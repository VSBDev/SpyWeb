import * as THREE from "three";
import type { TimeOfDay } from "../world/levelkit";

/**
 * Image-based lighting: a tiny procedural sky scene (gradient dome + sun +
 * ground bounce) baked through PMREM, cached per time-of-day. Applied as
 * scene.environment so every MeshStandardMaterial picks up sky light.
 */

const cache = new Map<TimeOfDay, THREE.Texture>();
let pmrem: THREE.PMREMGenerator | null = null;

const SKY: Record<TimeOfDay, { top: number; horizon: number; ground: number; sun: number; sunPos: [number, number, number]; sunScale: number }> = {
  day: { top: 0x7fb2d6, horizon: 0xe8dcc0, ground: 0xc9b28a, sun: 0xfff2d8, sunPos: [40, 55, 22], sunScale: 12 },
  dusk: { top: 0x9c7ba8, horizon: 0xf0a860, ground: 0x8a6a58, sun: 0xffb066, sunPos: [60, 18, -30], sunScale: 18 },
  night: { top: 0x0a1220, horizon: 0x1a2438, ground: 0x10141c, sun: 0xb8ccec, sunPos: [-35, 50, 25], sunScale: 5 },
};

function gradientTexture(top: number, horizon: number, ground: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  g.addColorStop(0, hex(top));
  g.addColorStop(0.52, hex(horizon));
  g.addColorStop(0.56, hex(ground));
  g.addColorStop(1, hex(ground));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function envFor(renderer: THREE.WebGLRenderer, time: TimeOfDay): THREE.Texture {
  if (cache.has(time)) return cache.get(time)!;
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  const s = SKY[time];
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 16),
    new THREE.MeshBasicMaterial({ map: gradientTexture(s.top, s.horizon, s.ground), side: THREE.BackSide })
  );
  scene.add(dome);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(s.sunScale, 12, 8),
    new THREE.MeshBasicMaterial({ color: s.sun })
  );
  sun.position.set(...s.sunPos).normalize();
  sun.position.multiplyScalar(45);
  scene.add(sun);
  const tex = pmrem.fromScene(scene, 0.06).texture;
  cache.set(time, tex);
  dome.material.map?.dispose();
  return tex;
}

export const ENV_INTENSITY: Record<TimeOfDay, number> = { day: 0.55, dusk: 0.5, night: 0.3 };
