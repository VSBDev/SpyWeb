import * as THREE from "three";
import { Humanoid, GUARD_STYLE, OFFICER_STYLE } from "../world/characters";
import { angleDelta, clamp, dampAngle, dist2D, resolveCircleBox, type BoxCollider } from "../core/mathutil";
import type { GuardDef, PatrolPoint } from "../world/levelkit";
import type { NavGrid } from "./nav";
import type { Player, NoiseEvent } from "./player";
import type { AudioEngine } from "../core/audio";

export type GuardState = "patrol" | "suspicious" | "investigate" | "search" | "combat" | "return" | "alarm-run" | "dead";

export interface AIWorld {
  player: Player;
  nav: NavGrid;
  colliders: BoxCollider[];
  guards: Guard[];
  night: boolean;
  audio: AudioEngine;
  alarmActive: boolean;
  /** line of sight test — blockH is min collider height that occludes */
  los(x1: number, z1: number, x2: number, z2: number, blockH: number): boolean;
  raiseAlarm(atX: number, z: number): void;
  onGuardAlerted(): void;               // any guard entered combat
  onGuardShoot(g: Guard): void;         // resolve guard -> player shot
  bark(g: Guard, kind: "curious" | "investigate" | "spotted" | "search" | "lost" | "body" | "alarm" | "buddy"): void;
  /** returns true if a reflex window was granted (combat wave deferred) */
  tryReflex(g: Guard): boolean;
  alarmPanels: { x: number; z: number }[];
  notifyCombatNoise(x: number, z: number): void;
}

const FOV_HALF = 0.92;          // ~105° total
const PERIPHERAL = 2.4;         // radians half-angle within closeRange
const CLOSE_RANGE = 3.2;

let questionTex: THREE.Texture | null = null;
let bangTex: THREE.Texture | null = null;
function markTexture(text: string, color: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 52px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 7;
  ctx.strokeText(text, 32, 36);
  ctx.fillStyle = color;
  ctx.fillText(text, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** flat sector mesh used for tactical-view vision cones */
function coneGeometry(): THREE.BufferGeometry {
  const segs = 22;
  const verts: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = -FOV_HALF + (i / segs) * FOV_HALF * 2;
    const a1 = -FOV_HALF + ((i + 1) / segs) * FOV_HALF * 2;
    verts.push(0, 0, 0, Math.sin(a0), 0, Math.cos(a0), Math.sin(a1), 0, Math.cos(a1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  return g;
}
let sharedConeGeo: THREE.BufferGeometry | null = null;

export class Guard {
  pos = new THREE.Vector3();
  yaw = 0;
  state: GuardState = "patrol";
  hp: number;
  officer: boolean;
  dead = false;
  awareness = 0;
  lastKnown = { x: 0, z: 0 };
  discoveredBody = false;      // this guard's corpse has been found
  beingDragged = false;
  barkT = 0;                   // per-guard bark cooldown, managed by the mission
  dumped = false;              // body disposed of in a well — gone for good
  seesPlayer = false;          // true on frames where the player is in this guard's sight
  buddy = -1;                  // index of the patrol partner this guard keeps an eye on
  private buddyCheckT = 15 + Math.random() * 25;
  private staggerT = 0;        // flinch timer after surviving a hit
  humanoid: Humanoid;
  def: GuardDef;

  private patrol: PatrolPoint[];
  private patrolIdx = 0;
  private waitT = 0;
  private stateT = 0;
  private path: [number, number][] | null = null;
  private pathIdx = 0;
  private repathT = 0;
  private shootT = 2.0;
  private searchPts: [number, number][] = [];
  private searchIdx = 0;
  private scanT = 0;
  private headYaw = 0;
  private speed = 0;
  private home: { x: number; z: number };
  private homeAngle: number;
  private alarmTarget: { x: number; z: number } | null = null;
  private curiousGrace = 0;    // brief pause before investigating

  visionMesh: THREE.Mesh;
  private marker: THREE.Sprite;
  private markerMat: THREE.SpriteMaterial;

  constructor(def: GuardDef, scene: THREE.Scene, night: boolean) {
    this.def = def;
    this.officer = !!def.officer;
    this.hp = this.officer ? 3 : 2;
    this.pos.set(def.x, 0, def.z);
    this.yaw = def.angle ?? 0;
    this.home = { x: def.x, z: def.z };
    this.homeAngle = def.angle ?? 0;
    this.patrol = def.patrol ?? [];
    this.humanoid = new Humanoid(this.officer ? OFFICER_STYLE : GUARD_STYLE, "rifle");
    this.humanoid.root.position.copy(this.pos);
    this.humanoid.root.rotation.y = this.yaw;
    scene.add(this.humanoid.root);
    if (night) this.humanoid.addFlashlight(scene);

    if (!sharedConeGeo) sharedConeGeo = coneGeometry();
    this.visionMesh = new THREE.Mesh(
      sharedConeGeo,
      new THREE.MeshBasicMaterial({ color: 0x4fd8c8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
    );
    this.visionMesh.position.y = 0.12;
    this.visionMesh.visible = false;
    scene.add(this.visionMesh);

    if (!questionTex) questionTex = markTexture("?", "#ffd479");
    if (!bangTex) bangTex = markTexture("!", "#ff5c44");
    this.markerMat = new THREE.SpriteMaterial({ map: questionTex, transparent: true, opacity: 0, depthTest: false });
    this.marker = new THREE.Sprite(this.markerMat);
    this.marker.scale.set(0.7, 0.7, 1);
    this.marker.renderOrder = 50;
    scene.add(this.marker);
  }

  get viewDist(): number {
    const base = this.officer ? 26 : 23;
    return this.stateBoost * base;
  }
  private get stateBoost(): number {
    return this.state === "combat" || this.state === "search" ? 1.2 : 1;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.humanoid.root);
    scene.remove(this.visionMesh);
    scene.remove(this.marker);
  }

  /** checkpoint restore: dead on arrival, no sounds or alerts */
  forceDead(dumped: boolean) {
    this.dead = true;
    this.state = "dead";
    this.awareness = 0;
    this.discoveredBody = false;
    this.visionMesh.visible = false;
    this.markerMat.opacity = 0;
    if (this.humanoid.flashlight) this.humanoid.flashlight.intensity = 0;
    // converge the death pose instantly
    for (let i = 0; i < 4; i++) this.humanoid.update(0.5, { speed: 0, dead: true });
    this.humanoid.root.position.copy(this.pos);
    if (dumped) {
      this.dumped = true;
      this.humanoid.root.visible = false;
      this.pos.y = -10;
    }
  }

  kill(world: AIWorld, silent: boolean) {
    if (this.dead) return;
    this.dead = true;
    this.state = "dead";
    // anyone watching this man drop reacts NOW, not when they trip over him
    for (const w of world.guards) {
      if (w === this || w.dead || w.state === "combat" || w.state === "alarm-run") continue;
      const d = dist2D(w.pos.x, w.pos.z, this.pos.x, this.pos.z);
      if (d > w.viewDist * 0.85) continue;
      const angTo = Math.atan2(this.pos.x - w.pos.x, this.pos.z - w.pos.z);
      if (Math.abs(angleDelta(w.yaw, angTo)) > FOV_HALF) continue;
      if (!world.los(w.pos.x, w.pos.z, this.pos.x, this.pos.z, 0.85)) continue;
      this.discoveredBody = true; // seen falling — no later "discovery" needed
      w.lastKnown = { x: world.player.pos.x, z: world.player.pos.z };
      w.witnessKill(world);
    }
    this.awareness = 0;
    this.visionMesh.visible = false;
    this.markerMat.opacity = 0;
    if (this.humanoid.flashlight) this.humanoid.flashlight.intensity = 0;
    world.audio.bodyFall(dist2D(this.pos.x, this.pos.z, world.player.pos.x, world.player.pos.z));
    if (!silent) world.notifyCombatNoise(this.pos.x, this.pos.z);
  }

  hit(world: AIWorld, dmg: number, sneaky: boolean) {
    if (this.dead) return;
    this.hp -= sneaky && this.state !== "combat" ? 99 : dmg;
    if (this.hp <= 0) {
      this.kill(world, true);
    } else {
      // survived a shot: flinch, then instant combat
      this.staggerT = 0.4;
      this.lastKnown = { x: world.player.pos.x, z: world.player.pos.z };
      this.enterCombat(world);
    }
  }

  /** does this guard notice the given noise? */
  onNoise(n: NoiseEvent, world: AIWorld) {
    if (this.dead || this.state === "combat") return;
    const d = dist2D(this.pos.x, this.pos.z, n.x, n.z);
    if (d > n.radius) return;
    const jitter = n.kind === "footstep" ? 2.5 : 0.8;
    const target = {
      x: n.x + (Math.random() - 0.5) * jitter,
      z: n.z + (Math.random() - 0.5) * jitter,
    };
    if (n.kind === "shot" || n.kind === "loud" || n.kind === "body") {
      this.lastKnown = target;
      this.startSearch(world, target.x, target.z);
      world.audio.guardAlert("curious");
      world.bark(this, "search");
    } else {
      this.lastKnown = target;
      if (this.state === "investigate" || this.state === "suspicious") {
        this.startInvestigate(world, target.x, target.z);
      } else {
        this.state = "suspicious";
        this.stateT = 0;
        this.curiousGrace = 0.8;
        this.awareness = Math.max(this.awareness, 0.42);
        world.audio.guardAlert("curious");
        world.bark(this, "curious");
      }
    }
  }

  private startInvestigate(world: AIWorld, x: number, z: number) {
    this.state = "investigate";
    this.stateT = 0;
    this.path = world.nav.findPath(this.pos.x, this.pos.z, x, z);
    this.pathIdx = 0;
  }

  startSearch(world: AIWorld, x: number, z: number) {
    this.state = "search";
    this.stateT = 0;
    this.searchPts = [];
    this.searchIdx = 0;
    // first point: the stimulus itself, then two random nearby
    this.searchPts.push([x, z]);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 6;
      const g = world.nav.nearestWalkable(x + Math.cos(a) * r, z + Math.sin(a) * r, 4);
      if (g) this.searchPts.push(world.nav.toWorld(g[0], g[1]));
    }
    this.path = world.nav.findPath(this.pos.x, this.pos.z, x, z);
    this.pathIdx = 0;
  }

  private enterCombat(world: AIWorld) {
    if (this.state === "combat" || this.state === "alarm-run") {
      this.awareness = 1;
      return;
    }
    world.audio.guardAlert("spotted");
    world.bark(this, "spotted");
    world.onGuardAlerted();
    this.state = "combat";
    this.stateT = 0;
    this.awareness = 1;
    this.repathT = 0;
    // fairness: no instant execution — first shot comes after a beat
    this.shootT = Math.max(this.shootT, 1.15);
    // reflex window: the spotter engages alone; kill him before it ends and
    // the compound never hears about it
    if (!world.tryReflex(this)) this.raiseCombatWave(world);
  }

  /** spread the alert: contagion + possible alarm dash (deferred during reflex) */
  raiseCombatWave(world: AIWorld) {
    if (this.dead) return;
    // combat is contagious: nearby guards join
    for (const g of world.guards) {
      if (g === this || g.dead || g.state === "combat") continue;
      if (dist2D(g.pos.x, g.pos.z, this.pos.x, this.pos.z) < 18) {
        g.lastKnown = { ...this.lastKnown };
        g.startSearch(world, this.lastKnown.x, this.lastKnown.z);
      }
    }
    // run for an alarm panel if one is close and we're not the only one left
    if (!world.alarmActive && world.alarmPanels.length > 0 && Math.random() < 0.65) {
      let best: { x: number; z: number } | null = null;
      let bestD = 30;
      for (const p of world.alarmPanels) {
        const d = dist2D(this.pos.x, this.pos.z, p.x, p.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD > 3) {
        world.bark(this, "alarm");
        this.alarmTarget = best;
        this.state = "alarm-run";
        this.path = world.nav.findPath(this.pos.x, this.pos.z, best.x, best.z);
        this.pathIdx = 0;
      }
    }
  }

  /** a comrade just dropped in front of this guard: immediate combat */
  witnessKill(world: AIWorld) {
    world.bark(this, "body");
    this.enterCombat(world);
  }

  /** visibility factor 0..1 for the player right now */
  private visibility(world: AIWorld): number {
    const p = world.player;
    if (p.dead) return 0;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    let maxD = this.viewDist * (world.night ? 0.62 : 1);
    if (p.crouching) maxD *= 0.66;
    if (p.cover) maxD *= 0.62; // pressed flat against a wall: much smaller profile
    if (p.hidden || p.inSmoke) maxD = CLOSE_RANGE; // grass or smoke: only visible point blank
    if (d > maxD) return 0;
    const angTo = Math.atan2(dx, dz);
    const inFov = Math.abs(angleDelta(this.yaw, angTo)) < (d < CLOSE_RANGE ? PERIPHERAL : FOV_HALF);
    if (!inFov) return 0;
    const blockH = p.crouching ? 0.85 : 1.35;
    if (!world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, blockH)) return 0;
    // closer = more visible; running player more visible
    let v = 1 - (d / maxD) * 0.75;
    if (p.running) v = Math.min(1, v * 1.5);
    if (p.speed < 0.1 && p.crouching) v *= 0.7;
    return v;
  }

  update(dt: number, world: AIWorld) {
    if (this.dead) {
      this.humanoid.update(dt, { speed: 0, dead: true, carried: this.beingDragged });
      this.humanoid.root.position.copy(this.pos);
      this.markerMat.opacity = 0;
      return;
    }
    this.stateT += dt;
    this.shootT -= dt;
    this.barkT = Math.max(0, this.barkT - dt);

    // ---------- perception ----------
    const vis = this.visibility(world);
    this.seesPlayer = vis > 0;
    this.staggerT = Math.max(0, this.staggerT - dt);
    const rate = (this.officer ? 1.5 : 1.05) * (world.alarmActive ? 1.6 : 1);
    if (vis > 0) {
      this.awareness = clamp(this.awareness + vis * rate * dt * (this.state === "search" ? 1.8 : 1), 0, 1);
      this.lastKnown = { x: world.player.pos.x, z: world.player.pos.z };
      const d = dist2D(this.pos.x, this.pos.z, world.player.pos.x, world.player.pos.z);
      if (this.awareness >= 1 || d < CLOSE_RANGE * 0.8) this.enterCombat(world);
      else if (this.awareness > 0.34 && (this.state === "patrol" || this.state === "return")) {
        this.state = "suspicious";
        this.stateT = 0;
        this.curiousGrace = 1.0;
        world.audio.guardAlert("curious");
        world.bark(this, "curious");
      }
    } else if (this.state !== "combat") {
      this.awareness = Math.max(0, this.awareness - dt * 0.24);
    }

    // ---------- body discovery ----------
    if (this.state === "patrol" || this.state === "suspicious" || this.state === "investigate" || this.state === "return") {
      for (const g of world.guards) {
        if (!g.dead || g.discoveredBody || g.beingDragged || g.dumped) continue;
        const d = dist2D(this.pos.x, this.pos.z, g.pos.x, g.pos.z);
        if (d > this.viewDist * 0.6) continue;
        const angTo = Math.atan2(g.pos.x - this.pos.x, g.pos.z - this.pos.z);
        if (Math.abs(angleDelta(this.yaw, angTo)) > FOV_HALF) continue;
        if (!world.los(this.pos.x, this.pos.z, g.pos.x, g.pos.z, 0.85)) continue;
        g.discoveredBody = true;
        world.audio.guardAlert("spotted");
        world.bark(this, "body");
        world.raiseAlarm(g.pos.x, g.pos.z);
        this.startSearch(world, g.pos.x, g.pos.z);
        break;
      }
    }

    // ---------- state behavior ----------
    let targetYaw = this.yaw;
    let wantSpeed = 0;
    const p = world.player;

    switch (this.state) {
      case "patrol": {
        this.headYaw = Math.sin(this.stateT * 0.8) * 0.4;
        // periodic buddy check: a missing partner is a red flag
        this.buddyCheckT -= dt;
        if (this.buddyCheckT <= 0) {
          this.buddyCheckT = 30 + Math.random() * 25;
          const b = this.buddy >= 0 ? world.guards[this.buddy] : null;
          if (b && (b.dead || b.dumped)) {
            world.bark(this, "buddy");
            this.awareness = Math.max(this.awareness, 0.5);
            this.startInvestigate(world, b.def.x, b.def.z);
            break;
          }
        }
        if (this.patrol.length === 0) {
          // static sentry: drift back to post
          const dHome = dist2D(this.pos.x, this.pos.z, this.home.x, this.home.z);
          if (dHome > 1) {
            const g = this.followPathTo(world, this.home.x, this.home.z, 1.6);
            wantSpeed = g.speed; targetYaw = g.yaw;
          } else {
            targetYaw = this.homeAngle;
          }
          break;
        }
        const wp = this.patrol[this.patrolIdx];
        const d = dist2D(this.pos.x, this.pos.z, wp.x, wp.z);
        if (d < 0.7) {
          if (this.waitT <= 0) this.waitT = wp.wait ?? 1.2;
          this.waitT -= dt;
          targetYaw = wp.look ?? this.yaw;
          if (this.waitT <= 0) {
            this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
            this.path = null;
          }
        } else {
          const g = this.followPathTo(world, wp.x, wp.z, 1.7);
          wantSpeed = g.speed; targetYaw = g.yaw;
        }
        break;
      }
      case "suspicious": {
        // stop, stare at the stimulus
        targetYaw = Math.atan2(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
        this.headYaw = 0;
        this.curiousGrace -= dt;
        if (this.awareness <= 0.02) { this.toReturn(world); break; }
        if (this.curiousGrace <= 0 && this.stateT > 1.6) {
          this.startInvestigate(world, this.lastKnown.x, this.lastKnown.z);
        }
        break;
      }
      case "investigate": {
        const g = this.followPathTo(world, this.lastKnown.x, this.lastKnown.z, 2.3);
        wantSpeed = g.speed; targetYaw = g.yaw;
        if (g.arrived) {
          this.scanT += dt;
          this.headYaw = Math.sin(this.scanT * 1.6) * 0.9;
          if (this.scanT > 3.4) { this.scanT = 0; world.bark(this, "lost"); this.toReturn(world); }
        }
        if (this.awareness <= 0.01 && this.stateT > 10) this.toReturn(world);
        break;
      }
      case "search": {
        if (this.searchIdx >= this.searchPts.length) { world.bark(this, "lost"); this.toReturn(world); break; }
        const [sx, sz] = this.searchPts[this.searchIdx];
        const g = this.followPathTo(world, sx, sz, 3.0);
        wantSpeed = g.speed; targetYaw = g.yaw;
        if (g.arrived) {
          this.scanT += dt;
          this.headYaw = Math.sin(this.scanT * 2.0) * 1.0;
          if (this.scanT > 2.4) { this.scanT = 0; this.searchIdx++; this.path = null; }
        }
        break;
      }
      case "alarm-run": {
        if (!this.alarmTarget || world.alarmActive) { this.enterCombatDirect(world); break; }
        const g = this.followPathTo(world, this.alarmTarget.x, this.alarmTarget.z, 3.6);
        wantSpeed = g.speed; targetYaw = g.yaw;
        if (g.arrived) {
          world.raiseAlarm(p.pos.x, p.pos.z);
          world.audio.guardAlert("radio");
          this.alarmTarget = null;
          this.enterCombatDirect(world);
        }
        break;
      }
      case "combat": {
        const d = dist2D(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        const seesNow = vis > 0;
        if (seesNow) {
          this.stateT = 0; // reset lost-sight timer
          targetYaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          // hold at mid range, advance if far
          if (d > 11) {
            const g = this.followPathTo(world, p.pos.x, p.pos.z, 3.7, true);
            wantSpeed = g.speed; targetYaw = g.yaw;
          }
          // shoot
          if (this.shootT <= 0 && d < 28 && !p.dead) {
            this.shootT = 1.05 + Math.random() * 0.6;
            world.onGuardShoot(this);
          }
        } else {
          // advance to last known
          const g = this.followPathTo(world, this.lastKnown.x, this.lastKnown.z, 3.7, true);
          wantSpeed = g.speed; targetYaw = g.yaw;
          if (g.arrived || this.stateT > 7) {
            this.startSearch(world, this.lastKnown.x, this.lastKnown.z);
          }
        }
        break;
      }
      case "return": {
        const g = this.followPathTo(world, this.home.x, this.home.z, 1.8);
        wantSpeed = g.speed; targetYaw = g.yaw;
        if (g.arrived) {
          this.state = "patrol";
          this.stateT = 0;
          this.awareness = Math.min(this.awareness, 0.2);
          this.path = null;
        }
        break;
      }
      case "dead": break;
    }

    // ---------- movement & separation ----------
    this.speed = wantSpeed;
    this.yaw = dampAngle(this.yaw, targetYaw, wantSpeed > 0 ? 9 : 5, dt);
    if (wantSpeed > 0) {
      // walk along faced direction (throttled while still turning hard)
      const align = Math.max(0.25, 1 - Math.abs(angleDelta(this.yaw, targetYaw)) / Math.PI);
      this.pos.x += Math.sin(this.yaw) * wantSpeed * align * dt;
      this.pos.z += Math.cos(this.yaw) * wantSpeed * align * dt;
      // separation from other guards
      for (const g of world.guards) {
        if (g === this || g.dead) continue;
        const dx = this.pos.x - g.pos.x, dz = this.pos.z - g.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.2 * 1.2 && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          this.pos.x += (dx / d) * dt * 1.2;
          this.pos.z += (dz / d) * dt * 1.2;
        }
      }
      let nx = this.pos.x, nz = this.pos.z;
      for (const c of world.colliders) {
        if (!c.solid) continue;
        [nx, nz] = resolveCircleBox(nx, nz, 0.4, c);
      }
      this.pos.x = nx; this.pos.z = nz;
    }

    // ---------- presentation ----------
    this.humanoid.root.position.copy(this.pos);
    this.humanoid.root.rotation.y = this.yaw;
    this.humanoid.update(dt, {
      speed: this.speed,
      run: this.speed > 2.8,
      headYaw: this.headYaw,
      aim: this.state === "combat" && vis > 0,
      stagger: this.staggerT > 0 ? this.staggerT / 0.4 : 0,
    });

    // marker sprite: continuous awareness ramp so detection never feels sudden —
    // it fades in, grows, and turns red as the meter fills
    const alerted = this.state === "combat" || this.state === "search" || this.state === "alarm-run";
    const wantMark = alerted ? 1
      : this.state === "investigate" ? 0.85
      : this.awareness > 0.05 ? 0.25 + this.awareness * 0.75 : 0;
    this.markerMat.map = (alerted || this.awareness > 0.72) ? bangTex : questionTex;
    this.markerMat.opacity += (wantMark - this.markerMat.opacity) * Math.min(1, dt * 10);
    const mScale = 0.5 + Math.min(1, alerted ? 1 : this.awareness) * 0.45;
    this.marker.scale.set(mScale, mScale, 1);
    this.marker.position.set(this.pos.x, 2.45, this.pos.z);

    // vision cone (tactical view only; game toggles visibility)
    const range = Math.min(this.viewDist * (world.night ? 0.62 : 1), 16);
    this.visionMesh.position.set(this.pos.x, 0.12, this.pos.z);
    this.visionMesh.rotation.y = this.yaw;
    this.visionMesh.scale.set(range, 1, range);
    const cmat = this.visionMesh.material as THREE.MeshBasicMaterial;
    if (this.state === "combat" || this.state === "alarm-run") cmat.color.setHex(0xff5c44);
    else if (this.awareness > 0.15 || this.state === "investigate" || this.state === "search") cmat.color.setHex(0xffc24f);
    else cmat.color.setHex(0x4fd8c8);
  }

  private enterCombatDirect(world: AIWorld) {
    this.state = "combat";
    this.stateT = 0;
    this.awareness = 1;
    this.path = null;
    world.onGuardAlerted();
  }

  private toReturn(world: AIWorld) {
    this.state = "return";
    this.stateT = 0;
    this.path = null;
    this.scanT = 0;
  }

  /** path-following helper */
  private followPathTo(world: AIWorld, tx: number, tz: number, speed: number, repath = false): { speed: number; yaw: number; arrived: boolean } {
    const arriveDist = 0.7;
    const dDirect = dist2D(this.pos.x, this.pos.z, tx, tz);
    if (dDirect < arriveDist) return { speed: 0, yaw: this.yaw, arrived: true };

    this.repathT -= 1 / 60;
    const stale = this.path && dist2D(this.path[this.path.length - 1][0], this.path[this.path.length - 1][1], tx, tz) > 2.5;
    const needPath = !this.path || this.pathIdx >= this.path.length || stale || (repath && this.repathT <= 0);
    if (needPath) {
      this.repathT = 1.1;
      this.path = world.nav.findPath(this.pos.x, this.pos.z, tx, tz);
      this.pathIdx = 0;
      if (!this.path || this.path.length === 0) {
        // unreachable: face it and creep forward; collisions will slide us
        const yaw = Math.atan2(tx - this.pos.x, tz - this.pos.z);
        return { speed: speed * 0.4, yaw, arrived: false };
      }
    }
    const wp = this.path![this.pathIdx];
    const d = dist2D(this.pos.x, this.pos.z, wp[0], wp[1]);
    if (d < 0.55) {
      this.pathIdx++;
      if (this.pathIdx >= this.path!.length) return { speed: 0, yaw: this.yaw, arrived: dDirect < 1.8 };
    }
    const cur = this.path![Math.min(this.pathIdx, this.path!.length - 1)];
    const yaw = Math.atan2(cur[0] - this.pos.x, cur[1] - this.pos.z);
    return { speed, yaw, arrived: false };
  }
}
