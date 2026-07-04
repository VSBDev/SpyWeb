import * as THREE from "three";
import { dist2D } from "../core/mathutil";
import type { LevelRuntime, ObjectiveDef } from "../world/levelkit";
import type { AudioEngine } from "../core/audio";

export interface ObjectiveState {
  def: ObjectiveDef;
  done: boolean;
  progress: number; // 0..1 while holding interact
}

export class ObjectiveSystem {
  states: ObjectiveState[] = [];
  exfilActive = false;
  private level: LevelRuntime;
  private audio: AudioEngine;
  private glowRings = new Map<string, THREE.Mesh>();
  onUpdate: () => void = () => {};
  onExfilReady: () => void = () => {};

  constructor(level: LevelRuntime, scene: THREE.Scene, audio: AudioEngine) {
    this.level = level;
    this.audio = audio;
    for (const def of level.def.objectives) {
      this.states.push({ def, done: false, progress: 0 });
      if (def.killGuard !== undefined) continue; // moving target, no ground ring
      // soft gold ring on the ground marking each objective
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.05, 26),
        new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(def.x, 0.07, def.z);
      scene.add(ring);
      this.glowRings.set(def.id, ring);
    }
  }

  /** silently restore a completed objective (checkpoint restart) */
  markDone(id: string) {
    const s = this.states.find((x) => x.def.id === id);
    if (!s || s.done) return;
    s.done = true;
    const ring = this.glowRings.get(id);
    if (ring) ring.visible = false;
    if (this.allMandatoryDone) this.exfilActive = true;
  }

  /** complete an objective from game logic (e.g. a kill target went down) */
  completeExternal(id: string) {
    const s = this.states.find((x) => x.def.id === id);
    if (!s || s.done) return;
    s.done = true;
    this.audio.objectiveComplete();
    this.onUpdate();
    if (this.allMandatoryDone && !this.exfilActive) {
      this.exfilActive = true;
      this.onExfilReady();
    }
  }

  get allMandatoryDone(): boolean {
    return this.states.every((s) => s.done || s.def.optional);
  }

  isAvailable(s: ObjectiveState): boolean {
    if (s.done || s.def.killGuard !== undefined) return false;
    for (const req of s.def.requires ?? []) {
      const r = this.states.find((x) => x.def.id === req);
      if (r && !r.done) return false;
    }
    return true;
  }

  /** closest interactable objective within reach of (x,z) */
  nearest(x: number, z: number): ObjectiveState | null {
    let best: ObjectiveState | null = null;
    let bestD = 2.4;
    for (const s of this.states) {
      if (!this.isAvailable(s)) continue;
      const d = dist2D(x, z, s.def.x, s.def.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** advance hold-to-interact; returns true when it completes this frame */
  interactTick(s: ObjectiveState, dt: number): boolean {
    const dur = s.def.duration ?? 1.6;
    s.progress += dt / dur;
    if (s.progress >= 1) {
      s.done = true;
      s.progress = 0;
      this.audio.objectiveComplete();
      const ring = this.glowRings.get(s.def.id);
      if (ring) ring.visible = false;
      // dim the objective prop's glow if any
      this.onUpdate();
      if (this.allMandatoryDone && !this.exfilActive) {
        this.exfilActive = true;
        this.onExfilReady();
      }
      return true;
    }
    return false;
  }

  resetProgressExcept(active: ObjectiveState | null) {
    for (const s of this.states) if (s !== active) s.progress = 0;
  }

  update(time: number) {
    // pulse objective rings
    for (const [id, ring] of this.glowRings) {
      const s = this.states.find((x) => x.def.id === id)!;
      if (s.done) { ring.visible = false; continue; }
      ring.visible = this.isAvailable(s);
      const m = ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + Math.sin(time * 2.4) * 0.18;
      ring.scale.setScalar(1 + Math.sin(time * 2.4) * 0.08);
    }
  }
}
