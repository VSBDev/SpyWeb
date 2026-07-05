import type { Item, GuardDef, ObjectiveDef, RectDef } from "../world/levelkit";
import { seededRandom } from "../core/mathutil";

/**
 * Underground compound generator: a long chain of rooms joined by L-shaped
 * corridors (plus loop connections), carved into a cell grid. Walls are
 * emitted as merged solid blocks; patrol routes, lighting, cameras, décor,
 * objectives and pickups are all derived from the same seeded layout.
 */

interface Room { x0: number; z0: number; x1: number; z1: number; cx: number; cz: number }

export interface DungeonResult {
  bounds: RectDef;
  items: Item[];
  guards: GuardDef[];
  objectives: ObjectiveDef[];
  playerStart: { x: number; z: number; angle: number };
  exfil: { x: number; z: number; r: number; label: string };
}

const W = 150, D = 56;               // grid extent (metres/cells)
const MINX = -W / 2, MINZ = -D / 2;
const WALL_H = 3.1;

export function generateDungeon(seed: number): DungeonResult {
  const rng = seededRandom(seed);
  const open = new Uint8Array(W * D);
  const at = (x: number, z: number) => (z - MINZ | 0) * W + (x - MINX | 0);
  const inG = (x: number, z: number) => x >= MINX && x < MINX + W && z >= MINZ && z < MINZ + D;

  const carveRect = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.max(MINZ + 1, z0); z <= Math.min(MINZ + D - 2, z1); z++)
      for (let x = Math.max(MINX + 1, x0); x <= Math.min(MINX + W - 2, x1); x++)
        open[at(x, z)] = 1;
  };

  // ---- rooms marching down the long axis ----
  const rooms: Room[] = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const rw = 12 + Math.floor(rng() * 8);
    const rd = 9 + Math.floor(rng() * 5);
    const cx = Math.round(MINX + 8 + (i * (W - 20)) / (N - 1) + (rng() - 0.5) * 4);
    // alternate above/below the central gallery, clear of it
    const side = i % 2 === 0 ? -1 : 1;
    const cz = Math.round(side * ((rd >> 1) + 5 + rng() * (D / 2 - rd - 9)));
    const r: Room = {
      x0: cx - (rw >> 1), z0: cz - (rd >> 1),
      x1: cx + (rw >> 1), z1: cz + (rd >> 1),
      cx, cz,
    };
    rooms.push(r);
    carveRect(r.x0, r.z0, r.x1, r.z1);
  }

  // ---- corridors: one long central gallery, a straight rib to every room,
  // and a bypass gallery for flanking. Every junction is a full-width
  // orthogonal overlap — immune to nav-inflation pinches by construction.
  const CW = 3; // half-width -> 7 cells wide (5 walkable after nav inflation)
  const elbows: { x: number; z: number }[] = [];
  const corridorMids: { x: number; z: number }[] = [];
  // central gallery, z = 0
  carveRect(rooms[0].cx - CW, -CW, rooms[N - 1].cx + CW, CW);
  for (let i = 0; i < N - 1; i++) corridorMids.push({ x: (rooms[i].cx + rooms[i + 1].cx) / 2, z: 0 });
  // ribs
  for (const r of rooms) {
    carveRect(r.cx - CW, Math.min(0, r.cz) - CW, r.cx + CW, Math.max(0, r.cz) + CW);
    elbows.push({ x: r.cx, z: 0 });
    corridorMids.push({ x: r.cx, z: r.cz / 2 });
  }
  // bypass gallery: an upper flanking route between two mid ribs
  const bz = -Math.floor(D / 2 - 6);
  carveRect(rooms[2].cx - CW, bz - CW, rooms[7].cx + CW, bz + CW);
  carveRect(rooms[2].cx - CW, bz - CW, rooms[2].cx + CW, CW);
  carveRect(rooms[7].cx - CW, bz - CW, rooms[7].cx + CW, CW);
  corridorMids.push({ x: (rooms[2].cx + rooms[7].cx) / 2, z: bz });

  // ---- walls: closed cells adjacent to open, merged into maximal rects ----
  const isOpen = (x: number, z: number) => inG(x, z) && open[at(x, z)] === 1;
  // EVERY closed cell is solid rock: no walkable void beyond the walls for
  // pathfinding to leak into, and the dollhouse view reads as a carved massif
  const wallCell = new Uint8Array(W * D);
  for (let z = MINZ; z < MINZ + D; z++) {
    for (let x = MINX; x < MINX + W; x++) {
      if (!isOpen(x, z)) wallCell[at(x, z)] = 1;
    }
  }
  const used = new Uint8Array(W * D);
  const items: Item[] = [];
  for (let z = MINZ; z < MINZ + D; z++) {
    for (let x = MINX; x < MINX + W; x++) {
      const i0 = at(x, z);
      if (!wallCell[i0] || used[i0]) continue;
      // greedy: extend right, then down
      let x1 = x;
      while (x1 + 1 < MINX + W && wallCell[at(x1 + 1, z)] && !used[at(x1 + 1, z)]) x1++;
      let z1 = z;
      outer: while (z1 + 1 < MINZ + D) {
        for (let xx = x; xx <= x1; xx++) {
          if (!wallCell[at(xx, z1 + 1)] || used[at(xx, z1 + 1)]) break outer;
        }
        z1++;
      }
      for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[at(xx, zz)] = 1;
      items.push({
        kind: "block",
        x: (x + x1) / 2 + 0.5, z: (z + z1) / 2 + 0.5,
        w: x1 - x + 1, d: z1 - z + 1, h: WALL_H,
      });
    }
  }

  // ---- lighting: real braziers in rooms and at every gallery junction,
  // emissive-only (dim) ones at corridor midpoints — pools of light with
  // honest darkness between them, without 40 forward-lit point lights
  for (const r of rooms) items.push({ kind: "lamp", x: r.cx + 0.5, z: r.cz - 1.5 });
  for (const e of elbows) items.push({ kind: "lamp", x: e.x + 0.5, z: e.z + 0.5 });
  // mid-corridor braziers hug the corridor edge so patrols don't clip them
  for (const m of corridorMids) {
    const vertical = m.z !== 0 && Math.abs(m.z) !== Math.abs(bz);
    items.push({ kind: "lamp", x: m.x + (vertical ? 2 : 0.5), z: m.z + (vertical ? 0.5 : 2), dim: true });
  }
  items.push({ kind: "lamp", x: rooms[2].cx + 0.5, z: bz + 0.5 });
  items.push({ kind: "lamp", x: rooms[7].cx + 0.5, z: bz + 0.5 });

  // ---- décor per room ----
  const decor: Item["kind"][] = ["crates", "barrel", "amphora", "firewood", "basket", "bench"];
  for (let i = 1; i < N; i++) {
    const r = rooms[i];
    const n = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const kind = decor[Math.floor(rng() * decor.length)];
      const ex = r.cx + (rng() < 0.5 ? -1 : 1) * ((r.x1 - r.x0) / 2 - 1.6);
      const ez = r.cz + (rng() - 0.5) * (r.z1 - r.z0 - 3.5);
      items.push({ kind, x: Math.round(ex * 2) / 2, z: Math.round(ez * 2) / 2, seed: Math.floor(rng() * 50) } as Item);
    }
    // big rooms get a column row along the FAR wall (never across the middle:
    // inflated pillar colliders would seal the room for pathfinding)
    if (r.x1 - r.x0 >= 12) {
      const farZ = r.cz < 0 ? r.z0 + 2.2 : r.z1 - 2.2; // wall away from the gallery rib
      items.push({ kind: "colonnade", x: r.cx + 0.5, z: farZ, length: Math.min(10, r.x1 - r.x0 - 5) });
    }
    if (rng() < 0.25) items.push({ kind: "shrine", x: r.cx - 2.5, z: r.z0 + 1.4, rot: 0 });
  }

  // ---- security ----
  items.push({ kind: "cam", x: elbows[2].x + 0.5, z: elbows[2].z + 0.5, rot: rng() * Math.PI * 2, sweep: 0.8 });
  items.push({ kind: "cam", x: elbows[6].x + 0.5, z: elbows[6].z + 0.5, rot: rng() * Math.PI * 2, sweep: 0.8 });
  items.push({ kind: "alarm", x: rooms[4].cx - 1.5, z: rooms[4].cz + 0.5, rot: 0 });
  items.push({ kind: "alarm", x: rooms[8].cx + 1.5, z: rooms[8].cz + 0.5, rot: 0 });

  // ---- pickups ----
  const pkRooms = [2, 4, 6, 8, 9];
  for (const [k, ri] of pkRooms.entries()) {
    const r = rooms[ri];
    items.push({
      kind: "pickup",
      x: r.cx + (rng() - 0.5) * 3, z: r.cz + 2,
      what: k % 2 === 0 ? "ammo" : "stones", amount: 3,
    });
  }

  // ---- guards with patrol routes derived from the room graph ----
  const guards: GuardDef[] = [];
  for (let i = 1; i < N; i++) {
    const r = rooms[i];
    const count = i >= N - 2 ? 2 : rng() < 0.6 ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const isOfficer = i === N - 2 && k === 0;
      const route: { x: number; z: number; wait?: number; look?: number }[] = [];
      route.push({ x: r.cx + (k ? 2 : -2), z: r.cz, wait: 2 + rng() * 1.5, look: rng() * Math.PI * 2 });
      // wander into a neighboring corridor and back
      const mid = corridorMids[Math.min(corridorMids.length - 1, (i - 1) * 2 + (rng() < 0.5 ? 0 : 1))];
      route.push({ x: mid.x, z: mid.z, wait: 1.5 + rng() * 2, look: rng() * Math.PI * 2 });
      if (rng() < 0.6) {
        const r2 = rooms[Math.max(1, i - 1)];
        route.push({ x: r2.cx + 2, z: r2.cz, wait: 2, look: rng() * Math.PI * 2 });
      }
      guards.push({ x: route[0].x, z: route[0].z, officer: isOfficer, patrol: route });
    }
  }

  // ---- objectives: three archive caches deep in the complex ----
  const objRooms = [Math.floor(N * 0.35), Math.floor(N * 0.65), N - 2];
  const objectives: ObjectiveDef[] = objRooms.map((ri, k) => ({
    id: `cache${k}`,
    label: `Burn archive cache ${["A", "B", "C"][k]}`,
    prop: "cache" as const,
    x: rooms[ri].cx + 1.5, z: rooms[ri].cz,
    duration: 2.8,
  }));
  objectives.push({
    id: "ledger",
    label: "Photograph the buyer ledger",
    prop: "documents" as const,
    x: rooms[5].cx - 1.5, z: rooms[5].cz,
    optional: true,
    duration: 2.2,
  });

  return {
    bounds: { minX: MINX - 2, minZ: MINZ - 2, maxX: MINX + W + 2, maxZ: MINZ + D + 2 },
    items,
    guards,
    objectives,
    playerStart: { x: rooms[0].cx, z: rooms[0].cz, angle: Math.PI / 2 },
    exfil: { x: rooms[N - 1].cx, z: rooms[N - 1].cz, r: 3, label: "Escape through the sea grotto" },
  };
}
