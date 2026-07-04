import * as THREE from "three";
import { seededRandom } from "../core/mathutil";

/**
 * Sun-bleached Mediterranean palette + canvas-generated textures.
 * Everything visual in SpyWeb derives from these.
 */

export const PALETTE = {
  skyDay: 0xb9d7e3,
  skyNight: 0x0d1626,
  hazeDay: 0xe8dcc0,
  hazeNight: 0x101a2c,
  sunDay: 0xffe8c4,
  moonlight: 0x9ab4d8,
  groundDirt: 0xc9b28a,
  groundPath: 0xb5a481,
  whitewash: 0xf0e9dc,
  plasterWarm: 0xe8d9bd,
  plasterPink: 0xdfc0a8,
  terracotta: 0xb3542e,
  terracottaDark: 0x94431f,
  stone: 0xa89f8d,
  stoneDark: 0x7d766a,
  wood: 0x8a6a48,
  woodDark: 0x6a4e34,
  cypress: 0x39523a,
  olive: 0x7d8756,
  grassDry: 0xa3a065,
  sea: 0x2e7f7c,
  uniformOlive: 0x5c6045,
  uniformOfficer: 0x707a82,
  skin: 0xd9a978,
  spySuit: 0x33383f,
  gold: 0xd9a441,
  metal: 0x8d9499,
  metalDark: 0x4d5359,
} as const;

const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.Material>();

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

function finishTexture(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function hex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

/** subtle per-pixel noise pass */
function grain(ctx: CanvasRenderingContext2D, size: number, amount: number, rng: () => number) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function texture(name: string): THREE.Texture {
  if (texCache.has(name)) return texCache.get(name)!;
  const rng = seededRandom(name.length * 7919 + 13);
  const size = 256;
  const [c, ctx] = makeCanvas(size);

  switch (name) {
    case "plaster": {
      ctx.fillStyle = hex(PALETTE.whitewash);
      ctx.fillRect(0, 0, size, size);
      // weathering streaks from top
      for (let i = 0; i < 26; i++) {
        const x = rng() * size;
        ctx.fillStyle = `rgba(150, 130, 100, ${0.03 + rng() * 0.05})`;
        ctx.fillRect(x, 0, 2 + rng() * 5, size * (0.2 + rng() * 0.8));
      }
      // patches of exposed plaster
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `rgba(210, 180, 140, ${0.06 + rng() * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(rng() * size, rng() * size, 12 + rng() * 34, 8 + rng() * 22, rng() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      grain(ctx, size, 14, rng);
      break;
    }
    case "roof": {
      ctx.fillStyle = hex(PALETTE.terracotta);
      ctx.fillRect(0, 0, size, size);
      const rows = 8, cols = 8;
      const rh = size / rows, cw = size / cols;
      for (let r = 0; r < rows; r++) {
        // row shadow line
        ctx.fillStyle = "rgba(60, 25, 10, 0.35)";
        ctx.fillRect(0, r * rh, size, 3);
        for (let col = 0; col < cols; col++) {
          const shade = 0.85 + rng() * 0.3;
          ctx.fillStyle = `rgba(${Math.floor(179 * shade)}, ${Math.floor(84 * shade)}, ${Math.floor(46 * shade)}, 1)`;
          ctx.fillRect(col * cw + 1, r * rh + 3, cw - 2, rh - 4);
          // curved tile highlight
          ctx.fillStyle = "rgba(255, 210, 170, 0.15)";
          ctx.fillRect(col * cw + 2, r * rh + 4, cw * 0.35, rh - 6);
        }
      }
      grain(ctx, size, 10, rng);
      break;
    }
    case "stone": {
      ctx.fillStyle = hex(PALETTE.stoneDark);
      ctx.fillRect(0, 0, size, size);
      const rows = 6;
      const rh = size / rows;
      for (let r = 0; r < rows; r++) {
        let x = (r % 2) * -20;
        while (x < size) {
          const w = 30 + rng() * 40;
          const shade = 0.85 + rng() * 0.35;
          ctx.fillStyle = `rgba(${Math.floor(168 * shade)}, ${Math.floor(159 * shade)}, ${Math.floor(141 * shade)}, 1)`;
          ctx.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
          x += w;
        }
      }
      grain(ctx, size, 16, rng);
      break;
    }
    case "wood": {
      ctx.fillStyle = hex(PALETTE.wood);
      ctx.fillRect(0, 0, size, size);
      const planks = 6;
      const pw = size / planks;
      for (let p = 0; p < planks; p++) {
        const shade = 0.8 + rng() * 0.4;
        ctx.fillStyle = `rgba(${Math.floor(138 * shade)}, ${Math.floor(106 * shade)}, ${Math.floor(72 * shade)}, 1)`;
        ctx.fillRect(p * pw + 1, 0, pw - 2, size);
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = `rgba(80, 55, 32, ${0.12 + rng() * 0.15})`;
          ctx.lineWidth = 1 + rng();
          ctx.beginPath();
          const gx = p * pw + rng() * pw;
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(gx + 6 * (rng() - 0.5), size * 0.33, gx + 6 * (rng() - 0.5), size * 0.66, gx + 4 * (rng() - 0.5), size);
          ctx.stroke();
        }
      }
      grain(ctx, size, 10, rng);
      break;
    }
    case "ground": {
      ctx.fillStyle = hex(PALETTE.groundDirt);
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 500; i++) {
        const v = rng();
        ctx.fillStyle = v < 0.5
          ? `rgba(160, 135, 95, ${0.1 + rng() * 0.2})`
          : `rgba(225, 205, 165, ${0.08 + rng() * 0.16})`;
        const s = 1 + rng() * 4;
        ctx.fillRect(rng() * size, rng() * size, s, s);
      }
      // dry grass tufts
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(140, 140, 85, ${0.2 + rng() * 0.3})`;
        ctx.lineWidth = 1;
        const x = rng() * size, y = rng() * size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 6, y - 3 - rng() * 5); ctx.stroke();
      }
      grain(ctx, size, 8, rng);
      break;
    }
    case "gravel": {
      ctx.fillStyle = hex(PALETTE.groundPath);
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 800; i++) {
        const v = 0.75 + rng() * 0.5;
        ctx.fillStyle = `rgba(${Math.floor(181 * v)}, ${Math.floor(164 * v)}, ${Math.floor(129 * v)}, 0.9)`;
        const s = 1.5 + rng() * 3;
        ctx.beginPath();
        ctx.ellipse(rng() * size, rng() * size, s, s * 0.8, rng() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      grain(ctx, size, 8, rng);
      break;
    }
    case "concrete": {
      ctx.fillStyle = "#b0aa9c";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = `rgba(90, 85, 75, ${0.15 + rng() * 0.1})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const y = rng() * size;
        ctx.moveTo(0, y); ctx.lineTo(size, y + (rng() - 0.5) * 30);
        ctx.stroke();
      }
      grain(ctx, size, 18, rng);
      break;
    }
    case "metalPanel": {
      ctx.fillStyle = hex(PALETTE.metal);
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "rgba(50, 55, 60, 0.5)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(0, (i * size) / 2); ctx.lineTo(size, (i * size) / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((i * size) / 2, 0); ctx.lineTo((i * size) / 2, size); ctx.stroke();
      }
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = "rgba(40, 45, 50, 0.6)";
        ctx.beginPath();
        ctx.arc(8 + rng() * (size - 16), 8 + rng() * (size - 16), 2, 0, Math.PI * 2);
        ctx.fill();
      }
      grain(ctx, size, 12, rng);
      break;
    }
    default: {
      ctx.fillStyle = "#ff00ff";
      ctx.fillRect(0, 0, size, size);
    }
  }

  const t = finishTexture(c);
  texCache.set(name, t);
  return t;
}

// ---------------------------------------------------------------------------
// Grass: blade-cluster texture on wind-swayed quads
// ---------------------------------------------------------------------------

/** global wind clock — advanced by the main loop, read by grass shaders */
export const WIND = { value: 0 };

let bladeTex: THREE.Texture | null = null;
export function grassBladeTexture(): THREE.Texture {
  if (bladeTex) return bladeTex;
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const rng = seededRandom(4242);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const baseX = 8 + i * 14 + rng() * 8;
    const tipX = baseX + (rng() - 0.5) * 44;
    const tipY = 4 + rng() * 34;
    const w = 4.5 + rng() * 4;
    const grad = ctx.createLinearGradient(0, size, 0, tipY);
    grad.addColorStop(0, "rgb(132, 142, 92)");
    grad.addColorStop(1, "rgb(228, 235, 190)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(baseX - w, size);
    ctx.quadraticCurveTo(baseX - w * 0.4 + (tipX - baseX) * 0.35, 70, tipX, tipY);
    ctx.quadraticCurveTo(baseX + w * 0.4 + (tipX - baseX) * 0.35, 70, baseX + w, size);
    ctx.closePath();
    ctx.fill();
  }
  bladeTex = new THREE.CanvasTexture(c);
  bladeTex.colorSpace = THREE.SRGBColorSpace;
  return bladeTex;
}

let leafTex: THREE.Texture | null = null;
/** cluster of small leaves with gaps — canopy silhouette card */
export function leafCardTexture(): THREE.Texture {
  if (leafTex) return leafTex;
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const rng = seededRandom(7171);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    // cluster density falls off toward the card edges
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.6) * 52;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r * 0.9;
    const s = 5 + rng() * 9;
    const tone = 150 + rng() * 90;
    ctx.fillStyle = `rgb(${Math.floor(tone * 0.85)}, ${Math.floor(tone)}, ${Math.floor(tone * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * (0.55 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

const windMatCache = new Map<string, THREE.MeshStandardMaterial>();
function windMaterial(kind: "grass" | "leaf", tint: number, ampX: number, ampZ: number, bendPow: string): THREE.MeshStandardMaterial {
  const key = `${kind}|${tint}|${ampX}`;
  if (windMatCache.has(key)) return windMatCache.get(key)!;
  const m = new THREE.MeshStandardMaterial({
    map: kind === "grass" ? grassBladeTexture() : leafCardTexture(),
    color: tint,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.92,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindT = WIND;
    shader.vertexShader = "uniform float uWindT;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      {
        float ph = position.x * 1.35 + position.z * 1.1;
        float sway = sin(uWindT * 1.7 + ph) * 0.6 + sin(uWindT * 3.3 + ph * 2.1) * 0.25;
        float bend = ${bendPow};
        transformed.x += sway * ${ampX.toFixed(3)} * bend;
        transformed.z += cos(uWindT * 1.3 + ph * 0.8) * ${ampZ.toFixed(3)} * bend;
      }`
    );
  };
  windMatCache.set(key, m);
  return m;
}

/** tinted, alpha-tested grass material with wind sway (tips move, roots planted) */
export function grassMat(tint: number): THREE.MeshStandardMaterial {
  return windMaterial("grass", tint, 0.11, 0.06, "uv.y * uv.y");
}

/** canopy leaf-card material — whole card rustles gently */
export function leafMat(tint: number): THREE.MeshStandardMaterial {
  return windMaterial("leaf", tint, 0.045, 0.03, "0.5 + uv.y * 0.5");
}

export interface MatOpts {
  map?: string;
  repeat?: [number, number];
  flat?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  rough?: number;
  metal?: number;
}

/** per-texture surface relief strength (bump derived from the color canvas) */
const BUMP_SCALE: Record<string, number> = {
  plaster: 0.5, roof: 0.9, stone: 1.1, wood: 0.4, ground: 0.7,
  gravel: 1.2, concrete: 0.4, metalPanel: 0.35,
};

/**
 * Cached PBR material (MeshStandardMaterial). All world surfaces route
 * through here, so the whole game responds to the environment light.
 */
export function mat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.map ?? ""}|${opts.repeat?.join(",") ?? ""}|${opts.flat ? 1 : 0}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.rough ?? ""}|${opts.metal ?? ""}`;
  if (matCache.has(key)) return matCache.get(key)! as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.88,
    metalness: opts.metal ?? 0.0,
  });
  if (opts.map) {
    const t = texture(opts.map).clone();
    t.needsUpdate = true;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    m.map = t;
    // reuse the color canvas as a bump map: paint grain becomes surface relief
    m.bumpMap = t;
    m.bumpScale = (BUMP_SCALE[opts.map] ?? 0.4) * 0.02;
  }
  if (opts.map === "metalPanel" && opts.metal === undefined) {
    m.metalness = 0.45;
    m.roughness = opts.rough ?? 0.55;
  }
  if (opts.flat) m.flatShading = true;
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  matCache.set(key, m);
  return m;
}
