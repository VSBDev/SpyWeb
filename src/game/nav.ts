import type { BoxCollider } from "../core/mathutil";

/**
 * Grid-based navigation over the level footprint: built once from the
 * static colliders, queried by guard AI with A* + line-of-sight smoothing.
 */
export class NavGrid {
  readonly cell = 1.0;
  readonly ox: number; readonly oz: number;
  readonly w: number; readonly h: number;
  private walk: Uint8Array;

  constructor(minX: number, minZ: number, maxX: number, maxZ: number, colliders: BoxCollider[], agentRadius = 0.45) {
    this.ox = minX; this.oz = minZ;
    this.w = Math.ceil((maxX - minX) / this.cell);
    this.h = Math.ceil((maxZ - minZ) / this.cell);
    this.walk = new Uint8Array(this.w * this.h).fill(1);
    for (const c of colliders) {
      if (!c.solid) continue;
      const x0 = Math.floor((c.minX - agentRadius - minX) / this.cell);
      const x1 = Math.floor((c.maxX + agentRadius - minX) / this.cell);
      const z0 = Math.floor((c.minZ - agentRadius - minZ) / this.cell);
      const z1 = Math.floor((c.maxZ + agentRadius - minZ) / this.cell);
      for (let gz = Math.max(0, z0); gz <= Math.min(this.h - 1, z1); gz++) {
        for (let gx = Math.max(0, x0); gx <= Math.min(this.w - 1, x1); gx++) {
          this.walk[gz * this.w + gx] = 0;
        }
      }
    }
  }

  private idx(gx: number, gz: number) { return gz * this.w + gx; }
  private inB(gx: number, gz: number) { return gx >= 0 && gz >= 0 && gx < this.w && gz < this.h; }
  isWalkable(gx: number, gz: number) { return this.inB(gx, gz) && this.walk[this.idx(gx, gz)] === 1; }

  toGrid(x: number, z: number): [number, number] {
    return [Math.floor((x - this.ox) / this.cell), Math.floor((z - this.oz) / this.cell)];
  }
  toWorld(gx: number, gz: number): [number, number] {
    return [this.ox + (gx + 0.5) * this.cell, this.oz + (gz + 0.5) * this.cell];
  }

  nearestWalkable(x: number, z: number, maxR = 8): [number, number] | null {
    let [gx, gz] = this.toGrid(x, z);
    if (this.isWalkable(gx, gz)) return [gx, gz];
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.isWalkable(gx + dx, gz + dz)) return [gx + dx, gz + dz];
        }
      }
    }
    return null;
  }

  /** grid line-of-sight for path smoothing (supercover) */
  gridLOS(x0: number, z0: number, x1: number, z1: number): boolean {
    let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    let sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let x = x0, z = z0;
    while (true) {
      if (!this.isWalkable(x, z)) return false;
      if (x === x1 && z === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x += sx; }
      else if (e2 < dx) { err += dx; z += sz; }
      else { // diagonal step: check both adjacent cells to avoid corner cutting
        if (!this.isWalkable(x + sx, z) || !this.isWalkable(x, z + sz)) return false;
        err -= dz; err += dx; x += sx; z += sz;
      }
    }
  }

  /**
   * A* path from world (sx,sz) to (tx,tz). Returns world waypoints
   * (excluding start), smoothed. Null if unreachable.
   */
  findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] | null {
    const s = this.nearestWalkable(sx, sz);
    const t = this.nearestWalkable(tx, tz);
    if (!s || !t) return null;
    const [sgx, sgz] = s, [tgx, tgz] = t;
    if (sgx === tgx && sgz === tgz) return [this.toWorld(tgx, tgz)];

    const n = this.w * this.h;
    const g = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const startI = this.idx(sgx, sgz), targetI = this.idx(tgx, tgz);
    g[startI] = 0;

    // binary min-heap (parallel arrays: f-scores and node indices)
    const hf: number[] = [], hi: number[] = [];
    const hpush = (f: number, i: number) => {
      hf.push(f); hi.push(i);
      let c = hf.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hf[p] <= hf[c]) break;
        [hf[p], hf[c]] = [hf[c], hf[p]];
        [hi[p], hi[c]] = [hi[c], hi[p]];
        c = p;
      }
    };
    const hpop = (): number => {
      const top = hi[0];
      const lf = hf.pop()!, li = hi.pop()!;
      if (hf.length > 0) {
        hf[0] = lf; hi[0] = li;
        let c = 0;
        while (true) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < hf.length && hf[l] < hf[m]) m = l;
          if (r < hf.length && hf[r] < hf[m]) m = r;
          if (m === c) break;
          [hf[m], hf[c]] = [hf[c], hf[m]];
          [hi[m], hi[c]] = [hi[c], hi[m]];
          c = m;
        }
      }
      return top;
    };

    const hEst = (i: number) => {
      const gx = i % this.w, gz = Math.floor(i / this.w);
      const dx = Math.abs(gx - tgx), dz = Math.abs(gz - tgz);
      return Math.max(dx, dz) + 0.41 * Math.min(dx, dz);
    };
    hpush(hEst(startI), startI);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
    let found = false;
    let iter = 0;
    const maxIter = n * 4;
    while (hf.length > 0 && iter++ < maxIter) {
      const cur = hpop();
      if (cur === targetI) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cgx = cur % this.w, cgz = Math.floor(cur / this.w);
      for (const [dx, dz, cost] of DIRS) {
        const nx = cgx + dx, nz = cgz + dz;
        if (!this.isWalkable(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (!this.isWalkable(cgx + dx, cgz) || !this.isWalkable(cgx, cgz + dz))) continue;
        const ni = this.idx(nx, nz);
        if (closed[ni]) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          parent[ni] = cur;
          hpush(ng + hEst(ni), ni);
        }
      }
    }
    if (!found) return null;

    // reconstruct
    const cells: [number, number][] = [];
    let cur = targetI;
    while (cur !== -1 && cur !== startI) {
      cells.push([cur % this.w, Math.floor(cur / this.w)]);
      cur = parent[cur];
    }
    cells.reverse();

    // smooth: greedily skip waypoints with grid LOS
    const out: [number, number][] = [];
    let anchor: [number, number] = [sgx, sgz];
    let i = 0;
    while (i < cells.length) {
      let j = i;
      while (j + 1 < cells.length && this.gridLOS(anchor[0], anchor[1], cells[j + 1][0], cells[j + 1][1])) j++;
      out.push(this.toWorld(cells[j][0], cells[j][1]));
      anchor = cells[j];
      i = j + 1;
    }
    // ensure exact target position as final point
    if (out.length > 0) out[out.length - 1] = this.toWorld(tgx, tgz);
    return out;
  }
}
