import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat, grassMat, leafMat, PALETTE } from "./materials";
import { seededRandom } from "../core/mathutil";

/**
 * Procedural Mediterranean prop builders. Each returns a THREE.Group centered
 * at origin, resting on y=0. Colliders are declared separately in level data.
 */

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** sprinkle wind-rustled leaf cards around a canopy shell to soften the silhouette */
function leafHalo(g: THREE.Group, rng: () => number, center: THREE.Vector3, radius: number, count: number, tint: number, size = 1.4) {
  const m = leafMat(tint);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const elev = (rng() - 0.35) * 1.6;
    const r = radius * (0.75 + rng() * 0.4);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(size * (0.7 + rng() * 0.6), size * (0.6 + rng() * 0.5)), m);
    card.position.set(
      center.x + Math.cos(a) * Math.cos(elev) * r,
      center.y + Math.sin(elev) * r * 0.7,
      center.z + Math.sin(a) * Math.cos(elev) * r
    );
    card.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    g.add(card); // no castShadow: quad shadows read as slabs
  }
}

export interface BuildingOpts {
  w: number; d: number; h: number;
  color?: number;
  roofStyle?: "gable" | "hip" | "flat";
  seed?: number;
  door?: boolean;
}

export function building(o: BuildingOpts): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(o.seed ?? 1);
  const wallMat = mat(o.color ?? PALETTE.whitewash, { map: "plaster", repeat: [Math.max(1, o.w / 4), Math.max(1, o.h / 4)] });
  const body = box(o.w, o.h, o.d, wallMat, 0, o.h / 2, 0);
  g.add(body);

  // facade variety (seeded): darker plinth base + stone corner quoins
  g.add(box(o.w + 0.08, 0.42, o.d + 0.08, mat(0xb9a98f, { map: "plaster", repeat: [3, 0.4] }), 0, 0.21, 0));
  if (rng() < 0.55) {
    const quoinM = mat(0xd6cdbb, { map: "stone", repeat: [0.4, 0.3] });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let qy = 0.65; qy < o.h - 0.3; qy += 0.58) {
        const q = box(0.34, 0.26, 0.34, quoinM, sx * o.w / 2, qy, sz * o.d / 2);
        q.position.x -= sx * 0.02; q.position.z -= sz * 0.02;
        g.add(q);
      }
    }
  }

  // roof — built in "ridge space" (ridge along local X, the building's LONG
  // axis) then rotated into place, so slopes and gables always face correctly
  const style = o.roofStyle ?? "gable";
  const overhang = 0.45;
  const roofH = Math.min(o.w, o.d) * 0.28 + 0.5;
  if (style === "flat") {
    const parapet = mat(PALETTE.plasterWarm);
    g.add(box(o.w + 0.2, 0.35, 0.25, parapet, 0, o.h + 0.17, -o.d / 2));
    g.add(box(o.w + 0.2, 0.35, 0.25, parapet, 0, o.h + 0.17, o.d / 2));
    g.add(box(0.25, 0.35, o.d + 0.2, parapet, -o.w / 2, o.h + 0.17, 0));
    g.add(box(0.25, 0.35, o.d + 0.2, parapet, o.w / 2, o.h + 0.17, 0));
  } else {
    const along = Math.max(o.w, o.d);   // ridge axis extent
    const across = Math.min(o.w, o.d);  // slope run extent
    const swap = o.d > o.w;             // deep building: ridge runs along Z
    const roofG = new THREE.Group();
    roofG.rotation.y = swap ? Math.PI / 2 : 0;
    g.add(roofG);
    const y0 = o.h, y1 = o.h + roofH;
    const ea = along / 2 + overhang;   // eave half-length along the ridge
    const ec = across / 2 + overhang;  // eave half-width across the slopes
    // gable: full-length ridge; hip: ridge shrinks so end slopes pitch inward
    const ridgeHalf = style === "hip" ? Math.max(0.5, along / 2 - across / 2) : ea;
    const roofTints = [0xffffff, 0xe8d0bc, 0xd9bfa8];
    const roofMat = mat(roofTints[Math.floor(rng() * roofTints.length)], { map: "roof", repeat: [along / 3, 2] }).clone();
    roofMat.side = THREE.DoubleSide; // visible from beneath the eaves too

    const verts: number[] = [];
    const uvs: number[] = [];
    const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
      verts.push(...a, ...b, ...c);
      uvs.push(...ua, ...ub, ...uc);
    };
    // long slopes (+z and -z faces in ridge space)
    tri([-ea, y0, ec], [ea, y0, ec], [ridgeHalf, y1, 0], [0, 0], [1, 0], [1, 1]);
    tri([-ea, y0, ec], [ridgeHalf, y1, 0], [-ridgeHalf, y1, 0], [0, 0], [1, 1], [0, 1]);
    tri([ea, y0, -ec], [-ea, y0, -ec], [-ridgeHalf, y1, 0], [0, 0], [1, 0], [1, 1]);
    tri([ea, y0, -ec], [-ridgeHalf, y1, 0], [ridgeHalf, y1, 0], [0, 0], [1, 1], [0, 1]);
    if (style === "hip") {
      // hip ends: triangular slopes closing the roof at ±x
      tri([ea, y0, ec], [ea, y0, -ec], [ridgeHalf, y1, 0], [0, 0], [1, 0], [0.5, 1]);
      tri([-ea, y0, -ec], [-ea, y0, ec], [-ridgeHalf, y1, 0], [0, 0], [1, 0], [0.5, 1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.computeVertexNormals();
    const roof = new THREE.Mesh(geo, roofMat);
    roof.castShadow = true;
    roofG.add(roof);
    if (style === "gable") {
      // gable end walls sit at the true wall plane (inside the eave overhang)
      const gableGeo = new THREE.BufferGeometry();
      const gw = along / 2, gd = across / 2;
      const gv = new Float32Array([
        -gw, y0, gd, -gw, y0, -gd, -gw, y1 - 0.02, 0,
        gw, y0, -gd, gw, y0, gd, gw, y1 - 0.02, 0,
      ]);
      gableGeo.setAttribute("position", new THREE.BufferAttribute(gv, 3));
      gableGeo.computeVertexNormals();
      roofG.add(new THREE.Mesh(gableGeo, wallMat));
    }
    // ridge cap tiles
    const cap = box(ridgeHalf * 2 + 0.3, 0.14, 0.3, mat(PALETTE.terracottaDark), 0, y1 + 0.04, 0);
    roofG.add(cap);
  }

  // door (front = +z): door + lintel + stone steps + wall lantern
  if (o.door !== false) {
    const door = box(1.1, 2.2, 0.12, mat(PALETTE.woodDark, { map: "wood", repeat: [1, 2] }), 0, 1.1, o.d / 2 + 0.03);
    g.add(door);
    const lintel = box(1.5, 0.22, 0.2, mat(PALETTE.stone), 0, 2.35, o.d / 2 + 0.04);
    g.add(lintel);
    const stepM = mat(0xffffff, { map: "stone", repeat: [1.4, 0.2] });
    g.add(box(1.6, 0.14, 0.55, stepM, 0, 0.07, o.d / 2 + 0.3));
    if (rng() < 0.6) g.add(box(1.3, 0.13, 0.35, stepM, 0, 0.2, o.d / 2 + 0.2));
    // lantern bracket beside the door
    const lantern = new THREE.Group();
    lantern.add(box(0.06, 0.06, 0.24, mat(0x2a2723, { flat: true }), 0, 0, 0.1));
    const lamp = box(0.14, 0.2, 0.14, mat(0xffe2a0, { emissive: 0xcf9d4a, emissiveIntensity: 0.9 }), 0, -0.12, 0.22);
    lantern.add(lamp);
    lantern.position.set(0.95, 2.15, o.d / 2);
    g.add(lantern);
  }

  // chimney: straddles the ridge, offset along the LONG axis (clamped so it
  // never slides onto a hip end slope). Flat roofs get a vent box instead.
  if (style !== "flat") {
    const along = Math.max(o.w, o.d);
    const across = Math.min(o.w, o.d);
    const swap = o.d > o.w;
    const ridgeHalf = style === "hip" ? Math.max(0.5, along / 2 - across / 2) : along / 2;
    const off = Math.min(along * 0.28, ridgeHalf * 0.6);
    const cxr = swap ? 0 : off;
    const czr = swap ? off : 0;
    const chimY = o.h + roofH - 0.12; // pokes through the ridge line
    g.add(box(0.45, 0.9, 0.45, mat(PALETTE.plasterWarm, { map: "plaster" }), cxr, chimY + 0.3, czr));
    g.add(box(0.55, 0.12, 0.55, mat(PALETTE.terracottaDark), cxr, chimY + 0.78, czr));
  } else {
    g.add(box(0.4, 0.5, 0.4, mat(PALETTE.plasterWarm), o.w * 0.3, o.h + 0.25, o.d * 0.2));
  }

  // windows on each face with shutters
  const winMat = mat(0x1c2a30, { emissive: 0x0a1214, emissiveIntensity: 0.4 });
  const shutterMat = mat(rng() < 0.5 ? 0x38635f : 0x7a5230);
  const addWindows = (faceW: number, isX: boolean, sign: number) => {
    const count = Math.max(1, Math.floor(faceW / 3.6));
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * (faceW / count);
      if (!isX && o.door !== false && sign > 0 && Math.abs(off) < 1.4) continue; // skip door slot
      const wy = o.h * 0.62;
      const wgroup = new THREE.Group();
      wgroup.add(box(1.0, 1.3, 0.1, winMat, 0, 0, 0));
      // shutters: closed / half / open per window
      const state = rng();
      if (state < 0.25) {
        wgroup.add(box(0.5, 1.3, 0.06, shutterMat, -0.26, 0, 0.05));
        wgroup.add(box(0.5, 1.3, 0.06, shutterMat, 0.26, 0, 0.05));
      } else if (state < 0.5) {
        wgroup.add(box(0.5, 1.3, 0.06, shutterMat, -0.26, 0, 0.05));
        const openR = box(0.34, 1.3, 0.06, shutterMat, 0.75, 0, 0.1);
        openR.rotation.y = 0.35;
        wgroup.add(openR);
      } else {
        const openL = box(0.34, 1.3, 0.06, shutterMat, -0.75, 0, 0.1);
        openL.rotation.y = -0.3;
        wgroup.add(openL);
        const openR = box(0.34, 1.3, 0.06, shutterMat, 0.75, 0, 0.1);
        openR.rotation.y = 0.3;
        wgroup.add(openR);
      }
      wgroup.add(box(1.5, 0.14, 0.14, mat(PALETTE.stone), 0, -0.75, 0.02));
      // window flower box
      if (rng() < 0.4) {
        wgroup.add(box(0.9, 0.16, 0.2, mat(0x8a5230, { map: "wood" }), 0, -0.72, 0.16));
        const flowerCols = [0xc2554a, 0xd97a8e, 0xe8e0ce, 0xd9b23d];
        for (let f = 0; f < 4; f++) {
          const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), mat(flowerCols[Math.floor(rng() * 4)], { flat: true }));
          fl.position.set(-0.32 + f * 0.21, -0.58, 0.18);
          wgroup.add(fl);
        }
      } else if (rng() < 0.3) {
        // striped awning
        const awn = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85), (() => {
          const m = mat(0xc3562b, { rough: 0.85 });
          return m;
        })());
        awn.position.set(0, 0.85, 0.35);
        awn.rotation.x = -Math.PI / 2 + 0.5;
        awn.castShadow = true;
        wgroup.add(awn);
      }
      if (isX) {
        wgroup.position.set(sign * (o.w / 2 + 0.05), wy, off);
        wgroup.rotation.y = sign * Math.PI / 2;
      } else {
        wgroup.position.set(off, wy, sign * (o.d / 2 + 0.05));
        if (sign < 0) wgroup.rotation.y = Math.PI;
      }
      g.add(wgroup);
    }
  };
  if (o.h > 2.6) {
    addWindows(o.d, true, 1);
    addWindows(o.d, true, -1);
    addWindows(o.w, false, 1);
    addWindows(o.w, false, -1);
  }
  return g;
}

/** perimeter wall segment along local X, centered */
export function wallSegment(length: number, height: number, stone = false): THREE.Group {
  const g = new THREE.Group();
  const m = stone
    ? mat(0xffffff, { map: "stone", repeat: [length / 2.5, height / 2] })
    : mat(PALETTE.plasterWarm, { map: "plaster", repeat: [length / 4, height / 3] });
  g.add(box(length, height, 0.6, m, 0, height / 2, 0));
  // cap
  g.add(box(length, 0.18, 0.9, mat(PALETTE.terracottaDark), 0, height + 0.09, 0));
  return g;
}

export function archGate(width: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xffffff, { map: "stone", repeat: [1.5, height / 2] });
  // pillars 1.4 wide so they overlap the abutting wall ends instead of
  // meeting them edge-to-edge (tangent boxes read as a floating gate)
  g.add(box(1.4, height, 1.2, m, -width / 2 - 0.5, height / 2, 0));
  g.add(box(1.4, height, 1.2, m, width / 2 + 0.5, height / 2, 0));
  g.add(box(width + 2.4, 0.9, 1.3, m, 0, height + 0.45, 0));
  g.add(box(width + 2.8, 0.2, 1.5, mat(PALETTE.terracottaDark), 0, height + 1.0, 0));
  return g;
}

// ---------------------------------------------------------------------------
// Recursive branching: the difference between "cones on a stick" and a tree.
// Each branch is a short chain of tapered, slightly curved segments; leaves
// (blob + wind-rustled cards) hang off the terminal twigs.
// ---------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);

function growBranch(
  g: THREE.Group, barkMat: THREE.Material, rng: () => number,
  from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number,
  depth: number, spread: number, upBias: number,
  leaf: (tip: THREE.Vector3) => void
) {
  let pos = from.clone();
  let d = dir.clone().normalize();
  const segs = 2 + (depth > 0 ? 1 : 0);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const segLen = len / segs;
    const ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, segLen * 1.06, 6), barkMat);
    const mid = pos.clone().addScaledVector(d, segLen / 2);
    seg.position.copy(mid);
    seg.quaternion.setFromUnitVectors(UP, d);
    seg.castShadow = true;
    g.add(seg);
    pos.addScaledVector(d, segLen);
    // wander + upward pull
    d.add(new THREE.Vector3((rng() - 0.5) * 0.5, upBias, (rng() - 0.5) * 0.5)).normalize();
  }
  if (depth <= 0) { leaf(pos); return; }
  const kids = 2 + Math.floor(rng() * 2);
  for (let k = 0; k < kids; k++) {
    const a = rng() * Math.PI * 2;
    const kd = d.clone()
      .addScaledVector(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), spread * (0.6 + rng() * 0.7))
      .normalize();
    growBranch(g, barkMat, rng, pos, kd, len * (0.55 + rng() * 0.2), r1, r1 * 0.5, depth - 1, spread, upBias, leaf);
  }
  if (rng() < 0.5) leaf(pos); // some foliage at forks too
}

function leafCluster(g: THREE.Group, rng: () => number, tones: THREE.Material[], cardTint: number, size: number) {
  return (tip: THREE.Vector3) => {
    // subdivided lobes (not icosa-0 crystals): one main mass + 1-2 satellites
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.8 + rng() * 0.4), 1), tones[Math.floor(rng() * tones.length)]);
    blob.position.copy(tip);
    blob.scale.set(1 + (rng() - 0.5) * 0.3, 0.72, 1 + (rng() - 0.5) * 0.3);
    blob.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    blob.castShadow = true;
    g.add(blob);
    const sats = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < sats; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.45 + rng() * 0.25), 1), tones[Math.floor(rng() * tones.length)]);
      s.position.copy(tip).add(new THREE.Vector3((rng() - 0.5) * size * 1.3, (rng() - 0.3) * size * 0.7, (rng() - 0.5) * size * 1.3));
      s.scale.y = 0.75;
      s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      s.castShadow = true;
      g.add(s);
    }
    const cardM = leafMat(cardTint);
    for (let i = 0; i < 2; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.9, size * 1.5), cardM);
      card.position.copy(tip).add(new THREE.Vector3((rng() - 0.5) * size, (rng() - 0.4) * size * 0.8, (rng() - 0.5) * size));
      card.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      g.add(card);
    }
  };
}

export function cypress(h = 6, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const tones = [mat(0x3a5540, { flat: true }), mat(0x46614a, { flat: true }), mat(0x527051, { flat: true })];
  const trunk = box(0.2, 0.8, 0.2, mat(PALETTE.woodDark), 0, 0.4, 0);
  g.add(trunk);
  // smooth flame: overlapping stretched ellipsoids, widest low, tapering tip
  const lean = (rng() - 0.5) * 0.12;
  const lobes = 4;
  for (let i = 0; i < lobes; i++) {
    const t = i / (lobes - 1);
    const r = (0.62 - t * 0.4) * (0.9 + rng() * 0.25) * (h / 6);
    const segH = (h * 0.42) * (1 - t * 0.35);
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), tones[i % tones.length]);
    const y = 0.85 + t * (h - 1.5);
    lobe.scale.set(1, segH / r, 1);
    lobe.position.set(lean * y + (rng() - 0.5) * 0.06, y + segH * 0.35, (rng() - 0.5) * 0.06);
    lobe.rotation.y = rng() * Math.PI;
    lobe.castShadow = true;
    g.add(lobe);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14 * (h / 6), h * 0.22, 6), tones[2]);
  tip.position.set(lean * h, h - 0.2, 0);
  tip.castShadow = true;
  g.add(tip);
  // soft fringe: tall leaf cards crossed through the column
  const fringe = leafMat(0x44603f);
  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.15 * (h / 6), h * 0.78), fringe);
    card.position.y = h * 0.5;
    card.rotation.y = (i / 3) * Math.PI + rng() * 0.3;
    g.add(card);
  }
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

export function oliveTree(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const bark = mat(0x6b5744, { flat: true });
  const tones = [mat(0x8a9464, { flat: true }), mat(0xa3b07c, { flat: true }), mat(0x96a570, { flat: true })];
  const leaf = leafCluster(g, rng, tones, 0x9aa877, 0.55 + rng() * 0.2);
  // gnarled trunk splitting into 3-4 primaries, each branching twice
  const trunkTop = new THREE.Vector3((rng() - 0.5) * 0.3, 1.0 + rng() * 0.4, (rng() - 0.5) * 0.3);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, trunkTop.y * 1.05, 7), bark);
  t.position.set(trunkTop.x / 2, trunkTop.y / 2, trunkTop.z / 2);
  t.quaternion.setFromUnitVectors(UP, trunkTop.clone().normalize());
  t.castShadow = true;
  g.add(t);
  const prims = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < prims; i++) {
    const a = (i / prims) * Math.PI * 2 + rng() * 0.8;
    const dir = new THREE.Vector3(Math.cos(a) * 0.8, 0.9 + rng() * 0.5, Math.sin(a) * 0.8).normalize();
    growBranch(g, bark, rng, trunkTop, dir, 0.9 + rng() * 0.5, 0.11, 0.05, 1, 0.9, 0.12, leaf);
  }
  return g;
}

export function palmTree(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const h = 4.5 + rng() * 2;
  const bark = mat(0x9c8563, { flat: true });
  // curved trunk from stacked, progressively offset segments
  const segs = 5;
  const bend = (rng() - 0.5) * 1.4;
  let topX = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const sh = h / segs;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13 + (1 - t) * 0.08, 0.15 + (1 - t) * 0.09, sh * 1.15, 6), bark);
    topX = bend * t * t;
    seg.position.set(topX, sh * (i + 0.5), 0);
    seg.rotation.z = -bend * t * 0.35;
    seg.castShadow = true;
    g.add(seg);
  }
  // drooping two-part fronds
  const frondA = mat(0x5f7d43, { flat: true });
  const frondB = mat(0x6f8f4d, { flat: true });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3;
    const droop = 0.35 + rng() * 0.4;
    const mtl = i % 2 ? frondA : frondB;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.42), mtl);
    base.position.set(topX + Math.cos(a) * 0.75, h + 0.05 - droop * 0.2, Math.sin(a) * 0.75);
    base.rotation.y = -a;
    base.rotation.z = droop * 0.6;
    base.castShadow = true;
    g.add(base);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.3), mtl);
    tip.position.set(topX + Math.cos(a) * 2.0, h - 0.25 - droop * 0.55, Math.sin(a) * 2.0);
    tip.rotation.y = -a;
    tip.rotation.z = droop * 1.4;
    tip.castShadow = true;
    g.add(tip);
  }
  // coconuts
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0x5d4a33, { flat: true }));
    const a = rng() * Math.PI * 2;
    c.position.set(topX + Math.cos(a) * 0.28, h - 0.18, Math.sin(a) * 0.28);
    g.add(c);
  }
  return g;
}

/** Mediterranean umbrella pine: tall bare trunk, wide flat canopy */
/** Mediterranean umbrella pine: tall bare trunk, branching flat crown */
export function pineTree(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const h = 5 + rng() * 2.5;
  const bark = mat(0x7a5f47, { flat: true });
  const tones = [mat(0x4c6a44, { flat: true }), mat(0x5a7a4e, { flat: true })];
  const flatLeaf = (tip: THREE.Vector3) => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 + rng() * 0.5, 1), tones[Math.floor(rng() * 2)]);
    blob.scale.set(1 + (rng() - 0.5) * 0.3, 0.36, 1 + (rng() - 0.5) * 0.3);
    blob.rotation.y = rng() * Math.PI;
    blob.position.copy(tip);
    blob.castShadow = true;
    g.add(blob);
    const under = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rng() * 0.3, 1), tones[0]);
    under.scale.set(1, 0.32, 1);
    under.position.copy(tip).add(new THREE.Vector3((rng() - 0.5) * 0.7, -0.12, (rng() - 0.5) * 0.7));
    under.castShadow = true;
    g.add(under);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), leafMat(0x6a8352));
    card.position.copy(tip).setY(tip.y + 0.15);
    card.rotation.set(-Math.PI / 2 + (rng() - 0.5) * 0.5, rng() * Math.PI, 0);
    g.add(card);
  };
  // trunk: two slightly kinked segments
  const kink = new THREE.Vector3((rng() - 0.5) * 0.5, h * 0.55, (rng() - 0.5) * 0.5);
  const top = new THREE.Vector3(kink.x + (rng() - 0.5) * 0.7, h, kink.z + (rng() - 0.5) * 0.7);
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.27, kink.length() * 1.03, 7), bark);
  t1.position.copy(kink.clone().multiplyScalar(0.5));
  t1.quaternion.setFromUnitVectors(UP, kink.clone().normalize());
  t1.castShadow = true;
  g.add(t1);
  const up2 = top.clone().sub(kink);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, up2.length() * 1.03, 7), bark);
  t2.position.copy(kink.clone().add(up2.clone().multiplyScalar(0.5)));
  t2.quaternion.setFromUnitVectors(UP, up2.clone().normalize());
  t2.castShadow = true;
  g.add(t2);
  // crown: 4-6 near-horizontal branches, each ending in flat foliage
  const prims = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < prims; i++) {
    const a = (i / prims) * Math.PI * 2 + rng() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0.28 + rng() * 0.25, Math.sin(a)).normalize();
    growBranch(g, bark, rng, top, dir, 1.1 + rng() * 0.6, 0.09, 0.04, 1, 0.7, -0.02, flatLeaf);
  }
  flatLeaf(top.clone().setY(top.y + 0.5));
  return g;
}

/** small citrus tree, heavy with fruit — villa gardens */
export function lemonTree(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const bark = mat(0x6f5a40, { flat: true });
  const tones = [mat(0x3e5c33, { flat: true }), mat(0x4c6e3d, { flat: true })];
  const fruit = mat(0xe8c93d, { emissive: 0x5c4d10, emissiveIntensity: 0.25, flat: true });
  const leaf = (tip: THREE.Vector3) => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rng() * 0.25, 0), tones[Math.floor(rng() * 2)]);
    blob.position.copy(tip);
    blob.castShadow = true;
    g.add(blob);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.75), leafMat(0x5f7d43));
    card.position.copy(tip);
    card.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    g.add(card);
    for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), fruit);
      const fa = rng() * Math.PI * 2;
      f.position.copy(tip).add(new THREE.Vector3(Math.cos(fa) * 0.45, -0.25 + rng() * 0.4, Math.sin(fa) * 0.45));
      g.add(f);
    }
  };
  const trunkTop = new THREE.Vector3(0, 0.7 + rng() * 0.2, 0);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, trunkTop.y, 6), bark);
  t.position.y = trunkTop.y / 2;
  t.castShadow = true;
  g.add(t);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng();
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7).normalize();
    growBranch(g, bark, rng, trunkTop, dir, 0.55 + rng() * 0.25, 0.055, 0.03, 0, 0.7, 0.1, leaf);
  }
  return g;
}

/** agave rosette: ring of thick curved spikes — sculptural roadside green */
export function agave(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const tones = [mat(0x6e8f7c, { flat: true }), mat(0x7fa08a, { flat: true })];
  const n = 11 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3;
    const tilt = 0.5 + rng() * 0.55; // outward lean
    const len = 0.7 + rng() * 0.5;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09 + rng() * 0.04, len, 4), tones[i % 2]);
    spike.scale.z = 0.45; // blade-flat
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    spike.position.copy(dir.clone().multiplyScalar(len * 0.4)).setY(dir.y * len * 0.42 + 0.05);
    spike.quaternion.setFromUnitVectors(UP, dir);
    spike.rotation.y += a;
    spike.castShadow = true;
    g.add(spike);
  }
  return g;
}

/** prickly pear cactus: branching flat pads with fruit */
export function pricklyPear(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const padM = mat(0x5e7d47, { flat: true });
  const fruitM = mat(0xb54a3c, { flat: true });
  const addPad = (base: THREE.Vector3, a: number, tilt: number, s: number, depth: number) => {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.32 * s, 8, 6), padM);
    pad.scale.set(1, 1.35, 0.28);
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const center = base.clone().addScaledVector(dir, 0.4 * s);
    pad.position.copy(center);
    pad.rotation.y = -a + Math.PI / 2;
    pad.rotation.z = (rng() - 0.5) * 0.3;
    pad.castShadow = true;
    g.add(pad);
    if (rng() < 0.5) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), fruitM);
      f.position.copy(center).add(new THREE.Vector3(0, 0.42 * s, 0));
      g.add(f);
    }
    if (depth > 0) {
      const kids = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < kids; k++) {
        addPad(center.clone().add(new THREE.Vector3(0, 0.3 * s, 0)), a + (rng() - 0.5) * 1.6, 0.5 + rng() * 0.5, s * 0.8, depth - 1);
      }
    }
  };
  const stems = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < stems; i++) {
    addPad(new THREE.Vector3((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3), rng() * Math.PI * 2, 0.25 + rng() * 0.3, 1, 2);
  }
  return g;
}

/** oleander: arcing bush with flower clusters */
export function oleander(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const leafM = mat(0x4c6a44, { flat: true });
  const flowerM = mat(rng() < 0.5 ? 0xd97a8e : 0xe8e0ce, { flat: true });
  const stems = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < stems; i++) {
    const a = rng() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize();
    const len = 0.9 + rng() * 0.5;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, len, 5), mat(0x5d6b4a, { flat: true }));
    const mid = dir.clone().multiplyScalar(len / 2);
    stem.position.copy(mid);
    stem.quaternion.setFromUnitVectors(UP, dir);
    g.add(stem);
    const tip = dir.clone().multiplyScalar(len);
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + rng() * 0.15, 0), leafM);
    foliage.position.copy(tip);
    foliage.castShadow = true;
    g.add(foliage);
    if (rng() < 0.75) {
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + rng() * 0.06, 0), flowerM);
      fl.position.copy(tip).add(new THREE.Vector3((rng() - 0.5) * 0.3, 0.22, (rng() - 0.5) * 0.3));
      g.add(fl);
    }
  }
  return g;
}

/**
 * Hiding spot: a clump of tall grass, ~2m radius. Crossed alpha-tested quads
 * with a painted blade texture, wind-swayed in the vertex shader — merged
 * into two meshes (one per tint).
 */
export function grassPatch(radius = 2, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const tints = [0xb5bb7e, 0x84a05e];
  const buckets: THREE.BufferGeometry[][] = [[], []];
  const tmp = new THREE.Object3D();
  const clumps = Math.floor(radius * radius * 5.2);
  for (let i = 0; i < clumps; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const edge = r / radius; // shorter, paler toward the rim
    const h = (0.8 + rng() * 0.55) * (1 - edge * 0.35);
    const w = 0.55 + rng() * 0.45;
    const bucket = rng() < 0.55 ? 0 : 1;
    const yaw = rng() * Math.PI;
    // three crossed quads per clump — full from every view angle
    for (const cross of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
      const quad = new THREE.PlaneGeometry(w, h, 1, 2);
      quad.translate(0, h / 2 - 0.02, 0);
      tmp.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      tmp.rotation.set((rng() - 0.5) * 0.14, yaw + cross, (rng() - 0.5) * 0.14);
      tmp.updateMatrix();
      quad.applyMatrix4(tmp.matrix);
      buckets[bucket].push(quad);
    }
  }
  for (let b = 0; b < 2; b++) {
    if (!buckets[b].length) continue;
    const merged = mergeGeometries(buckets[b]);
    for (const p of buckets[b]) p.dispose();
    const mesh = new THREE.Mesh(merged, grassMat(tints[b]));
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  // scattered wildflowers
  const flowerColors = [0xe8e0ce, 0xd46a52, 0xd9b23d];
  for (let i = 0; i < Math.floor(radius * 3); i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius * 0.9;
    const f = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.05, 0),
      mat(flowerColors[Math.floor(rng() * flowerColors.length)], { flat: true })
    );
    f.position.set(Math.cos(a) * r, 0.5 + rng() * 0.3, Math.sin(a) * r);
    g.add(f);
  }
  return g;
}

export function crate(size = 1.2, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const m = mat(0xffffff, { map: "wood" });
  const c = box(size, size, size, m, 0, size / 2, 0);
  c.rotation.y = (rng() - 0.5) * 0.4;
  g.add(c);
  return g;
}

export function crateStack(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const s1 = crate(1.3, seed); g.add(s1);
  const s2 = crate(1.1, seed + 1); s2.position.set(1.15, 0, 0.3); g.add(s2);
  if (rng() < 0.7) { const s3 = crate(1.0, seed + 2); s3.position.set(0.5, 1.3, 0.1); g.add(s3); }
  return g;
}

export function barrel(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const color = rng() < 0.5 ? 0x6a7047 : 0x8a4432;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), mat(color));
  b.position.y = 0.55;
  b.castShadow = true; b.receiveShadow = true;
  g.add(b);
  const ring = mat(PALETTE.metalDark);
  for (const y of [0.2, 0.9]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 10), ring);
    r.position.y = y;
    g.add(r);
  }
  return g;
}

export function sandbags(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xb0a175, { flat: true });
  let i = 0;
  for (let row = 0; row < 3; row++) {
    const count = 4 - row;
    for (let c = 0; c < count; c++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 2, 6), m);
      bag.rotation.z = Math.PI / 2;
      bag.rotation.y = (i * 0.7) % 0.3 - 0.15;
      bag.position.set((c - (count - 1) / 2) * 0.62, 0.22 + row * 0.4, 0);
      bag.castShadow = true;
      g.add(bag);
      i++;
    }
  }
  return g;
}

export function watchtower(h = 6): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xffffff, { map: "wood", repeat: [1, 3] });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.28, h, 0.28, wood, sx * 1.1, h / 2, sz * 1.1);
    leg.rotation.y = 0.0;
    g.add(leg);
  }
  // cross braces
  g.add(box(2.5, 0.16, 0.16, wood, 0, h * 0.4, -1.1));
  g.add(box(2.5, 0.16, 0.16, wood, 0, h * 0.4, 1.1));
  // platform
  g.add(box(3.2, 0.22, 3.2, wood, 0, h, 0));
  // railing
  for (const [x, z, w, d] of [[0, -1.5, 3.2, 0.1], [0, 1.5, 3.2, 0.1], [-1.5, 0, 0.1, 3.2], [1.5, 0, 0.1, 3.2]]) {
    g.add(box(w, 0.9, d, wood, x, h + 0.55, z));
  }
  // roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.4, 4), mat(PALETTE.terracotta, { flat: true }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 2.6;
  roof.castShadow = true;
  g.add(roof);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.14, 1.9, 0.14, wood, sx * 1.3, h + 1.05, sz * 1.3));
  }
  return g;
}

let glowTex: THREE.Texture | null = null;
function lampGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 226, 160, 0.9)");
  g.addColorStop(0.4, "rgba(255, 210, 130, 0.28)");
  g.addColorStop(1, "rgba(255, 200, 110, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function lampPost(lit: boolean): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.6, 6), mat(PALETTE.metalDark));
  pole.position.y = 1.8;
  pole.castShadow = true;
  g.add(pole);
  const head = box(0.5, 0.3, 0.5, mat(PALETTE.metalDark), 0, 3.7, 0);
  g.add(head);
  const bulb = box(0.34, 0.16, 0.34, mat(lit ? 0xffe6a8 : 0x555248, lit ? { emissive: 0xffdd88, emissiveIntensity: 1.4 } : {}), 0, 3.56, 0);
  g.add(bulb);
  if (lit) {
    const light = new THREE.PointLight(0xffd489, 14, 13, 1.8);
    light.position.set(0, 3.4, 0);
    g.add(light);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: lampGlowTexture(), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(2.4, 2.4, 1);
    glow.position.set(0, 3.55, 0);
    g.add(glow);
  }
  return g;
}

/** crypt floor brazier: stone bowl, glowing coals, optional real light */
export function brazier(withLight = true): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xffffff, { map: "stone", repeat: [1, 0.5] });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 7), stone);
  base.position.y = 0.375;
  base.castShadow = true;
  g.add(base);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.3, 8), stone);
  bowl.position.y = 0.95;
  g.add(bowl);
  const coals = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8),
    mat(0xff9448, { emissive: 0xff6a22, emissiveIntensity: 1.6, flat: true }),
  );
  coals.position.y = 1.08;
  g.add(coals);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.5, 6),
    mat(0xffc46a, { emissive: 0xffaa33, emissiveIntensity: 2.4, flat: true }),
  );
  flame.position.y = 1.34;
  g.add(flame);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: lampGlowTexture(), color: 0xff9a4a, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(1.9, 1.9, 1);
  glow.position.y = 1.3;
  g.add(glow);
  if (withLight) {
    const light = new THREE.PointLight(0xff9a4a, 11, 11, 1.7);
    light.position.set(0, 1.6, 0);
    g.add(light);
  }
  return g;
}

export function radioMast(h = 10): THREE.Group {
  const g = new THREE.Group();
  const m = mat(PALETTE.metalDark);
  const legs = 3;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2;
    const leg = box(0.12, h, 0.12, m, Math.cos(a) * 0.6, h / 2, Math.sin(a) * 0.6);
    leg.rotation.y = -a;
    g.add(leg);
  }
  for (let y = 1.4; y < h; y += 1.6) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 4, 8), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(0xd8d2c4, { flat: true }));
  dish.rotation.x = Math.PI / 1.5;
  dish.position.set(0.4, h - 1.4, 0);
  dish.castShadow = true;
  g.add(dish);
  const beacon = box(0.2, 0.2, 0.2, mat(0xff4433, { emissive: 0xff2211, emissiveIntensity: 2 }), 0, h + 0.2, 0);
  g.add(beacon);
  return g;
}

export function fountain(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xffffff, { map: "stone", repeat: [4, 0.5] });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.7, 10), stone);
  basin.position.y = 0.35;
  basin.castShadow = true; basin.receiveShadow = true;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.1, 10), mat(PALETTE.sea, { emissive: 0x1a4a48, emissiveIntensity: 0.4 }));
  water.position.y = 0.62;
  g.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.4, 8), stone);
  column.position.y = 1.3;
  g.add(column);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.24, 10), stone);
  top.position.y = 2.05;
  g.add(top);
  return g;
}

export function statue(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xd6d0c2, { flat: true });
  const plinth = box(1.2, 1.0, 1.2, mat(0xffffff, { map: "stone" }), 0, 0.5, 0);
  g.add(plinth);
  const torso = box(0.55, 0.9, 0.35, m, 0, 1.9, 0);
  torso.rotation.y = 0.3;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), m);
  head.position.y = 2.55; head.castShadow = true;
  g.add(head);
  const armL = box(0.18, 0.7, 0.18, m, -0.42, 2.1, 0.1);
  armL.rotation.z = 0.9;
  g.add(armL);
  const armR = box(0.18, 0.75, 0.18, m, 0.4, 1.85, 0);
  armR.rotation.z = -0.25;
  g.add(armR);
  const legs = box(0.5, 0.55, 0.32, m, 0, 1.3, 0);
  g.add(legs);
  return g;
}

export function boat(): THREE.Group {
  const g = new THREE.Group();
  const hullM = mat(0x3a5a74, { flat: true });
  const hull = box(2.2, 0.9, 5.6, hullM, 0, 0.45, 0);
  g.add(hull);
  // bow taper
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), hullM);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1.42, 1, 0.64);
  bow.position.set(0, 0.45, -3.9);
  bow.castShadow = true;
  g.add(bow);
  const deck = box(2.0, 0.1, 5.2, mat(0xffffff, { map: "wood", repeat: [2, 4] }), 0, 0.92, 0);
  g.add(deck);
  const cabin = box(1.5, 1.1, 1.6, mat(0xe8e0ce), 0, 1.5, 1.2);
  g.add(cabin);
  const cabinWin = box(1.3, 0.4, 1.4, mat(0x22343c, { emissive: 0x1a2a30, emissiveIntensity: 0.5 }), 0, 1.72, 1.2);
  g.add(cabinWin);
  return g;
}

export function truck(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const bodyM = mat(0x55604a, { flat: true });
  g.add(box(2.2, 1.1, 2.0, bodyM, 0, 1.15, -2.2)); // cab
  const winM = mat(0x1a262c);
  g.add(box(2.0, 0.5, 0.1, winM, 0, 1.45, -1.25));
  g.add(box(2.3, 0.9, 4.4, bodyM, 0, 1.5, 0.8)); // bed with canvas
  const canvas = box(2.3, 0.9, 4.4, mat(0x8d8668, { flat: true }), 0, 2.2, 0.8);
  canvas.scale.set(0.98, 0.6, 0.98);
  g.add(canvas);
  g.add(box(2.4, 0.5, 6.6, mat(0x3d4436), 0, 0.72, 0)); // chassis
  const wheelM = mat(0x22241f);
  for (const z of [-2.2, 1.4, 2.6]) {
    for (const x of [-1.1, 1.1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10), wheelM);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.5, z);
      w.castShadow = true;
      g.add(w);
    }
  }
  return g;
}

export function alarmPanel(): THREE.Group {
  const g = new THREE.Group();
  const post = box(0.16, 1.4, 0.16, mat(PALETTE.metalDark), 0, 0.7, 0);
  g.add(post);
  const panel = box(0.55, 0.75, 0.2, mat(0x9a3226), 0, 1.55, 0);
  g.add(panel);
  const light = box(0.16, 0.16, 0.1, mat(0xffcc44, { emissive: 0xff9922, emissiveIntensity: 1.2 }), 0, 1.78, 0.12);
  g.add(light);
  const btn = box(0.2, 0.2, 0.08, mat(0xe0d8c8), 0, 1.5, 0.12);
  g.add(btn);
  return g;
}

/** generic objective props */
export function deskWithDocuments(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xffffff, { map: "wood" });
  g.add(box(1.8, 0.1, 0.9, wood, 0, 0.78, 0));
  for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) {
    g.add(box(0.1, 0.78, 0.1, wood, x, 0.39, z));
  }
  g.add(box(0.5, 0.04, 0.35, mat(0xf4eee0), -0.3, 0.85, 0.05));
  g.add(box(0.45, 0.1, 0.32, mat(0x8a3324), 0.35, 0.88, -0.1)); // red dossier
  const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 8), mat(0x2b5248, { emissive: 0x1a3a30, emissiveIntensity: 0.6 }));
  lamp.position.set(0.7, 1.0, 0.25);
  g.add(lamp);
  return g;
}

export function safeBox(): THREE.Group {
  const g = new THREE.Group();
  const body = box(1.0, 1.3, 0.9, mat(0x3c4248, { map: "metalPanel" }), 0, 0.65, 0);
  g.add(body);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), mat(0xc8c2b2));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, 0.75, 0.48);
  g.add(dial);
  const handle = box(0.26, 0.06, 0.1, mat(0xc8c2b2), 0.28, 0.6, 0.48);
  g.add(handle);
  return g;
}

export function radioConsole(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.6, 1.0, 0.7, mat(0x4a5147, { map: "metalPanel" }), 0, 0.5, 0));
  g.add(box(1.5, 0.5, 0.14, mat(0x2c3138), 0, 1.2, -0.2));
  for (let i = 0; i < 5; i++) {
    g.add(box(0.08, 0.08, 0.06, mat(i % 2 ? 0x66ff88 : 0xffaa44, { emissive: i % 2 ? 0x33cc55 : 0xcc7722, emissiveIntensity: 1.5 }), -0.5 + i * 0.25, 1.22, -0.12));
  }
  const antenna = box(0.04, 1.4, 0.04, mat(PALETTE.metalDark), 0.6, 1.9, -0.2);
  g.add(antenna);
  return g;
}

export function crateCache(): THREE.Group {
  const g = new THREE.Group();
  const c = crate(1.15, 42);
  g.add(c);
  const lid = box(1.2, 0.08, 1.2, mat(0xffffff, { map: "wood" }), 0.34, 1.19, 0.1);
  lid.rotation.z = 0.2;
  g.add(lid);
  const glow = box(0.8, 0.25, 0.8, mat(0xd9a441, { emissive: 0xb8860b, emissiveIntensity: 0.8 }), 0, 1.05, 0);
  g.add(glow);
  return g;
}

export function camera_prop(): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.4, 0.24, 0.24, mat(PALETTE.metalDark), 0, 0, 0);
  g.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 8), mat(0x18242c, { emissive: 0xcc3322, emissiveIntensity: 1.2 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.26;
  g.add(lens);
  return g;
}

export function pergola(w = 4, d = 3): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xffffff, { map: "wood" });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.18, 2.4, 0.18, wood, (sx * w) / 2, 1.2, (sz * d) / 2));
  }
  for (let i = 0; i <= Math.floor(w / 0.7); i++) {
    g.add(box(0.1, 0.14, d + 0.6, wood, -w / 2 + i * 0.7, 2.48, 0));
  }
  g.add(box(w + 0.4, 0.14, 0.16, wood, 0, 2.4, -d / 2));
  g.add(box(w + 0.4, 0.14, 0.16, wood, 0, 2.4, d / 2));
  // vines
  const vine = mat(0x6a7a4a, { flat: true });
  const rng = seededRandom(7);
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rng() * 0.2, 0), vine);
    b.position.set((rng() - 0.5) * w, 2.55 + rng() * 0.15, (rng() - 0.5) * d);
    g.add(b);
  }
  return g;
}

export function bush(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const m = mat(0x5f7048, { flat: true });
  for (let i = 0; i < 3; i++) {
    const s = 0.4 + rng() * 0.4;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), m);
    b.position.set((rng() - 0.5) * 0.8, s * 0.8, (rng() - 0.5) * 0.8);
    b.castShadow = true;
    g.add(b);
  }
  leafHalo(g, rng, new THREE.Vector3(0, 0.7, 0), 0.75, 6, 0x7c8f5c, 0.8);
  return g;
}

export function rocks(seed = 1, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const m = mat(PALETTE.stone, { flat: true });
  for (let i = 0; i < 3; i++) {
    const s = (0.4 + rng() * 0.8) * scale;
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), m);
    r.position.set((rng() - 0.5) * 2 * scale, s * 0.5, (rng() - 0.5) * 2 * scale);
    r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    r.castShadow = true; r.receiveShadow = true;
    g.add(r);
  }
  return g;
}

export function dock(length = 10, width = 3): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xffffff, { map: "wood", repeat: [width / 1.5, length / 1.5] });
  const deckMesh = box(width, 0.24, length, wood, 0, 0.55, 0);
  g.add(deckMesh);
  const post = mat(PALETTE.woodDark);
  for (let z = -length / 2 + 0.5; z <= length / 2; z += 2.4) {
    for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) {
      g.add(box(0.22, 1.6, 0.22, post, x, 0, z));
    }
  }
  return g;
}

/** clipped hedge wall along local X, blocks movement and sight */
export function hedge(length: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x4a5f3a, { flat: true });
  const rng = seededRandom(Math.floor(length * 7));
  const body = box(length, 1.9, 0.9, m, 0, 0.95, 0);
  g.add(body);
  // lumpy top
  for (let x = -length / 2 + 0.5; x < length / 2; x += 0.8) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + rng() * 0.18, 0), m);
    b.position.set(x + (rng() - 0.5) * 0.3, 1.9 + rng() * 0.12, (rng() - 0.5) * 0.5);
    g.add(b);
  }
  return g;
}

/** a row of grapevines along local X — low cover you can crouch behind */
export function vineyardRow(length = 10): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(Math.floor(length * 13));
  const post = mat(PALETTE.woodDark);
  const vine = mat(0x5d7042, { flat: true });
  for (let x = -length / 2; x <= length / 2; x += 2.4) {
    g.add(box(0.1, 1.35, 0.1, post, x, 0.67, 0));
  }
  g.add(box(length, 0.05, 0.05, post, 0, 1.28, 0));
  g.add(box(length, 0.05, 0.05, post, 0, 0.85, 0));
  for (let x = -length / 2 + 0.5; x < length / 2; x += 0.7) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rng() * 0.16, 0), vine);
    b.position.set(x, 0.9 + rng() * 0.4, (rng() - 0.5) * 0.2);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

/** laundry line strung between two posts, cloth flapping (animated via name tag) */
export function laundryLine(length = 6): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(Math.floor(length * 31));
  const post = mat(PALETTE.woodDark);
  g.add(box(0.12, 2.3, 0.12, post, -length / 2, 1.15, 0));
  g.add(box(0.12, 2.3, 0.12, post, length / 2, 1.15, 0));
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-length / 2, 2.2, 0), new THREE.Vector3(0, 2.05, 0), new THREE.Vector3(length / 2, 2.2, 0),
  ]);
  g.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x555048 })));
  const colors = [0xe8e0ce, 0xc86a52, 0x7ba3b5, 0xe0c56a, 0xd8d8d8];
  let x = -length / 2 + 0.8;
  while (x < length / 2 - 0.6) {
    const w = 0.5 + rng() * 0.4;
    const cloth = box(w, 0.7 + rng() * 0.35, 0.04, mat(colors[Math.floor(rng() * colors.length)], { flat: true }), x + w / 2, 1.75, 0);
    cloth.name = "cloth";
    g.add(cloth);
    x += w + 0.25 + rng() * 0.3;
  }
  return g;
}

/** dockside cargo crane */
export function crane(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x8a5a30, { map: "metalPanel" });
  const dark = mat(PALETTE.metalDark);
  g.add(box(1.4, 1.2, 1.4, dark, 0, 0.6, 0));
  const mast = box(0.6, 7.5, 0.6, m, 0, 4.4, 0);
  g.add(mast);
  const jib = box(0.45, 0.45, 7.5, m, 0, 7.6, 3.2);
  jib.rotation.x = -0.18;
  g.add(jib);
  const counter = box(0.5, 0.5, 2.2, dark, 0, 7.7, -1.6);
  counter.rotation.x = 0.12;
  g.add(counter);
  // cable + hook + crate
  const cableGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 8.1, 6.4), new THREE.Vector3(0, 3.4, 6.4),
  ]);
  g.add(new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: 0x333333 })));
  const hooked = box(1.2, 1.2, 1.2, mat(0xffffff, { map: "wood" }), 0, 2.8, 6.4);
  hooked.rotation.y = 0.4;
  g.add(hooked);
  return g;
}

/** cloister colonnade: a row of arches along local X (walk-through between pillars) */
export function colonnade(length = 12): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xffffff, { map: "stone", repeat: [0.6, 1.6] });
  const n = Math.max(2, Math.round(length / 3));
  const spacing = length / n;
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + i * spacing;
    g.add(box(0.55, 3.2, 0.55, stone, x, 1.6, 0));
  }
  g.add(box(length + 0.8, 0.5, 0.9, stone, 0, 3.45, 0));
  const roofM = mat(0xffffff, { map: "roof", repeat: [length / 3, 1] });
  const roof = box(length + 1.2, 0.16, 2.4, roofM, 0, 3.85, -0.5);
  roof.rotation.x = 0.28;
  g.add(roof);
  return g;
}

/** hanging syndicate banner on a pole */
export function banner(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6), mat(PALETTE.metalDark));
  pole.position.y = 2.3;
  pole.castShadow = true;
  g.add(pole);
  g.add(box(1.5, 0.1, 0.1, mat(PALETTE.metalDark), 0.65, 4.4, 0));
  const cloth = box(1.2, 2.2, 0.05, mat(0x7a2222, { flat: true }), 0.75, 3.2, 0);
  cloth.name = "cloth";
  g.add(cloth);
  // serpent emblem: gold circle
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), mat(PALETTE.gold, { emissive: 0x664d1a, emissiveIntensity: 0.3 }));
  emblem.position.set(0.75, 3.3, 0.06);
  g.add(emblem);
  const emblem2 = emblem.clone();
  emblem2.position.z = -0.06;
  emblem2.rotation.y = Math.PI;
  g.add(emblem2);
  return g;
}

/** small glowing supply pickups */
export function pickup(kind: "ammo" | "stones"): THREE.Group {
  const g = new THREE.Group();
  if (kind === "ammo") {
    const boxM = mat(0x4a4f3d, { flat: true });
    const b = box(0.5, 0.3, 0.35, boxM, 0, 0.4, 0);
    b.name = "float";
    g.add(b);
    const tip = box(0.36, 0.08, 0.2, mat(PALETTE.gold, { emissive: 0xb8860b, emissiveIntensity: 1.2 }), 0, 0.58, 0);
    tip.name = "float2";
    g.add(tip);
  } else {
    const rng = seededRandom(5);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + rng() * 0.05, 0), mat(0x9a938a, { emissive: 0x2e2b26, emissiveIntensity: 0.8, flat: true }));
      s.position.set((rng() - 0.5) * 0.4, 0.34 + (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.4);
      s.name = i === 0 ? "float" : "";
      s.castShadow = true;
      g.add(s);
    }
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 18),
    new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  return g;
}

/** cluster of 1-3 terracotta amphorae / clay pots */
export function amphora(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const clay = mat(0xb2673c, { flat: true });
  const clayDark = mat(0x96522e, { flat: true });
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.55 + rng() * 0.45;
    const pot = new THREE.Group();
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 8, 6), rng() < 0.5 ? clay : clayDark);
    belly.scale.y = 1.25;
    belly.position.y = 0.34 * s;
    belly.castShadow = true;
    pot.add(belly);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.18 * s, 8), clay);
    neck.position.y = 0.72 * s;
    pot.add(neck);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12 * s, 0.035 * s, 5, 10), clayDark);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.82 * s;
    pot.add(rim);
    pot.position.set((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8);
    if (rng() < 0.2) { pot.rotation.z = 1.45; pot.position.y = 0.22 * s; } // one tipped over
    g.add(pot);
  }
  return g;
}

/** simple stone bench */
export function bench(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xffffff, { map: "stone", repeat: [1.4, 0.3] });
  g.add(box(1.5, 0.12, 0.45, stone, 0, 0.5, 0));
  g.add(box(0.16, 0.46, 0.4, stone, -0.58, 0.23, 0));
  g.add(box(0.16, 0.46, 0.4, stone, 0.58, 0.23, 0));
  return g;
}

/** wooden hand cart, resting on its legs */
export function cart(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const wood = mat(0xffffff, { map: "wood" });
  const bed = box(1.1, 0.1, 1.7, wood, 0, 0.62, 0);
  bed.rotation.x = -0.12;
  g.add(bed);
  for (const s of [-1, 1]) {
    g.add(box(0.55, 0.3, 0.06, wood, s * 0.55, 0.82, -0.1));
  }
  const wheelM = mat(0x6a4e34, { flat: true });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 10), wheelM);
    w.rotation.z = Math.PI / 2;
    w.position.set(s * 0.62, 0.42, 0.25);
    w.castShadow = true;
    g.add(w);
  }
  for (const s of [-1, 1]) {
    const handle = box(0.06, 0.06, 1.0, wood, s * 0.4, 0.42, -1.1);
    handle.rotation.x = 0.35;
    g.add(handle);
  }
  if (rng() < 0.6) g.add(box(0.6, 0.35, 0.5, mat(0xb0a175, { flat: true }), 0.05, 0.85, 0.2)); // sacks
  return g;
}

/** stacked firewood in a cradle */
export function firewood(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const logM = mat(0x8a6a48, { flat: true });
  const endM = mat(0xc4a678, { flat: true });
  let y = 0.12;
  for (let row = 0; row < 3; row++) {
    const n = 5 - row;
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9 + rng() * 0.2, 7), logM);
      log.rotation.x = Math.PI / 2;
      log.position.set((i - (n - 1) / 2) * 0.2, y, (rng() - 0.5) * 0.1);
      log.castShadow = true;
      g.add(log);
      for (const s of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.CircleGeometry(0.085, 7), endM);
        end.position.set(log.position.x, y, log.position.z + s * 0.51);
        if (s < 0) end.rotation.y = Math.PI;
        g.add(end);
      }
    }
    y += 0.17;
  }
  return g;
}

let netTex: THREE.Texture | null = null;
function netTexture(): THREE.Texture {
  if (netTex) return netTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(120, 105, 80, 0.9)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * 8, 0); ctx.lineTo(i * 8 + 4, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 8); ctx.lineTo(64, i * 8 + 4); ctx.stroke();
  }
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  return netTex;
}

/** fishing nets hung to dry between two posts */
export function netRack(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const wood = mat(PALETTE.woodDark);
  g.add(box(0.12, 1.9, 0.12, wood, -1.2, 0.95, 0));
  g.add(box(0.12, 1.9, 0.12, wood, 1.2, 0.95, 0));
  g.add(box(2.6, 0.08, 0.08, wood, 0, 1.82, 0));
  const netM = new THREE.MeshStandardMaterial({
    map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
    color: 0xcabb9a, roughness: 0.9,
  });
  netM.map!.repeat.set(3, 2);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), netM);
  net.position.set(0, 1.0, 0.02);
  net.rotation.x = 0.06 + rng() * 0.04;
  g.add(net);
  return g;
}

/** woven basket (sometimes with fish/produce) */
export function basket(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const weave = mat(0xc4a066, { map: "wood", repeat: [2, 0.5] });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.35, 9), weave);
  b.position.y = 0.18;
  b.castShadow = true;
  g.add(b);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 10), mat(0xa07f4a, { flat: true }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.36;
  g.add(rim);
  if (rng() < 0.6) {
    for (let i = 0; i < 3; i++) {
      const fish = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 2, 5), mat(0x9fb2bb, { flat: true }));
      fish.rotation.z = Math.PI / 2 + (rng() - 0.5);
      fish.position.set((rng() - 0.5) * 0.25, 0.37, (rng() - 0.5) * 0.25);
      g.add(fish);
    }
  }
  return g;
}

/** coiled mooring rope */
export function ropeCoil(): THREE.Group {
  const g = new THREE.Group();
  const rope = mat(0xb59a6a, { flat: true });
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.26 - i * 0.02, 0.05, 6, 12), rope);
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.05 + i * 0.09;
    t.castShadow = true;
    g.add(t);
  }
  return g;
}

let awningTex: THREE.Texture | null = null;
function awningTexture(): THREE.Texture {
  if (awningTex) return awningTex;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 8;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#e8e0ce" : "#c3562b";
    ctx.fillRect(i * 8, 0, 8, 8);
  }
  awningTex = new THREE.CanvasTexture(c);
  awningTex.wrapS = awningTex.wrapT = THREE.RepeatWrapping;
  awningTex.colorSpace = THREE.SRGBColorSpace;
  return awningTex;
}

/** little market stall with striped awning and produce boxes */
export function marketStall(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const wood = mat(0xffffff, { map: "wood" });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.1, 2.0 + (sz > 0 ? 0.3 : 0), 0.1, wood, sx * 1.1, 1.0, sz * 0.8));
  }
  g.add(box(2.3, 0.08, 1.5, wood, 0, 0.85, 0)); // counter
  const awnM = new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.85, side: THREE.DoubleSide });
  awnM.map!.repeat.set(2, 1);
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.9), awnM);
  awning.rotation.x = -Math.PI / 2 + 0.28;
  awning.position.set(0, 2.28, 0.1);
  awning.castShadow = true;
  g.add(awning);
  // produce boxes
  const colors = [0xd46a52, 0xd9b23d, 0x7f8f57];
  for (let i = 0; i < 3; i++) {
    g.add(box(0.5, 0.18, 0.35, wood, -0.7 + i * 0.7, 0.98, (rng() - 0.5) * 0.4));
    const produce = box(0.42, 0.12, 0.28, mat(colors[i], { flat: true }), -0.7 + i * 0.7, 1.08, (rng() - 0.5) * 0.4);
    g.add(produce);
  }
  return g;
}

/** roadside shrine niche with a candle */
export function shrine(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xffffff, { map: "stone", repeat: [1, 1.4] });
  g.add(box(0.8, 1.5, 0.55, stone, 0, 0.75, 0));
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.55, 10, 1, false, 0, Math.PI), stone);
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 1.5;
  arch.castShadow = true;
  g.add(arch);
  const niche = box(0.42, 0.55, 0.1, mat(0x1c1812), 0, 1.05, 0.24);
  g.add(niche);
  const icon = box(0.2, 0.32, 0.03, mat(PALETTE.gold, { emissive: 0x664d1a, emissiveIntensity: 0.4 }), 0, 1.05, 0.3);
  g.add(icon);
  const candle = box(0.05, 0.12, 0.05, mat(0xf4eee0, { emissive: 0xffaa44, emissiveIntensity: 1.6 }), 0.12, 0.86, 0.28);
  g.add(candle);
  return g;
}

/** telegraph pole with crossarm and insulators */
export function telegraphPole(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x6f5a40, { flat: true });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 7), wood);
  pole.position.y = 2.8;
  pole.castShadow = true;
  g.add(pole);
  for (const y of [5.0, 4.5]) {
    g.add(box(1.2, 0.08, 0.08, wood, 0, y, 0));
    for (const s of [-0.45, 0.45]) {
      g.add(box(0.06, 0.12, 0.06, mat(0xd8d2c4, { flat: true }), s, y + 0.09, 0));
    }
  }
  return g;
}

/** low wooden fence along local X */
export function fenceRun(length: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const wood = mat(0x8a7050, { flat: true });
  for (let x = -length / 2; x <= length / 2; x += 1.4) {
    const post = box(0.09, 1.0, 0.09, wood, x, 0.5, 0);
    post.rotation.z = (rng() - 0.5) * 0.06;
    g.add(post);
  }
  for (const y of [0.42, 0.8]) {
    const rail = box(length, 0.07, 0.05, wood, 0, y, 0);
    rail.rotation.z = (rng() - 0.5) * 0.015;
    g.add(rail);
  }
  return g;
}

/** seagull perched on a mooring post */
export function seagullPost(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.1, 8), mat(PALETTE.woodDark));
  post.position.y = 0.55;
  post.castShadow = true;
  g.add(post);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.14, 2, 6), mat(0xeceae2, { flat: true }));
  body.rotation.z = Math.PI / 2 - 0.25;
  body.position.y = 1.22;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0xeceae2, { flat: true }));
  head.position.set(0.13, 1.34, 0);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), mat(0xd9a441, { flat: true }));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.21, 1.33, 0);
  g.add(beak);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), mat(0xb9b6ac, { flat: true }));
  wing.position.set(-0.02, 1.28, 0);
  g.add(wing);
  g.rotation.y = seededRandom(seed + 3)() * Math.PI * 2;
  void rng;
  return g;
}

/** pastel 60s scooter — the Riviera on two wheels */
export function vespa(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const colors = [0x9fd4c5, 0xe8e0ce, 0xc2554a, 0x8fb3d9];
  const bodyM = mat(colors[Math.floor(rng() * colors.length)], { rough: 0.35 });
  const darkM = mat(0x2a2723, { flat: true });
  // rear body: squashed sphere over the back wheel
  const rear = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 7), bodyM);
  rear.scale.set(0.72, 0.78, 1.1);
  rear.position.set(0, 0.5, -0.35);
  rear.castShadow = true;
  g.add(rear);
  // floorboard + front shield
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.55), bodyM);
  board.position.set(0, 0.28, 0.15);
  g.add(board);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.05), bodyM);
  shield.position.set(0, 0.6, 0.48);
  shield.rotation.x = -0.15;
  shield.castShadow = true;
  g.add(shield);
  // seat, handlebar, headlight
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.45), darkM);
  seat.position.set(0, 0.78, -0.28);
  g.add(seat);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), darkM);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.95, 0.45);
  g.add(bar);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0xfff2c0, { emissive: 0x776a3a, emissiveIntensity: 0.5 }));
  light.position.set(0, 0.88, 0.52);
  g.add(light);
  for (const zz of [0.45, -0.42]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 10), darkM);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.17, zz);
    wheel.castShadow = true;
    g.add(wheel);
  }
  // kickstand lean
  g.rotation.z = 0.08;
  return g;
}

/** café table with two chairs */
export function cafeSet(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const metal = mat(0x3d4a52, { rough: 0.4 });
  const topM = mat(0xe8e0ce, { rough: 0.5 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), topM);
  top.position.y = 0.72;
  top.castShadow = true;
  g.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), metal);
  leg.position.y = 0.36;
  g.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 10), metal);
  foot.position.y = 0.02;
  g.add(foot);
  // a bottle and glasses
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 7), mat(0x2e5a3a, { rough: 0.15 }));
  bottle.position.set(0.1, 0.86, 0.05);
  g.add(bottle);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 7), mat(0xcfd8dc, { rough: 0.1 }));
  glass.position.set(-0.12, 0.78, -0.06);
  g.add(glass);
  for (const s of [-1, 1]) {
    const a = s * (0.8 + rng() * 0.5);
    const cx = Math.cos(a) * 0.75, cz = Math.sin(a) * 0.75;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.38), topM);
    seat.position.set(cx, 0.45, cz);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.04), metal);
    back.position.set(cx * 1.25, 0.68, cz * 1.25);
    back.lookAt(0, 0.68, 0);
    g.add(back);
    for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
      const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 5), metal);
      cl.position.set(cx + lx, 0.22, cz + lz);
      g.add(cl);
    }
  }
  return g;
}

/** stacked fruit crates bursting with produce */
export function fruitCrates(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRandom(seed);
  const wood = mat(0xffffff, { map: "wood" });
  const produce = [0xe0862f, 0xe8c93d, 0xc2554a, 0x7f9457];
  let y = 0;
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const cw = 0.72, ch = 0.3;
    const crateBox = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.5), wood);
    crateBox.position.set((rng() - 0.5) * 0.12, y + ch / 2, (rng() - 0.5) * 0.12);
    crateBox.rotation.y = (rng() - 0.5) * 0.3;
    crateBox.castShadow = true;
    g.add(crateBox);
    const color = produce[Math.floor(rng() * produce.length)];
    for (let f = 0; f < 6; f++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.055 + rng() * 0.02, 6, 5), mat(color, { flat: true }));
      fruit.position.set(
        crateBox.position.x + (rng() - 0.5) * (cw - 0.2),
        y + ch + 0.03,
        crateBox.position.z + (rng() - 0.5) * 0.32
      );
      g.add(fruit);
    }
    y += ch + 0.1;
  }
  return g;
}

/** wall-mounted security camera on a pole; head pans (rotated by game code) */
export function securityCamera(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), mat(PALETTE.metalDark));
  pole.position.y = 1.6;
  pole.castShadow = true;
  g.add(pole);
  const head = new THREE.Group();
  head.name = "cam-head";
  head.position.y = 3.15;
  const body = box(0.5, 0.26, 0.3, mat(0xd8d2c4, { flat: true }), 0, 0, 0.12);
  head.add(body);
  const hood = box(0.52, 0.08, 0.34, mat(PALETTE.metalDark), 0, 0.16, 0.12);
  head.add(hood);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), mat(0x101820, { flat: true }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, 0.4);
  head.add(lens);
  const led = box(0.06, 0.06, 0.04, mat(0xff3322, { emissive: 0xff1100, emissiveIntensity: 2 }));
  led.name = "cam-led";
  led.position.set(0.16, 0.08, 0.29);
  head.add(led);
  g.add(head);
  return g;
}

export function searchlight(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 8), mat(PALETTE.metalDark));
  base.position.y = 0.25;
  g.add(base);
  const yoke = box(0.14, 0.7, 0.14, mat(PALETTE.metalDark), 0, 0.75, 0);
  g.add(yoke);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 10), mat(PALETTE.metal));
  drum.rotation.x = Math.PI / 2;
  drum.position.y = 1.15;
  drum.name = "drum";
  g.add(drum);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10), mat(0xfff4cc, { emissive: 0xffeeaa, emissiveIntensity: 2.2 }));
  face.position.set(0, 1.15, -0.36);
  face.rotation.y = Math.PI;
  drum.add(face);
  face.position.set(0, -0.36, 0);
  face.rotation.set(Math.PI / 2, 0, 0);
  return g;
}
