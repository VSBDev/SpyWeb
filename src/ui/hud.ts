import type { ObjectiveState } from "../game/objectives";

export type AlertLevel = "calm" | "suspicious" | "search" | "combat";

/**
 * In-mission HUD, plain DOM over the canvas.
 */
export class HUD {
  private root: HTMLElement;
  private el: HTMLElement;
  private objList: HTMLElement;
  private alertEl: HTMLElement;
  private healthEl: HTMLElement;
  private gearEl: HTMLElement;
  private promptEl: HTMLElement;
  private crosshair: HTMLElement;
  private toastEl: HTMLElement;
  private tacticalEl: HTMLElement;
  private vignette: HTMLElement;
  private detectRing: HTMLElement;
  private toastTimer: number | null = null;
  private ticks: HTMLElement[] = [];

  constructor(uiRoot: HTMLElement) {
    this.root = uiRoot;
    this.el = document.createElement("div");
    this.el.id = "hud";
    this.el.innerHTML = `
      <div class="hud-objectives"><div class="obj-title">Objectives</div><div class="obj-list"></div></div>
      <div class="hud-alert calm"></div>
      <canvas class="hud-minimap" width="180" height="180"></canvas>
      <div class="hud-bottom-left">
        <div class="hud-health"></div>
        <div class="hud-gear"></div>
      </div>
      <div class="hud-prompt"></div>
      <div class="hud-crosshair"></div>
      <div class="hud-hitmarker"></div>
      <div class="hud-interact-ring"><div class="ring-fill"></div></div>
      <div class="hud-toast"></div>
      <div id="detect-ring"></div>
      <div id="tactical-overlay"><div class="tac-label">■ Recon Uplink Active ■</div></div>
      <div id="damage-vignette"></div>
      <div id="reflex-overlay"><div class="reflex-label">REFLEX — drop him before he calls it in</div></div>
      <div class="hud-subtitle"></div>
      <div class="letterbox top"></div>
      <div class="letterbox bottom"></div>
      <div class="hud-controls-hint">
        <span class="key">WASD</span> move&nbsp; <span class="key">SHIFT</span> run&nbsp; <span class="key">C</span> crouch<br>
        <span class="key">Q</span>/<span class="key">RMB</span> aim toggle&nbsp; <span class="key">LMB</span> fire&nbsp; <span class="key">E</span> action&nbsp; <span class="key">F</span> drag body<br>
        <span class="key">G</span> stone&nbsp; <span class="key">1</span> smoke&nbsp; <span class="key">2</span> decoy&nbsp; <span class="key">3</span> EMP<br>
        <span class="key">SPACE</span> cover&nbsp; <span class="key">TAB</span> recon cam&nbsp; <span class="key">ESC</span> pause
      </div>
    `;
    uiRoot.appendChild(this.el);
    this.objList = this.el.querySelector(".obj-list")!;
    this.alertEl = this.el.querySelector(".hud-alert")!;
    this.healthEl = this.el.querySelector(".hud-health")!;
    this.gearEl = this.el.querySelector(".hud-gear")!;
    this.promptEl = this.el.querySelector(".hud-prompt")!;
    this.crosshair = this.el.querySelector(".hud-crosshair")!;
    this.toastEl = this.el.querySelector(".hud-toast")!;
    this.tacticalEl = this.el.querySelector("#tactical-overlay")!;
    this.vignette = this.el.querySelector("#damage-vignette")!;
    this.detectRing = this.el.querySelector("#detect-ring")!;
  }

  show() { this.el.classList.add("visible"); }
  hide() { this.el.classList.remove("visible"); this.setPrompt(null); }

  setObjectives(states: ObjectiveState[], exfilActive: boolean, exfilLabel: string) {
    let html = "";
    for (const s of states) {
      const cls = ["obj"];
      if (s.done) cls.push("done");
      if (s.def.optional) cls.push("optional");
      html += `<div class="${cls.join(" ")}">${s.def.label}${s.def.optional ? " (optional)" : ""}</div>`;
    }
    if (exfilActive) html += `<div class="obj" style="color:#ffd479">${exfilLabel}</div>`;
    this.objList.innerHTML = html;
  }

  setAlert(level: AlertLevel) {
    this.alertEl.className = `hud-alert ${level}`;
    this.alertEl.textContent =
      level === "combat" ? "!! COMPROMISED !!"
      : level === "search" ? "AREA SEARCH"
      : level === "suspicious" ? "SUSPICION"
      : "";
  }

  setHealth(hp: number, max: number) {
    let html = "";
    for (let i = 0; i < max; i++) {
      const cls = hp >= i + 1 ? "pip on" : hp > i ? "pip hurt" : "pip";
      html += `<div class="${cls}"></div>`;
    }
    this.healthEl.innerHTML = html;
    const missing = 1 - hp / max;
    this.vignette.style.boxShadow = `inset 0 0 ${90 + missing * 120}px rgba(209, 75, 58, ${missing * 0.55})`;
  }

  setGear(ammo: number, stones: number, smoke = 0, decoys = 0, emp = 0) {
    const slot = (icon: string, label: string, n: number, key?: string) =>
      `<span class="${n <= 0 ? "gear-empty" : ""}"><span class="g-icon">${icon}</span> ${label} ×${n}${key ? ` <span class="g-key">[${key}]</span>` : ""}</span>`;
    this.gearEl.innerHTML =
      slot("▮", "P7-S", ammo) +
      slot("●", "Stone", stones, "G") +
      slot("▒", "Smoke", smoke, "1") +
      slot("♪", "Decoy", decoys, "2") +
      slot("⚡", "EMP", emp, "3");
  }

  setPrompt(html: string | null) {
    if (html) {
      this.promptEl.innerHTML = html;
      this.promptEl.classList.add("visible");
    } else {
      this.promptEl.classList.remove("visible");
    }
  }

  setAiming(aiming: boolean) {
    this.crosshair.className = aiming ? "hud-crosshair aim" : "hud-crosshair";
    this.crosshair.style.display = aiming ? "block" : "none";
  }

  setTactical(on: boolean) {
    this.tacticalEl.classList.toggle("visible", on);
  }

  private subtitleEl: HTMLElement | null = null;
  private subtitleTimer: number | null = null;

  subtitle(speaker: string, text: string, ms = 2400) {
    if (!this.subtitleEl) this.subtitleEl = this.el.querySelector(".hud-subtitle");
    const el = this.subtitleEl!;
    el.innerHTML = `<span class="sub-speaker">${speaker}</span> ${text}`;
    el.classList.add("visible");
    if (this.subtitleTimer) clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => el.classList.remove("visible"), ms);
  }

  private hitTimer: number | null = null;

  /** flash the crosshair hit-marker; red on kill */
  hitMarker(kill: boolean) {
    const el = this.el.querySelector(".hud-hitmarker") as HTMLElement;
    el.classList.remove("show", "kill");
    void el.offsetWidth; // restart the animation
    el.classList.add("show");
    if (kill) el.classList.add("kill");
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => el.classList.remove("show", "kill"), 260);
  }

  private ringEl: HTMLElement | null = null;
  private ringFillEl: HTMLElement | null = null;
  private ringVisible = false;

  /** radial hold-to-interact progress; null hides. No DOM work unless state changes. */
  setProgress(p: number | null) {
    if (p === null && !this.ringVisible) return;
    if (!this.ringEl) {
      this.ringEl = this.el.querySelector(".hud-interact-ring") as HTMLElement;
      this.ringFillEl = this.ringEl.querySelector(".ring-fill") as HTMLElement;
    }
    if (p === null) {
      this.ringEl.classList.remove("visible");
      this.ringVisible = false;
      return;
    }
    if (!this.ringVisible) {
      this.ringEl.classList.add("visible");
      this.ringVisible = true;
    }
    this.ringFillEl!.style.background = `conic-gradient(var(--gold) ${Math.floor(p * 360)}deg, rgba(242,232,213,0.15) 0deg)`;
  }

  // ---- minimap ----
  private mmStatic: HTMLCanvasElement | null = null;
  private mmScale = 2.5;                 // px per metre
  private mmBounds = { minX: 0, minZ: 0 };
  private mmCanvas: HTMLCanvasElement | null = null;

  /** prerender the static wall layer once per mission */
  initMinimap(colliders: { minX: number; maxX: number; minZ: number; maxZ: number; height: number; solid: boolean }[], bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    this.mmCanvas = this.el.querySelector(".hud-minimap") as HTMLCanvasElement;
    this.mmBounds = { minX: bounds.minX, minZ: bounds.minZ };
    const w = Math.ceil((bounds.maxX - bounds.minX) * this.mmScale);
    const h = Math.ceil((bounds.maxZ - bounds.minZ) * this.mmScale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(18, 22, 21, 0.9)";
    ctx.fillRect(0, 0, w, h);
    for (const col of colliders) {
      if (!col.solid) continue;
      ctx.fillStyle = col.height >= 1.5 ? "rgba(196, 188, 165, 0.85)" : "rgba(120, 116, 100, 0.5)";
      ctx.fillRect(
        (col.minX - bounds.minX) * this.mmScale,
        (col.minZ - bounds.minZ) * this.mmScale,
        Math.max(1.5, (col.maxX - col.minX) * this.mmScale),
        Math.max(1.5, (col.maxZ - col.minZ) * this.mmScale)
      );
    }
    this.mmStatic = c;
  }

  /** per-frame dynamic layer: player, guards by state, objectives, exfil */
  drawMinimap(
    px: number, pz: number, pyaw: number,
    guards: { x: number; z: number; state: string; dead: boolean }[],
    objectives: { x: number; z: number; done: boolean }[],
    exfil: { x: number; z: number; active: boolean }
  ) {
    if (!this.mmCanvas || !this.mmStatic) return;
    const ctx = this.mmCanvas.getContext("2d")!;
    const S = 180, half = S / 2, sc = this.mmScale;
    ctx.clearRect(0, 0, S, S);
    // static layer centred on the player
    const ox = (px - this.mmBounds.minX) * sc - half;
    const oz = (pz - this.mmBounds.minZ) * sc - half;
    ctx.drawImage(this.mmStatic, -ox, -oz);
    const toMap = (x: number, z: number): [number, number] =>
      [(x - this.mmBounds.minX) * sc - ox, (z - this.mmBounds.minZ) * sc - oz];
    // objectives
    for (const o of objectives) {
      if (o.done) continue;
      const [mx, mz] = toMap(o.x, o.z);
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#d9a441";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    // exfil
    if (exfil.active) {
      const [mx, mz] = toMap(exfil.x, exfil.z);
      ctx.strokeStyle = "#d9a441";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, mz, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // guards
    for (const g of guards) {
      if (g.dead) continue;
      const [mx, mz] = toMap(g.x, g.z);
      if (mx < -4 || mx > S + 4 || mz < -4 || mz > S + 4) continue;
      ctx.fillStyle = g.state === "combat" || g.state === "alarm-run" ? "#ff5c44"
        : g.state === "search" || g.state === "investigate" || g.state === "suspicious" ? "#ffc24f"
        : "#4fd8c8";
      ctx.beginPath();
      ctx.arc(mx, mz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow (character yaw: forward = (sin, cos) in world XZ)
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(Math.atan2(Math.sin(pyaw), Math.cos(pyaw)) * -1 + Math.PI);
    ctx.fillStyle = "#f6efdf";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  setReflex(on: boolean) {
    this.el.querySelector("#reflex-overlay")!.classList.toggle("visible", on);
  }

  setLetterbox(on: boolean) {
    this.el.querySelectorAll(".letterbox").forEach((l) => l.classList.toggle("active", on));
  }

  toast(text: string, sub?: string, ms = 2600) {
    this.toastEl.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : "");
    this.toastEl.classList.add("visible");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("visible"), ms);
  }

  /**
   * Detection direction ticks around screen center.
   * Each entry: bearing (radians, screen-relative: 0 = up) + strength 0..1 + hot flag.
   */
  setDetectionTicks(entries: { bearing: number; strength: number; hot: boolean }[]) {
    while (this.ticks.length < entries.length) {
      const d = document.createElement("div");
      d.className = "detect-tick";
      d.innerHTML = `<div class="fill"></div>`;
      this.detectRing.appendChild(d);
      this.ticks.push(d);
    }
    for (let i = 0; i < this.ticks.length; i++) {
      const t = this.ticks[i];
      if (i >= entries.length) { t.style.display = "none"; continue; }
      const e = entries[i];
      t.style.display = "block";
      const r = 70;
      t.style.transform = `rotate(${(e.bearing * 180) / Math.PI}deg) translateY(-${r + 34}px)`;
      t.style.color = e.hot ? "#ff5c44" : "#ffd479";
      (t.firstElementChild as HTMLElement).style.opacity = String(0.25 + e.strength * 0.75);
      (t.firstElementChild as HTMLElement).style.transform = `scaleY(${0.4 + e.strength * 0.6})`;
    }
  }

  destroy() {
    this.el.remove();
  }
}
