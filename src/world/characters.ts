import * as THREE from "three";
import { mat, PALETTE } from "./materials";
import { clamp, damp, lerp } from "../core/mathutil";

/**
 * Low-poly humanoid with a procedural animation rig (no keyframe data).
 * Joints are pivot groups; poses are computed every frame from a small
 * parameter set (speed, crouch, aim, death...).
 */

export interface HumanoidStyle {
  suit: number;        // torso/limbs
  pants?: number;
  skin?: number;
  cap?: number | null; // cap color or null for none
  officer?: boolean;
}

export class Humanoid {
  root: THREE.Group;          // at feet, +Z forward is character facing -Z? we use -Z forward like three cameras? No: +Z forward for simplicity via lookAt handled by yaw.
  private pelvis: THREE.Group;
  private torso: THREE.Group;
  private headG: THREE.Group;
  private armL: THREE.Group; private armR: THREE.Group;      // shoulder pivots
  private foreL: THREE.Group; private foreR: THREE.Group;    // elbow pivots
  private legL: THREE.Group; private legR: THREE.Group;      // hip pivots
  private shinL: THREE.Group; private shinR: THREE.Group;    // knee pivots
  weaponG: THREE.Group;       // attached to right forearm
  flashlight: THREE.SpotLight | null = null;
  flashTarget: THREE.Object3D | null = null;

  private phase = 0;
  private deadT = -1;         // -1 alive; else seconds since death
  private crouchBlend = 0;
  private aimBlend = 0;
  private meshes: THREE.Mesh[] = [];

  constructor(style: HumanoidStyle, weapon: "rifle" | "pistol" | "none") {
    this.root = new THREE.Group();
    const suit = mat(style.suit, { flat: true });
    const pants = mat(style.pants ?? style.suit, { flat: true });
    const skin = mat(style.skin ?? PALETTE.skin, { flat: true });

    const B = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    // soft contact shadow so the character grounds visually
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.96;
    this.root.add(this.pelvis);
    B(0.42, 0.24, 0.26, pants, 0, 0.02, 0, this.pelvis);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.14;
    this.pelvis.add(this.torso);
    B(0.48, 0.58, 0.28, suit, 0, 0.32, 0, this.torso);
    // shoulders detail
    B(0.54, 0.12, 0.3, suit, 0, 0.58, 0, this.torso);
    if (style.officer) {
      B(0.1, 0.04, 0.31, mat(PALETTE.gold), -0.2, 0.62, 0, this.torso); // epaulettes
      B(0.1, 0.04, 0.31, mat(PALETTE.gold), 0.2, 0.62, 0, this.torso);
    }

    this.headG = new THREE.Group();
    this.headG.position.y = 0.72;
    this.torso.add(this.headG);
    B(0.14, 0.16, 0.15, skin, 0, -0.04, 0, this.headG); // neck: keeps the head visually connected in leaned poses
    B(0.26, 0.28, 0.26, skin, 0, 0.14, 0, this.headG);
    if (style.cap != null) {
      const capM = mat(style.cap, { flat: true });
      B(0.28, 0.1, 0.28, capM, 0, 0.31, 0, this.headG);
      B(0.28, 0.04, 0.14, capM, 0, 0.27, 0.19, this.headG); // brim (faces +Z = forward)
    } else {
      B(0.27, 0.08, 0.27, mat(0x27221c, { flat: true }), 0, 0.3, 0, this.headG); // hair
    }

    // arms — pivot at shoulder
    const mkArm = (side: number): [THREE.Group, THREE.Group] => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.31, 0.56, 0);
      this.torso.add(sh);
      B(0.14, 0.34, 0.16, suit, 0, -0.16, 0, sh);
      const el = new THREE.Group();
      el.position.y = -0.33;
      sh.add(el);
      B(0.12, 0.3, 0.13, suit, 0, -0.13, 0, el);
      B(0.11, 0.1, 0.12, skin, 0, -0.3, 0, el); // hand
      return [sh, el];
    };
    [this.armL, this.foreL] = mkArm(-1);
    [this.armR, this.foreR] = mkArm(1);

    // legs — pivot at hip
    const mkLeg = (side: number): [THREE.Group, THREE.Group] => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.13, -0.08, 0);
      this.pelvis.add(hip);
      B(0.17, 0.4, 0.19, pants, 0, -0.2, 0, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.4;
      hip.add(knee);
      B(0.15, 0.38, 0.16, pants, 0, -0.19, 0, knee);
      B(0.16, 0.1, 0.26, mat(0x2a251f, { flat: true }), 0, -0.42, 0.04, knee); // boot
      return [hip, knee];
    };
    [this.legL, this.shinL] = mkLeg(-1);
    [this.legR, this.shinR] = mkLeg(1);

    // weapon
    this.weaponG = new THREE.Group();
    this.foreR.add(this.weaponG);
    this.weaponG.position.set(0, -0.32, 0.05);
    if (weapon === "rifle") {
      const gm = mat(0x30322c, { flat: true });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.85), gm);
      body.position.z = 0.2; body.castShadow = true;
      this.weaponG.add(body);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.25), mat(PALETTE.woodDark, { flat: true }));
      stock.position.z = -0.22;
      this.weaponG.add(stock);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), gm);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.72;
      this.weaponG.add(barrel);
    } else if (weapon === "pistol") {
      const gm = mat(0x24262a, { flat: true });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.24), gm);
      body.position.set(0, 0, 0.1); body.castShadow = true;
      this.weaponG.add(body);
      const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), gm);
      suppressor.rotation.x = Math.PI / 2;
      suppressor.position.set(0, 0.02, 0.31);
      this.weaponG.add(suppressor);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), mat(PALETTE.woodDark, { flat: true }));
      grip.position.set(0, -0.09, 0.0);
      grip.rotation.x = 0.25;
      this.weaponG.add(grip);
    }
  }

  addFlashlight(scene: THREE.Scene) {
    this.flashlight = new THREE.SpotLight(0xffe9b8, 40, 18, 0.42, 0.5, 1.6);
    this.flashlight.position.set(0, 0.05, 0.2);
    this.flashTarget = new THREE.Object3D();
    this.weaponG.add(this.flashlight);
    this.weaponG.add(this.flashTarget);
    this.flashTarget.position.set(0, 0, 6);
    this.flashlight.target = this.flashTarget;
    // visible beam shaft
    const geo = new THREE.CylinderGeometry(1.7, 0.05, 8, 12, 1, true);
    geo.rotateX(Math.PI / 2); // axis -> +Z, wide end far
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffe9b8, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    beam.position.set(0, 0.05, 4.2);
    beam.name = "flash-beam";
    this.weaponG.add(beam);
  }

  /**
   * @param speed horizontal speed m/s
   * @param headYaw local head turn (radians) e.g. guard scanning
   */
  update(dt: number, p: {
    speed: number; run?: boolean; crouch?: boolean; aim?: boolean;
    pitch?: number; headYaw?: number; dead?: boolean; carried?: boolean; cover?: boolean;
    stagger?: number;
  }) {
    if (p.dead) {
      if (this.deadT < 0) this.deadT = 0;
      this.deadT += dt;
      const t = Math.min(1, this.deadT * 2.2);
      const e = 1 - (1 - t) * (1 - t); // ease out
      this.root.rotation.x = p.carried ? 0 : lerp(this.root.rotation.x, -Math.PI / 2, e * 0.2 + (t === 1 ? 1 : 0));
      // simpler: rotate about local X to fall backward-ish
      this.root.rotation.x = -e * (Math.PI / 2) * 0.98;
      this.pelvis.position.y = lerp(0.96, 0.45, e);
      // limbs sprawl
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.9, e);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -1.1, e);
      this.armL.rotation.x = this.armR.rotation.x = 0;
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0.2, e);
      this.legR.rotation.x = lerp(this.legR.rotation.x, -0.15, e);
      this.headG.rotation.y = lerp(this.headG.rotation.y, 0.5, e);
      return;
    }

    this.crouchBlend = damp(this.crouchBlend, p.crouch ? 1 : 0, 10, dt);
    this.aimBlend = damp(this.aimBlend, p.aim ? 1 : 0, 12, dt);
    const c = this.crouchBlend, a = this.aimBlend;

    const moving = p.speed > 0.15;
    const freq = p.run ? 11 : p.crouch ? 6.5 : 8;
    if (moving) this.phase += dt * freq * clamp(p.speed / 3, 0.4, 1.6);
    const swing = moving ? Math.sin(this.phase) : 0;
    const swing2 = moving ? Math.sin(this.phase + Math.PI) : 0;
    const amp = (p.run ? 0.85 : 0.55) * (1 - c * 0.4);

    // crouch pose (see CROUCH_TUNE below: deep hips + hunched torso)
    const CT = CROUCH_TUNE;
    this.pelvis.rotation.x = c * CT.pelvisRotX;
    this.pelvis.position.z = CT.pelvisZ * c;
    this.torso.rotation.x = c * CT.torso + (p.run && moving ? 0.14 : 0) - (p.pitch ?? 0) * 0.25 * a;
    this.headG.rotation.x = c * CT.head + (p.pitch ?? 0) * 0.5;
    this.headG.rotation.y = damp(this.headG.rotation.y, p.headYaw ?? 0, 8, dt);

    // NOTE joint sign convention (character faces +Z): hip flexion (thigh
    // swings FORWARD) is NEGATIVE rotation.x; knee flexion (heel folds BACK
    // toward the butt) is POSITIVE rotation.x.
    const thighBase = -c * CT.thigh;
    const kneeBase = c * CT.knee;
    const strideAmp = amp * (1 - c * 0.5);
    // staggered stance + slight knee splay make the held crouch read natural
    this.legL.rotation.x = thighBase - c * CT.stagger + swing * strideAmp;
    this.legR.rotation.x = thighBase + c * CT.stagger + swing2 * strideAmp;
    // splay: left leg is -X, so OUTWARD for it is negative rotation.z
    this.legL.rotation.z = -c * CT.splay;
    this.legR.rotation.z = c * CT.splay;
    const stepL = moving ? Math.max(0, -Math.sin(this.phase - 0.6)) * strideAmp * 1.1 : 0;
    const stepR = moving ? Math.max(0, -Math.sin(this.phase + Math.PI - 0.6)) * strideAmp * 1.1 : 0;
    this.shinL.rotation.x = Math.max(0.001, kneeBase + stepL);
    this.shinR.rotation.x = Math.max(0.001, kneeBase + stepR);

    // pelvis height from the actual leg chain so the feet stay planted at any
    // crouch depth (thigh 0.40m + shin 0.42m, hip pivot 0.08 below pelvis, boot 0.05)
    const chain = (thigh: number, knee: number) =>
      0.4 * Math.cos(thigh) + 0.42 * Math.cos(thigh + knee);
    const stance = Math.max(
      chain(this.legL.rotation.x, this.shinL.rotation.x),
      chain(this.legR.rotation.x, this.shinR.rotation.x)
    );
    const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.035 * (1 - c * 0.5) : 0;
    // upright uses the classic fixed height (floating mid-stride feet read
    // better than a dipping pelvis); crouch grounds to the actual leg chain
    // so bent knees always plant on the floor (slight press > slight float)
    const chainY = clamp(stance, 0.35, 0.83) + CROUCH_TUNE.lift;
    this.pelvis.position.y = lerp(0.96, chainY, c) + bob;

    // arms: swing when moving; crouch pulls them into a guarded ready pose;
    // aim pose overrides the right arm
    const armAmp = amp * 0.7 * (1 - c * 0.4);
    const idleSway = Math.sin(this.phase * 0.4) * 0.03;
    const armCrouch = -0.38 * c; // held forward, elbows in
    this.armL.rotation.x = swing2 * armAmp * (1 - a * 0.4) + idleSway + armCrouch;
    this.armL.rotation.z = 0.08 + c * 0.06;
    this.foreL.rotation.x = -0.25 - c * 0.55 - (moving ? Math.abs(swing2) * 0.3 : 0);

    // right arm: blend between swing and aim-forward
    const aimPitch = (p.pitch ?? 0);
    this.armR.rotation.x = lerp(swing * armAmp + idleSway + armCrouch, -Math.PI / 2 + aimPitch, a);
    this.armR.rotation.z = lerp(-0.08 - c * 0.06, 0, a);
    this.foreR.rotation.x = lerp(-0.25 - c * 0.55 - (moving ? Math.abs(swing) * 0.3 : 0), 0, a);
    this.weaponG.rotation.x = lerp(1.2, Math.PI / 2, a); // holstered-ish angle vs level

    // left hand supports weapon when aiming
    if (a > 0.5) {
      this.armL.rotation.x = -Math.PI / 2 + aimPitch + 0.15;
      this.armL.rotation.z = 0.5;
      this.foreL.rotation.x = -0.3;
    }

    // flinch: recoil back and hunch when a shot lands but doesn't kill
    if (p.stagger && p.stagger > 0) {
      const st = p.stagger;
      this.torso.rotation.x -= st * 0.35;
      this.headG.rotation.x += st * 0.25;
      this.armL.rotation.x -= st * 0.7;
      this.armR.rotation.x -= st * 0.5;
      this.pelvis.position.z -= st * 0.1;
    }

    // back-to-wall cover: pressed flat, arms spread against the surface
    if (p.cover && a < 0.5) {
      this.torso.rotation.x = -0.09;
      this.headG.rotation.x = 0.05;
      this.armL.rotation.x = lerp(this.armL.rotation.x, -0.1, 0.8);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -0.1, 0.8);
      this.armL.rotation.z = 0.42;
      this.armR.rotation.z = -0.42;
      this.foreL.rotation.x = -0.12;
      this.foreR.rotation.x = -0.12;
      this.weaponG.rotation.x = 1.4;
    }
  }

  /** briefly used for takedown lunge */
  takedownPose(t: number) {
    const e = Math.sin(Math.min(1, t) * Math.PI);
    this.armL.rotation.x = -1.9 * e;
    this.armR.rotation.x = -1.6 * e;
    this.torso.rotation.x = 0.5 * e;
  }

  setOpacity(o: number) {
    for (const m of this.meshes) {
      const mm = m.material as THREE.MeshLambertMaterial;
      if (o >= 1) { mm.transparent = false; mm.opacity = 1; }
      else {
        if (!mm.transparent) { m.material = mm.clone(); (m.material as THREE.MeshLambertMaterial).transparent = true; }
        (m.material as THREE.MeshLambertMaterial).opacity = o;
      }
    }
  }
}

/** crouch pose constants (radians / meters) — a coiled stalk: deep hips + hunch */
export const CROUCH_TUNE = {
  // pure vertical compression: body drops straight down, torso/head stay
  // upright; knee fold = 2x thigh angle keeps each foot under its hip
  thigh: 1.0,
  knee: 2.0,
  torso: 0.22,      // slight forward incline (stalking intent)
  head: -0.16,      // counter-tilt keeps the gaze level
  pelvisRotX: 0.02,
  pelvisZ: -0.05,   // hips ease back to balance the incline
  lift: 0.1,        // hip height above the computed leg chain
  stagger: 0.12,    // slight leading foot so the held pose isn't robotic
  splay: 0.16,      // knees rotated outward, clearly apart
};

export const GUARD_STYLE: HumanoidStyle = { suit: PALETTE.uniformOlive, pants: 0x4c5039, cap: 0x3f4230 };
export const OFFICER_STYLE: HumanoidStyle = { suit: PALETTE.uniformOfficer, pants: 0x5a626a, cap: 0x454d55, officer: true };
export const PLAYER_STYLE: HumanoidStyle = { suit: PALETTE.spySuit, pants: 0x2a2e34, cap: null };
