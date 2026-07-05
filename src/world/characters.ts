import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat, PALETTE } from "./materials";
import { clamp, damp, lerp } from "../core/mathutil";

/**
 * Skinned humanoid with a real bone rig. The skeleton is built in code
 * (hips -> torso -> head, full arm and leg chains) and a smooth tube-based
 * body mesh is skinned to it with blended weights at every joint, so elbows
 * and knees bend instead of hinging as separate boxes.
 *
 * Poses are procedural: the same parameter set as ever (speed, crouch, aim,
 * dead...) writes bone rotations every frame.
 */

export interface HumanoidStyle {
  suit: number;        // torso/limbs
  pants?: number;
  skin?: number;
  cap?: number | null; // cap color or null for none
  officer?: boolean;
}

// rest-pose landmarks (root space, character faces +Z)
const REST = {
  pelvisY: 0.96,
  torsoLocalY: 0.14,   // pelvis -> torso joint
  headLocalY: 0.72,    // torso -> head joint
  shoulderX: 0.27, shoulderLocalY: 0.56,
  elbowDrop: 0.33, wristDrop: 0.30,
  hipX: 0.13, hipLocalY: -0.08,
  kneeDrop: 0.4, ankleDrop: 0.42,
};

interface SkinPart {
  geo: THREE.BufferGeometry;
  bone: number;                       // primary bone index
  blend?: { atY: number; other: number; range: number }; // blend toward `other` near atY
  color: number;
}

function colorOf(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** apply skin indices/weights + vertex colors to a positioned part geometry */
function skinPart(part: SkinPart) {
  const pos = part.geo.getAttribute("position") as THREE.BufferAttribute;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  const [r, g, b] = colorOf(part.color);
  for (let i = 0; i < n; i++) {
    let wOther = 0;
    if (part.blend) {
      const d = Math.abs(pos.getY(i) - part.blend.atY);
      wOther = 0.5 * Math.max(0, 1 - d / part.blend.range);
    }
    idx[i * 4] = part.bone;
    idx[i * 4 + 1] = part.blend ? part.blend.other : part.bone;
    wgt[i * 4] = 1 - wOther;
    wgt[i * 4 + 1] = wOther;
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  part.geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
  part.geo.setAttribute("skinWeight", new THREE.BufferAttribute(wgt, 4));
  part.geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

/** vertical tapered tube positioned in rest space */
function tube(x: number, topY: number, botY: number, rTop: number, rBot: number, radial = 10): THREE.BufferGeometry {
  const h = topY - botY;
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, radial, 3);
  geo.translate(x, botY + h / 2, 0);
  return geo;
}

function ball(x: number, y: number, r: number, sy = 1, z = 0): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, 10, 7);
  geo.scale(1, sy, 1);
  geo.translate(x, y, z);
  return geo;
}

export class Humanoid {
  root: THREE.Group;
  weaponG: THREE.Group;
  flashlight: THREE.SpotLight | null = null;
  flashTarget: THREE.Object3D | null = null;

  // joints (bones) — same names/conventions as the old group rig
  private pelvis: THREE.Bone;
  private torso: THREE.Bone;
  private headG: THREE.Bone;
  private armL: THREE.Bone; private armR: THREE.Bone;
  private foreL: THREE.Bone; private foreR: THREE.Bone;
  private legL: THREE.Bone; private legR: THREE.Bone;
  private shinL: THREE.Bone; private shinR: THREE.Bone;

  private phase = 0;
  private deadT = -1;
  private crouchBlend = 0;
  private aimBlend = 0;
  private fadeMats: THREE.Material[] = [];

  constructor(style: HumanoidStyle, weapon: "rifle" | "pistol" | "none") {
    this.root = new THREE.Group();

    // ---- skeleton ----
    const B = (x: number, y: number, z: number, parent?: THREE.Bone) => {
      const bone = new THREE.Bone();
      bone.position.set(x, y, z);
      parent?.add(bone);
      return bone;
    };
    this.pelvis = B(0, REST.pelvisY, 0);
    this.torso = B(0, REST.torsoLocalY, 0, this.pelvis);
    this.headG = B(0, REST.headLocalY, 0, this.torso);
    this.armL = B(-REST.shoulderX, REST.shoulderLocalY, 0, this.torso);
    this.armR = B(REST.shoulderX, REST.shoulderLocalY, 0, this.torso);
    this.foreL = B(0, -REST.elbowDrop, 0, this.armL);
    this.foreR = B(0, -REST.elbowDrop, 0, this.armR);
    this.legL = B(-REST.hipX, REST.hipLocalY, 0, this.pelvis);
    this.legR = B(REST.hipX, REST.hipLocalY, 0, this.pelvis);
    this.shinL = B(0, -REST.kneeDrop, 0, this.legL);
    this.shinR = B(0, -REST.kneeDrop, 0, this.legR);
    const bones = [
      this.pelvis, this.torso, this.headG,
      this.armL, this.armR, this.foreL, this.foreR,
      this.legL, this.legR, this.shinL, this.shinR,
    ];
    const BI = { pelvis: 0, torso: 1, head: 2, armL: 3, armR: 4, foreL: 5, foreR: 6, legL: 7, legR: 8, shinL: 9, shinR: 10 };

    // ---- rest-space landmarks for the geometry ----
    const shoulderY = REST.pelvisY + REST.torsoLocalY + REST.shoulderLocalY; // 1.66
    const elbowY = shoulderY - REST.elbowDrop;   // 1.33
    const wristY = elbowY - REST.wristDrop;      // 1.03
    const hipY = REST.pelvisY + REST.hipLocalY;  // 0.88
    const kneeY = hipY - REST.kneeDrop;          // 0.48
    const ankleY = kneeY - REST.ankleDrop;       // 0.06
    const headBase = REST.pelvisY + REST.torsoLocalY + REST.headLocalY; // 1.82

    const suit = style.suit;
    const pants = style.pants ?? style.suit;
    const skin = style.skin ?? PALETTE.skin;

    const parts: SkinPart[] = [
      // trunk
      { geo: tube(0, 1.06, 0.85, 0.195, 0.185), bone: BI.pelvis, color: pants },
      { geo: tube(0, shoulderY + 0.02, 1.02, 0.2, 0.165), bone: BI.torso, blend: { atY: 1.06, other: BI.pelvis, range: 0.14 }, color: suit },
      // neck + head
      { geo: tube(0, headBase + 0.06, headBase - 0.16, 0.062, 0.075), bone: BI.head, blend: { atY: headBase - 0.16, other: BI.torso, range: 0.1 }, color: skin },
      { geo: ball(0, headBase + 0.17, 0.15, 1.18), bone: BI.head, color: skin },
      // arms
      { geo: tube(-REST.shoulderX, shoulderY, elbowY, 0.075, 0.063), bone: BI.armL, blend: { atY: shoulderY, other: BI.torso, range: 0.09 }, color: suit },
      { geo: tube(REST.shoulderX, shoulderY, elbowY, 0.075, 0.063), bone: BI.armR, blend: { atY: shoulderY, other: BI.torso, range: 0.09 }, color: suit },
      { geo: tube(-REST.shoulderX, elbowY, wristY, 0.06, 0.049), bone: BI.foreL, blend: { atY: elbowY, other: BI.armL, range: 0.09 }, color: suit },
      { geo: tube(REST.shoulderX, elbowY, wristY, 0.06, 0.049), bone: BI.foreR, blend: { atY: elbowY, other: BI.armR, range: 0.09 }, color: suit },
      { geo: ball(-REST.shoulderX, wristY - 0.05, 0.056, 1.35), bone: BI.foreL, color: skin },
      { geo: ball(REST.shoulderX, wristY - 0.05, 0.056, 1.35), bone: BI.foreR, color: skin },
      // shoulder & joint balls for smooth silhouettes
      { geo: ball(-REST.shoulderX, shoulderY, 0.097), bone: BI.armL, blend: { atY: shoulderY, other: BI.torso, range: 0.12 }, color: suit },
      { geo: ball(REST.shoulderX, shoulderY, 0.097), bone: BI.armR, blend: { atY: shoulderY, other: BI.torso, range: 0.12 }, color: suit },
      { geo: ball(-REST.shoulderX, elbowY, 0.066), bone: BI.foreL, blend: { atY: elbowY, other: BI.armL, range: 0.09 }, color: suit },
      { geo: ball(REST.shoulderX, elbowY, 0.066), bone: BI.foreR, blend: { atY: elbowY, other: BI.armR, range: 0.09 }, color: suit },
      // legs
      { geo: tube(-REST.hipX, hipY, kneeY, 0.095, 0.068), bone: BI.legL, blend: { atY: hipY, other: BI.pelvis, range: 0.1 }, color: pants },
      { geo: tube(REST.hipX, hipY, kneeY, 0.095, 0.068), bone: BI.legR, blend: { atY: hipY, other: BI.pelvis, range: 0.1 }, color: pants },
      { geo: tube(-REST.hipX, kneeY, ankleY, 0.062, 0.048), bone: BI.shinL, blend: { atY: kneeY, other: BI.legL, range: 0.1 }, color: pants },
      { geo: tube(REST.hipX, kneeY, ankleY, 0.062, 0.048), bone: BI.shinR, blend: { atY: kneeY, other: BI.legR, range: 0.1 }, color: pants },
      { geo: ball(-REST.hipX, hipY, 0.1), bone: BI.legL, blend: { atY: hipY, other: BI.pelvis, range: 0.12 }, color: pants },
      { geo: ball(REST.hipX, hipY, 0.1), bone: BI.legR, blend: { atY: hipY, other: BI.pelvis, range: 0.12 }, color: pants },
      { geo: ball(-REST.hipX, kneeY, 0.072), bone: BI.shinL, blend: { atY: kneeY, other: BI.legL, range: 0.09 }, color: pants },
      { geo: ball(REST.hipX, kneeY, 0.072), bone: BI.shinR, blend: { atY: kneeY, other: BI.legR, range: 0.09 }, color: pants },
    ];
    for (const p of parts) skinPart(p);
    const merged = mergeGeometries(parts.map((p) => p.geo));
    for (const p of parts) p.geo.dispose();
    merged.computeVertexNormals();

    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
    this.fadeMats.push(bodyMat);
    const skinned = new THREE.SkinnedMesh(merged, bodyMat);
    skinned.castShadow = true;
    skinned.frustumCulled = false; // animated bounds; a handful of characters
    this.root.add(skinned);
    skinned.add(this.pelvis);
    skinned.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton(bones));

    // ---- attached details (regular meshes riding on bones) ----
    const attach = (bone: THREE.Bone, mesh: THREE.Mesh) => { mesh.castShadow = true; bone.add(mesh); };
    const bootM = new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 0.85 });
    for (const shin of [this.shinL, this.shinR]) {
      const bootBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.26), bootM);
      bootBox.position.set(0, -0.4, 0.05);
      attach(shin, bootBox);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), bootM);
      cuff.position.set(0, -0.36, 0);
      attach(shin, cuff);
    }
    if (style.cap != null) {
      const capM = mat(style.cap, { flat: true });
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.155, 0.09, 10), capM);
      capTop.position.set(0, 0.33, 0);
      attach(this.headG, capTop);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.13), capM);
      brim.position.set(0, 0.29, 0.2);
      attach(this.headG, brim);
    } else {
      const hairM = new THREE.MeshStandardMaterial({ color: 0x27221c, roughness: 0.9 });
      this.fadeMats.push(hairM);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.152, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
      hair.scale.set(1.02, 1.15, 1.04);
      hair.position.set(0, 0.185, -0.012);
      attach(this.headG, hair);
    }
    if (style.officer) {
      const gold = mat(PALETTE.gold);
      for (const s of [-1, 1]) {
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.14), gold);
        ep.position.set(s * 0.28, 0.6, 0);
        attach(this.torso, ep);
      }
    }

    // soft contact shadow
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);

    // ---- weapon ----
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
    const geo = new THREE.CylinderGeometry(1.7, 0.05, 8, 12, 1, true);
    geo.rotateX(Math.PI / 2);
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffe9b8, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    beam.position.set(0, 0.05, 4.2);
    beam.name = "flash-beam";
    this.weaponG.add(beam);
  }

  update(dt: number, p: {
    speed: number; run?: boolean; crouch?: boolean; aim?: boolean;
    pitch?: number; headYaw?: number; dead?: boolean; carried?: boolean; cover?: boolean;
    stagger?: number;
  }) {
    if (p.dead) {
      if (this.deadT < 0) this.deadT = 0;
      this.deadT += dt;
      const t = Math.min(1, this.deadT * 2.2);
      const e = 1 - (1 - t) * (1 - t);
      this.root.rotation.x = -e * (Math.PI / 2) * 0.98;
      this.pelvis.position.y = lerp(REST.pelvisY, 0.45, e);
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

    const CT = CROUCH_TUNE;
    this.pelvis.rotation.x = c * CT.pelvisRotX;
    this.pelvis.position.z = CT.pelvisZ * c;
    this.torso.rotation.x = c * CT.torso + (p.run && moving ? 0.14 : 0) - (p.pitch ?? 0) * 0.25 * a;
    this.headG.rotation.x = c * CT.head + (p.pitch ?? 0) * 0.5;
    this.headG.rotation.y = damp(this.headG.rotation.y, p.headYaw ?? 0, 8, dt);
    // breathing: subtle chest rise when still
    if (!moving) this.torso.rotation.x += Math.sin(this.phase + performance.now() * 0.0012) * 0.008;

    // NOTE joint sign convention (character faces +Z): hip flexion (thigh
    // swings FORWARD) is NEGATIVE rotation.x; knee flexion (heel folds BACK
    // toward the butt) is POSITIVE rotation.x.
    const thighBase = -c * CT.thigh;
    const kneeBase = c * CT.knee;
    const strideAmp = amp * (1 - c * 0.5);
    this.legL.rotation.x = thighBase - c * CT.stagger + swing * strideAmp;
    this.legR.rotation.x = thighBase + c * CT.stagger + swing2 * strideAmp;
    this.legL.rotation.z = -c * CT.splay;
    this.legR.rotation.z = c * CT.splay;
    const stepL = moving ? Math.max(0, -Math.sin(this.phase - 0.6)) * strideAmp * 1.1 : 0;
    const stepR = moving ? Math.max(0, -Math.sin(this.phase + Math.PI - 0.6)) * strideAmp * 1.1 : 0;
    this.shinL.rotation.x = Math.max(0.001, kneeBase + stepL);
    this.shinR.rotation.x = Math.max(0.001, kneeBase + stepR);

    const chain = (thigh: number, knee: number) =>
      0.4 * Math.cos(thigh) + 0.42 * Math.cos(thigh + knee);
    const stance = Math.max(
      chain(this.legL.rotation.x, this.shinL.rotation.x),
      chain(this.legR.rotation.x, this.shinR.rotation.x)
    );
    const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.035 * (1 - c * 0.5) : 0;
    const chainY = clamp(stance, 0.35, 0.83) + CROUCH_TUNE.lift;
    this.pelvis.position.y = lerp(REST.pelvisY, chainY, c) + bob;

    const armAmp = amp * 0.7 * (1 - c * 0.4);
    const idleSway = Math.sin(this.phase * 0.4) * 0.03;
    const armCrouch = -0.38 * c;
    this.armL.rotation.x = swing2 * armAmp * (1 - a * 0.4) + idleSway + armCrouch;
    this.armL.rotation.z = 0.08 + c * 0.06;
    this.foreL.rotation.x = -0.25 - c * 0.55 - (moving ? Math.abs(swing2) * 0.3 : 0);

    const aimPitch = (p.pitch ?? 0);
    this.armR.rotation.x = lerp(swing * armAmp + idleSway + armCrouch, -Math.PI / 2 + aimPitch, a);
    this.armR.rotation.z = lerp(-0.08 - c * 0.06, 0, a);
    this.foreR.rotation.x = lerp(-0.25 - c * 0.55 - (moving ? Math.abs(swing) * 0.3 : 0), 0, a);
    this.weaponG.rotation.x = lerp(1.2, Math.PI / 2, a);

    if (a > 0.5) {
      this.armL.rotation.x = -Math.PI / 2 + aimPitch + 0.15;
      this.armL.rotation.z = 0.5;
      this.foreL.rotation.x = -0.3;
    }

    if (p.stagger && p.stagger > 0) {
      const st = p.stagger;
      this.torso.rotation.x -= st * 0.35;
      this.headG.rotation.x += st * 0.25;
      this.armL.rotation.x -= st * 0.7;
      this.armR.rotation.x -= st * 0.5;
      this.pelvis.position.z -= st * 0.1;
    }

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
    for (const m of this.fadeMats) {
      const mm = m as THREE.MeshStandardMaterial;
      if (o >= 1) { mm.transparent = false; mm.opacity = 1; }
      else { mm.transparent = true; mm.opacity = o; }
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
