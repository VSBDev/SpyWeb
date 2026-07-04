import * as THREE from "three";
import { clamp, damp, type BoxCollider } from "../core/mathutil";

/**
 * Hybrid camera: third-person orbit that can flip to a tactical overhead
 * "spy-cam". Third-person mode pulls in when geometry blocks the view.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.32;
  tactical = false;
  private tacBlend = 0;      // 0 = third person, 1 = overhead
  private aimBlend = 0;
  private dist = 5.4;
  private colliders: BoxCollider[] = [];
  private curPos = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private initialized = false;
  shake = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 400);
  }

  setColliders(c: BoxCollider[]) { this.colliders = c; }

  reset(x: number, z: number, yaw: number) {
    this.yaw = yaw;
    this.pitch = 0.32;
    this.tacBlend = 0;
    this.tactical = false;
    this.initialized = false;
  }

  applyLook(dx: number, dy: number, sensitivity: number, invertY: boolean) {
    const s = 0.0024 * sensitivity;
    this.yaw -= dx * s;
    this.pitch += dy * s * (invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.55, 1.15);
  }

  /** blocks camera ray so walls don't hide the player; 3D AABB slab test */
  private rayBlockDist(from: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
    let best = maxDist;
    for (const c of this.colliders) {
      if (c.height < 1.6) continue; // low props never eat the camera
      let tmin = 0, tmax = best;
      let ok = true;
      const fo = [from.x, from.y, from.z];
      const d = [dir.x, dir.y, dir.z];
      const mn = [c.minX, -1, c.minZ];
      const mx = [c.maxX, c.height, c.maxZ];
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) {
          if (fo[i] < mn[i] || fo[i] > mx[i]) { ok = false; break; }
        } else {
          let t1 = (mn[i] - fo[i]) / d[i], t2 = (mx[i] - fo[i]) / d[i];
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin < best && tmin > 0) best = tmin;
    }
    return best;
  }

  private bobPhase = 0;

  update(dt: number, target: THREE.Vector3, aiming: boolean, crouching: boolean, coverN?: { nx: number; nz: number } | null, runSpeed = 0) {
    // subtle sprint bob — sells momentum without inducing seasickness
    if (runSpeed > 4) this.bobPhase += dt * 10.5;
    const bobAmp = runSpeed > 4 ? 0.035 : 0;
    this.tacBlend = damp(this.tacBlend, this.tactical ? 1 : 0, 7, dt);
    this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 11, dt);

    const headY = crouching ? 1.05 : 1.55;
    const look = new THREE.Vector3(target.x, target.y + headY, target.z);
    // in wall cover, pivot the camera out in front of the wall so it doesn't
    // collide with the surface the player is pressed against
    if (coverN) {
      look.x += coverN.nx * 1.3;
      look.z += coverN.nz * 1.3;
    }

    // ---- third person desired position ----
    const a = this.aimBlend;
    const wantDist = 5.4 - a * 3.0;
    const shoulder = a * 0.85;
    const pitch = this.pitch;
    const back = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch)
    );
    // shoulder offset (right of view dir)
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const orbitLook = look.clone().addScaledVector(right, shoulder);
    const blocked = this.rayBlockDist(orbitLook, back, wantDist + 0.4);
    this.dist = damp(this.dist, Math.min(wantDist, Math.max(0.8, blocked - 0.35)), 12, dt);
    const tpPos = orbitLook.clone().addScaledVector(back, this.dist);
    if (tpPos.y < 0.35) tpPos.y = 0.35;

    // ---- tactical overhead ----
    const tacHeight = 34;
    const tacPos = new THREE.Vector3(target.x - Math.sin(this.yaw) * 4, tacHeight, target.z - Math.cos(this.yaw) * 4);
    const tacLook = new THREE.Vector3(target.x, 0, target.z);

    const t = this.tacBlend;
    const wantPos = tpPos.lerp(tacPos, t);
    const wantLook = orbitLook.lerp(tacLook, t);

    if (!this.initialized) {
      this.curPos.copy(wantPos);
      this.curLook.copy(wantLook);
      this.initialized = true;
    } else {
      this.curPos.x = damp(this.curPos.x, wantPos.x, 14, dt);
      this.curPos.y = damp(this.curPos.y, wantPos.y, 14, dt);
      this.curPos.z = damp(this.curPos.z, wantPos.z, 14, dt);
      this.curLook.x = damp(this.curLook.x, wantLook.x, 18, dt);
      this.curLook.y = damp(this.curLook.y, wantLook.y, 18, dt);
      this.curLook.z = damp(this.curLook.z, wantLook.z, 18, dt);
    }

    // camera shake (damage / gunfire nearby)
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake * this.shake;
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * sh * 0.5,
      (Math.random() - 0.5) * sh * 0.35,
      (Math.random() - 0.5) * sh * 0.5
    );

    jitter.y += Math.abs(Math.sin(this.bobPhase)) * bobAmp;
    this.camera.position.copy(this.curPos).add(jitter);
    this.camera.lookAt(this.curLook);
    this.camera.fov = 62 - this.aimBlend * 14;
    this.camera.updateProjectionMatrix();
  }

  get isOverhead(): boolean { return this.tacBlend > 0.5; }
}
