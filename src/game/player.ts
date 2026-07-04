import * as THREE from "three";
import { Humanoid, PLAYER_STYLE } from "../world/characters";
import { clamp, dampAngle, resolveCircleBox, type BoxCollider } from "../core/mathutil";
import type { Input } from "../core/input";
import type { AudioEngine } from "../core/audio";
import type { GrassZone } from "../world/levelkit";

export interface NoiseEvent { x: number; z: number; radius: number; kind: "footstep" | "stone" | "shot" | "body" | "loud" }

export const PLAYER_RADIUS = 0.38;

export class Player {
  pos = new THREE.Vector3();
  yaw = 0;                    // facing of the character mesh
  health = 4;
  maxHealth = 4;
  ammo = 0;
  stones = 0;
  smoke = 0;
  decoys = 0;
  emp = 0;
  /** set by the mission each frame when standing inside a smoke cloud */
  inSmoke = false;
  /** back-to-wall cover: outward face normal, or null */
  cover: { nx: number; nz: number } | null = null;
  // aim input: quick RMB tap (or Q) toggles, long RMB hold behaves classically
  private aimHold = false;
  private aimToggle = false;
  private rmbHeldT = 0;
  crouching = false;
  aiming = false;
  running = false;
  dead = false;
  speed = 0;                  // current horizontal speed (for anim & AI noise)
  draggingGuard: unknown = null; // set by game (Guard)
  takedownT = -1;             // >=0 while takedown anim plays
  hurtCooldown = 0;
  regenT = 0;

  humanoid: Humanoid;
  private stepAcc = 0;
  private colliders: BoxCollider[] = [];
  private grass: GrassZone[] = [];
  private bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

  constructor(scene: THREE.Scene) {
    this.humanoid = new Humanoid(PLAYER_STYLE, "pistol");
    scene.add(this.humanoid.root);
  }

  setup(x: number, z: number, yaw: number, ammo: number, stones: number, gear: { smoke: number; decoys: number; emp: number }, colliders: BoxCollider[], grass: GrassZone[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.health = this.maxHealth;
    this.ammo = ammo;
    this.stones = stones;
    this.smoke = gear.smoke;
    this.decoys = gear.decoys;
    this.emp = gear.emp;
    this.inSmoke = false;
    this.dead = false;
    this.crouching = false;
    this.aiming = false;
    this.takedownT = -1;
    this.draggingGuard = null;
    this.colliders = colliders;
    this.grass = grass;
    this.bounds = bounds;
    this.humanoid.root.position.copy(this.pos);
    this.humanoid.root.rotation.set(0, yaw, 0);
  }

  get inGrass(): boolean {
    for (const g of this.grass) {
      const dx = this.pos.x - g.x, dz = this.pos.z - g.z;
      if (dx * dx + dz * dz < g.r * g.r) return true;
    }
    return false;
  }

  get hidden(): boolean { return this.crouching && this.inGrass; }

  /** returns noise events emitted this frame */
  update(dt: number, input: Input, camYaw: number, camPitch: number, emitNoise: (n: NoiseEvent) => void): void {
    if (this.dead) {
      this.humanoid.update(dt, { speed: 0, dead: true });
      return;
    }
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);

    // health regen after 9s without damage
    this.regenT += dt;
    if (this.regenT > 9 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 0.4);
    }

    const takedownActive = this.takedownT >= 0;
    if (takedownActive) {
      this.takedownT += dt;
      this.humanoid.update(dt, { speed: 0, crouch: this.crouching });
      this.humanoid.takedownPose(this.takedownT / 0.55);
      if (this.takedownT > 0.55) this.takedownT = -1;
      this.humanoid.root.position.copy(this.pos);
      this.humanoid.root.rotation.y = this.yaw;
      return;
    }

    if (input.wasPressed("KeyC") || input.wasPressed("ControlLeft")) this.crouching = !this.crouching;

    // ---- aim: trackpad-friendly ----
    // tap RMB or press Q -> toggle; hold RMB (>0.3s) -> hold-to-aim
    if (input.wasMousePressed(2)) {
      if (this.aimToggle) this.aimToggle = false;
      else { this.aimHold = true; this.rmbHeldT = 0; }
    }
    if (this.aimHold) {
      this.rmbHeldT += dt;
      if (!input.isMouseDown(2)) {
        this.aimHold = false;
        if (this.rmbHeldT < 0.3) this.aimToggle = true; // quick tap = toggle on
      }
    }
    if (input.wasPressed("KeyQ")) this.aimToggle = !this.aimToggle;
    if (this.draggingGuard) { this.aimToggle = false; this.aimHold = false; }
    this.aiming = this.aimHold || this.aimToggle;
    this.running = input.isDown("ShiftLeft") && !this.crouching && !this.aiming && !this.draggingGuard && !this.cover;

    // ---- cover toggle ----
    if (input.wasPressed("Space") && !this.draggingGuard) {
      if (this.cover) this.cover = null;
      else {
        const c = this.findCoverFace();
        if (c) {
          this.cover = c.normal;
          // snap flush to the wall
          this.pos.x = c.px + c.normal.nx * (PLAYER_RADIUS + 0.03);
          this.pos.z = c.pz + c.normal.nz * (PLAYER_RADIUS + 0.03);
        }
      }
    }

    // movement relative to camera
    const mx = input.moveX, mz = input.moveZ;
    let dirX = 0, dirZ = 0;
    if (mx !== 0 || mz !== 0) {
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      // camera forward on ground = (-sin, -cos)
      dirX = (-sin * -mz) + (cos * mx);
      dirZ = (-cos * -mz) + (-sin * mx);
      const len = Math.hypot(dirX, dirZ);
      dirX /= len; dirZ /= len;
    }
    let moving = dirX !== 0 || dirZ !== 0;

    // ---- cover movement: slide along the wall; push away to leave ----
    if (this.cover) {
      const n = this.cover;
      if (moving && dirX * n.nx + dirZ * n.nz > 0.72) {
        this.cover = null; // stepped away from the wall
      } else if (moving) {
        // project movement onto the wall tangent
        const tx = -n.nz, tz = n.nx;
        const along = dirX * tx + dirZ * tz;
        dirX = tx * Math.sign(along);
        dirZ = tz * Math.sign(along);
        if (Math.abs(along) < 0.25) { dirX = 0; dirZ = 0; moving = false; }
      }
      // still on a wall? (face may have ended)
      if (this.cover && !this.checkWallBehind(n)) this.cover = null;
    }

    const base = this.draggingGuard ? 1.5 : this.cover ? 2.0 : this.aiming ? 2.0 : this.crouching ? 1.8 : this.running ? 5.7 : 3.3;
    this.speed = moving ? base : 0;

    let nx = this.pos.x + dirX * base * dt * (moving ? 1 : 0);
    let nz = this.pos.z + dirZ * base * dt * (moving ? 1 : 0);

    // collide
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (!c.solid) continue;
        [nx, nz] = resolveCircleBox(nx, nz, PLAYER_RADIUS, c);
      }
    }
    nx = clamp(nx, this.bounds.minX + 0.5, this.bounds.maxX - 0.5);
    nz = clamp(nz, this.bounds.minZ + 0.5, this.bounds.maxZ - 0.5);
    this.pos.set(nx, 0, nz);

    // facing: cover -> back to wall; aim -> camera direction; move -> velocity direction
    if (this.cover && !this.aiming) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.cover.nx, this.cover.nz), 14, dt);
    } else if (this.aiming) {
      this.yaw = dampAngle(this.yaw, camYaw + Math.PI, 16, dt);
    } else if (moving) {
      this.yaw = dampAngle(this.yaw, Math.atan2(dirX, dirZ), 12, dt);
    }

    // footsteps
    if (moving) {
      this.stepAcc += dt * base;
      const stride = this.running ? 2.4 : this.crouching ? 1.5 : 1.9;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const radius = this.crouching ? 2.0 : this.running ? 13 : 6.5;
        emitNoise({ x: nx, z: nz, radius, kind: "footstep" });
      }
    } else this.stepAcc = 0;

    this.humanoid.root.position.copy(this.pos);
    this.humanoid.root.rotation.y = this.yaw;
    this.humanoid.update(dt, {
      speed: this.speed,
      run: this.running,
      crouch: this.crouching,
      aim: this.aiming,
      pitch: -camPitch,
      cover: !!this.cover,
    });
    // subtle transparency when hidden in grass (readability feedback)
    this.humanoid.setOpacity(this.hidden ? 0.55 : 1);
  }

  /** nearest tall collider face within reach; returns wall point + outward normal */
  findCoverFace(): { px: number; pz: number; normal: { nx: number; nz: number } } | null {
    let best: { px: number; pz: number; normal: { nx: number; nz: number }; d: number } | null = null;
    for (const c of this.colliders) {
      if (!c.solid || c.height < 1.6) continue;
      const px = clamp(this.pos.x, c.minX, c.maxX);
      const pz = clamp(this.pos.z, c.minZ, c.maxZ);
      const dx = this.pos.x - px, dz = this.pos.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < 0.05 || d > 1.1) continue;
      if (best && d >= best.d) continue;
      // snap normal to the dominant axis (AABB face)
      const normal = Math.abs(dx) > Math.abs(dz)
        ? { nx: Math.sign(dx), nz: 0 }
        : { nx: 0, nz: Math.sign(dz) };
      best = { px, pz, normal, d };
    }
    return best;
  }

  /** is the covered wall still directly behind us? */
  checkWallBehind(n: { nx: number; nz: number }): boolean {
    const probeX = this.pos.x - n.nx * (PLAYER_RADIUS + 0.25);
    const probeZ = this.pos.z - n.nz * (PLAYER_RADIUS + 0.25);
    for (const c of this.colliders) {
      if (!c.solid || c.height < 1.6) continue;
      if (probeX >= c.minX && probeX <= c.maxX && probeZ >= c.minZ && probeZ <= c.maxZ) return true;
    }
    return false;
  }

  takeDamage(amount: number, audio: AudioEngine): boolean {
    if (this.dead || this.hurtCooldown > 0) return false;
    this.health -= amount;
    this.hurtCooldown = 0.35;
    this.regenT = 0;
    audio.playerHurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  get footstepSurfaceGrass(): boolean { return this.inGrass; }
}
