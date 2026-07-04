import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat, grassMat, PALETTE, texture } from "./materials";
import * as P from "./props";
import { BoxCollider, clamp, fbm2, makeBox, seededRandom } from "../core/mathutil";
import { NavGrid } from "../game/nav";
import type { AmbienceKind } from "../core/audio";

// ============================================================================
// Level definition schema (missions are authored as plain data)
// ============================================================================

export type TimeOfDay = "day" | "dusk" | "night";

export interface PatrolPoint { x: number; z: number; wait?: number; look?: number }

export interface GuardDef {
  x: number; z: number;
  angle?: number;             // facing when idle/static
  officer?: boolean;
  patrol?: PatrolPoint[];     // empty/undefined = stationary sentry
}

export interface ObjectiveDef {
  id: string;
  label: string;
  optional?: boolean;
  prop: "documents" | "safe" | "radio" | "cache" | "camera" | "none";
  x: number; z: number; rot?: number;
  duration?: number;          // hold-to-interact seconds (default 1.6)
  requires?: string[];        // objective ids that must be done first
  killGuard?: number;         // index into guards[]: completes when that guard dies
}

export type Item =
  | { kind: "building"; x: number; z: number; rot?: number; w: number; d: number; h: number; roof?: "gable" | "hip" | "flat"; color?: number; seed?: number; door?: boolean }
  | { kind: "wall"; x1: number; z1: number; x2: number; z2: number; h?: number; stone?: boolean }
  | { kind: "hedge"; x1: number; z1: number; x2: number; z2: number }
  | { kind: "vineyard"; x1: number; z1: number; x2: number; z2: number }
  | { kind: "arch"; x: number; z: number; rot?: number; w?: number; h?: number }
  | { kind: "tower"; x: number; z: number; h?: number }
  | { kind: "cypress" | "olive" | "palm" | "bush" | "pine"; x: number; z: number; seed?: number }
  | { kind: "amphora" | "bench" | "cart" | "firewood" | "netrack" | "basket" | "ropecoil" | "stall" | "shrine" | "pole" | "seagull"; x: number; z: number; rot?: number; seed?: number }
  | { kind: "fence"; x1: number; z1: number; x2: number; z2: number }
  | { kind: "rocks"; x: number; z: number; seed?: number; scale?: number }
  | { kind: "grass"; x: number; z: number; r?: number; seed?: number }
  | { kind: "crate" | "crates" | "barrel" | "sandbags" | "fountain" | "statue" | "truck" | "boat" | "pergola" | "lamp" | "mast" | "alarm" | "searchlight" | "crane" | "banner"; x: number; z: number; rot?: number }
  | { kind: "laundry" | "colonnade"; x: number; z: number; rot?: number; length?: number }
  | { kind: "pickup"; x: number; z: number; what: "ammo" | "stones"; amount?: number }
  | { kind: "cam"; x: number; z: number; rot: number; sweep?: number }
  | { kind: "house"; x: number; z: number; w: number; d: number; door: "N" | "S" | "E" | "W"; seed?: number; color?: number }
  | { kind: "well"; x: number; z: number }
  | { kind: "sweeper"; x: number; z: number; height?: number; radius?: number; speed?: number }
  | { kind: "dock"; x: number; z: number; rot?: number; length?: number; width?: number };

export interface RectDef { minX: number; minZ: number; maxX: number; maxZ: number }

export interface LevelDef {
  id: string;
  name: string;
  tag: string;                // "OP 01" etc
  cardBlurb: string;          // mission-select card text
  briefing: string;
  time: TimeOfDay;
  ambience: AmbienceKind;
  bounds: RectDef;
  playerStart: { x: number; z: number; angle: number };
  ammo: number;
  stones: number;
  /** gadget loadout; defaults applied when omitted */
  gear?: { smoke?: number; decoys?: number; emp?: number };
  water?: RectDef[];          // unwalkable, rendered as sea
  paths?: RectDef[];          // gravel decals
  plazas?: RectDef[];         // stone decals
  items: Item[];
  guards: GuardDef[];
  objectives: ObjectiveDef[];
  exfil: { x: number; z: number; r: number; label: string };
  hint?: string;              // shown at mission start
  epilogue?: string;          // shown on the debrief screen — carries the story forward
}

// ============================================================================
// Runtime level built from a definition
// ============================================================================

export interface GrassZone { x: number; z: number; r: number }
export interface AlarmPanelSpot { x: number; z: number; obj: THREE.Group }
export interface PickupSpot { x: number; z: number; what: "ammo" | "stones"; amount: number; obj: THREE.Group }
export interface HouseZone { minX: number; maxX: number; minZ: number; maxZ: number; roof: THREE.Object3D }
export interface WellSpot { x: number; z: number }
export interface CamSpot { x: number; z: number; rot: number; sweep: number; obj: THREE.Group; head: THREE.Object3D }
export interface SweeperSpot { x: number; z: number; height: number; radius: number; speed: number }

export interface LevelRuntime {
  def: LevelDef;
  group: THREE.Group;               // all static scenery
  colliders: BoxCollider[];
  nav: NavGrid;
  grass: GrassZone[];
  alarmPanels: AlarmPanelSpot[];
  pickups: PickupSpot[];
  houses: HouseZone[];
  wells: WellSpot[];
  cams: CamSpot[];
  sweepers: SweeperSpot[];
  clothMeshes: THREE.Mesh[];        // laundry/banners, animated by game
  waterMeshes: THREE.Mesh[];
  objectiveProps: Map<string, THREE.Group>;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  skyColor: number;
}

function itemGroup(item: Item): THREE.Group {
  switch (item.kind) {
    case "building": return P.building({ w: item.w, d: item.d, h: item.h, roofStyle: item.roof, color: item.color, seed: item.seed, door: item.door });
    case "arch": return P.archGate(item.w ?? 3, item.h ?? 3.4);
    case "tower": return P.watchtower(item.h ?? 6);
    case "cypress": return P.cypress(5 + ((item.seed ?? 1) % 3), item.seed ?? 1);
    case "olive": return P.oliveTree(item.seed ?? 1);
    case "palm": return P.palmTree(item.seed ?? 1);
    case "pine": return P.pineTree(item.seed ?? 1);
    case "bush": return P.bush(item.seed ?? 1);
    case "amphora": return P.amphora(item.seed ?? ((item.x * 13 + item.z * 7) | 0));
    case "bench": return P.bench();
    case "cart": return P.cart(item.seed ?? ((item.x * 3 + item.z * 11) | 0));
    case "firewood": return P.firewood(item.seed ?? 1);
    case "netrack": return P.netRack(item.seed ?? 1);
    case "basket": return P.basket(item.seed ?? ((item.x * 17 + item.z) | 0));
    case "ropecoil": return P.ropeCoil();
    case "stall": return P.marketStall(item.seed ?? 1);
    case "shrine": return P.shrine();
    case "pole": return P.telegraphPole();
    case "seagull": return P.seagullPost(item.seed ?? ((item.x + item.z * 5) | 0));
    case "rocks": return P.rocks(item.seed ?? 1, item.scale ?? 1);
    case "grass": return P.grassPatch(item.r ?? 2, item.seed ?? 1);
    case "crane": return P.crane();
    case "banner": return P.banner();
    case "laundry": return P.laundryLine(item.length ?? 6);
    case "colonnade": return P.colonnade(item.length ?? 12);
    case "pickup": return P.pickup(item.what);
    case "cam": return P.securityCamera();
    case "crate": return P.crate(1.2, (item.x * 7 + item.z * 13) | 0);
    case "crates": return P.crateStack((item.x * 11 + item.z * 3) | 0);
    case "barrel": return P.barrel((item.x * 5 + item.z * 17) | 0);
    case "sandbags": return P.sandbags();
    case "fountain": return P.fountain();
    case "statue": return P.statue();
    case "truck": return P.truck();
    case "boat": return P.boat();
    case "dock": return P.dock(item.length ?? 10, item.width ?? 3);
    case "pergola": return P.pergola();
    case "lamp": return P.lampPost(false); // lit flag set by time-of-day below
    case "mast": return P.radioMast();
    case "alarm": return P.alarmPanel();
    case "searchlight": return P.searchlight();
    default: return new THREE.Group();
  }
}

function objectiveProp(kind: ObjectiveDef["prop"]): THREE.Group {
  switch (kind) {
    case "documents": return P.deskWithDocuments();
    case "safe": return P.safeBox();
    case "radio": return P.radioConsole();
    case "cache": return P.crateCache();
    case "camera": { const g = new THREE.Group(); const c = P.camera_prop(); c.position.y = 1.2; g.add(c); const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.24, 1.2, 3), mat(PALETTE.metalDark)); tripod.position.y = 0.6; g.add(tripod); return g; }
    default: return new THREE.Group();
  }
}

/** collider footprints per item kind (local, unrotated) */
function itemColliders(item: Item): BoxCollider[] {
  const c: BoxCollider[] = [];
  switch (item.kind) {
    case "building": {
      // rotation supported only for 90° multiples (swap w/d)
      const rot = ((item.rot ?? 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const quarter = Math.round(rot / (Math.PI / 2)) % 2 === 1;
      const w = quarter ? item.d : item.w;
      const d = quarter ? item.w : item.d;
      c.push(makeBox(item.x, item.z, w, d, item.h));
      break;
    }
    case "wall": {
      const w = Math.abs(item.x2 - item.x1) + 0.6;
      const d = Math.abs(item.z2 - item.z1) + 0.6;
      c.push(makeBox((item.x1 + item.x2) / 2, (item.z1 + item.z2) / 2, w, d, item.h ?? 2.6));
      break;
    }
    case "hedge": {
      const w = Math.abs(item.x2 - item.x1) + 0.9;
      const d = Math.abs(item.z2 - item.z1) + 0.9;
      c.push(makeBox((item.x1 + item.x2) / 2, (item.z1 + item.z2) / 2, w, d, 1.9));
      break;
    }
    case "vineyard": {
      // low cover: blocks movement + crouched sightlines, see over when standing
      const w = Math.abs(item.x2 - item.x1) + 0.5;
      const d = Math.abs(item.z2 - item.z1) + 0.5;
      c.push(makeBox((item.x1 + item.x2) / 2, (item.z1 + item.z2) / 2, w, d, 1.2));
      break;
    }
    case "crane": c.push(makeBox(item.x, item.z, 1.6, 1.6, 1.4)); break;
    case "banner": c.push(makeBox(item.x, item.z, 0.35, 0.35, 1.0)); break;
    case "colonnade": {
      const len = item.length ?? 12;
      const n = Math.max(2, Math.round(len / 3));
      const spacing = len / n;
      const rot = item.rot ?? 0;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for (let i = 0; i <= n; i++) {
        const lx = -len / 2 + i * spacing;
        c.push(makeBox(item.x + lx * cos, item.z - lx * sin, 0.7, 0.7, 3.2));
      }
      break;
    }
    case "laundry": break;
    case "pickup": break;
    case "cam": break;
    case "sweeper": break;
    case "house": {
      for (const s of houseSegments(item)) c.push(makeBox(s.cx, s.cz, s.w, s.d, HOUSE_H));
      break;
    }
    case "well": c.push(makeBox(item.x, item.z, 1.8, 1.8, 1.0)); break;
    case "arch": {
      const w = item.w ?? 3;
      // two pillars, pass-through center; local X spread, rotate below
      const rot = item.rot ?? 0;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for (const side of [-1, 1]) {
        const lx = side * (w / 2 + 0.5);
        c.push(makeBox(item.x + lx * cos, item.z - lx * sin, 1.2, 1.2, item.h ?? 3.4));
      }
      break;
    }
    case "tower": c.push(makeBox(item.x, item.z, 2.5, 2.5, 1.0)); break;
    case "cypress": c.push(makeBox(item.x, item.z, 1.1, 1.1, 5)); break;
    case "olive": c.push(makeBox(item.x, item.z, 0.55, 0.55, 1.0)); break;
    case "palm": c.push(makeBox(item.x, item.z, 0.45, 0.45, 1.0)); break;
    case "pine": c.push(makeBox(item.x, item.z, 0.55, 0.55, 1.0)); break;
    case "amphora": c.push(makeBox(item.x, item.z, 0.8, 0.8, 0.8)); break;
    case "bench": c.push(makeBox(item.x, item.z, 1.5, 0.5, 0.6)); break;
    case "cart": c.push(makeBox(item.x, item.z, 1.3, 1.9, 0.9)); break;
    case "firewood": c.push(makeBox(item.x, item.z, 1.1, 1.1, 0.6)); break;
    case "netrack": c.push(makeBox(item.x, item.z, 2.5, 0.3, 1.2)); break;
    case "basket": break;
    case "ropecoil": break;
    case "stall": c.push(makeBox(item.x, item.z, 2.4, 1.6, 1.0)); break;
    case "shrine": c.push(makeBox(item.x, item.z, 0.9, 0.65, 1.9)); break;
    case "pole": c.push(makeBox(item.x, item.z, 0.28, 0.28, 1.0)); break;
    case "seagull": break;
    case "fence": {
      const w = Math.abs(item.x2 - item.x1) + 0.3;
      const d = Math.abs(item.z2 - item.z1) + 0.3;
      c.push(makeBox((item.x1 + item.x2) / 2, (item.z1 + item.z2) / 2, w, d, 0.95));
      break;
    }
    case "rocks": c.push(makeBox(item.x, item.z, 1.6 * (item.scale ?? 1), 1.6 * (item.scale ?? 1), 0.9 * (item.scale ?? 1))); break;
    case "crate": c.push(makeBox(item.x, item.z, 1.25, 1.25, 1.2)); break;
    case "crates": c.push(makeBox(item.x + 0.5, item.z + 0.15, 2.6, 1.6, 1.3)); break;
    case "barrel": c.push(makeBox(item.x, item.z, 0.95, 0.95, 1.1)); break;
    case "sandbags": c.push(makeBox(item.x, item.z, 2.6, 0.7, 1.1)); break;
    case "fountain": c.push(makeBox(item.x, item.z, 4.4, 4.4, 0.8)); break;
    case "statue": c.push(makeBox(item.x, item.z, 1.3, 1.3, 2.6)); break;
    case "truck": {
      const rot = item.rot ?? 0;
      const quarter = Math.abs(Math.round(rot / (Math.PI / 2))) % 2 === 1;
      c.push(makeBox(item.x, item.z, quarter ? 7 : 2.6, quarter ? 2.6 : 7, 2.4));
      break;
    }
    case "boat": c.push(makeBox(item.x, item.z, 2.4, 7.4, 1.6)); break;
    case "pergola": break; // walk under
    case "lamp": c.push(makeBox(item.x, item.z, 0.3, 0.3, 1.0)); break;
    case "mast": c.push(makeBox(item.x, item.z, 1.5, 1.5, 1.2)); break;
    case "alarm": break;
    case "searchlight": c.push(makeBox(item.x, item.z, 0.9, 0.9, 1.0)); break;
    case "bush": break;   // can walk through bushes (partial hiding via grass zones instead)
    case "grass": break;
    case "dock": break;
  }
  return c;
}

/** wall strips for an enterable house: 4 sides, door side split around a gap */
function houseSegments(it: Extract<Item, { kind: "house" }>): { cx: number; cz: number; w: number; d: number }[] {
  const t = 0.35, doorW = 3.2; // wide arch: must clear a full nav cell after agent-radius inflation
  const { x, z, w, d } = it;
  const out: { cx: number; cz: number; w: number; d: number }[] = [];
  const side = (axis: "x" | "z", sign: number, hasDoor: boolean) => {
    if (axis === "z") {
      // wall along X at z +- d/2
      const cz = z + sign * (d / 2 - t / 2);
      if (!hasDoor) { out.push({ cx: x, cz, w, d: t }); return; }
      const seg = (w - doorW) / 2;
      out.push({ cx: x - (doorW / 2 + seg / 2), cz, w: seg, d: t });
      out.push({ cx: x + (doorW / 2 + seg / 2), cz, w: seg, d: t });
    } else {
      const cx = x + sign * (w / 2 - t / 2);
      if (!hasDoor) { out.push({ cx, cz: z, w: t, d }); return; }
      const seg = (d - doorW) / 2;
      out.push({ cx, cz: z - (doorW / 2 + seg / 2), w: t, d: seg });
      out.push({ cx, cz: z + (doorW / 2 + seg / 2), w: t, d: seg });
    }
  };
  side("z", -1, it.door === "N");
  side("z", 1, it.door === "S");
  side("x", 1, it.door === "E");
  side("x", -1, it.door === "W");
  return out;
}

const HOUSE_H = 2.9;

function buildHouse(it: Extract<Item, { kind: "house" }>, night: boolean): { group: THREE.Group; roof: THREE.Object3D } {
  const g = new THREE.Group();
  const rng = seededRandom(it.seed ?? 5);
  const wallMat = mat(it.color ?? PALETTE.plasterWarm, { map: "plaster", repeat: [2, 1.5] });
  for (const s of houseSegments(it)) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, HOUSE_H, s.d), wallMat);
    m.position.set(s.cx - it.x, HOUSE_H / 2, s.cz - it.z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(it.w - 0.5, it.d - 0.5),
    mat(0xffffff, { map: "wood", repeat: [it.w / 1.6, it.d / 1.6] })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  g.add(floor);
  // furniture: table + stool + shelf + cot
  const wood = mat(0xffffff, { map: "wood" });
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.8), wood);
  table.position.set(-it.w / 4, 0.75, -it.d / 4);
  table.castShadow = true;
  g.add(table);
  for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), wood);
    leg.position.set(-it.w / 4 + lx, 0.36, -it.d / 4 + lz);
    g.add(leg);
  }
  const stool = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), wood);
  stool.position.set(-it.w / 4 + 1.1, 0.22, -it.d / 4 + 0.2);
  stool.castShadow = true;
  g.add(stool);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 1.3), mat(PALETTE.woodDark, { flat: true }));
  shelf.position.set(it.w / 2 - 0.65, 0.85, -it.d / 4);
  shelf.castShadow = true;
  g.add(shelf);
  const cot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 1.9), mat(0x8a8272, { flat: true }));
  cot.position.set(it.w / 4, 0.2, it.d / 4);
  cot.castShadow = true;
  g.add(cot);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.4), mat(0xe8e0ce, { flat: true }));
  pillow.position.set(it.w / 4, 0.47, it.d / 4 - 0.65);
  g.add(pillow);
  // warm interior light
  const lamp = new THREE.PointLight(0xffd9a0, night ? 8 : 3.5, 7, 1.8);
  lamp.position.set(0, 2.2, 0);
  g.add(lamp);
  // roof (hidden when the player is inside)
  const roof = new THREE.Group();
  // NOTE ×√2: a 4-sided cone rotated 45° has axis half-extent radius/√2,
  // so the radius must be the half-DIAGONAL to cover the walls
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry((Math.max(it.w, it.d) / 2 + 0.55) * Math.SQRT2, 1.6, 4),
    mat(PALETTE.terracotta, { flat: true })
  );
  cone.rotation.y = Math.PI / 4;
  cone.scale.set(it.w / Math.max(it.w, it.d), 1, it.d / Math.max(it.w, it.d));
  cone.position.y = HOUSE_H + 0.8;
  cone.castShadow = true;
  roof.add(cone);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(it.w + 0.4, 0.14, it.d + 0.4), mat(PALETTE.plasterWarm));
  slab.position.y = HOUSE_H + 0.05;
  roof.add(slab);
  g.add(roof);
  void rng;
  return { group: g, roof };
}

function buildWell(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.9, 12), mat(0xffffff, { map: "stone", repeat: [3, 0.6] }));
  ring.position.y = 0.45;
  ring.castShadow = true; ring.receiveShadow = true;
  g.add(ring);
  const dark = new THREE.Mesh(new THREE.CircleGeometry(0.72, 12), mat(0x0a0d10));
  dark.rotation.x = -Math.PI / 2;
  dark.position.y = 0.91;
  g.add(dark);
  const wood = mat(PALETTE.woodDark);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.12), wood);
    post.position.set(s * 0.8, 1.15, 0);
    post.castShadow = true;
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.85;
  g.add(bar);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.7, 4), mat(PALETTE.terracotta, { flat: true }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.35;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

// ============================================================================
// Builder
// ============================================================================

export function buildLevel(def: LevelDef): LevelRuntime {
  const group = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const grass: GrassZone[] = [];
  const alarmPanels: AlarmPanelSpot[] = [];
  const waterMeshes: THREE.Mesh[] = [];
  const objectiveProps = new Map<string, THREE.Group>();
  const b = def.bounds;
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const night = def.time === "night";

  // ---- terrain: flat inside the playable bounds, hills & sea basin beyond ----
  const tSeed = def.id.length * 977 + def.id.charCodeAt(0) * 13;
  const inRectT = (x: number, z: number, r: RectDef) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
  /** world-space terrain height; exactly 0 within (and shortly beyond) bounds */
  const terrainH = (x: number, z: number): number => {
    const dx = Math.max(b.minX - x, x - b.maxX, 0);
    const dz = Math.max(b.minZ - z, z - b.maxZ, 0);
    const distOut = Math.hypot(dx, dz);
    if (distOut <= 5) return 0;
    const t0 = Math.min(1, (distOut - 5) / 70);
    const t = t0 * t0 * (3 - 2 * t0);
    // if the nearest playable point is water, the sea continues outward instead of hills
    const nx = clamp(x, b.minX + 0.6, b.maxX - 0.6);
    const nz = clamp(z, b.minZ + 0.6, b.maxZ - 0.6);
    const seaward = (def.water ?? []).some((r) => inRectT(nx, nz, r));
    if (seaward) return -3.4 * t;
    const n = fbm2(x * 0.016, z * 0.016, tSeed);
    return t * (2 + n * n * 30);
  };

  const EXT = 180;
  const segs = 110;
  const groundTex = texture("ground");
  const gMat = new THREE.MeshStandardMaterial({
    map: groundTex.clone(), color: night ? 0x8a94a8 : 0xffffff, roughness: 0.95, vertexColors: true,
  });
  gMat.map!.repeat.set((W + EXT * 2) / 7, (D + EXT * 2) / 7);
  gMat.map!.needsUpdate = true;
  gMat.bumpMap = gMat.map;
  gMat.bumpScale = 0.015;
  const terrainGeo = new THREE.PlaneGeometry(W + EXT * 2, D + EXT * 2, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  {
    const pos = terrainGeo.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const flat = new THREE.Color(0xffffff);
    const scrub = new THREE.Color(night ? 0x93a37e : 0x9db072);
    const rock = new THREE.Color(night ? 0xb8b2a6 : 0xc9bda4);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + cx;
      const wz = pos.getZ(i) + cz;
      const h = terrainH(wx, wz);
      pos.setY(i, h);
      if (h <= 0.01) col.copy(flat);
      else {
        const k = clamp(h / 22, 0, 1);
        if (k < 0.5) col.copy(flat).lerp(scrub, k * 2);
        else col.copy(scrub).lerp(rock, (k - 0.5) * 2);
        // patchiness so the hills aren't a smooth gradient
        const p = fbm2(wx * 0.05, wz * 0.05, tSeed + 7);
        col.multiplyScalar(0.86 + p * 0.28);
      }
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(terrainGeo, gMat);
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- horizon forest: cheap merged trees on the surrounding hills ----
  {
    const rngF = seededRandom(tSeed + 5);
    const trunkGeos: THREE.BufferGeometry[] = [];
    const crownBuckets: THREE.BufferGeometry[][] = [[], []];
    const tmpF = new THREE.Object3D();
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 240; tries++) {
      const x = cx + (rngF() - 0.5) * (W + EXT * 1.7);
      const z = cz + (rngF() - 0.5) * (D + EXT * 1.7);
      const h = terrainH(x, z);
      if (h < 1.5) continue;
      // forest prefers mid-slopes, thins near rocky tops
      if (h > 20 && rngF() < 0.6) continue;
      const s = 1.6 + rngF() * 2.6;
      const isCypress = rngF() < 0.45;
      // toNonIndexed: cones are indexed, icosahedra aren't — merges need one or the other
      const crown = isCypress
        ? new THREE.ConeGeometry(s * 0.32, s * 1.5, 5).toNonIndexed()
        : new THREE.IcosahedronGeometry(s * 0.55, 0);
      tmpF.position.set(x - cx, h + (isCypress ? s * 0.75 : s * 0.72), z - cz);
      tmpF.rotation.set(0, rngF() * Math.PI, 0);
      tmpF.updateMatrix();
      crown.applyMatrix4(tmpF.matrix);
      crownBuckets[rngF() < 0.5 ? 0 : 1].push(crown);
      const trunk = new THREE.CylinderGeometry(0.1 * s, 0.14 * s, s * 0.7, 5).toNonIndexed();
      tmpF.position.set(x - cx, h + s * 0.3, z - cz);
      tmpF.updateMatrix();
      trunk.applyMatrix4(tmpF.matrix);
      trunkGeos.push(trunk);
      placed++;
    }
    const bakeF = (geos: THREE.BufferGeometry[], material: THREE.Material) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos);
      for (const p of geos) p.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.position.set(cx, 0, cz);
      group.add(mesh);
    };
    bakeF(crownBuckets[0], mat(night ? 0x2c3d33 : 0x3f5a38, { flat: true }));
    bakeF(crownBuckets[1], mat(night ? 0x35473a : 0x527048, { flat: true }));
    bakeF(trunkGeos, mat(0x6b5744, { flat: true }));
  }

  const addDecal = (r: RectDef, texName: string, y: number, tint?: number) => {
    const m = new THREE.MeshStandardMaterial({ map: texture(texName).clone(), color: tint ?? (night ? 0x9aa2b2 : 0xffffff), roughness: 0.93 });
    m.map!.repeat.set((r.maxX - r.minX) / 5, (r.maxZ - r.minZ) / 5);
    m.map!.needsUpdate = true;
    m.bumpMap = m.map;
    m.bumpScale = 0.02;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ), m);
    p.rotation.x = -Math.PI / 2;
    p.position.set((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2);
    p.receiveShadow = true;
    group.add(p);
  };
  for (const r of def.paths ?? []) addDecal(r, "gravel", 0.02);
  for (const r of def.plazas ?? []) addDecal(r, "concrete", 0.025, night ? 0x9aa2b2 : 0xd8cfbc);

  // ---- water ----
  for (const r of def.water ?? []) {
    const wMat = new THREE.MeshStandardMaterial({
      color: night ? 0x14343e : PALETTE.sea,
      emissive: night ? 0x06141c : 0x0d3230,
      roughness: 0.12,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
    });
    // the visible sea continues out over the terrain basin wherever the
    // water rect touches the playable bounds (collider keeps the true rect)
    const vis: RectDef = { ...r };
    if (r.minX <= b.minX + 2) vis.minX -= 150;
    if (r.maxX >= b.maxX - 2) vis.maxX += 150;
    if (r.minZ <= b.minZ + 2) vis.minZ -= 150;
    if (r.maxZ >= b.maxZ - 2) vis.maxZ += 150;
    const seg = Math.min(30, Math.max(8, Math.floor((vis.maxX - vis.minX) / 6)));
    const w = new THREE.Mesh(new THREE.PlaneGeometry(vis.maxX - vis.minX, vis.maxZ - vis.minZ, seg, seg), wMat);
    w.rotation.x = -Math.PI / 2;
    // sits just above the ground plane so the sea reads as water over sand
    w.position.set((vis.minX + vis.maxX) / 2, 0.12, (vis.minZ + vis.maxZ) / 2);
    group.add(w);
    waterMeshes.push(w);
    colliders.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, height: 0, solid: true });
  }

  // ---- items ----
  const rng = seededRandom(99);
  const pickups: PickupSpot[] = [];
  const cams: CamSpot[] = [];
  const sweepers: SweeperSpot[] = [];
  const clothMeshes: THREE.Mesh[] = [];
  const houses: HouseZone[] = [];
  const wells: WellSpot[] = [];
  for (const item of def.items) {
    if (item.kind === "house") {
      const h = buildHouse(item, night);
      h.group.position.set(item.x, 0, item.z);
      group.add(h.group);
      houses.push({ minX: item.x - item.w / 2, maxX: item.x + item.w / 2, minZ: item.z - item.d / 2, maxZ: item.z + item.d / 2, roof: h.roof });
      colliders.push(...itemColliders(item));
      continue;
    }
    if (item.kind === "well") {
      const w = buildWell();
      w.position.set(item.x, 0, item.z);
      group.add(w);
      wells.push({ x: item.x, z: item.z });
      colliders.push(...itemColliders(item));
      continue;
    }
    if (item.kind === "sweeper") {
      sweepers.push({ x: item.x, z: item.z, height: item.height ?? 7, radius: item.radius ?? 10, speed: item.speed ?? 0.5 });
      continue;
    }
    if (item.kind === "wall" || item.kind === "hedge" || item.kind === "vineyard" || item.kind === "fence") {
      const dx = item.x2 - item.x1, dz = item.z2 - item.z1;
      const len = Math.hypot(dx, dz);
      const seg = item.kind === "wall" ? P.wallSegment(len, item.h ?? 2.6, item.stone)
        : item.kind === "hedge" ? P.hedge(len)
        : item.kind === "fence" ? P.fenceRun(len, Math.floor(item.x1 * 7 + item.z1 * 3))
        : P.vineyardRow(len);
      seg.position.set((item.x1 + item.x2) / 2, 0, (item.z1 + item.z2) / 2);
      seg.rotation.y = -Math.atan2(dz, dx);
      group.add(seg);
    } else {
      const g = itemGroup(item);
      g.position.set(item.x, 0, item.z);
      if ("rot" in item && item.rot) g.rotation.y = item.rot;
      if (item.kind === "lamp" && night) {
        // replace with lit version
        g.clear();
        const lit = P.lampPost(true);
        g.add(lit);
      }
      group.add(g);
      if (item.kind === "grass") grass.push({ x: item.x, z: item.z, r: item.r ?? 2 });
      if (item.kind === "alarm") alarmPanels.push({ x: item.x, z: item.z, obj: g });
      if (item.kind === "pickup") pickups.push({ x: item.x, z: item.z, what: item.what, amount: item.amount ?? (item.what === "ammo" ? 4 : 3), obj: g });
      if (item.kind === "cam") {
        const head = g.getObjectByName("cam-head")!;
        cams.push({ x: item.x, z: item.z, rot: item.rot, sweep: item.sweep ?? 0.7, obj: g, head });
      }
      g.traverse((o) => { if (o.name === "cloth") clothMeshes.push(o as THREE.Mesh); });
    }
    colliders.push(...itemColliders(item));
  }

  // ---- objective props ----
  for (const o of def.objectives) {
    const g = objectiveProp(o.prop);
    g.position.set(o.x, 0, o.z);
    if (o.rot) g.rotation.y = o.rot;
    group.add(g);
    objectiveProps.set(o.id, g);
    if (o.prop === "documents") colliders.push(makeBox(o.x, o.z, 1.9, 1.0, 0.85));
    if (o.prop === "safe") colliders.push(makeBox(o.x, o.z, 1.1, 1.0, 1.3));
    if (o.prop === "radio") colliders.push(makeBox(o.x, o.z, 1.7, 0.8, 1.3));
    if (o.prop === "cache") colliders.push(makeBox(o.x, o.z, 1.25, 1.25, 1.2));
  }

  // ---- exfil marker ----
  const exfilRing = new THREE.Mesh(
    new THREE.RingGeometry(def.exfil.r - 0.4, def.exfil.r, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
  );
  exfilRing.rotation.x = -Math.PI / 2;
  exfilRing.position.set(def.exfil.x, 0.06, def.exfil.z);
  exfilRing.name = "exfil-ring";
  group.add(exfilRing);

  // ---- auto-scattered ground cover: tufts, pebbles, wildflowers ----
  // decorative only (no colliders) so navigation and stealth are untouched
  {
    const rng2 = seededRandom(def.id.length * 131 + 17);
    const area = W * D;
    const inRect = (x: number, z: number, r: RectDef) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
    const blocked = (x: number, z: number) => {
      for (const r of def.water ?? []) if (inRect(x, z, r)) return true;
      for (const r of def.paths ?? []) if (inRect(x, z, r)) return true;
      for (const r of def.plazas ?? []) if (inRect(x, z, r)) return true;
      for (const cc of colliders) {
        if (x > cc.minX - 0.2 && x < cc.maxX + 0.2 && z > cc.minZ - 0.2 && z < cc.maxZ + 0.2) return true;
      }
      return false;
    };
    const pick = (): [number, number] | null => {
      for (let tries = 0; tries < 6; tries++) {
        const x = b.minX + 1.5 + rng2() * (W - 3);
        const z = b.minZ + 1.5 + rng2() * (D - 3);
        if (!blocked(x, z)) return [x, z];
      }
      return null;
    };
    const tmp = new THREE.Object3D();
    const bake = (geos: THREE.BufferGeometry[], material: THREE.Material) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos);
      for (const p of geos) p.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    // grass tufts, two tones — crossed wind-swayed blade quads
    const tuftBuckets: THREE.BufferGeometry[][] = [[], []];
    const tuftCount = Math.min(420, Math.floor(area / 28));
    for (let i = 0; i < tuftCount; i++) {
      const p = pick();
      if (!p) continue;
      const h = 0.28 + rng2() * 0.34;
      const w = 0.32 + rng2() * 0.28;
      const bucket = rng2() < 0.55 ? 0 : 1;
      const yaw = rng2() * Math.PI;
      for (const cross of [0, Math.PI / 2]) {
        const quad = new THREE.PlaneGeometry(w, h, 1, 2);
        quad.translate(0, h / 2 - 0.02, 0);
        tmp.position.set(p[0], 0, p[1]);
        tmp.rotation.set(0, yaw + cross, (rng2() - 0.5) * 0.12);
        tmp.updateMatrix();
        quad.applyMatrix4(tmp.matrix);
        tuftBuckets[bucket].push(quad);
      }
      tmp.rotation.set(0, 0, 0);
    }
    bake(tuftBuckets[0], grassMat(night ? 0x8a8f68 : 0xb5bb7e));
    bake(tuftBuckets[1], grassMat(night ? 0x74855f : 0x84a05e));
    // pebbles
    const pebbles: THREE.BufferGeometry[] = [];
    const pebbleCount = Math.min(200, Math.floor(area / 60));
    for (let i = 0; i < pebbleCount; i++) {
      const p = pick();
      if (!p) continue;
      const s = 0.05 + rng2() * 0.1;
      const pg = new THREE.IcosahedronGeometry(s, 0);
      tmp.position.set(p[0], s * 0.4, p[1]);
      tmp.rotation.set(rng2() * 3, rng2() * 3, rng2() * 3);
      tmp.scale.set(1, 0.6, 1);
      tmp.updateMatrix();
      pg.applyMatrix4(tmp.matrix);
      tmp.scale.set(1, 1, 1);
      pebbles.push(pg);
    }
    bake(pebbles, mat(0xa89f8d, { flat: true }));
    // wildflowers
    const flowerCols = [0xe8e0ce, 0xd46a52, 0xd9b23d];
    const flowerBuckets: THREE.BufferGeometry[][] = [[], [], []];
    const flowerCount = Math.min(90, Math.floor(area / 130));
    for (let i = 0; i < flowerCount; i++) {
      const p = pick();
      if (!p) continue;
      const fg = new THREE.IcosahedronGeometry(0.045, 0);
      tmp.position.set(p[0], 0.22 + rng2() * 0.15, p[1]);
      tmp.updateMatrix();
      fg.applyMatrix4(tmp.matrix);
      flowerBuckets[Math.floor(rng2() * 3)].push(fg);
    }
    flowerBuckets.forEach((bkt, i) => bake(bkt, mat(flowerCols[i], { flat: true })));
  }

  // ---- sky: gradient dome + sun disc + drifting cloud puffs ----
  {
    const skyDef = def.time === "day"
      ? { top: 0x6ea9d4, horizon: 0xe8dcc0, sun: 0xfff4d8, sunPos: [40, 55, 22] as const, clouds: 0xffffff, cloudOp: 0.85 }
      : def.time === "dusk"
        ? { top: 0x7c6a9c, horizon: 0xf0a860, sun: 0xffc077, sunPos: [60, 18, -30] as const, clouds: 0xf5c9a0, cloudOp: 0.8 }
        : { top: 0x060b16, horizon: 0x18233a, sun: 0xd8e4f8, sunPos: [-35, 50, 25] as const, clouds: 0x27324a, cloudOp: 0.4 };
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 4; skyCanvas.height = 512;
    const sctx = skyCanvas.getContext("2d")!;
    const grad = sctx.createLinearGradient(0, 0, 0, 512);
    const hx = (n: number) => "#" + n.toString(16).padStart(6, "0");
    grad.addColorStop(0, hx(skyDef.top));
    grad.addColorStop(0.62, hx(skyDef.horizon));
    grad.addColorStop(1, hx(skyDef.horizon));
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 4, 512);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(320, 28, 18),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.position.set(cx, -12, cz);
    dome.renderOrder = -10;
    group.add(dome);

    // sun / moon disc
    const sunDir = new THREE.Vector3(...skyDef.sunPos).normalize();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(def.time === "night" ? 9 : 16, 24),
      new THREE.MeshBasicMaterial({ color: skyDef.sun, fog: false, transparent: true, opacity: 0.95 })
    );
    disc.position.copy(sunDir).multiplyScalar(290).add(new THREE.Vector3(cx, -12, cz));
    disc.lookAt(cx, 0, cz);
    group.add(disc);

    // cloud puffs: flat billboardy blobs high above
    const cloudRng = seededRandom(def.id.length * 31 + 7);
    const cloudMat = new THREE.MeshBasicMaterial({ color: skyDef.clouds, transparent: true, opacity: skyDef.cloudOp, fog: false, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const cluster = new THREE.Group();
      const puffs = 3 + Math.floor(cloudRng() * 3);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(9 + cloudRng() * 10, 7, 5), cloudMat);
        puff.scale.y = 0.32;
        puff.position.set((j - puffs / 2) * 12 + cloudRng() * 6, cloudRng() * 4, (cloudRng() - 0.5) * 10);
        cluster.add(puff);
      }
      const a = cloudRng() * Math.PI * 2;
      const r = 120 + cloudRng() * 130;
      cluster.position.set(cx + Math.cos(a) * r, 85 + cloudRng() * 45, cz + Math.sin(a) * r);
      group.add(cluster);
    }
  }

  // ---- perimeter fence at bounds (visual guard rail) ----
  // (levels are authored with their own walls; bounds are enforced in code)

  // ---- lighting ----
  let sun: THREE.DirectionalLight;
  let hemi: THREE.HemisphereLight;
  let skyColor: number;
  // hemisphere is a light touch only — image-based env lighting fills the rest
  if (def.time === "day") {
    skyColor = PALETTE.skyDay;
    sun = new THREE.DirectionalLight(PALETTE.sunDay, 3.0);
    sun.position.set(40, 55, 22);
    hemi = new THREE.HemisphereLight(0xcfe4ec, 0xcaa877, 0.35);
  } else if (def.time === "dusk") {
    skyColor = 0xd9a878;
    sun = new THREE.DirectionalLight(0xffb066, 2.4);
    sun.position.set(60, 20, -30);
    hemi = new THREE.HemisphereLight(0xe8b088, 0x8a6a58, 0.28);
  } else {
    skyColor = PALETTE.skyNight;
    sun = new THREE.DirectionalLight(PALETTE.moonlight, 0.85);
    sun.position.set(-35, 50, 25);
    hemi = new THREE.HemisphereLight(0x32456a, 0x1a202c, 0.52);
  }
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);
  group.add(hemi);

  const nav = new NavGrid(b.minX, b.minZ, b.maxX, b.maxZ, colliders);

  return { def, group, colliders, nav, grass, alarmPanels, pickups, houses, wells, cams, sweepers, clothMeshes, waterMeshes, objectiveProps, sun, hemi, skyColor };
}
