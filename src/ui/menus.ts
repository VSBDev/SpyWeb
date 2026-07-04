import type { LevelDef } from "../world/levelkit";
import type { MissionStats } from "../game/game";
import type { SaveSystem } from "../core/save";
import { formatTime } from "../core/mathutil";

/**
 * All full-screen DOM (title, mission select, briefing, pause, debrief,
 * game over). One screen at a time; menus never touch the 3D scene.
 */
export class Menus {
  private root: HTMLElement;
  private current: HTMLElement | null = null;
  onHover: () => void = () => {};
  onClick: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
  }

  private mount(el: HTMLElement) {
    this.clear();
    this.current = el;
    this.root.appendChild(el);
    el.querySelectorAll(".btn, .mission-card").forEach((b) => {
      b.addEventListener("mouseenter", () => this.onHover());
    });
  }

  clear() {
    this.current?.remove();
    this.current = null;
  }

  private screen(dim: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = "screen" + (dim ? " dim" : "");
    return el;
  }

  private btn(label: string, cls = ""): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = ("btn " + cls).trim();
    b.textContent = label;
    return b;
  }

  // --------------------------------------------------------------------------

  showTitle(onStart: () => void, save?: SaveSystem, audio?: { setVolumes(m: number, s: number): void }) {
    const el = this.screen(false);
    el.innerHTML = `
      <div class="title-logo">SPY<span class="accent">WEB</span></div>
      <div class="title-sub">A Mediterranean Infiltration</div>
      <div class="title-strip"></div>
    `;
    const buttons = document.createElement("div");
    buttons.className = "menu-buttons";
    const start = this.btn("Infiltrate");
    start.addEventListener("click", () => { this.onClick(); onStart(); });
    buttons.appendChild(start);
    if (save && audio) {
      const st = this.btn("Settings", "small");
      let panel: HTMLElement | null = null;
      st.addEventListener("click", () => {
        this.onClick();
        if (panel) { panel.remove(); panel = null; return; }
        panel = this.settingsPanel(save, audio);
        buttons.appendChild(panel);
      });
      buttons.appendChild(st);
    }
    el.appendChild(buttons);
    const foot = document.createElement("div");
    foot.className = "screen-footer";
    foot.textContent = "Riviera di Levante · 1963 · Keyboard + mouse or gamepad · Headphones recommended";
    el.appendChild(foot);
    this.mount(el);
  }

  showMissionSelect(levels: LevelDef[], save: SaveSystem, order: string[], onPick: (def: LevelDef) => void, onBack: () => void) {
    const el = this.screen(true);
    el.innerHTML = `
      <div class="title-logo" style="font-size:44px">OPERATIONS</div>
      <div class="title-sub" style="letter-spacing:0.4em">Select your target</div>
    `;
    const grid = document.createElement("div");
    grid.className = "mission-grid";
    levels.forEach((def, i) => {
      const unlocked = save.isUnlocked(i, order);
      const rec = save.getMission(def.id);
      const card = document.createElement("div");
      card.className = "mission-card" + (unlocked ? "" : " locked");
      card.innerHTML = `
        <div class="m-num">${def.tag}</div>
        <div class="m-name">${def.name}</div>
        <div class="m-desc">${unlocked ? def.cardBlurb : "Complete the previous operation to decrypt this dossier."}</div>
        <div class="m-rank ${rec.bestRank === "GHOST" ? "gold" : ""}">${rec.completed ? `★ ${rec.bestRank} · ${formatTime(rec.bestTime)}` : unlocked ? "— no record —" : ""}</div>
        ${unlocked ? "" : `<div class="m-lock">🔒</div>`}
      `;
      if (unlocked) card.addEventListener("click", () => { this.onClick(); onPick(def); });
      grid.appendChild(card);
    });
    el.appendChild(grid);
    const back = this.btn("Back", "small");
    back.style.marginTop = "30px";
    back.addEventListener("click", () => { this.onClick(); onBack(); });
    el.appendChild(back);
    this.mount(el);
  }

  showBriefing(def: LevelDef, onStart: () => void, onBack: () => void) {
    const el = this.screen(true);
    const panel = document.createElement("div");
    panel.className = "brief-panel";
    const objectives = def.objectives
      .map((o) => `<div>${o.label}${o.optional ? " (optional)" : ""}</div>`)
      .join("") + `<div>${def.exfil.label}</div>`;
    panel.innerHTML = `
      <h2>${def.tag} · Operation Briefing</h2>
      <h1>${def.name}</h1>
      <div class="brief-body">${def.briefing}</div>
      <div class="brief-objectives">${objectives}</div>
    `;
    const actions = document.createElement("div");
    actions.className = "brief-actions";
    const back = this.btn("Back", "small");
    back.addEventListener("click", () => { this.onClick(); onBack(); });
    const go = this.btn("Commence", "small");
    go.addEventListener("click", () => { this.onClick(); onStart(); });
    actions.appendChild(back);
    actions.appendChild(go);
    panel.appendChild(actions);
    el.appendChild(panel);
    this.mount(el);
  }

  showPause(save: SaveSystem, audio: { setVolumes(m: number, s: number): void }, onResume: () => void, onRestart: () => void, onQuit: () => void) {
    const el = this.screen(true);
    el.innerHTML = `<div class="overlay-title">PAUSED</div><div class="overlay-sub">The web waits.</div>`;
    const buttons = document.createElement("div");
    buttons.className = "menu-buttons";
    const r = this.btn("Resume");
    r.addEventListener("click", () => { this.onClick(); onResume(); });
    const re = this.btn("Restart Mission");
    re.addEventListener("click", () => { this.onClick(); onRestart(); });
    const q = this.btn("Abort to Operations");
    q.addEventListener("click", () => { this.onClick(); onQuit(); });
    buttons.append(r, re, q);
    el.appendChild(buttons);
    el.appendChild(this.settingsPanel(save, audio));
    this.mount(el);
  }

  /** inline settings block used on the pause screen and title */
  settingsPanel(save: SaveSystem, audio: { setVolumes(m: number, s: number): void }): HTMLElement {
    const s = save.data.settings;
    const panel = document.createElement("div");
    panel.className = "settings-panel";
    const row = (label: string, input: HTMLElement) => {
      const r = document.createElement("div");
      r.className = "settings-row";
      const l = document.createElement("span");
      l.textContent = label;
      r.append(l, input);
      return r;
    };
    const slider = (value: number, min: number, max: number, onInput: (v: number) => void) => {
      const i = document.createElement("input");
      i.type = "range";
      i.min = String(min); i.max = String(max); i.step = "0.05";
      i.value = String(value);
      i.addEventListener("input", () => { onInput(parseFloat(i.value)); save.persist(); });
      return i;
    };
    panel.appendChild(row("Music", slider(s.musicVolume, 0, 1, (v) => { s.musicVolume = v; audio.setVolumes(s.musicVolume, s.sfxVolume); })));
    panel.appendChild(row("Effects", slider(s.sfxVolume, 0, 1, (v) => { s.sfxVolume = v; audio.setVolumes(s.musicVolume, s.sfxVolume); })));
    panel.appendChild(row("Sensitivity", slider(s.sensitivity, 0.3, 2.5, (v) => { s.sensitivity = v; })));
    const inv = document.createElement("input");
    inv.type = "checkbox";
    inv.checked = s.invertY;
    inv.addEventListener("change", () => { s.invertY = inv.checked; save.persist(); });
    panel.appendChild(row("Invert Y", inv));
    return panel;
  }

  showDebrief(def: LevelDef, stats: MissionStats, isNewBest: boolean, hasNext: boolean, onNext: () => void, onReplay: () => void, onQuit: () => void) {
    const el = this.screen(true);
    const panel = document.createElement("div");
    panel.className = "brief-panel";
    panel.innerHTML = `
      <h2>${def.tag} · Mission Debrief</h2>
      <h1>${def.name} — COMPLETE</h1>
      <div class="debrief-rank">${stats.rank}</div>
      <div class="debrief-rank-label">${stats.ghost ? "no trace · no bodies · no alarms" : isNewBest ? "new personal best" : "operation rating"}</div>
      <div class="debrief-stats" style="justify-content:center">
        <div class="stat"><div class="v">${formatTime(stats.time)}</div><div class="k">Time</div></div>
        <div class="stat"><div class="v">${stats.kills}</div><div class="k">Kills</div></div>
        <div class="stat"><div class="v">${stats.spotted}</div><div class="k">Spotted</div></div>
        <div class="stat"><div class="v">${stats.alarms}</div><div class="k">Alarms</div></div>
      </div>
      ${def.epilogue ? `<div class="brief-body" style="border-top:1px solid rgba(217,164,65,0.3); padding-top:16px; margin-top:4px;">${def.epilogue}</div>` : ""}
    `;
    const actions = document.createElement("div");
    actions.className = "brief-actions";
    if (hasNext) {
      const n = this.btn("Next Operation", "small");
      n.addEventListener("click", () => { this.onClick(); onNext(); });
      actions.appendChild(n);
    }
    const rp = this.btn("Replay", "small");
    rp.addEventListener("click", () => { this.onClick(); onReplay(); });
    const q = this.btn("Operations", "small");
    q.addEventListener("click", () => { this.onClick(); onQuit(); });
    actions.append(rp, q);
    panel.appendChild(actions);
    el.appendChild(panel);
    this.mount(el);
  }

  showGameOver(reason: string, onCheckpoint: (() => void) | null, onRetry: () => void, onQuit: () => void) {
    const el = this.screen(true);
    el.innerHTML = `<div class="overlay-title gameover-title">MISSION FAILED</div><div class="overlay-sub">${reason}</div>`;
    const buttons = document.createElement("div");
    buttons.className = "menu-buttons";
    if (onCheckpoint) {
      const c = this.btn("Retry from Checkpoint");
      c.addEventListener("click", () => { this.onClick(); onCheckpoint(); });
      buttons.appendChild(c);
    }
    const r = this.btn(onCheckpoint ? "Restart Mission" : "Retry Mission");
    r.addEventListener("click", () => { this.onClick(); onRetry(); });
    const q = this.btn("Abort to Operations");
    q.addEventListener("click", () => { this.onClick(); onQuit(); });
    buttons.append(r, q);
    el.appendChild(buttons);
    this.mount(el);
  }
}
