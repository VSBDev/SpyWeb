import * as THREE from "three";
import { buildLevel, type LevelDef, type LevelRuntime } from "../world/levelkit";
import { CameraRig } from "./camera";
import { Player, type NoiseEvent, PLAYER_RADIUS } from "./player";
import { Guard, type AIWorld } from "./guards";
import { ObjectiveSystem, type ObjectiveState } from "./objectives";
import { angleDelta, clamp, dist2D, segmentHitsBox, formatTime } from "../core/mathutil";
import type { Input } from "../core/input";
import type { AudioEngine, MusicState } from "../core/audio";
import type { HUD, AlertLevel } from "../ui/hud";
import type { SaveData } from "../core/save";

export interface MissionStats {
  time: number;
  kills: number;
  spotted: number;
  alarms: number;
  ghost: boolean;
  rank: string;
  rankScore: number;
}

export interface MissionCallbacks {
  onComplete(stats: MissionStats): void;
  onFail(reason: string): void;
}

type ThrowKind = "stone" | "smoke" | "decoy" | "emp";
interface Stone { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; kind: ThrowKind }

interface SmokeCloud { x: number; z: number; r: number; t: number; puffs: THREE.Mesh[] }
interface NoiseRing { mesh: THREE.Mesh; t: number; radius: number }
interface Dust { sprite: THREE.Sprite; t: number; life: number; rise: number }

/** state carried across a death so the player can retry from progress */
export interface Checkpoint {
  time: number;
  stats: { kills: number; spotted: number; alarms: number };
  player: { x: number; z: number; yaw: number; health: number; ammo: number; stones: number; smoke: number; decoys: number; emp: number };
  dead: number[];
  dumped: number[];
  done: string[];
  takenPickups: string[];
}
interface Decoy { x: number; z: number; t: number; beepT: number; mesh: THREE.Group; led: THREE.Mesh; ring: THREE.Mesh }
interface EmpPulse { mesh: THREE.Mesh; t: number }
interface Tracer { line: THREE.Line; life: number }
interface Spark { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

interface CamState {
  x: number; z: number; baseRot: number; sweep: number;
  head: THREE.Object3D; led: THREE.Mesh | null;
  destroyed: boolean; exposure: number; beepT: number; phase: number;
  stunnedT: number;
  cone: THREE.Mesh;
}

interface SweeperState {
  x: number; z: number; height: number; radius: number; speed: number; phase: number;
  disc: THREE.Mesh; light: THREE.SpotLight; target: THREE.Object3D; beam: THREE.Mesh;
  exposure: number; spotX: number; spotZ: number; stunnedT: number;
}
const DOWN = new THREE.Vector3(0, -1, 0);

const CAM_FOV_HALF = 0.42;
const CAM_RANGE = 15;

/** flat sector fan in the XZ plane, apex at origin, centered on +Z */
function fanGeo(half: number): THREE.BufferGeometry {
  const segs = 18;
  const verts: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = -half + (i / segs) * half * 2;
    const a1 = -half + ((i + 1) / segs) * half * 2;
    verts.push(0, 0, 0, Math.sin(a0), 0, Math.cos(a0), Math.sin(a1), 0, Math.cos(a1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  return g;
}

type BarkKind = "curious" | "investigate" | "spotted" | "search" | "lost" | "body" | "alarm" | "buddy";
const BARK_LINES: Record<BarkKind, string[]> = {
  curious: ["Huh? Who's there?", "You hear that?", "What was that?", "Hm... something moved."],
  investigate: ["Going to check it out.", "Probably a cat. Probably.", "Eyes open..."],
  spotted: ["INTRUDER!", "There! Contact!", "I see him — open fire!", "We've got a rat!"],
  search: ["Spread out — find them!", "Someone's inside the wire!", "Search the area, now!"],
  lost: ["Must've been nothing...", "Gone. If he was ever there.", "All quiet. Resuming rounds.", "Lost him. Stay sharp."],
  body: ["MAN DOWN! Man down!", "Body here! We're not alone!", "Somebody killed Rocco!"],
  alarm: ["Hit the alarm!", "I'm calling it in!", "Sound the alarm — GO!"],
  buddy: ["Marco? Where'd you go?", "Post six, report in.", "He should be right here...", "Where the hell is Rocco?"],
};

const CHATTER_LINES: [string, string][] = [
  ["Quiet night, eh?", "Too quiet. I hate this posting."],
  ["Did you hear about Rocco's transfer?", "Everyone hears everything here. Except the boss."],
  ["The commandant doubled the watch.", "Something's got them spooked upstairs."],
  ["I'm telling you, I heard something in the grass.", "It's cats. It's always cats."],
  ["When's the next boat in?", "Midnight. Same as always."],
  ["My cousin says the war made him rich.", "Your cousin says a lot of things."],
];

const RANKS: { name: string; score: number }[] = [
  { name: "GHOST", score: 5 }, { name: "PHANTOM", score: 4 }, { name: "PRO", score: 3 },
  { name: "OPERATIVE", score: 2 }, { name: "LOUD & ALIVE", score: 1 },
];

export class Mission {
  scene: THREE.Scene;
  rig: CameraRig;
  level: LevelRuntime;
  player: Player;
  guards: Guard[] = [];
  objectives: ObjectiveSystem;
  over = false;
  paused = false;

  private input: Input;
  private audio: AudioEngine;
  private hud: HUD;
  private cb: MissionCallbacks;
  private settings: SaveData["settings"];

  private time = 0;
  private stats = { kills: 0, spotted: 0, alarms: 0 };
  private alarmActive = false;
  private alarmT = 0;
  private stones: Stone[] = [];
  private tracers: Tracer[] = [];
  private muzzleLight: THREE.PointLight;
  private shootCooldown = 0;
  private takedownVictim: Guard | null = null;
  private takedownTimer = 0;
  private draggedGuard: Guard | null = null;
  private activeInteract: ObjectiveState | null = null;
  private lastAlert: AlertLevel = "calm";
  private prevCombat = false;
  private exfilToastDone = false;
  private endTimer = -1;
  private endStats: MissionStats | null = null;
  private failReason: string | null = null;
  private world: AIWorld;
  private sparks: Spark[] = [];
  private noiseRings: NoiseRing[] = [];
  private dusts: Dust[] = [];
  private ghost: THREE.Group;
  private dustTex: THREE.Texture;
  checkpoint: Checkpoint | null = null;
  private takenPickups: string[] = [];
  private smokes: SmokeCloud[] = [];
  private decoys: Decoy[] = [];
  private empPulses: EmpPulse[] = [];
  private cams: CamState[] = [];
  private sweepers: SweeperState[] = [];
  private exfilBeacon: THREE.Mesh;
  private camAlarmToastDone = false;
  private globalBarkT = 0;
  private chatterT = 12;
  private reflex: { guard: Guard; t: number } | null = null;
  private reflexCooldown = 0;
  private hitStop = 0;
  private introT: number;
  private introDone = false;
  private introFrom = new THREE.Vector3();

  constructor(def: LevelDef, aspect: number, input: Input, audio: AudioEngine, hud: HUD, settings: SaveData["settings"], cb: MissionCallbacks, restoreFrom?: Checkpoint | null) {
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.cb = cb;
    this.settings = settings;

    this.scene = new THREE.Scene();
    this.level = buildLevel(def);
    this.scene.add(this.level.group);
    this.scene.background = new THREE.Color(this.level.skyColor);
    const fogColor = def.time === "night" ? 0x101a2c : def.time === "dusk" ? 0xd9a878 : 0xdcd2b8;
    this.scene.fog = new THREE.FogExp2(fogColor, def.time === "night" ? 0.0085 : 0.0038);

    // shadow frustum follows the player (set bounds once)
    const sc = this.level.sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48;
    sc.updateProjectionMatrix();

    this.rig = new CameraRig(aspect);
    this.rig.setColliders(this.level.colliders);
    this.rig.reset(def.playerStart.x, def.playerStart.z, def.playerStart.angle + Math.PI);

    this.player = new Player(this.scene);
    const gear = { smoke: def.gear?.smoke ?? 2, decoys: def.gear?.decoys ?? 1, emp: def.gear?.emp ?? 1 };
    this.player.setup(def.playerStart.x, def.playerStart.z, def.playerStart.angle, def.ammo, def.stones, gear, this.level.colliders, this.level.grass, def.bounds);

    for (const g of def.guards) this.guards.push(new Guard(g, this.scene, def.time === "night"));
    // pair each guard with his nearest colleague — a vanished buddy raises questions
    this.guards.forEach((g, i) => {
      let best = -1, bestD = Infinity;
      this.guards.forEach((o, j) => {
        if (i === j) return;
        const d = dist2D(g.def.x, g.def.z, o.def.x, o.def.z);
        if (d < bestD) { bestD = d; best = j; }
      });
      if (bestD < 26) g.buddy = best;
    });

    this.objectives = new ObjectiveSystem(this.level, this.scene, audio);
    this.objectives.onUpdate = () => this.refreshObjectiveHud();
    this.objectives.onExfilReady = () => {
      const ring = this.level.group.getObjectByName("exfil-ring") as THREE.Mesh;
      if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0.75;
      this.hud.toast("All objectives complete", def.exfil.label);
      this.refreshObjectiveHud();
    };

    this.muzzleLight = new THREE.PointLight(0xffd9a0, 0, 9, 2);
    this.scene.add(this.muzzleLight);

    // soft dust puff texture (shared by footstep dust + muzzle wisps)
    {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const cctx = c.getContext("2d")!;
      const grad = cctx.createRadialGradient(32, 32, 3, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      cctx.fillStyle = grad;
      cctx.fillRect(0, 0, 64, 64);
      this.dustTex = new THREE.CanvasTexture(c);
      this.dustTex.colorSpace = THREE.SRGBColorSpace;
    }

    // fairness ghost: a translucent mannequin standing where the AI *thinks*
    // you are — visible only while they hunt a stale position
    this.ghost = new THREE.Group();
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xbfe8e0, transparent: true, opacity: 0.3, depthWrite: false });
    const gBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.85, 3, 8), ghostMat);
    gBody.position.y = 0.95;
    this.ghost.add(gBody);
    const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), ghostMat);
    gHead.position.y = 1.68;
    this.ghost.add(gHead);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    // ---- security cameras ----
    for (const c of this.level.cams) {
      const cone = new THREE.Mesh(
        fanGeo(CAM_FOV_HALF),
        new THREE.MeshBasicMaterial({ color: 0xffc24f, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide })
      );
      cone.position.set(c.x, 0.1, c.z);
      cone.scale.setScalar(CAM_RANGE * 0.85);
      cone.visible = false;
      this.scene.add(cone);
      this.cams.push({
        x: c.x, z: c.z, baseRot: c.rot, sweep: c.sweep,
        head: c.head, led: (c.head.getObjectByName("cam-led") as THREE.Mesh) ?? null,
        destroyed: false, exposure: 0, beepT: 0, phase: Math.random() * 6.28,
        stunnedT: 0,
        cone,
      });
    }

    // ---- sweeping searchlights ----
    let sweepIdx = 0;
    for (const s of this.level.sweepers) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(3.4, 26),
        new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.09;
      this.scene.add(disc);
      const light = new THREE.SpotLight(0xfff2c0, 260, s.height * 3.5, Math.atan(3.4 / s.height) * 1.25, 0.4, 1.2);
      light.position.set(s.x, s.height, s.z);
      const target = new THREE.Object3D();
      this.scene.add(light);
      this.scene.add(target);
      light.target = target;
      // volumetric shaft from tower head to the ground spot
      const beamGeo = new THREE.CylinderGeometry(0.35, 3.2, 1, 14, 1, true);
      beamGeo.translate(0, -0.5, 0); // apex at origin, base at y=-1
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xfff2c0, transparent: true, opacity: 0.055,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      beam.position.set(s.x, s.height, s.z);
      this.scene.add(beam);
      this.sweepers.push({
        ...s, phase: (sweepIdx++ * Math.PI * 2) / Math.max(1, this.level.sweepers.length),
        disc, light, target, beam, exposure: 0, spotX: s.x, spotZ: s.z, stunnedT: 0,
      });
    }

    // ---- exfil beacon (lit when objectives complete) ----
    this.exfilBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.85, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    this.exfilBeacon.position.set(def.exfil.x, 7, def.exfil.z);
    this.scene.add(this.exfilBeacon);

    this.world = {
      player: this.player,
      nav: this.level.nav,
      colliders: this.level.colliders,
      guards: this.guards,
      night: def.time === "night",
      audio,
      alarmActive: false,
      los: (x1, z1, x2, z2, blockH) => this.lineOfSight(x1, z1, x2, z2, blockH),
      raiseAlarm: (x, z) => this.raiseAlarm(x, z),
      onGuardAlerted: () => { /* spotted count handled on alert-level transition */ },
      onGuardShoot: (g) => this.resolveGuardShot(g),
      bark: (g, kind) => this.doBark(g, kind),
      tryReflex: (g) => this.tryReflex(g),
      alarmPanels: this.level.alarmPanels.map((p) => ({ x: p.x, z: p.z })),
      notifyCombatNoise: (x, z) => this.emitNoise({ x, z, radius: 9, kind: "body" }),
    };

    // intro flyover: sweep down from high above the compound to the agent
    this.introT = 4.2;
    const center = new THREE.Vector3((def.bounds.minX + def.bounds.maxX) / 2, 0, (def.bounds.minZ + def.bounds.maxZ) / 2);
    this.introFrom.set(
      center.x + (def.playerStart.x - center.x) * 0.3,
      44,
      center.z + (def.playerStart.z - center.z) * 0.3
    );
    this.hud.setLetterbox(true);

    audio.setAmbience(def.ambience);
    audio.setMusicState("calm");
    this.hud.setAlert("calm");
    this.hud.setDetectionTicks([]);
    this.hud.setTactical(false);
    this.hud.show();
    this.refreshGear();
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.refreshObjectiveHud();
    if (def.hint) this.hud.toast(def.name, def.hint, 4200);

    if (restoreFrom) this.applyCheckpoint(restoreFrom);
  }

  // ==========================================================================
  // Checkpoints
  // ==========================================================================

  private makeCheckpoint() {
    const p = this.player;
    this.checkpoint = {
      time: this.time,
      stats: { ...this.stats },
      player: {
        x: p.pos.x, z: p.pos.z, yaw: p.yaw, health: Math.max(2, Math.ceil(p.health)),
        ammo: p.ammo, stones: p.stones, smoke: p.smoke, decoys: p.decoys, emp: p.emp,
      },
      dead: this.guards.map((g, i) => (g.dead && !g.dumped ? i : -1)).filter((i) => i >= 0),
      dumped: this.guards.map((g, i) => (g.dumped ? i : -1)).filter((i) => i >= 0),
      done: this.objectives.states.filter((s) => s.done).map((s) => s.def.id),
      takenPickups: [...this.takenPickups],
    };
    this.audio.checkpoint();
  }

  private applyCheckpoint(cp: Checkpoint) {
    this.checkpoint = cp;
    this.time = cp.time;
    this.stats = { ...cp.stats };
    const p = this.player;
    p.pos.set(cp.player.x, 0, cp.player.z);
    p.yaw = cp.player.yaw;
    p.health = cp.player.health;
    p.ammo = cp.player.ammo;
    p.stones = cp.player.stones;
    p.smoke = cp.player.smoke;
    p.decoys = cp.player.decoys;
    p.emp = cp.player.emp;
    p.humanoid.root.position.copy(p.pos);
    p.humanoid.root.rotation.y = p.yaw;
    this.rig.reset(cp.player.x, cp.player.z, cp.player.yaw + Math.PI);
    for (const i of cp.dead) this.guards[i]?.forceDead(false);
    for (const i of cp.dumped) this.guards[i]?.forceDead(true);
    for (const id of cp.done) this.objectives.markDone(id);
    if (this.objectives.exfilActive) {
      const ring = this.level.group.getObjectByName("exfil-ring") as THREE.Mesh | undefined;
      if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0.75;
      this.exfilToastDone = true;
    }
    for (let i = this.level.pickups.length - 1; i >= 0; i--) {
      const pk = this.level.pickups[i];
      if (cp.takenPickups.includes(`${pk.x}|${pk.z}`)) {
        pk.obj.removeFromParent();
        this.level.pickups.splice(i, 1);
      }
    }
    this.takenPickups = [...cp.takenPickups];
    // no flyover on a checkpoint restart
    this.introT = 0;
    this.introDone = true;
    this.hud.setLetterbox(false);
    this.refreshObjectiveHud();
    this.refreshGear();
    this.hud.setHealth(p.health, p.maxHealth);
    this.hud.toast("CHECKPOINT RESTORED", "the guards remember nothing", 2600);
  }

  private refreshObjectiveHud() {
    this.hud.setObjectives(this.objectives.states, this.objectives.exfilActive, this.level.def.exfil.label);
  }

  lineOfSight(x1: number, z1: number, x2: number, z2: number, blockH: number): boolean {
    for (const c of this.level.colliders) {
      if (c.height < blockH) continue;
      if (segmentHitsBox(x1, z1, x2, z2, c)) return false;
    }
    // smoke clouds block sight while dense
    for (const sm of this.smokes) {
      if (sm.t > 9.5 || sm.t < 0.3) continue;
      if (segmentNearPoint(x1, z1, x2, z2, sm.x, sm.z, sm.r * 0.85)) return false;
    }
    return true;
  }

  private doBark(g: Guard, kind: BarkKind) {
    if (g.dead || g.barkT > 0 || this.globalBarkT > 0) return;
    g.barkT = 3.5;
    this.globalBarkT = 1.1;
    const d = dist2D(g.pos.x, g.pos.z, this.player.pos.x, this.player.pos.z);
    if (d > 45) return;
    this.audio.bark(kind, d);
    const lines = BARK_LINES[kind];
    this.hud.subtitle(g.officer ? "OFFICER:" : "GUARD:", lines[Math.floor(Math.random() * lines.length)]);
  }

  private tryReflex(g: Guard): boolean {
    // one chance: first sighting, no active alert anywhere else
    if (this.reflex || this.reflexCooldown > 0 || this.alarmActive) return false;
    const othersAlerted = this.guards.some((x) => x !== g && !x.dead && (x.state === "combat" || x.state === "alarm-run" || x.state === "search"));
    if (othersAlerted) return false;
    this.reflex = { guard: g, t: 2.7 };
    this.reflexCooldown = 40;
    this.hud.setReflex(true);
    this.audio.heartbeat();
    this.audio.stinger();
    return true;
  }

  private endReflex(neutralized: boolean) {
    if (!this.reflex) return;
    const g = this.reflex.guard;
    this.reflex = null;
    this.hud.setReflex(false);
    if (neutralized) {
      const otherWitnesses = this.guards.some((x) => !x.dead && (x.state === "combat" || x.state === "alarm-run"));
      if (!otherWitnesses) this.hud.toast("THREAT NEUTRALIZED", "the compound never heard a thing", 2600);
    } else {
      g.raiseCombatWave(this.world);
    }
  }

  private raiseAlarm(x: number, z: number) {
    if (!this.alarmActive) this.stats.alarms++;
    this.alarmActive = true;
    this.world.alarmActive = true;
    this.alarmT = 40;
    this.audio.startAlarm();
    this.hud.toast("ALARM RAISED", "guards are hunting you");
    for (const g of this.guards) {
      if (g.dead || g.state === "combat") continue;
      g.lastKnown = { x, z };
      g.startSearch(this.world, x, z);
    }
  }

  private emitNoise(n: NoiseEvent, visualize = true) {
    for (const g of this.guards) g.onNoise(n, this.world);
    if (!visualize) return;
    // fairness: every noise you cause is shown at its true radius
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 36),
      new THREE.MeshBasicMaterial({ color: 0xf2e8d5, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(n.x, 0.1, n.z);
    ring.scale.setScalar(0.3);
    this.scene.add(ring);
    this.noiseRings.push({ mesh: ring, t: 0, radius: n.radius });
  }

  private spawnDust(pos: THREE.Vector3, color: number, scale: number, count = 1) {
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.dustTex, color, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      sprite.position.copy(pos);
      sprite.position.x += (Math.random() - 0.5) * 0.3;
      sprite.position.z += (Math.random() - 0.5) * 0.3;
      sprite.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
      this.scene.add(sprite);
      this.dusts.push({ sprite, t: 0, life: 0.4 + Math.random() * 0.25, rise: 0.4 + Math.random() * 0.5 });
    }
  }

  // ==========================================================================
  // Combat
  // ==========================================================================

  private spawnSparks(pos: THREE.Vector3, color: number, count = 6) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      mesh.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6);
      this.scene.add(mesh);
      this.sparks.push({ mesh, vel, life: 0.2 + Math.random() * 0.15 });
    }
  }

  private addTracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.14 });
  }

  private playerShoot() {
    if (this.player.ammo <= 0) { this.audio.uiClick(); return; }
    this.player.ammo--;
    this.shootCooldown = 0.34;
    this.audio.suppressedShot();
    this.refreshGear();

    const cam = this.rig.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    // environment hit distance (3D slab vs colliders)
    let envT = 60;
    for (const c of this.level.colliders) {
      if (c.height < 0.3) continue;
      const t = rayAabb(origin, dir, c.minX, -0.5, c.minZ, c.maxX, c.height, c.maxZ);
      if (t !== null && t < envT) envT = t;
    }
    // guard hit
    let hitGuard: Guard | null = null;
    let hitT = envT;
    for (const g of this.guards) {
      if (g.dead) continue;
      const center = new THREE.Vector3(g.pos.x, 0.95, g.pos.z);
      const oc = center.clone().sub(origin);
      const t = oc.dot(dir);
      if (t < 0.5 || t > hitT) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const dy = Math.abs(closest.y - 0.95);
      const dxz = Math.hypot(closest.x - center.x, closest.z - center.z);
      if (dxz < 0.42 && dy < 1.0) { hitGuard = g; hitT = t; }
    }
    // security camera hit (destructible)
    let hitCam: CamState | null = null;
    for (const cam of this.cams) {
      if (cam.destroyed) continue;
      const center = new THREE.Vector3(cam.x, 3.15, cam.z);
      const oc = center.clone().sub(origin);
      const t = oc.dot(dir);
      if (t < 0.5 || t > hitT) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      if (closest.distanceTo(center) < 0.5) { hitCam = cam; hitGuard = null; hitT = t; }
    }

    const hitPoint = origin.clone().addScaledVector(dir, hitT);
    const muzzle = this.player.pos.clone().add(new THREE.Vector3(Math.sin(this.player.yaw) * 0.4, 1.35, Math.cos(this.player.yaw) * 0.4));
    this.addTracer(muzzle, hitPoint, 0xffe9b0);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleLight.intensity = 6;
    this.spawnDust(muzzle, 0xd8d2c4, 0.35, 2);
    this.input.rumble(0.15, 0.3, 60);

    // suppressed but not silent
    this.emitNoise({ x: this.player.pos.x, z: this.player.pos.z, radius: 7, kind: "footstep" });
    if (hitCam) {
      hitCam.destroyed = true;
      hitCam.cone.visible = false;
      hitCam.head.rotation.x = 0.7; // slumps
      if (hitCam.led) (hitCam.led.material as THREE.MeshLambertMaterial).emissiveIntensity = 0;
      this.audio.sparks();
      this.spawnSparks(new THREE.Vector3(hitCam.x, 3.1, hitCam.z), 0xffe08a, 10);
      this.hud.toast("Camera disabled", undefined, 1400);
      this.emitNoise({ x: hitCam.x, z: hitCam.z, radius: 6, kind: "stone" });
    } else if (hitGuard) {
      const wasUnaware = hitGuard.state !== "combat";
      hitGuard.hit(this.world, 1, wasUnaware);
      this.spawnSparks(hitPoint, 0xc46a5a, 4);
      this.hud.hitMarker(hitGuard.dead);
      this.audio.hitTick(hitGuard.dead);
      this.input.rumble(hitGuard.dead ? 0.5 : 0.25, 0.4, 90);
      if (hitGuard.dead) {
        this.stats.kills++;
        this.emitNoise({ x: hitGuard.pos.x, z: hitGuard.pos.z, radius: 8, kind: "body" });
      }
    } else {
      this.audio.ricochet();
      this.spawnSparks(hitPoint, 0xd8cfb8, 5);
      this.emitNoise({ x: hitPoint.x, z: hitPoint.z, radius: 8, kind: "stone" });
    }
  }

  private resolveGuardShot(g: Guard) {
    const p = this.player;
    const d = dist2D(g.pos.x, g.pos.z, p.pos.x, p.pos.z);
    this.audio.guardShot(d);
    let acc = 0.52 * clamp(1.15 - d / 30, 0.15, 1);
    if (p.running) acc -= 0.13;
    if (p.crouching) acc -= 0.12;
    if (p.speed > 0.5) acc -= 0.08;
    acc = clamp(acc, 0.08, 0.85);
    const hit = Math.random() < acc;
    const muzzle = new THREE.Vector3(g.pos.x + Math.sin(g.yaw) * 0.5, 1.35, g.pos.z + Math.cos(g.yaw) * 0.5);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleLight.intensity = 7;
    const target = p.pos.clone().add(new THREE.Vector3(0, p.crouching ? 0.7 : 1.2, 0));
    if (!hit) {
      target.x += (Math.random() - 0.5) * 3;
      target.y += Math.random() * 1.4;
      target.z += (Math.random() - 0.5) * 3;
    }
    this.addTracer(muzzle, target, 0xffb070);
    if (hit) {
      this.rig.shake = 0.9;
      this.input.rumble(0.9, 0.6, 200);
      const died = p.takeDamage(1, this.audio);
      this.hud.setHealth(p.health, p.maxHealth);
      if (died) this.failMission("Agent MIRA was killed in action.");
    } else if (d < 22) {
      // near miss: supersonic crack + a flinch of camera
      this.audio.bulletWhiz();
      this.rig.shake = Math.max(this.rig.shake, 0.22);
    }
  }

  private tryTakedown(): Guard | null {
    if (this.draggedGuard || this.player.takedownT >= 0) return null;
    for (const g of this.guards) {
      if (g.dead) continue;
      const d = dist2D(this.player.pos.x, this.player.pos.z, g.pos.x, g.pos.z);
      if (d > 2.1) continue;
      if (g.state === "combat") continue;
      const rearAngle = Math.abs(angleDelta(g.yaw, Math.atan2(this.player.pos.x - g.pos.x, this.player.pos.z - g.pos.z)));
      if (rearAngle > 1.85) return g; // player is in the guard's rear arc
    }
    return null;
  }

  private nearestBody(): Guard | null {
    for (const g of this.guards) {
      if (!g.dead) continue;
      const d = dist2D(this.player.pos.x, this.player.pos.z, g.pos.x, g.pos.z);
      if (d < 1.7) return g;
    }
    return null;
  }

  private refreshGear() {
    const p = this.player;
    this.hud.setGear(p.ammo, p.stones, p.smoke, p.decoys, p.emp);
  }

  private throwGadget(kind: ThrowKind) {
    const p = this.player;
    if (kind === "stone") { if (p.stones <= 0) return; p.stones--; }
    else if (kind === "smoke") { if (p.smoke <= 0) return; p.smoke--; }
    else if (kind === "decoy") { if (p.decoys <= 0) return; p.decoys--; }
    else { if (p.emp <= 0) return; p.emp--; }
    this.refreshGear();
    this.audio.stoneThrow();
    const cam = this.rig.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    // land point: project forward on the ground, clamp distance
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const throwDist = clamp(10 + -dir.y * 22, 5, 19);
    const to = this.player.pos.clone().addScaledVector(flat, throwDist);
    to.x = clamp(to.x, this.level.def.bounds.minX + 1, this.level.def.bounds.maxX - 1);
    to.z = clamp(to.z, this.level.def.bounds.minZ + 1, this.level.def.bounds.maxZ - 1);
    const from = this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const geo = kind === "stone" ? new THREE.IcosahedronGeometry(0.09, 0)
      : kind === "smoke" ? new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8)
      : new THREE.BoxGeometry(0.16, 0.12, 0.16);
    const color = kind === "stone" ? 0x8d8578 : kind === "smoke" ? 0x5a6a5c : kind === "decoy" ? 0x384048 : 0x2d3e58;
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.stones.push({ mesh, from, to, t: 0, dur: 0.85, kind });
  }

  // ---- gadget landing effects -------------------------------------------

  private landSmoke(x: number, z: number) {
    this.audio.smokePop(dist2D(x, z, this.player.pos.x, this.player.pos.z));
    const puffs: THREE.Mesh[] = [];
    const mat = new THREE.MeshLambertMaterial({
      color: this.level.def.time === "night" ? 0x76808c : 0xcfd2cc,
      transparent: true, opacity: 0.0, depthWrite: false,
    });
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15 + Math.random() * 0.9, 0), mat.clone());
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.6;
      puff.position.set(x + Math.cos(a) * r, 0.5 + Math.random() * 1.7, z + Math.sin(a) * r);
      puff.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(puff);
      puffs.push(puff);
    }
    this.smokes.push({ x, z, r: 4.2, t: 0, puffs });
    // guards hear the pop faintly
    this.emitNoise({ x, z, radius: 7, kind: "stone" });
  }

  private landDecoy(x: number, z: number) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), new THREE.MeshLambertMaterial({ color: 0x384048 }));
    body.position.y = 0.08;
    body.castShadow = true;
    mesh.add(body);
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xff9a3d, emissive: 0xff7a1d, emissiveIntensity: 2 })
    );
    led.position.set(0.08, 0.19, 0);
    mesh.add(led);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 22),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    mesh.add(ring);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.decoys.push({ x, z, t: 0, beepT: 0.4, mesh, led, ring });
  }

  private landEmp(x: number, z: number) {
    this.audio.empZap();
    const EMP_R = 13;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 34),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    this.scene.add(ring);
    this.empPulses.push({ mesh: ring, t: 0 });
    this.spawnSparks(new THREE.Vector3(x, 0.6, z), 0x9fdcff, 12);

    let hits = 0;
    for (const cam of this.cams) {
      if (cam.destroyed) continue;
      if (dist2D(cam.x, cam.z, x, z) < EMP_R) {
        cam.stunnedT = 14;
        cam.exposure = 0;
        hits++;
      }
    }
    for (const sw of this.sweepers) {
      if (dist2D(sw.x, sw.z, x, z) < EMP_R + 4) { // tower base counts
        sw.stunnedT = 14;
        sw.exposure = 0;
        hits++;
      }
    }
    if (hits > 0) this.hud.toast(`EMP — ${hits} device${hits > 1 ? "s" : ""} down`, "14 seconds of dark", 2200);
    this.emitNoise({ x, z, radius: 9, kind: "stone" });
  }

  private failMission(reason: string) {
    if (this.over) return;
    this.failReason = reason;
    this.endTimer = 1.6;
    this.audio.setMusicState("off");
  }

  private completeMission() {
    if (this.over) return;
    const ghost = this.stats.kills === 0 && this.stats.spotted === 0 && this.stats.alarms === 0;
    let rank: { name: string; score: number };
    if (ghost) rank = RANKS[0];
    else if (this.stats.spotted === 0 && this.stats.alarms === 0) rank = RANKS[1];
    else if (this.stats.spotted <= 1 && this.stats.alarms === 0) rank = RANKS[2];
    else if (this.stats.spotted <= 3) rank = RANKS[3];
    else rank = RANKS[4];
    this.endStats = {
      time: this.time, kills: this.stats.kills, spotted: this.stats.spotted,
      alarms: this.stats.alarms, ghost, rank: rank.name, rankScore: rank.score,
    };
    this.endTimer = 1.2;
    this.audio.setMusicState("off");
    this.audio.objectiveComplete();
    this.hud.toast("EXFILTRATION COMPLETE", formatTime(this.time));
  }

  // ==========================================================================
  // Frame update
  // ==========================================================================

  update(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    const realDt = dt;
    this.globalBarkT = Math.max(0, this.globalBarkT - realDt);
    this.reflexCooldown = Math.max(0, this.reflexCooldown - realDt);
    // hit-stop: freeze the world for a beat on takedown impact
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      dt = 0.0005;
    }
    // reflex slow-mo: drop the spotter before the window closes
    if (this.reflex) {
      this.reflex.t -= realDt;
      dt *= 0.24;
      if (this.reflex.guard.dead) this.endReflex(true);
      else if (this.reflex.t <= 0) this.endReflex(false);
    }
    this.time += dt;
    const p = this.player;
    const input = this.input;

    // intro flyover: hold player input, cinematic camera (any key skips)
    const introActive = this.introT > 0;
    if (introActive) {
      if (input.anyRawPressed) this.introT = 0;
      else this.introT -= realDt;
      input.enabled = false;
    }
    if (this.introT <= 0 && !this.introDone) {
      this.introDone = true;
      this.hud.setLetterbox(false);
      input.enabled = true;
    }

    // ---- mission end countdown ----
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.over = true;
        if (this.endStats) this.cb.onComplete(this.endStats);
        else this.cb.onFail(this.failReason ?? "Mission failed.");
        return;
      }
    }

    // ---- camera look ----
    if (input.pointerLocked || input.gamepadActive) {
      this.rig.applyLook(input.mouseDX, input.mouseDY, this.settings.sensitivity, this.settings.invertY);
    }
    if (input.wasPressed("Tab") || input.wasPressed("KeyT")) {
      this.rig.tactical = !this.rig.tactical;
      this.audio.uiHover();
    }
    this.hud.setTactical(this.rig.tactical);
    for (const g of this.guards) {
      const alertCone = g.awareness > 0.12 || g.state === "investigate" || g.state === "search" || g.state === "combat" || g.state === "alarm-run";
      g.visionMesh.visible = (this.rig.tactical || alertCone) && !g.dead;
    }

    // ---- takedown in progress ----
    if (this.takedownVictim) {
      this.takedownTimer -= dt;
      if (this.takedownTimer <= 0) {
        this.takedownVictim.kill(this.world, true);
        this.stats.kills++;
        this.audio.takedown();
        this.triggerHitStop();
        this.input.rumble(0.8, 0.5, 140);
        this.emitNoise({ x: this.takedownVictim.pos.x, z: this.takedownVictim.pos.z, radius: 5, kind: "body" });
        this.takedownVictim = null;
      }
    }

    // ---- player update ----
    if (!this.over && this.endTimer < 0) {
      p.update(dt, input, this.rig.yaw, this.rig.pitch, (n) => {
        this.emitNoise(n);
        this.audio.footstep(p.running, p.crouching, p.inGrass);
        if (p.running) this.spawnDust(p.pos.clone().setY(0.12), 0xcfc0a0, 0.5, 2);
      });
    } else {
      p.update(dt, input, this.rig.yaw, this.rig.pitch, () => {});
    }
    this.hud.setHealth(p.health, p.maxHealth);

    // keep the player from phasing through living guards
    for (const g of this.guards) {
      if (g.dead) continue;
      const dx = p.pos.x - g.pos.x, dz = p.pos.z - g.pos.z;
      const d2 = dx * dx + dz * dz;
      const minD = PLAYER_RADIUS + 0.42;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.pos.x = g.pos.x + (dx / d) * minD;
        p.pos.z = g.pos.z + (dz / d) * minD;
        p.humanoid.root.position.copy(p.pos);
      }
    }

    // ---- actions ----
    const takedownTarget = this.tryTakedown();
    const body = this.draggedGuard ? null : this.nearestBody();
    const objState = this.objectives.nearest(p.pos.x, p.pos.z);

    if (!p.dead && this.endTimer < 0) {
      // shoot
      this.shootCooldown -= dt;
      if (p.aiming && input.wasMousePressed(0) && this.shootCooldown <= 0 && p.takedownT < 0) {
        this.playerShoot();
      }
      // throwables: stone lure + Q-branch gadgets
      if (!this.draggedGuard) {
        if (input.wasPressed("KeyG")) this.throwGadget("stone");
        if (input.wasPressed("Digit1")) this.throwGadget("smoke");
        if (input.wasPressed("Digit2")) this.throwGadget("decoy");
        if (input.wasPressed("Digit3")) this.throwGadget("emp");
      }
      // takedown
      if (input.wasPressed("KeyE") && takedownTarget) {
        this.takedownVictim = takedownTarget;
        this.takedownTimer = 0.32;
        p.takedownT = 0;
        // lunge to the guard's back
        const behind = takedownTarget.pos.clone().add(new THREE.Vector3(-Math.sin(takedownTarget.yaw) * 0.7, 0, -Math.cos(takedownTarget.yaw) * 0.7));
        p.pos.copy(behind);
        p.yaw = takedownTarget.yaw;
      }
      // dump a dragged body down a well
      if (this.draggedGuard && input.wasPressed("KeyE")) {
        const nearWell = this.level.wells.find((w) => dist2D(p.pos.x, p.pos.z, w.x, w.z) < 2.2);
        if (nearWell) {
          const g = this.draggedGuard;
          g.beingDragged = false;
          g.dumped = true;
          g.humanoid.root.visible = false;
          g.pos.set(nearWell.x, -10, nearWell.z);
          this.draggedGuard = null;
          p.draggingGuard = null;
          this.audio.bodyFall(2);
          this.audio.interact();
          this.hud.toast("Body disposed", "no one will find him down there", 2200);
        }
      }
      // drag / release body
      if (input.wasPressed("KeyF")) {
        if (this.draggedGuard) {
          this.draggedGuard.beingDragged = false;
          this.draggedGuard = null;
          p.draggingGuard = null;
        } else if (body) {
          this.draggedGuard = body;
          body.beingDragged = true;
          p.draggingGuard = body;
          this.audio.interact();
        }
      }
      // objective interact (hold E)
      if (objState && !takedownTarget && !this.draggedGuard && input.isDown("KeyE") && p.takedownT < 0) {
        this.activeInteract = objState;
        if (this.objectives.interactTick(objState, dt)) {
          this.hud.toast("Objective complete", `${objState.def.label} — checkpoint saved`);
          this.activeInteract = null;
          this.makeCheckpoint();
        }
      } else {
        if (this.activeInteract) this.activeInteract.progress = 0;
        this.activeInteract = null;
      }
    }

    // dragged body follows
    if (this.draggedGuard) {
      const behind = p.pos.clone().add(new THREE.Vector3(-Math.sin(p.yaw) * 0.95, 0, -Math.cos(p.yaw) * 0.95));
      this.draggedGuard.pos.lerp(behind, Math.min(1, dt * 10));
      this.draggedGuard.humanoid.root.position.copy(this.draggedGuard.pos);
    }

    // ---- prompt ----
    let prompt: string | null = null;
    if (takedownTarget) prompt = `<span class="key">E</span> Silent takedown`;
    else if (!p.cover && !this.draggedGuard && p.findCoverFace()) prompt = `<span class="key">SPACE</span> Take cover`;
    else if (this.activeInteract) prompt = `<span class="key">E</span> ${this.activeInteract.def.label} — ${Math.floor(this.activeInteract.progress * 100)}%`;
    else if (this.draggedGuard && this.level.wells.some((w) => dist2D(p.pos.x, p.pos.z, w.x, w.z) < 2.2)) prompt = `<span class="key">E</span> Dump body in the well`;
    else if (objState && !this.draggedGuard) prompt = `<span class="key">E</span> ${objState.def.label}`;
    else if (this.draggedGuard) prompt = `<span class="key">F</span> Drop body`;
    else if (body) prompt = `<span class="key">F</span> Drag body`;
    this.hud.setPrompt(prompt);
    this.hud.setAiming(p.aiming);
    this.hud.setProgress(this.activeInteract ? this.activeInteract.progress : null);

    // ---- guards ----
    for (const g of this.guards) g.update(dt, this.world);

    // ---- pickups ----
    for (let i = this.level.pickups.length - 1; i >= 0; i--) {
      const pk = this.level.pickups[i];
      // bob & spin
      pk.obj.rotation.y += dt * 1.6;
      pk.obj.position.y = Math.sin(this.time * 2.4 + pk.x) * 0.07;
      if (!p.dead && dist2D(p.pos.x, p.pos.z, pk.x, pk.z) < 1.15) {
        if (pk.what === "ammo") p.ammo += pk.amount;
        else p.stones += pk.amount;
        this.refreshGear();
        this.hud.toast(pk.what === "ammo" ? `+${pk.amount} pistol rounds` : `+${pk.amount} stones`, undefined, 1400);
        this.audio.pickup();
        this.takenPickups.push(`${pk.x}|${pk.z}`);
        pk.obj.removeFromParent(); // parent is the level group, not the scene
        this.level.pickups.splice(i, 1);
      }
    }

    // ---- security cameras ----
    for (const cam of this.cams) {
      if (cam.destroyed) continue;
      if (cam.stunnedT > 0) {
        cam.stunnedT -= dt;
        cam.cone.visible = false;
        cam.exposure = 0;
        if (cam.led) (cam.led.material as THREE.MeshLambertMaterial).emissiveIntensity = 0;
        continue;
      }
      const pan = Math.sin(this.time * 0.55 + cam.phase) * cam.sweep;
      cam.head.rotation.y = pan;
      const worldYaw = cam.baseRot + pan;
      cam.cone.rotation.y = worldYaw;
      cam.cone.visible = this.rig.tactical;

      // detection
      let vis = false;
      if (!p.dead && !p.hidden && this.endTimer < 0) {
        const dx = p.pos.x - cam.x, dz = p.pos.z - cam.z;
        const d = Math.hypot(dx, dz);
        if (d < CAM_RANGE * (p.crouching ? 0.72 : 1)) {
          const ang = Math.atan2(dx, dz);
          if (Math.abs(angleDelta(worldYaw, ang)) < CAM_FOV_HALF) {
            vis = this.lineOfSight(cam.x, cam.z, p.pos.x, p.pos.z, p.crouching ? 0.85 : 1.35);
          }
        }
      }
      if (vis) {
        cam.exposure = Math.min(1, cam.exposure + dt * 1.1);
        cam.beepT -= dt;
        if (cam.beepT <= 0) { this.audio.camBeep(); cam.beepT = Math.max(0.12, 0.45 - cam.exposure * 0.3); }
        if (cam.exposure >= 1 && !this.alarmActive) {
          this.hud.toast("CAMERA SPOTTED YOU", "shoot cameras out before they see you");
          this.raiseAlarm(p.pos.x, p.pos.z);
        }
      } else {
        cam.exposure = Math.max(0, cam.exposure - dt * 0.7);
      }
      const cmat = cam.cone.material as THREE.MeshBasicMaterial;
      cmat.color.setHex(cam.exposure > 0.05 ? 0xff5c44 : 0xffc24f);
      if (cam.led) {
        const lm = cam.led.material as THREE.MeshLambertMaterial;
        lm.emissiveIntensity = cam.exposure > 0.05 ? 2 + Math.sin(this.time * 18) * 1.6 : 1.2 + Math.sin(this.time * 3) * 0.8;
      }
    }

    // ---- sweeping searchlights ----
    for (const sw of this.sweepers) {
      if (sw.stunnedT > 0) {
        sw.stunnedT -= dt;
        sw.disc.visible = false;
        sw.beam.visible = false;
        sw.light.intensity = 0;
        sw.exposure = 0;
        if (sw.stunnedT <= 0) { sw.disc.visible = true; sw.beam.visible = true; sw.light.intensity = 260; }
        continue;
      }
      const a = this.time * sw.speed + sw.phase;
      const r = sw.radius * (0.72 + 0.28 * Math.sin(this.time * 0.31 + sw.phase * 2));
      sw.spotX = sw.x + Math.cos(a) * r;
      sw.spotZ = sw.z + Math.sin(a) * r;
      sw.disc.position.set(sw.spotX, 0.09, sw.spotZ);
      sw.target.position.set(sw.spotX, 0, sw.spotZ);
      sw.light.target.updateMatrixWorld();
      // aim the volumetric shaft
      const dir = new THREE.Vector3(sw.spotX - sw.x, -sw.height, sw.spotZ - sw.z);
      const len = dir.length();
      dir.normalize();
      sw.beam.quaternion.setFromUnitVectors(DOWN, dir);
      sw.beam.scale.set(1, len, 1);
      if (!p.dead && !p.hidden && this.endTimer < 0 && dist2D(p.pos.x, p.pos.z, sw.spotX, sw.spotZ) < 3.4) {
        sw.exposure = Math.min(1, sw.exposure + dt * 1.8);
        if (sw.exposure > 0.15 && sw.exposure < 0.2) this.audio.camBeep();
        if (sw.exposure >= 1 && !this.alarmActive) {
          this.hud.toast("CAUGHT IN THE SEARCHLIGHT", "stay out of the beams");
          this.raiseAlarm(p.pos.x, p.pos.z);
        }
      } else {
        sw.exposure = Math.max(0, sw.exposure - dt * 1.2);
      }
      (sw.disc.material as THREE.MeshBasicMaterial).color.setHex(sw.exposure > 0.05 ? 0xffb0a0 : 0xfff2c0);
    }

    // ---- sparks ----
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.vel.y -= dt * 14;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, sp.life / 0.3);
      if (sp.life <= 0) { this.scene.remove(sp.mesh); sp.mesh.geometry.dispose(); this.sparks.splice(i, 1); }
    }

    // ---- noise rings (fairness: every sound shown at its true radius) ----
    for (let i = this.noiseRings.length - 1; i >= 0; i--) {
      const r = this.noiseRings[i];
      r.t += dt;
      const k = r.t / 0.55;
      r.mesh.scale.setScalar(0.3 + (r.radius - 0.3) * Math.min(1, k));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.3 * Math.max(0, 1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.noiseRings.splice(i, 1);
      }
    }

    // ---- dust puffs ----
    for (let i = this.dusts.length - 1; i >= 0; i--) {
      const d = this.dusts[i];
      d.t += dt;
      const k = d.t / d.life;
      d.sprite.position.y += d.rise * dt;
      d.sprite.scale.multiplyScalar(1 + dt * 2.2);
      (d.sprite.material as THREE.SpriteMaterial).opacity = 0.5 * Math.max(0, 1 - k);
      if (k >= 1) {
        this.scene.remove(d.sprite);
        (d.sprite.material as THREE.SpriteMaterial).dispose();
        this.dusts.splice(i, 1);
      }
    }

    // ---- last-known-position ghost: what the hunt is converging on ----
    {
      const seen = this.guards.some((g) => !g.dead && g.seesPlayer);
      let hunter: Guard | null = null;
      for (const g of this.guards) {
        if (g.dead) continue;
        if (g.state === "combat" || g.state === "search" || g.state === "alarm-run") {
          if (!hunter || g.awareness > hunter.awareness) hunter = g;
        }
      }
      this.ghost.visible = !!hunter && !seen && !p.dead;
      if (hunter && this.ghost.visible) {
        this.ghost.position.set(hunter.lastKnown.x, 0, hunter.lastKnown.z);
        const gm = (this.ghost.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        gm.opacity = 0.22 + Math.sin(this.time * 3.2) * 0.08;
      }
    }

    // ---- cloth sway ----
    for (let i = 0; i < this.level.clothMeshes.length; i++) {
      const c = this.level.clothMeshes[i];
      c.rotation.x = Math.sin(this.time * 1.9 + i * 1.3) * 0.16;
    }

    // ---- exfil beacon ----
    const bMat = this.exfilBeacon.material as THREE.MeshBasicMaterial;
    if (this.objectives.exfilActive) {
      bMat.opacity = 0.13 + Math.sin(this.time * 2.2) * 0.05;
      this.exfilBeacon.rotation.y += dt * 0.5;
    }

    // ---- stones ----
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const x = s.from.x + (s.to.x - s.from.x) * k;
      const z = s.from.z + (s.to.z - s.from.z) * k;
      const y = s.from.y * (1 - k) + 4.2 * Math.sin(Math.PI * k) * (1 - k * 0.3) + 0.08;
      s.mesh.position.set(x, y, z);
      s.mesh.rotation.x += dt * 9;
      if (k >= 1) {
        if (s.kind === "stone") {
          this.audio.stoneLand(dist2D(x, z, p.pos.x, p.pos.z));
          this.emitNoise({ x, z, radius: 14, kind: "stone" });
        } else if (s.kind === "smoke") this.landSmoke(x, z);
        else if (s.kind === "decoy") this.landDecoy(x, z);
        else this.landEmp(x, z);
        this.scene.remove(s.mesh);
        this.stones.splice(i, 1);
      }
    }

    // ---- interiors: hide the roof when the player is inside ----
    for (const h of this.level.houses) {
      const inside = p.pos.x > h.minX && p.pos.x < h.maxX && p.pos.z > h.minZ && p.pos.z < h.maxZ;
      h.roof.visible = !inside && !this.rig.tactical;
    }

    // ---- ambient guard chatter ----
    this.chatterT -= dt;
    if (this.chatterT <= 0) {
      this.chatterT = 16 + Math.random() * 10;
      const calmGuards = this.guards.filter((g) => !g.dead && (g.state === "patrol" || g.state === "return"));
      outer: for (const a of calmGuards) {
        if (dist2D(a.pos.x, a.pos.z, p.pos.x, p.pos.z) > 20) continue;
        for (const b of calmGuards) {
          if (a === b) continue;
          if (dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) < 6) {
            const [l1, l2] = CHATTER_LINES[Math.floor(Math.random() * CHATTER_LINES.length)];
            this.audio.bark("investigate", dist2D(a.pos.x, a.pos.z, p.pos.x, p.pos.z));
            this.hud.subtitle("GUARD:", l1, 2400);
            setTimeout(() => {
              if (!this.over && !this.paused) this.hud.subtitle("GUARD:", l2, 2400);
            }, 2600);
            break outer;
          }
        }
      }
    }

    // ---- smoke clouds ----
    p.inSmoke = false;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.t += dt;
      const life = 11;
      const grow = Math.min(1, sm.t * 1.6);
      const fade = sm.t > life - 2.5 ? Math.max(0, (life - sm.t) / 2.5) : 1;
      for (let j = 0; j < sm.puffs.length; j++) {
        const puff = sm.puffs[j];
        puff.scale.setScalar(grow * (1 + sm.t * 0.05));
        puff.rotation.y += dt * (0.15 + j * 0.03);
        puff.position.y += dt * 0.06;
        (puff.material as THREE.MeshLambertMaterial).opacity = 0.82 * grow * fade;
      }
      if (!p.dead && dist2D(p.pos.x, p.pos.z, sm.x, sm.z) < sm.r * grow * fade) p.inSmoke = true;
      if (sm.t > life) {
        for (const puff of sm.puffs) { this.scene.remove(puff); puff.geometry.dispose(); }
        this.smokes.splice(i, 1);
      }
    }

    // ---- decoy beacons ----
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t += dt;
      d.beepT -= dt;
      const ringMat = d.ring.material as THREE.MeshBasicMaterial;
      const pulse = (d.t * 1.4) % 1;
      d.ring.scale.setScalar(0.4 + pulse * 2.4);
      ringMat.opacity = 0.55 * (1 - pulse);
      (d.led.material as THREE.MeshLambertMaterial).emissiveIntensity = 1 + Math.sin(d.t * 14) * 1;
      if (d.beepT <= 0) {
        d.beepT = 0.9;
        this.audio.decoyBeep(dist2D(d.x, d.z, p.pos.x, p.pos.z));
        this.emitNoise({ x: d.x, z: d.z, radius: 17, kind: "stone" }, false);
      }
      if (d.t > 8) {
        this.scene.remove(d.mesh);
        this.decoys.splice(i, 1);
      }
    }

    // ---- EMP pulse rings ----
    for (let i = this.empPulses.length - 1; i >= 0; i--) {
      const e = this.empPulses[i];
      e.t += dt;
      e.mesh.scale.setScalar(1 + e.t * 26);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - e.t * 1.6);
      if (e.t > 0.6) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        this.empPulses.splice(i, 1);
      }
    }

    // ---- tracers & muzzle light ----
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.14) * 0.85;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 60);

    // ---- alarm timer ----
    if (this.alarmActive) {
      this.alarmT -= dt;
      const anyCombat = this.guards.some((g) => !g.dead && (g.state === "combat" || g.state === "alarm-run"));
      if (anyCombat) this.alarmT = Math.max(this.alarmT, 6);
      if (this.alarmT <= 0) {
        this.alarmActive = false;
        this.world.alarmActive = false;
        this.audio.stopAlarm();
      }
    }

    // ---- alert level / music / detection ticks ----
    let level: AlertLevel = "calm";
    // during the reflex window, the lone spotter doesn't count as full combat yet
    const anyCombat = this.guards.some((g) =>
      !g.dead && (g.state === "combat" || g.state === "alarm-run") && !(this.reflex && this.reflex.guard === g));
    const anySearch = this.alarmActive || this.guards.some((g) => !g.dead && g.state === "search");
    const anySus = !!this.reflex || this.guards.some((g) => !g.dead && (g.state === "suspicious" || g.state === "investigate" || g.awareness > 0.2));
    if (anyCombat) level = "combat";
    else if (anySearch) level = "search";
    else if (anySus) level = "suspicious";
    if (level === "combat" && !this.prevCombat) {
      this.stats.spotted++;
      this.audio.stinger();
    }
    this.prevCombat = level === "combat";
    if (level !== this.lastAlert) {
      this.lastAlert = level;
      this.hud.setAlert(level);
      this.audio.setMusicState(level as MusicState);
    }

    const ticks: { bearing: number; strength: number; hot: boolean }[] = [];
    for (const g of this.guards) {
      if (g.dead) continue;
      const show = g.awareness > 0.06 || g.state === "combat" || g.state === "search" || g.state === "investigate";
      if (!show) continue;
      const worldAng = Math.atan2(g.pos.x - p.pos.x, g.pos.z - p.pos.z);
      // camera forward bearing = rig.yaw + PI
      const bearing = -angleDelta(this.rig.yaw + Math.PI, worldAng);
      ticks.push({
        bearing,
        strength: g.state === "combat" ? 1 : clamp(g.awareness, 0.15, 1),
        hot: g.state === "combat" || g.state === "search",
      });
    }
    this.hud.setDetectionTicks(ticks);

    // ---- objectives / exfil ----
    // kill-target objectives complete when their guard goes down
    for (const s of this.objectives.states) {
      if (s.def.killGuard === undefined || s.done) continue;
      const target = this.guards[s.def.killGuard];
      if (target?.dead) {
        this.objectives.completeExternal(s.def.id);
        this.hud.toast("Target eliminated", `${s.def.label} — checkpoint saved`);
        this.makeCheckpoint();
      }
    }
    this.objectives.update(this.time);
    if (this.objectives.exfilActive && !this.exfilToastDone) {
      this.exfilToastDone = true;
    }
    const ex = this.level.def.exfil;
    if (this.objectives.exfilActive && this.endTimer < 0 && dist2D(p.pos.x, p.pos.z, ex.x, ex.z) < ex.r) {
      this.completeMission();
    }
    const ring = this.level.group.getObjectByName("exfil-ring") as THREE.Mesh | undefined;
    if (ring && this.objectives.exfilActive) {
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(this.time * 3) * 0.25;
    }

    // ---- water ----
    for (const w of this.level.waterMeshes) {
      const pos = w.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        pos.setZ(i, Math.sin(x * 0.25 + this.time * 1.3) * 0.09 + Math.cos(y * 0.3 + this.time * 0.9) * 0.07);
      }
      pos.needsUpdate = true;
    }

    // ---- shadow frustum follows player ----
    const sun = this.level.sun;
    const off = sun.position.clone().sub(sun.target.position);
    sun.target.position.set(p.pos.x, 0, p.pos.z);
    sun.position.copy(sun.target.position).add(off.normalize().multiplyScalar(70));

    // ---- camera ----
    this.rig.update(dt, p.pos, p.aiming, p.crouching, p.cover, p.running ? p.speed : 0);
    if (introActive && this.introT > 0) {
      const t = 1 - Math.max(0, this.introT / 4.2);
      const e = 1 - Math.pow(1 - t, 3);
      const cam = this.rig.camera;
      const pos = this.introFrom.clone().lerp(cam.position, e);
      cam.position.copy(pos);
      cam.lookAt(p.pos.x, 1.2 + (1 - e) * 2, p.pos.z);
    }
  }

  /** trigger a brief world freeze (takedown impact) */
  triggerHitStop(s = 0.09) {
    this.hitStop = s;
    this.rig.shake = Math.max(this.rig.shake, 0.35);
  }

  dispose() {
    this.audio.stopAlarm();
    this.audio.setAmbience("none");
    this.audio.setMusicState("off");
    this.hud.hide();
    this.hud.setDetectionTicks([]);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

/** does segment (x1,z1)-(x2,z2) pass within r of point (px,pz)? */
function segmentNearPoint(x1: number, z1: number, x2: number, z2: number, px: number, pz: number, r: number): boolean {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - x1) * dx + (pz - z1) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t, cz = z1 + dz * t;
  const ddx = px - cx, ddz = pz - cz;
  return ddx * ddx + ddz * ddz < r * r;
}

/** ray vs 3D AABB, returns entry t or null */
function rayAabb(o: THREE.Vector3, d: THREE.Vector3, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number | null {
  let tmin = 0, tmax = Infinity;
  const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
  const mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(da[i]) < 1e-9) {
      if (oa[i] < mn[i] || oa[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - oa[i]) / da[i], t2 = (mx[i] - oa[i]) / da[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
