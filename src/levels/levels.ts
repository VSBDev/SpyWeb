import type { LevelDef } from "../world/levelkit";

/**
 * All six missions. Angle convention: forward = (sin a, cos a),
 * so 0 faces +Z, PI faces -Z, PI/2 faces +X, -PI/2 faces -X.
 */

const PI = Math.PI;

// ============================================================================
// TUTORIAL — Safehouse Cove
// ============================================================================
const tutorial: LevelDef = {
  id: "cove",
  name: "SAFEHOUSE COVE",
  tag: "TRAINING",
  cardBlurb:
    'Back on the coast after Budapest. ANCHOR\'s cove should be safe. It isn\'t — Serpe scouts found it.',
  briefing:
    `ANCHOR here. Welcome back to the Riviera, MIRA.\n\nSix weeks ago our courier network went quiet. Every asset the Service moved through this coast has been sold out — to SERPE, the syndicate that now brokers NATO secrets to any buyer with gold.\n\nAnd this morning two of their scouts walked a line straight to this safehouse. Nobody outside London knew this cove existed. Think about what that means.\n\nNeither scout reports back. Recover our gear, tap their courier relay, and take the boat out. Quietly — the web must not feel the first thread snap.`,
  time: "day",
  ambience: "sea",
  bounds: { minX: -40, minZ: -40, maxX: 40, maxZ: 40 },
  playerStart: { x: 0, z: -32, angle: 0 },
  ammo: 6,
  stones: 4,
  gear: { smoke: 1, decoys: 1, emp: 0 },
  water: [
    { minX: -40, maxX: -1.8, minZ: 24, maxZ: 40 },
    { minX: 1.8, maxX: 40, minZ: 24, maxZ: 40 },
    { minX: -1.8, maxX: 1.8, minZ: 33, maxZ: 40 },
  ],
  paths: [{ minX: -2, minZ: -30, maxX: 2, maxZ: 24 }],
  items: [
    { kind: "building", x: -16, z: -28, w: 9, d: 7, h: 3.2, roof: "gable", seed: 3 },
    { kind: "pergola", x: -9, z: -21 },
    { kind: "cypress", x: -22, z: -24, seed: 4 },
    { kind: "cypress", x: -21, z: -31, seed: 9 },
    { kind: "olive", x: -25, z: -10, seed: 2 },
    { kind: "olive", x: -22, z: 4, seed: 5 },
    { kind: "olive", x: -28, z: 14, seed: 8 },
    { kind: "palm", x: -12, z: 20, seed: 3 },
    { kind: "palm", x: 15, z: 21, seed: 7 },
    { kind: "rocks", x: 25, z: -20, seed: 2, scale: 1.8 },
    { kind: "rocks", x: -31, z: -16, seed: 6, scale: 1.4 },
    { kind: "rocks", x: 30, z: 18, seed: 9, scale: 1.2 },
    { kind: "grass", x: -4, z: -12, r: 2.6, seed: 1 },
    { kind: "grass", x: 5, z: -2, r: 3, seed: 2 },
    { kind: "grass", x: -8, z: 6, r: 2.5, seed: 3 },
    { kind: "grass", x: 14, z: 2, r: 2.3, seed: 4 },
    { kind: "grass", x: 3, z: 14, r: 3, seed: 5 },
    { kind: "grass", x: 24, z: 6, r: 2.2, seed: 6 },
    // ruined watch post
    { kind: "wall", x1: 8, z1: 6, x2: 20, z2: 6, h: 2, stone: true },
    { kind: "wall", x1: 8, z1: 6, x2: 8, z2: 14, h: 2, stone: true },
    { kind: "crate", x: 18, z: 10 },
    { kind: "crates", x: 21, z: 8.5 },
    { kind: "barrel", x: 17, z: 12.5 },
    { kind: "building", x: -16, z: 12, w: 5, d: 4, h: 2.8, roof: "flat", seed: 11, door: false },
    { kind: "dock", x: 0, z: 28, length: 9, width: 3 },
    { kind: "boat", x: 3.6, z: 32, rot: 0.25 },
    { kind: "bush", x: 9, z: -20, seed: 3 },
    { kind: "bush", x: -12, z: -4, seed: 5 },
    { kind: "laundry", x: -10, z: -27, length: 5 },
    { kind: "house", x: -28, z: -4, w: 6, d: 5, door: "E", seed: 3 },
    // fishing-village dressing
    { kind: "netrack", x: -6, z: 22, rot: 0.3 },
    { kind: "netrack", x: 9, z: 23, rot: -0.4 },
    { kind: "basket", x: -4.5, z: 21 },
    { kind: "basket", x: 10.5, z: 21.5 },
    { kind: "ropecoil", x: 1.5, z: 25 },
    { kind: "ropecoil", x: -1.6, z: 24.5 },
    { kind: "seagull", x: 2.2, z: 26.5 },
    { kind: "seagull", x: -14, z: 22.5, seed: 9 },
    { kind: "cart", x: -12, z: -20, rot: 1.1 },
    { kind: "firewood", x: -20, z: -25.5, rot: 0.4 },
    { kind: "amphora", x: -12.5, z: -30, seed: 4 },
    { kind: "amphora", x: -18.5, z: 9.5, seed: 11 },
    { kind: "bench", x: -11, z: -24, rot: 0.2 },
    { kind: "pine", x: 27, z: -12, seed: 3 },
    { kind: "pine", x: -33, z: 5, seed: 8 },
    { kind: "fence", x1: -22, z1: -18, x2: -12, z2: -18 },
    { kind: "shrine", x: 3.5, z: -26, rot: -0.5 },
    { kind: "pole", x: 3, z: -14 },
    { kind: "pole", x: 3, z: 2 },
    { kind: "well", x: -9, z: -31 },
    { kind: "pickup", x: 24, z: 2, what: "stones", amount: 2 },
    { kind: "pickup", x: -20, z: 2, what: "ammo", amount: 3 },
  ],
  guards: [
    {
      x: -2, z: -6,
      patrol: [
        { x: -2, z: -6, wait: 2.2, look: PI },
        { x: 10, z: -4, wait: 1.6 },
        { x: 9, z: 2, wait: 1.8, look: -PI / 2 },
      ],
    },
    { x: 16, z: 14, angle: -PI / 2 },
  ],
  objectives: [
    { id: "cache", label: "Recover the equipment cache", prop: "cache", x: 21, z: 13, duration: 1.6 },
    { id: "relay", label: "Tap the courier relay", prop: "radio", x: -13, z: 12, rot: PI / 2, duration: 2.2 },
  ],
  exfil: { x: 0, z: 30, r: 3, label: "Board the boat at the dock" },
  hint:
    "Crouch [C] in tall grass to vanish. Strike from behind with [E].",
  epilogue:
    `The relay tap paid off within the hour: courier runs, three a week, all routed through the estate of Don Anselmo — Serpe's paymaster. And one intercepted phrase that should worry London more than it worries me: \"our friend confirms the shipment lists are genuine.\"\n\nTheir friend. Somebody is feeding them our paper. — ANCHOR`,
};

// ============================================================================
// OP 01 — Villa Anselmo
// ============================================================================
const villa: LevelDef = {
  id: "villa",
  name: "VILLA ANSELMO",
  tag: "OP 01",
  cardBlurb:
    'The paymaster\'s estate. Every lira Serpe launders crosses Anselmo\'s desk — and so does our stolen paper.',
  briefing:
    `The relay you tapped at the cove points here: VILLA ANSELMO.\n\nDon Anselmo washes the syndicate's money and warehouses its purchases — including, we believe, copied NATO shipment lists. His study safe holds the account ciphers. A Zurich courier left a shipping ledger at the guest house; photograph it before it moves.\n\nThe household guard is lazy in the afternoon heat, but they know the grounds. If you can wreck the radio truck on your way out, Anselmo goes deaf for a week — and deaf men can't warn the harbor. — ANCHOR`,
  time: "day",
  ambience: "day",
  bounds: { minX: -55, minZ: -55, maxX: 55, maxZ: 55 },
  playerStart: { x: 0, z: 48, angle: PI },
  ammo: 8,
  stones: 5,
  gear: { smoke: 2, decoys: 1, emp: 1 },
  paths: [
    { minX: -2.5, minZ: 14, maxX: 2.5, maxZ: 38 },
    { minX: -14, minZ: -30, maxX: 14, maxZ: -22 },
  ],
  plazas: [{ minX: -9, minZ: -6, maxX: 9, maxZ: 0 }],
  items: [
    // perimeter
    { kind: "wall", x1: -45, z1: 38, x2: -3, z2: 38, h: 2.8 },
    { kind: "wall", x1: 3, z1: 38, x2: 45, z2: 38, h: 2.8 },
    { kind: "arch", x: 0, z: 38, w: 4, h: 3.6 },
    { kind: "wall", x1: -45, z1: -38, x2: -34, z2: -38, h: 2.8 },
    { kind: "wall", x1: -26, z1: -38, x2: 45, z2: -38, h: 2.8 },
    { kind: "arch", x: -30, z: -38, w: 4, h: 3.4 },
    { kind: "wall", x1: -45, z1: -38, x2: -45, z2: 38, h: 2.8 },
    { kind: "wall", x1: 45, z1: -38, x2: 45, z2: 38, h: 2.8 },
    // buildings
    { kind: "building", x: 0, z: 5, w: 16, d: 10, h: 6, roof: "hip", seed: 21 },
    { kind: "building", x: -25, z: 20, w: 10, d: 8, h: 4, roof: "gable", seed: 22, color: 0xdfc0a8 },
    { kind: "building", x: 25, z: 22, w: 9, d: 6, h: 3.5, roof: "flat", seed: 23 },
    { kind: "truck", x: 25, z: 31, rot: PI / 2 },
    // garden
    { kind: "fountain", x: 0, z: -15 },
    { kind: "statue", x: -8, z: -15 },
    { kind: "statue", x: 8, z: -15 },
    { kind: "pergola", x: -18, z: -8 },
    { kind: "pergola", x: -25, z: 12 },
    { kind: "grass", x: -14, z: -24, r: 3, seed: 11 },
    { kind: "grass", x: 10, z: -24, r: 3, seed: 12 },
    { kind: "grass", x: -32, z: -10, r: 2.6, seed: 13 },
    { kind: "grass", x: 30, z: -8, r: 2.6, seed: 14 },
    { kind: "grass", x: 18, z: 12, r: 2.4, seed: 15 },
    { kind: "grass", x: -15, z: 4, r: 2.2, seed: 16 },
    { kind: "grass", x: 38, z: 26, r: 2.6, seed: 17 },
    { kind: "grass", x: -38, z: 30, r: 2.4, seed: 18 },
    // trees
    { kind: "cypress", x: -5.5, z: 30, seed: 1 },
    { kind: "cypress", x: 5.5, z: 30, seed: 2 },
    { kind: "cypress", x: -5.5, z: 22, seed: 3 },
    { kind: "cypress", x: 5.5, z: 22, seed: 4 },
    { kind: "cypress", x: -5.5, z: 14, seed: 5 },
    { kind: "cypress", x: 5.5, z: 14, seed: 6 },
    { kind: "olive", x: -35, z: 0, seed: 7 },
    { kind: "olive", x: -30, z: -22, seed: 8 },
    { kind: "olive", x: -38, z: -25, seed: 9 },
    { kind: "olive", x: -33, z: 25, seed: 10 },
    { kind: "olive", x: 35, z: -20, seed: 11 },
    { kind: "olive", x: 38, z: 5, seed: 12 },
    { kind: "bush", x: -12, z: -15, seed: 2 },
    { kind: "bush", x: 12, z: -15, seed: 4 },
    { kind: "crates", x: 20, z: 16 },
    { kind: "barrel", x: 29.5, z: 17 },
    { kind: "alarm", x: 9, z: 11, rot: -PI / 2 },
    { kind: "alarm", x: -22, z: 27, rot: 0 },
    // garden hedges & vineyard terraces
    { kind: "hedge", x1: -18, z1: -27, x2: -8, z2: -27 },
    { kind: "hedge", x1: 8, z1: -27, x2: 18, z2: -27 },
    { kind: "vineyard", x1: -40, z1: 6, x2: -30, z2: 6 },
    { kind: "vineyard", x1: -40, z1: 10, x2: -30, z2: 10 },
    { kind: "vineyard", x1: -40, z1: 14, x2: -30, z2: 14 },
    { kind: "laundry", x: -33, z: 27, length: 5 },
    { kind: "banner", x: -6, z: 36 },
    { kind: "banner", x: 6, z: 36 },
    // supplies
    { kind: "pickup", x: 29, z: 19.5, what: "ammo", amount: 3 },
    { kind: "pickup", x: -8, z: -17, what: "stones", amount: 3 },
    { kind: "pickup", x: -40, z: -30, what: "ammo", amount: 3 },
    // garden shed (enterable) + old well
    { kind: "house", x: 38, z: 14, w: 7, d: 6, door: "W", seed: 8 },
    { kind: "pickup", x: 39, z: 15, what: "ammo", amount: 3 },
    { kind: "well", x: -33, z: -16 },
    // estate dressing
    { kind: "amphora", x: -10.5, z: 36, seed: 2 },
    { kind: "amphora", x: 10.5, z: 36, seed: 5 },
    { kind: "amphora", x: -9, z: -1.5, seed: 7 },
    { kind: "amphora", x: 9.5, z: -3, seed: 9 },
    { kind: "bench", x: -5, z: -12, rot: 0.5 },
    { kind: "bench", x: 5, z: -12, rot: -0.5 },
    { kind: "bench", x: 0, z: -19.5, rot: 3.14 },
    { kind: "cart", x: 20, z: 26, rot: 2.2 },
    { kind: "firewood", x: 29, z: 25, rot: 1.6 },
    { kind: "basket", x: 21.5, z: 18 },
    { kind: "shrine", x: 3.5, z: 41, rot: 3.14 },
    { kind: "pole", x: -4, z: 44 },
    { kind: "pole", x: -4, z: 52 },
    { kind: "pine", x: -41, z: -32, seed: 2 },
    { kind: "pine", x: 41, z: -30, seed: 6 },
    { kind: "pine", x: 40, z: 32, seed: 12 },
    { kind: "fence", x1: -40, z1: 3, x2: -30, z2: 3 },
    { kind: "fence", x1: -40, z1: 17, x2: -30, z2: 17 },
    { kind: "amphora", x: 36, z: 12, seed: 13 },
    { kind: "bush", x: -20, z: 32, seed: 7 },
    { kind: "bush", x: 24, z: 8, seed: 9 },
    { kind: "bush", x: -28, z: -33, seed: 11 },
    // one camera watching the terrace safe — shoot it or slip the sweep
    { kind: "cam", x: 8, z: -8, rot: -2.2, sweep: 0.55 },
  ],
  guards: [
    { x: 2.5, z: 35.5, angle: PI },
    { x: -2.5, z: 35.5, angle: PI },
    {
      x: 0, z: 30,
      patrol: [
        { x: 0, z: 30, wait: 2, look: PI },
        { x: -12, z: 26, wait: 1 },
        { x: 0, z: 18, wait: 1.6, look: PI },
        { x: 12, z: 26, wait: 1 },
      ],
    },
    {
      x: -12, z: 8,
      patrol: [
        { x: -12, z: 8, wait: 2, look: -PI / 2 },
        { x: -12, z: -4, wait: 2 },
        { x: -20, z: 0, wait: 1 },
      ],
    },
    {
      x: 12, z: 8,
      patrol: [
        { x: 12, z: 8, wait: 2, look: PI / 2 },
        { x: 12, z: -6, wait: 2 },
        { x: 20, z: 2, wait: 1 },
      ],
    },
    {
      x: 0, z: -22,
      patrol: [
        { x: 0, z: -22, wait: 2, look: 0 },
        { x: -12, z: -19, wait: 1.4 },
        { x: 0, z: -11, wait: 1 },
        { x: 12, z: -19, wait: 1.4 },
      ],
    },
    {
      x: -28, z: -32,
      patrol: [
        { x: -28, z: -32, wait: 2.4, look: PI },
        { x: -8, z: -32, wait: 2 },
        { x: 15, z: -32, wait: 2.4, look: -PI / 2 },
      ],
    },
    {
      x: -4, z: -2, officer: true,
      patrol: [
        { x: -4, z: -2.8, wait: 2.6, look: PI },
        { x: 6, z: -2.8, wait: 2.6, look: 0 },
      ],
    },
    { x: -18, z: 13, angle: -PI / 2 },
    { x: 25, z: 18, angle: 0 },
    {
      x: 32, z: 8,
      patrol: [
        { x: 32, z: 8, wait: 2 },
        { x: 36, z: -14, wait: 2, look: -PI / 2 },
        { x: 24, z: -22, wait: 2 },
      ],
    },
  ],
  objectives: [
    { id: "safe", label: "Crack the study safe", prop: "safe", x: 3, z: -2, rot: PI, duration: 3.2 },
    { id: "ledger", label: "Photograph the shipping ledger", prop: "documents", x: -25, z: 13, duration: 2.2 },
    { id: "radio", label: "Sabotage the radio truck", prop: "radio", x: 22, z: 29, rot: PI / 2, optional: true, duration: 2.6 },
  ],
  exfil: { x: -30, z: -43, r: 3.2, label: "Slip out through the garden gate" },
  hint: "Use [TAB] recon to learn the patrol routes before you move.",
  epilogue:
    `The ledger is worse than we feared. Payments to a broker codenamed IL SARTO — \"the Tailor\" — for merchandise listed only as \"cloth, London cut.\" He is selling them our secrets by the yard.\n\nAnd a margin note in Anselmo's hand: \"London confirms the woman is on the coast.\" They know about you, MIRA. Which means the Tailor's thread runs through our own house. The freight moves through Porto Vecchio. Go pull the thread. — ANCHOR`,
};

// ============================================================================
// OP 02 — Porto Vecchio
// ============================================================================
const harbor: LevelDef = {
  id: "harbor",
  name: "PORTO VECCHIO",
  tag: "OP 02",
  cardBlurb:
    'Serpe\'s freight moves through this harbor at dusk — including the Tailor\'s merchandise, by the crate.',
  briefing:
    `Anselmo's ledger routes everything through PORTO VECCHIO.\n\nTheir patrol boat sails at midnight. Plant our tracker on it and we chart every pier in the Tailor's network. The harbor master's manifest names the crooked captains and — if the ledger is right — what exactly Serpe has been buying with our paper.\n\nDock hands knock off at sundown; Serpe's men stay on, and after the villa they are nervous. The fishing boat at the north pier is ours. Don't keep her waiting. — ANCHOR`,
  time: "dusk",
  ambience: "sea",
  bounds: { minX: -60, minZ: -60, maxX: 60, maxZ: 60 },
  playerStart: { x: -52, z: -40, angle: PI / 2 },
  ammo: 8,
  stones: 5,
  gear: { smoke: 2, decoys: 2, emp: 1 },
  water: [
    { minX: 25, maxX: 60, minZ: -60, maxZ: -21.8 },
    { minX: 41.5, maxX: 60, minZ: -21.8, maxZ: -18.2 },
    { minX: 25, maxX: 60, minZ: -18.2, maxZ: 18.4 },
    { minX: 41.5, maxX: 60, minZ: 18.4, maxZ: 21.8 },
    { minX: 25, maxX: 60, minZ: 21.8, maxZ: 60 },
  ],
  plazas: [{ minX: -5, minZ: -45, maxX: 25, maxZ: 45 }],
  paths: [{ minX: -45, minZ: -3, maxX: -5, maxZ: 3 }],
  items: [
    // warehouses
    { kind: "building", x: -15, z: -25, w: 14, d: 10, h: 5, roof: "flat", seed: 31, color: 0xd8c4a4, door: false },
    { kind: "building", x: -15, z: 0, w: 14, d: 10, h: 5, roof: "flat", seed: 32, color: 0xcbb599, door: false },
    { kind: "building", x: -15, z: 25, w: 14, d: 10, h: 5, roof: "gable", seed: 33, door: false },
    { kind: "building", x: -35, z: 32, w: 8, d: 6, h: 4, roof: "gable", seed: 34 },
    { kind: "mast", x: -39, z: 37 },
    // docks
    { kind: "dock", x: 33, z: -20, rot: PI / 2, length: 16, width: 3 },
    { kind: "dock", x: 33, z: 20, rot: PI / 2, length: 16, width: 3 },
    { kind: "boat", x: 38, z: -25, rot: -0.2 },
    { kind: "boat", x: 40, z: 25, rot: 0.15 },
    { kind: "boat", x: 30, z: 42, rot: 0.5 },
    // quay clutter
    { kind: "crates", x: 5, z: -30 },
    { kind: "crate", x: 9, z: -27 },
    { kind: "crates", x: 3, z: -10 },
    { kind: "crate", x: 10, z: 0 },
    { kind: "crates", x: 6, z: 18 },
    { kind: "crate", x: 12, z: 28 },
    { kind: "crates", x: 0, z: 33 },
    { kind: "barrel", x: 14, z: -18 },
    { kind: "barrel", x: 15, z: -16.5 },
    { kind: "barrel", x: 2, z: 30 },
    { kind: "sandbags", x: 20, z: -5, rot: PI / 2 },
    { kind: "lamp", x: 22, z: -30 },
    { kind: "lamp", x: 22, z: 0 },
    { kind: "lamp", x: 22, z: 30 },
    { kind: "lamp", x: -5, z: -40 },
    // west edge greenery
    { kind: "grass", x: -28, z: -32, r: 3, seed: 21 },
    { kind: "grass", x: -30, z: 15, r: 2.6, seed: 22 },
    { kind: "grass", x: -5, z: -48, r: 2.6, seed: 23 },
    { kind: "grass", x: 2, z: 47, r: 2.6, seed: 24 },
    { kind: "grass", x: -7.5, z: -14, r: 2, seed: 25 },
    { kind: "grass", x: -7.5, z: 14, r: 2, seed: 26 },
    { kind: "grass", x: -45, z: -25, r: 3, seed: 27 },
    { kind: "palm", x: -32, z: -12, seed: 4 },
    { kind: "palm", x: -35, z: 12, seed: 6 },
    { kind: "palm", x: -50, z: 8, seed: 9 },
    { kind: "olive", x: -48, z: 28, seed: 3 },
    { kind: "rocks", x: -52, z: 45, seed: 5, scale: 1.5 },
    { kind: "rocks", x: -50, z: -52, seed: 8, scale: 1.7 },
    { kind: "alarm", x: 12, z: -2, rot: PI / 2 },
    { kind: "alarm", x: -11, z: -18, rot: 0 },
    // harbor dressing
    { kind: "crane", x: 16, z: 13, rot: 0.6 },
    { kind: "crane", x: 14, z: -40, rot: -1.2 },
    { kind: "laundry", x: -25, z: 13, length: 5, rot: PI / 2 },
    { kind: "banner", x: -31, z: 28.5 },
    // supplies
    { kind: "pickup", x: 0, z: 30.5, what: "ammo", amount: 3 },
    { kind: "pickup", x: 14, z: -16.5, what: "stones", amount: 3 },
    { kind: "pickup", x: -27, z: -40, what: "ammo", amount: 3 },
    // dockmaster hut (enterable) + cistern well
    { kind: "house", x: -50, z: -15, w: 7, d: 6, door: "E", seed: 12 },
    { kind: "pickup", x: -51, z: -16, what: "stones", amount: 3 },
    { kind: "well", x: -27, z: 5 },
    // waterfront dressing
    { kind: "netrack", x: 18, z: -12, rot: 0.2 },
    { kind: "netrack", x: 17, z: 14, rot: -0.3 },
    { kind: "basket", x: 19.5, z: -10 },
    { kind: "basket", x: 16, z: 16.5 },
    { kind: "basket", x: 4.5, z: -28 },
    { kind: "ropecoil", x: 23, z: -20 },
    { kind: "ropecoil", x: 23.5, z: 20.5 },
    { kind: "ropecoil", x: 21, z: 34 },
    { kind: "seagull", x: 24, z: -24, seed: 2 },
    { kind: "seagull", x: 24, z: 14, seed: 5 },
    { kind: "seagull", x: 20, z: 42, seed: 8 },
    { kind: "stall", x: -4, z: -34, rot: 0.5 },
    { kind: "cart", x: -7, z: -30, rot: -1.2 },
    { kind: "cart", x: -4, z: 24, rot: 1.9 },
    { kind: "firewood", x: -25.5, z: 18, rot: 0.3 },
    { kind: "amphora", x: -9, z: -6.5, seed: 3 },
    { kind: "amphora", x: -8.5, z: 30, seed: 6 },
    { kind: "bench", x: -30, z: 27, rot: 1.57 },
    { kind: "shrine", x: -28, z: 35.5, rot: 2.6 },
    { kind: "pole", x: -30, z: -3 },
    { kind: "pole", x: -18, z: -3.2 },
    { kind: "pole", x: -6, z: -3.5 },
    { kind: "pine", x: -44, z: 14, seed: 4 },
    { kind: "pine", x: -55, z: -34, seed: 7 },
    // camera over the mid-quay
    { kind: "cam", x: 22, z: 8, rot: -PI / 2 - 0.4, sweep: 0.7 },
  ],
  guards: [
    {
      x: 8, z: -35,
      patrol: [
        { x: 8, z: -35, wait: 2, look: -PI / 2 },
        { x: 8, z: -15, wait: 2 },
        { x: 2, z: -25, wait: 1.2 },
      ],
    },
    {
      x: 10, z: -5,
      patrol: [
        { x: 10, z: -5, wait: 2 },
        { x: 10, z: 10, wait: 2, look: PI / 2 },
        { x: 4, z: 3, wait: 1 },
      ],
    },
    {
      x: 8, z: 25,
      patrol: [
        { x: 8, z: 25, wait: 2, look: PI / 2 },
        { x: 8, z: 38, wait: 2 },
        { x: 0, z: 40, wait: 1.2 },
      ],
    },
    { x: 28, z: -20, angle: PI / 2 },
    {
      x: 36, z: -20,
      patrol: [
        { x: 36, z: -20, wait: 3, look: PI / 2 },
        { x: 27, z: -20, wait: 2, look: -PI / 2 },
      ],
    },
    { x: 28, z: 20, angle: PI / 2 },
    {
      x: -15, z: -12,
      patrol: [
        { x: -15, z: -12, wait: 2, look: PI / 2 },
        { x: -15, z: 12, wait: 2 },
        { x: -26, z: 0, wait: 1.4 },
      ],
    },
    { x: -31, z: 26, angle: 0 },
    {
      x: 18, z: -30, officer: true,
      patrol: [
        { x: 18, z: -30, wait: 2.4, look: PI / 2 },
        { x: 18, z: 30, wait: 2.4, look: PI / 2 },
      ],
    },
    { x: -15, z: -16, angle: PI },
    {
      x: -40, z: -8,
      patrol: [
        { x: -40, z: -8, wait: 2 },
        { x: -40, z: -30, wait: 2, look: 0 },
        { x: -30, z: -40, wait: 2 },
      ],
    },
  ],
  objectives: [
    { id: "tracker", label: "Plant the tracker on the patrol boat", prop: "none", x: 38, z: -20, duration: 2.6 },
    { id: "manifest", label: "Steal the harbor manifest", prop: "documents", x: -15, z: 8, duration: 2 },
    { id: "cache", label: "Pocket the smuggler cache", prop: "cache", x: 3, z: 36, optional: true, duration: 1.6 },
  ],
  exfil: { x: 39, z: 20, r: 3, label: "Board the fishing boat, north pier" },
  hint:
    "Thrown stones [G] pull sentries off the piers. Cameras die to one quiet round.",
  epilogue:
    `Your tracker ran true: the patrol boat put in at the old monastery of San Luca before dawn. And the manifest explains why — crate after crate of radio equipment lifted from a NATO depot outside Genoa.\n\nThey haven't just been buying our secrets, MIRA. They built ears of their own. That is how they found the cove; that is how they shadow our traffic. Climb the hill. Burn the ears. — ANCHOR`,
};

// ============================================================================
// OP 03 — Monastero San Luca
// ============================================================================
const monastery: LevelDef = {
  id: "monastery",
  name: "MONASTERO SAN LUCA",
  tag: "OP 03",
  cardBlurb:
    'The brothers left in \'58. Serpe\'s radio men moved in — and they\'ve been reading our cables ever since.',
  briefing:
    `The boat you tagged berths beneath MONASTERO SAN LUCA. Under its campanile, Serpe runs the listening post that has been reading Allied traffic for a year — the ears the Tailor's money built.\n\nRecord their transmissions and steal the cipher book from the chapel vault. With both, our cryptographers can finally read THEM — and follow the Tailor's thread all the way back to whoever in London holds the other end.\n\nIt is a moonless night. Their torches cut narrow beams, and searchlights sweep the cloister. Stay out of the light; the dark is yours. — ANCHOR`,
  time: "night",
  ambience: "night",
  bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 },
  playerStart: { x: 0, z: 44, angle: PI },
  ammo: 10,
  stones: 6,
  gear: { smoke: 2, decoys: 2, emp: 2 },
  paths: [{ minX: -2.5, minZ: 16, maxX: 2.5, maxZ: 44 }],
  plazas: [{ minX: -12, minZ: -12, maxX: 12, maxZ: 6 }],
  items: [
    // perimeter
    { kind: "wall", x1: -40, z1: 32, x2: -3, z2: 32, h: 3, stone: true },
    { kind: "wall", x1: 3, z1: 32, x2: 40, z2: 32, h: 3, stone: true },
    { kind: "arch", x: 0, z: 32, w: 4, h: 3.8 },
    { kind: "wall", x1: -40, z1: -32, x2: 12, z2: -32, h: 3, stone: true },
    { kind: "wall", x1: 28, z1: -32, x2: 40, z2: -32, h: 3, stone: true },
    { kind: "wall", x1: -40, z1: -32, x2: -40, z2: 32, h: 3, stone: true },
    { kind: "wall", x1: 40, z1: -32, x2: 40, z2: 32, h: 3, stone: true },
    // monastery
    { kind: "building", x: 0, z: -20, w: 18, d: 10, h: 7, roof: "gable", seed: 41, color: 0xe4d6be },
    { kind: "building", x: -22, z: 0, w: 8, d: 16, h: 4, roof: "gable", seed: 42 },
    { kind: "building", x: 22, z: 0, w: 8, d: 14, h: 4, roof: "gable", seed: 43 },
    { kind: "mast", x: 0, z: 8 },
    { kind: "mast", x: 7, z: 12 },
    { kind: "fountain", x: 0, z: -2 },
    // lighting
    { kind: "lamp", x: -8, z: 24 },
    { kind: "lamp", x: 8, z: 24 },
    { kind: "lamp", x: 0, z: 14 },
    { kind: "lamp", x: -14, z: 6 },
    { kind: "lamp", x: 14, z: 6 },
    { kind: "lamp", x: 10, z: -10 },
    { kind: "lamp", x: -10, z: -10 },
    { kind: "lamp", x: -26, z: -20 },
    { kind: "searchlight", x: -30, z: 28, rot: PI * 0.75 },
    { kind: "searchlight", x: 30, z: 28, rot: -PI * 0.75 },
    { kind: "tower", x: -33, z: -25 },
    { kind: "tower", x: 33, z: -25 },
    // greenery & cover
    { kind: "cypress", x: -30, z: 10, seed: 1 },
    { kind: "cypress", x: -28, z: 16, seed: 2 },
    { kind: "cypress", x: 26, z: 18, seed: 3 },
    { kind: "cypress", x: 34, z: 4, seed: 4 },
    { kind: "cypress", x: -6, z: 38, seed: 5 },
    { kind: "cypress", x: 6, z: 38, seed: 6 },
    { kind: "olive", x: -34, z: -8, seed: 7 },
    { kind: "olive", x: 33, z: -12, seed: 8 },
    { kind: "grass", x: -16, z: 22, r: 3, seed: 31 },
    { kind: "grass", x: 14, z: 24, r: 2.6, seed: 32 },
    { kind: "grass", x: -26, z: -12, r: 3, seed: 33 },
    { kind: "grass", x: 26, z: -14, r: 2.6, seed: 34 },
    { kind: "grass", x: 0, z: 2.5, r: 2, seed: 35 },
    { kind: "grass", x: -14, z: -26, r: 2.4, seed: 36 },
    { kind: "grass", x: 18, z: -27, r: 2.4, seed: 37 },
    { kind: "grass", x: 20, z: -38, r: 2.6, seed: 38 },
    { kind: "crates", x: 12, z: 16 },
    { kind: "barrel", x: -12, z: 14 },
    { kind: "sandbags", x: 4, z: 18, rot: 0 },
    { kind: "rocks", x: 16, z: -36, seed: 3, scale: 1.4 },
    { kind: "rocks", x: 25, z: -36, seed: 7, scale: 1.3 },
    { kind: "alarm", x: 6, z: 20, rot: PI },
    { kind: "alarm", x: -6, z: -12, rot: 0 },
    // cloister colonnade + banners
    { kind: "colonnade", x: 0, z: 6, length: 14 },
    { kind: "banner", x: -7, z: -13 },
    { kind: "banner", x: 7, z: -13 },
    // supplies
    { kind: "pickup", x: 12, z: 18, what: "ammo", amount: 4 },
    { kind: "pickup", x: -12, z: 16, what: "stones", amount: 3 },
    { kind: "pickup", x: -28, z: -16, what: "ammo", amount: 3 },
    // sacristy (enterable) + cloister well
    { kind: "house", x: -30, z: -27, w: 6, d: 5, door: "N", seed: 17, color: 0xe4d6be },
    { kind: "pickup", x: -31, z: -28, what: "ammo", amount: 3 },
    { kind: "well", x: -18, z: 14 },
    // cloister dressing
    { kind: "amphora", x: -8, z: 4, seed: 2 },
    { kind: "amphora", x: 8.5, z: 3.5, seed: 4 },
    { kind: "bench", x: -6, z: -6, rot: 1.57 },
    { kind: "bench", x: 6, z: -6, rot: -1.57 },
    { kind: "bench", x: -13, z: 24.5, rot: 0.4 },
    { kind: "firewood", x: -25, z: 5.5, rot: 1.1 },
    { kind: "firewood", x: 26.5, z: 7, rot: -0.6 },
    { kind: "cart", x: -14, z: 27.5, rot: 2.6 },
    { kind: "shrine", x: 4, z: 27.5, rot: 2.9 },
    { kind: "shrine", x: -21, z: -14, rot: 0.9 },
    { kind: "basket", x: -23.5, z: 7.5 },
    { kind: "pine", x: -36, z: 18, seed: 3 },
    { kind: "pine", x: 36, z: 16, seed: 6 },
    { kind: "pine", x: -12, z: 40, seed: 9 },
    { kind: "pine", x: 14, z: 41, seed: 13 },
    { kind: "rocks", x: -34, z: 40, seed: 12, scale: 1.6 },
    { kind: "rocks", x: 35, z: 42, seed: 15, scale: 1.3 },
    { kind: "amphora", x: 23, z: -8.5, seed: 8 },
    // electronic security: cameras + tower searchlights
    { kind: "cam", x: -11, z: -11, rot: 0.8, sweep: 0.6 },
    { kind: "cam", x: 8, z: 16, rot: -2.36, sweep: 0.5 },
    { kind: "sweeper", x: -33, z: -25, height: 7, radius: 9, speed: 0.42 },
    { kind: "sweeper", x: 33, z: -25, height: 7, radius: 9, speed: 0.55 },
  ],
  guards: [
    { x: 2.5, z: 29.5, angle: PI },
    { x: -2.5, z: 29.5, angle: PI },
    {
      x: -12, z: 4, officer: true,
      patrol: [
        { x: -14, z: 4, wait: 2, look: 0 },
        { x: -14, z: -10, wait: 2 },
        { x: 14, z: -10, wait: 2 },
        { x: 14, z: 4, wait: 2, look: 0 },
      ],
    },
    {
      x: 4, z: 14, angle: PI / 2,
    },
    {
      x: -8, z: -28,
      patrol: [
        { x: -8, z: -28, wait: 2.4, look: PI },
        { x: 8, z: -28, wait: 2.4, look: PI },
      ],
    },
    {
      x: -30, z: 22,
      patrol: [
        { x: -30, z: 22, wait: 2, look: 0 },
        { x: -34, z: -2, wait: 2 },
        { x: -28, z: -20, wait: 2, look: PI },
      ],
    },
    {
      x: 30, z: 22,
      patrol: [
        { x: 30, z: 22, wait: 2, look: 0 },
        { x: 34, z: -2, wait: 2 },
        { x: 28, z: -20, wait: 2, look: PI },
      ],
    },
    {
      x: 0, z: 24,
      patrol: [
        { x: 0, z: 24, wait: 2.6, look: 0 },
        { x: -10, z: 18, wait: 1.4 },
        { x: 10, z: 18, wait: 1.4 },
      ],
    },
    {
      x: 18, z: -2,
      patrol: [
        { x: 18, z: -4, wait: 2.2, look: -PI / 2 },
        { x: 18, z: 10, wait: 2 },
      ],
    },
    {
      x: -18, z: -2,
      patrol: [
        { x: -18, z: -4, wait: 2.2, look: PI / 2 },
        { x: -18, z: 10, wait: 2 },
      ],
    },
    { x: 12, z: -35, angle: PI / 2 },
  ],
  objectives: [
    { id: "record", label: "Record the transmissions", prop: "radio", x: 3, z: 10.5, rot: PI, duration: 4 },
    { id: "cipher", label: "Steal the cipher book", prop: "safe", x: 0, z: -27.5, rot: PI, duration: 3 },
    { id: "photo", label: "Photograph the antenna array", prop: "camera", x: 12, z: 12, rot: -2.2, optional: true, duration: 2.4 },
  ],
  exfil: { x: 20, z: -40, r: 3.4, label: "Descend the cliff path" },
  hint:
    "Their torches are narrow — flank the beams. EMP [3] kills searchlights for 14 seconds.",
  epilogue:
    `The recordings decrypt beautifully. IL SARTO's buyer-side contact is a cipher clerk — OUR cipher clerk, Admiralty registry. London is moving on him tonight.\n\nBut the clerk is a thread, not the spider. Every name, every account, every bought official in the network lives in one master file the syndicate calls SPYWEB — kept where Serpe keeps everything it fears losing: the fortress. Steal it before they burn it. — ANCHOR`,
};

// ============================================================================
// OP 04 — Fortezza Serpe
// ============================================================================
const fortress: LevelDef = {
  id: "fortress",
  name: "FORTEZZA SERPE",
  tag: "OP 04",
  cardBlurb:
    'The serpent\'s nest. Somewhere inside the citadel sits SPYWEB — the master file of every thread in the web.',
  briefing:
    `This is the head of the snake, MIRA.\n\nInside the citadel sits the SPYWEB dossier — every agent, every account, every official the syndicate ever bought, and every secret the Tailor ever sold them. Steal it. Sabotage their armory stockpile. And plant the forged ledgers in the commandant's safe: let the syndicate tear itself apart hunting a traitor that never existed.\n\nThe garrison is disciplined and the walls have teeth. Our boat waits in the cove beneath the postern gate. Finish what the cove started. — ANCHOR`,
  time: "day",
  ambience: "day",
  bounds: { minX: -60, minZ: -60, maxX: 60, maxZ: 60 },
  playerStart: { x: -54, z: 0, angle: PI / 2 },
  ammo: 12,
  stones: 6,
  gear: { smoke: 3, decoys: 2, emp: 2 },
  water: [
    { minX: -60, maxX: 33.2, minZ: 52, maxZ: 60 },
    { minX: 36.8, maxX: 60, minZ: 52, maxZ: 60 },
  ],
  paths: [{ minX: -45, minZ: -2.5, maxX: 4, maxZ: 2.5 }],
  plazas: [{ minX: -8, minZ: -10, maxX: 6, maxZ: 12 }],
  items: [
    // outer walls
    { kind: "wall", x1: -45, z1: -45, x2: 45, z2: -45, h: 4, stone: true },
    { kind: "wall", x1: -45, z1: 45, x2: 32, z2: 45, h: 4, stone: true },
    { kind: "wall", x1: 38, z1: 45, x2: 45, z2: 45, h: 4, stone: true },
    { kind: "wall", x1: 45, z1: -45, x2: 45, z2: 45, h: 4, stone: true },
    { kind: "wall", x1: -45, z1: -45, x2: -45, z2: -3, h: 4, stone: true },
    { kind: "wall", x1: -45, z1: 3, x2: -45, z2: 45, h: 4, stone: true },
    { kind: "arch", x: -45, z: 0, rot: PI / 2, w: 5, h: 4.4 },
    // towers
    { kind: "tower", x: -38, z: -38, h: 7 },
    { kind: "tower", x: 38, z: -38, h: 7 },
    { kind: "tower", x: -38, z: 38, h: 7 },
    { kind: "tower", x: 38, z: 38, h: 7 },
    // keep + support buildings
    { kind: "building", x: 18, z: 0, w: 20, d: 16, h: 8, roof: "flat", seed: 51, color: 0xd8cbb2, door: false },
    { kind: "building", x: -20, z: 28, w: 14, d: 8, h: 4, roof: "gable", seed: 52 },
    { kind: "building", x: -20, z: -28, w: 12, d: 8, h: 4, roof: "flat", seed: 53, door: false },
    { kind: "building", x: 18, z: 28, w: 10, d: 7, h: 4, roof: "flat", seed: 54 },
    { kind: "truck", x: 0, z: 36, rot: PI / 2 },
    { kind: "truck", x: 9, z: 36, rot: PI / 2 },
    // inner walls (chokepoints)
    { kind: "wall", x1: -10, z1: -45, x2: -10, z2: -15, h: 3 },
    { kind: "wall", x1: -10, z1: -7, x2: -10, z2: 15, h: 3 },
    { kind: "wall", x1: -10, z1: 15, x2: 6, z2: 15, h: 3 },
    // courtyard set dressing
    { kind: "statue", x: 0, z: -4 },
    { kind: "fountain", x: -2, z: 7 },
    { kind: "sandbags", x: -5, z: -12, rot: 0 },
    { kind: "sandbags", x: 2, z: -20, rot: PI / 2 },
    { kind: "crates", x: -26, z: -20 },
    { kind: "crate", x: -14, z: -21 },
    { kind: "crates", x: 28, z: 12 },
    { kind: "barrel", x: 30, z: -25 },
    { kind: "barrel", x: 31.5, z: -23.5 },
    { kind: "crate", x: -30, z: 8 },
    // greenery
    { kind: "cypress", x: -16, z: -40, seed: 1 },
    { kind: "cypress", x: -24, z: -40, seed: 2 },
    { kind: "cypress", x: 12, z: -40, seed: 3 },
    { kind: "cypress", x: 24, z: -40, seed: 4 },
    { kind: "olive", x: -35, z: 20, seed: 5 },
    { kind: "olive", x: 35, z: 30, seed: 6 },
    { kind: "grass", x: -38, z: 22, r: 3, seed: 41 },
    { kind: "grass", x: -35, z: -8, r: 3, seed: 42 },
    { kind: "grass", x: -28, z: 0, r: 2.6, seed: 43 },
    { kind: "grass", x: 5, z: -30, r: 3, seed: 44 },
    { kind: "grass", x: 33, z: 25, r: 2.6, seed: 45 },
    { kind: "grass", x: -5, z: 25, r: 2.6, seed: 46 },
    { kind: "grass", x: 35, z: -5, r: 2.2, seed: 47 },
    { kind: "grass", x: 20, z: -25, r: 2.4, seed: 48 },
    { kind: "grass", x: 35, z: 41, r: 2.6, seed: 49 },
    // alarms
    { kind: "alarm", x: -6, z: -14, rot: PI / 2 },
    { kind: "alarm", x: 14, z: 20, rot: 0 },
    { kind: "alarm", x: -24, z: -18, rot: 0 },
    // regalia & dressing
    { kind: "banner", x: 6, z: -10 },
    { kind: "banner", x: 6, z: 10 },
    { kind: "laundry", x: -27, z: 36, length: 5 },
    // supplies
    { kind: "pickup", x: -14, z: -19, what: "ammo", amount: 4 },
    { kind: "pickup", x: -30, z: 6.5, what: "stones", amount: 3 },
    { kind: "pickup", x: 28, z: 14, what: "ammo", amount: 3 },
    { kind: "pickup", x: 35, z: -6.5, what: "stones", amount: 2 },
    // electronic security
    { kind: "cam", x: -38, z: 6, rot: -2.45, sweep: 0.5 },
    { kind: "cam", x: 8, z: 6, rot: -2.55, sweep: 0.4 },
    { kind: "cam", x: 33, z: 40, rot: 0.38, sweep: 0.5 },
    // garrison dressing
    { kind: "cart", x: -6, z: 36, rot: 0.8 },
    { kind: "firewood", x: -35, z: 30.5, rot: 0.2 },
    { kind: "firewood", x: -28, z: -35, rot: 1.4 },
    { kind: "bench", x: -16, z: 20, rot: 1.57 },
    { kind: "bench", x: -3, z: 12.5, rot: 0 },
    { kind: "amphora", x: 3, z: 11.5, seed: 3 },
    { kind: "amphora", x: -41, z: 28, seed: 6 },
    { kind: "basket", x: -24, z: 24.5 },
    { kind: "basket", x: 14.5, z: 24 },
    { kind: "ropecoil", x: 33, z: 47 },
    { kind: "seagull", x: 31.5, z: 49.5, seed: 3 },
    { kind: "pole", x: -35, z: -3.5 },
    { kind: "pole", x: -20, z: -3.5 },
    { kind: "pine", x: -41, z: -28, seed: 5 },
    { kind: "pine", x: 41, z: -34, seed: 9 },
    { kind: "pine", x: 42, z: 33, seed: 14 },
    { kind: "sandbags", x: -14, z: 3, rot: 1.57 },
    { kind: "barrel", x: -12.5, z: -25 },
    { kind: "barrel", x: -11, z: -26.5 },
    { kind: "crate", x: 24, z: -18 },
    // guardhouse (enterable) + courtyard well
    { kind: "house", x: -34, z: -33, w: 6, d: 5, door: "S", seed: 22 },
    { kind: "pickup", x: -35, z: -34, what: "ammo", amount: 3 },
    { kind: "well", x: -6, z: 20 },
    // exfil dock
    { kind: "dock", x: 35, z: 52, length: 8, width: 3 },
    { kind: "boat", x: 38.5, z: 56, rot: 0.2 },
  ],
  guards: [
    { x: -41.5, z: 2.5, angle: PI / 2 },
    { x: -41.5, z: -2.5, angle: PI / 2 },
    {
      x: -40, z: -20,
      patrol: [
        { x: -40, z: -20, wait: 2, look: PI / 2 },
        { x: -40, z: 20, wait: 2, look: PI / 2 },
      ],
    },
    {
      x: -30, z: -40,
      patrol: [
        { x: -30, z: -40, wait: 2, look: 0 },
        { x: 30, z: -40, wait: 2, look: 0 },
      ],
    },
    {
      x: -30, z: 40,
      patrol: [
        { x: -30, z: 40, wait: 2, look: PI },
        { x: 26, z: 40, wait: 2, look: PI },
      ],
    },
    {
      x: 40, z: -25,
      patrol: [
        { x: 40, z: -25, wait: 2, look: -PI / 2 },
        { x: 40, z: 25, wait: 2, look: -PI / 2 },
      ],
    },
    {
      x: -28, z: -20,
      patrol: [
        { x: -28, z: -19, wait: 2, look: 0 },
        { x: -14, z: -24, wait: 2 },
        { x: -20, z: -14, wait: 1.2 },
      ],
    },
    {
      x: -28, z: 24,
      patrol: [
        { x: -28, z: 23, wait: 2, look: 0 },
        { x: -13, z: 23, wait: 2 },
        { x: -20, z: 34, wait: 2 },
      ],
    },
    {
      x: -5, z: -8,
      patrol: [
        { x: -5, z: -8, wait: 2, look: PI / 2 },
        { x: -5, z: 10, wait: 2 },
        { x: 2, z: 2, wait: 1 },
      ],
    },
    {
      x: 3, z: -6, officer: true,
      patrol: [
        { x: 3, z: -6, wait: 2.6, look: PI / 2 },
        { x: 3, z: 6, wait: 2.6, look: PI / 2 },
      ],
    },
    {
      x: 32, z: -8, officer: true,
      patrol: [
        { x: 32, z: -8, wait: 2.4, look: -PI / 2 },
        { x: 32, z: 8, wait: 2.4, look: -PI / 2 },
      ],
    },
    {
      x: -2, z: 31,
      patrol: [
        { x: -3, z: 31, wait: 2.2, look: 0 },
        { x: 11, z: 31, wait: 2.2, look: 0 },
      ],
    },
    {
      x: 12, z: 18,
      patrol: [
        { x: 12, z: 18, wait: 2 },
        { x: 26, z: 18, wait: 2, look: 0 },
      ],
    },
    {
      x: 12, z: -14,
      patrol: [
        { x: 12, z: -14, wait: 2, look: PI },
        { x: 26, z: -14, wait: 2, look: PI },
      ],
    },
  ],
  objectives: [
    { id: "dossier", label: "Steal the SPYWEB dossier", prop: "documents", x: 4, z: 0, rot: PI / 2, duration: 3 },
    { id: "armory", label: "Sabotage the armory stockpile", prop: "cache", x: -20, z: -22.5, duration: 3 },
    { id: "ledgers", label: "Plant the forged ledgers", prop: "safe", x: 30.5, z: 0, rot: -PI / 2, duration: 3 },
    { id: "car", label: "Tag the staff car", prop: "none", x: 0, z: 31, optional: true, duration: 2 },
  ],
  exfil: { x: 35, z: 49, r: 3.2, label: "Escape through the postern gate" },
  hint:
    "Four objectives, one garrison. The seams of the fortress are unwatched.",
  epilogue:
    `The dossier is everything London hoped: the clerk confessed by midnight, and the Tailor's whole customer list burns by morning.\n\nOne page missing. Commandant VASARI — Serpe's enforcer and the Tailor's protector — slipped the net an hour before you came over the wall. He is pulling every man he still owns back to the fortress under blackout, to sell the last thing worth selling: the master negatives.\n\nYour forged ledgers are already working — half his officers suspect the other half. Go back in and end it. — ANCHOR`,
};

// ============================================================================
// OP 05 — Notte Rossa (the fortress, remixed: night, floodlit, one target)
// ============================================================================
const gauntlet: LevelDef = {
  ...fortress,
  id: "gauntlet",
  name: "NOTTE ROSSA",
  tag: "OP 05",
  cardBlurb:
    'Blackout watch. Vasari regroups at the fortress to sell the master negatives. He must not see morning.',
  briefing:
    `Last transmission, MIRA. After tonight this channel is ash.\n\nVASARI knows the web is cut and he is selling the master negatives to the first buyer who lands. London has signed the order: he does not see morning. He paces the keep's west front, guarded like a king who knows he is already dead.\n\nOne more thing. The courier PIETRO — the man we flipped in '61, whose pier schedules led you here — is locked in the armory cell, and Vasari means to shoot him at dawn. He earned his boat ride. Bring him out.\n\nSearchlights on every tower, cameras on every approach, torches on every rifle. This is the last night of the Serpe syndicate. Make it red. — ANCHOR`,
  time: "night",
  ambience: "night",
  ammo: 10,
  stones: 6,
  gear: { smoke: 3, decoys: 2, emp: 3 },
  items: [
    ...fortress.items.filter((i) => i.kind !== "cam" && i.kind !== "pickup"),
    // blackout lighting
    { kind: "lamp", x: -6, z: 0 },
    { kind: "lamp", x: 6, z: 18 },
    { kind: "lamp", x: -20, z: 22 },
    { kind: "lamp", x: -20, z: -22 },
    { kind: "lamp", x: 30, z: 12 },
    { kind: "lamp", x: 30, z: -12 },
    { kind: "lamp", x: -2, z: 30 },
    { kind: "lamp", x: -42, z: 0 },
    // heavier electronic security
    { kind: "cam", x: -38, z: 6, rot: -2.45, sweep: 0.5 },
    { kind: "cam", x: 8, z: 6, rot: -2.55, sweep: 0.4 },
    { kind: "cam", x: 33, z: 40, rot: 0.38, sweep: 0.5 },
    { kind: "cam", x: -6, z: -18, rot: 0.4, sweep: 0.7 },
    { kind: "sweeper", x: -38, z: -38, height: 8, radius: 11, speed: 0.4 },
    { kind: "sweeper", x: 38, z: -38, height: 8, radius: 11, speed: 0.5 },
    { kind: "sweeper", x: -38, z: 38, height: 8, radius: 11, speed: 0.46 },
    { kind: "sweeper", x: 38, z: 38, height: 8, radius: 11, speed: 0.56 },
    // supplies
    { kind: "pickup", x: -14, z: -19, what: "ammo", amount: 4 },
    { kind: "pickup", x: -30, z: 6.5, what: "stones", amount: 3 },
    { kind: "pickup", x: 28, z: 14, what: "ammo", amount: 4 },
    { kind: "pickup", x: -5, z: 27, what: "ammo", amount: 3 },
  ],
  guards: [
    ...fortress.guards,
    // Commandant Vasari (kill target) pacing the keep roof court... at ground front
    {
      x: 14, z: 0, officer: true,
      patrol: [
        { x: 14, z: -5, wait: 3, look: -PI / 2 },
        { x: 5, z: 0, wait: 2.4, look: -PI / 2 },
        { x: 14, z: 5, wait: 3, look: -PI / 2 },
      ],
    },
    // extra night watch
    { x: -36, z: 30, patrol: [{ x: -36, z: 30, wait: 2 }, { x: -36, z: 12, wait: 2, look: PI / 2 }] },
    { x: 20, z: -30, patrol: [{ x: 20, z: -30, wait: 2, look: 0 }, { x: 34, z: -30, wait: 2, look: 0 }] },
  ],
  objectives: [
    { id: "vasari", label: "Assassinate Commandant Vasari", prop: "none", x: 14, z: 0, killGuard: 14 },
    { id: "informant", label: "Free PIETRO from the armory cell", prop: "none", x: -20, z: -22.5, duration: 3 },
    { id: "gold", label: "Seize the syndicate gold", prop: "cache", x: 30.5, z: 0, rot: -PI / 2, optional: true, duration: 2.6 },
  ],
  exfil: { x: 35, z: 49, r: 3.2, label: "Take the boat — it's over" },
  hint:
    "Searchlights on every tower. Vasari paces the keep's west front.",
  epilogue:
    `Vasari is dead. Pietro is aboard, asking if London pays pensions. The negatives are in the sea, where they will keep their secrets better than we ever did.\n\nThe web is cut, MIRA — every thread, both ends. Come home. The Riviera is just the sea again. — ANCHOR`,
};

export const LEVELS: LevelDef[] = [tutorial, villa, harbor, monastery, fortress, gauntlet];
export const LEVEL_ORDER = LEVELS.map((l) => l.id);
