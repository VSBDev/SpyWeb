export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const TAU = Math.PI * 2;

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

export function dist2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  return Math.hypot(dx, dz);
}

/** Axis-aligned box collider on the XZ plane with a height (for vision blocking). */
export interface BoxCollider {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  height: number; // top of the obstacle above ground
  /** blocks movement (some vision blockers like tall hedges may still block walk too) */
  solid: boolean;
  /** physical + sight-blocking but ignored by the nav grid (small furniture) */
  noNav?: boolean;
}

export function makeBox(cx: number, cz: number, w: number, d: number, height: number, solid = true): BoxCollider {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height, solid };
}

/** Push a circle (x,z,r) out of a box; returns corrected [x,z]. */
export function resolveCircleBox(x: number, z: number, r: number, b: BoxCollider): [number, number] {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [x, z];
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r];
  }
  // center inside the box: push out along smallest penetration axis
  const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return [b.minX - r, z];
  if (m === pr) return [b.maxX + r, z];
  if (m === pt) return [x, b.minZ - r];
  return [x, b.maxZ + r];
}

/** Does segment (x1,z1)-(x2,z2) intersect box b (2D)? Slab method. */
export function segmentHitsBox(x1: number, z1: number, x2: number, z2: number, b: BoxCollider): boolean {
  const dx = x2 - x1, dz = z2 - z1;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < b.minX || x1 > b.maxX) return false;
  } else {
    let t1 = (b.minX - x1) / dx, t2 = (b.maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < b.minZ || z1 > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - z1) / dz, t2 = (b.maxZ - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Deterministic pseudo-random from a seed (mulberry32). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** deterministic 2D value noise in [0,1] */
export function valueNoise2(x: number, z: number, seed: number): number {
  const h = (ix: number, iz: number) => {
    let n = ix * 374761393 + iz * 668265263 + seed * 1442695041;
    n = (n ^ (n >> 13)) * 1274126177;
    return (((n ^ (n >> 16)) >>> 0) % 100000) / 100000;
  };
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

/** fractal Brownian motion, 4 octaves, [0,1] */
export function fbm2(x: number, z: number, seed: number): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    v += valueNoise2(x * f, z * f, seed + i * 101) * amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return v / 0.9375;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
