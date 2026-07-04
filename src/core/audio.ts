/**
 * SpyWeb audio: everything is synthesized with WebAudio — no sample files.
 *  - SFX bus: footsteps, suppressed shots, takedowns, stones, alarms, UI.
 *  - Ambience bus: cicadas / night crickets / sea, per level.
 *  - Music bus: a 16-step sequenced spy score whose layers follow the alert
 *    state (calm -> suspicious -> search -> combat).
 */

export type MusicState = "off" | "calm" | "suspicious" | "search" | "combat";
export type AmbienceKind = "day" | "night" | "sea" | "none";

export class AudioEngine {
  ctx: AudioContext;
  private master: GainNode;
  private sfxBus: GainNode;
  private musicBus: GainNode;
  private ambBus: GainNode;
  private noiseBuf: AudioBuffer;

  // --- music sequencer state ---
  private musicState: MusicState = "off";
  private pendingState: MusicState = "off";
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;
  private bpm = 104;
  private alarmNodes: { stop(): void } | null = null;
  private ambNodes: AudioNode[] = [];
  private started = false;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.ambBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.musicBus.gain.value = 0.55;
    this.ambBus.gain.value = 0.5;

    // shared noise buffer (2s white noise)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** must be called from a user gesture */
  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.nextStepTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.pump(), 25);
    }
  }

  setVolumes(music: number, sfx: number) {
    this.musicBus.gain.value = 0.55 * music;
    this.sfxBus.gain.value = sfx;
    this.ambBus.gain.value = 0.5 * sfx;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private env(node: GainNode, t: number, peak: number, attack: number, decay: number) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noise(t: number, dur: number, dest: AudioNode): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.loopStart = Math.random() * 1.5;
    s.connect(dest);
    s.start(t);
    s.stop(t + dur + 0.05);
    return s;
  }

  /** simple positional attenuation: volume from distance to listener */
  private distGain(dist: number, radius: number): number {
    if (dist >= radius) return 0;
    const v = 1 - dist / radius;
    return v * v;
  }

  // =========================================================================
  // SFX
  // =========================================================================

  footstep(run: boolean, crouch: boolean, grass: boolean) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = grass ? 900 : 1600;
    g.connect(f); f.connect(this.sfxBus);
    const vol = crouch ? 0.045 : run ? 0.16 : 0.085;
    this.env(g, t, vol, 0.004, grass ? 0.07 : 0.055);
    this.noise(t, 0.1, g);
    if (!grass) {
      // gravel tick
      const g2 = this.ctx.createGain();
      const f2 = this.ctx.createBiquadFilter();
      f2.type = "bandpass"; f2.frequency.value = 3200 + Math.random() * 1500; f2.Q.value = 2;
      g2.connect(f2); f2.connect(this.sfxBus);
      this.env(g2, t, vol * 0.5, 0.002, 0.03);
      this.noise(t, 0.05, g2);
    }
  }

  suppressedShot() {
    const t = this.ctx.currentTime;
    // thump
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, 0.5, 0.003, 0.09);
    const o = this.osc("sine", 160, t, 0.12, g);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    // mechanical click / air burst
    const g2 = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 1.2;
    g2.connect(f); f.connect(this.sfxBus);
    this.env(g2, t, 0.3, 0.001, 0.06);
    this.noise(t, 0.09, g2);
  }

  guardShot(dist: number) {
    const v = this.distGain(dist, 90) * 0.9 + 0.08;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, v, 0.002, 0.22);
    const o = this.osc("sawtooth", 220, t, 0.25, g);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g2 = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 1200;
    g2.connect(f); f.connect(this.sfxBus);
    this.env(g2, t, v * 0.8, 0.001, 0.12);
    this.noise(t, 0.16, g2);
  }

  /** crisp confirmation tick when your shot connects */
  hitTick(kill: boolean) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, kill ? 0.16 : 0.1, 0.002, kill ? 0.12 : 0.06);
    this.osc("square", kill ? 620 : 900, t, 0.06, g);
    if (kill) this.osc("square", 465, t + 0.05, 0.08, g);
  }

  /** supersonic crack of a near miss */
  bulletWhiz() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 2.2;
    f.frequency.setValueAtTime(5200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.22, 0.002, 0.09);
    this.noise(t, 0.12, g);
  }

  checkpoint() {
    const t = this.ctx.currentTime;
    for (const [i, fr] of [392, 523.25].entries()) {
      const g = this.ctx.createGain();
      g.connect(this.sfxBus);
      this.env(g, t + i * 0.09, 0.1, 0.01, 0.22);
      this.osc("triangle", fr, t + i * 0.09, 0.26, g);
    }
  }

  ricochet() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 6;
    f.frequency.setValueAtTime(3800, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.14);
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.12, 0.002, 0.13);
    this.noise(t, 0.16, g);
  }

  takedown() {
    const t = this.ctx.currentTime;
    // whoosh
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.13);
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.22, 0.02, 0.12);
    this.noise(t, 0.18, g);
    // thud
    const t2 = t + 0.16;
    const g2 = this.ctx.createGain();
    g2.connect(this.sfxBus);
    this.env(g2, t2, 0.4, 0.004, 0.12);
    const o = this.osc("sine", 120, t2, 0.15, g2);
    o.frequency.exponentialRampToValueAtTime(40, t2 + 0.12);
  }

  bodyFall(dist: number) {
    const v = this.distGain(dist, 26) * 0.5;
    if (v <= 0.01) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 500;
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, v, 0.006, 0.16);
    this.noise(t, 0.2, g);
    const o = this.osc("sine", 90, t, 0.14, g);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
  }

  stoneThrow() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 1;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.09, 0.02, 0.14);
    this.noise(t, 0.2, g);
  }

  stoneLand(dist: number) {
    const v = this.distGain(dist, 40) * 0.55 + 0.03;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * (0.07 + Math.random() * 0.04);
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 2600 + Math.random() * 1800; f.Q.value = 4;
      g.connect(f); f.connect(this.sfxBus);
      this.env(g, tt, v * (1 - i * 0.3), 0.002, 0.05);
      this.noise(tt, 0.07, g);
    }
  }

  guardAlert(kind: "curious" | "spotted" | "radio") {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    if (kind === "curious") {
      this.env(g, t, 0.12, 0.02, 0.25);
      const o = this.osc("triangle", 340, t, 0.3, g);
      o.frequency.setValueAtTime(340, t);
      o.frequency.linearRampToValueAtTime(430, t + 0.22);
    } else if (kind === "spotted") {
      this.env(g, t, 0.2, 0.01, 0.3);
      const o = this.osc("square", 520, t, 0.14, g);
      o.frequency.setValueAtTime(520, t);
      const o2 = this.osc("square", 690, t + 0.13, 0.2, g);
      o2.frequency.setValueAtTime(690, t + 0.13);
    } else {
      // radio static burst
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 1.5;
      g.disconnect(); g.connect(f); f.connect(this.sfxBus);
      this.env(g, t, 0.09, 0.01, 0.28);
      this.noise(t, 0.32, g);
      const g2 = this.ctx.createGain();
      g2.connect(this.sfxBus);
      this.env(g2, t + 0.05, 0.06, 0.01, 0.1);
      this.osc("square", 1100, t + 0.05, 0.1, g2);
    }
  }

  /** radio-filtered voice gibberish: syllable blips with a pitch contour per mood */
  bark(kind: "curious" | "investigate" | "spotted" | "search" | "lost" | "body" | "alarm", dist: number) {
    const v = this.distGain(dist, 40) * 0.55 + 0.05;
    const t0 = this.ctx.currentTime;
    const contours: Record<string, { n: number; base: number; step: number; rate: number }> = {
      curious: { n: 2, base: 200, step: 30, rate: 0.16 },
      investigate: { n: 3, base: 190, step: 6, rate: 0.13 },
      spotted: { n: 3, base: 260, step: 22, rate: 0.09 },
      search: { n: 4, base: 220, step: -10, rate: 0.11 },
      lost: { n: 3, base: 210, step: -26, rate: 0.17 },
      body: { n: 4, base: 250, step: 14, rate: 0.09 },
      alarm: { n: 3, base: 270, step: 18, rate: 0.08 },
    };
    const c = contours[kind];
    for (let i = 0; i < c.n; i++) {
      const t = t0 + i * c.rate;
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 1.1;
      g.connect(f); f.connect(this.sfxBus);
      this.env(g, t, v * (0.7 + Math.random() * 0.4), 0.012, c.rate * 0.7);
      const o = this.osc("sawtooth", c.base + i * c.step + Math.random() * 24, t, c.rate, g);
      o.frequency.linearRampToValueAtTime(c.base + i * c.step - 22, t + c.rate * 0.8);
    }
  }

  /** sharp orchestral hit when the player is spotted */
  stinger() {
    const t = this.ctx.currentTime;
    for (const fr of [98, 116.5, 146.8, 293.7]) { // G, Bb, D minor-ish stack
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(400, t + 0.7);
      g.connect(f); f.connect(this.musicBus);
      this.env(g, t, 0.16, 0.008, 0.85);
      const o = this.osc("sawtooth", fr, t, 0.95, g);
      o.detune.value = (Math.random() - 0.5) * 12;
    }
    // cymbal-ish noise swell
    const g2 = this.ctx.createGain();
    const f2 = this.ctx.createBiquadFilter();
    f2.type = "highpass"; f2.frequency.value = 5200;
    g2.connect(f2); f2.connect(this.musicBus);
    this.env(g2, t, 0.14, 0.006, 0.6);
    this.noise(t, 0.7, g2);
  }

  interact() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, 0.14, 0.005, 0.12);
    this.osc("triangle", 660, t, 0.08, g);
    this.osc("triangle", 990, t + 0.07, 0.1, g);
  }

  objectiveComplete() {
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const g = this.ctx.createGain();
      g.connect(this.sfxBus);
      this.env(g, t + i * 0.1, 0.13, 0.01, 0.3);
      this.osc("triangle", f, t + i * 0.1, 0.35, g);
    });
  }

  playerHurt() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 700;
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.4, 0.004, 0.18);
    this.noise(t, 0.2, g);
    const o = this.osc("sawtooth", 140, t, 0.18, g);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.16);
  }

  heartbeat() {
    const t = this.ctx.currentTime;
    for (const dt of [0, 0.18]) {
      const g = this.ctx.createGain();
      g.connect(this.sfxBus);
      this.env(g, t + dt, dt === 0 ? 0.22 : 0.14, 0.008, 0.1);
      const o = this.osc("sine", 65, t + dt, 0.12, g);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.1);
    }
  }

  smokePop(dist: number) {
    const v = this.distGain(dist, 30) * 0.6 + 0.1;
    const t = this.ctx.currentTime;
    // foom
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, v * 0.7, 0.01, 0.18);
    const o = this.osc("sine", 130, t, 0.2, g);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.16);
    // hiss tail
    const g2 = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 0.7;
    g2.connect(f); f.connect(this.sfxBus);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(v * 0.25, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    this.noise(t, 2.3, g2);
  }

  decoyBeep(dist: number) {
    const v = this.distGain(dist, 40) * 0.5 + 0.03;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, v, 0.005, 0.14);
    this.osc("square", 980, t, 0.09, g);
    this.osc("square", 1240, t + 0.09, 0.08, g);
  }

  empZap() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(6000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.4, 0.004, 0.4);
    this.noise(t, 0.45, g);
    const g2 = this.ctx.createGain();
    g2.connect(this.sfxBus);
    this.env(g2, t, 0.25, 0.002, 0.3);
    const o = this.osc("sawtooth", 320, t, 0.32, g2);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  }

  camBeep() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, 0.08, 0.004, 0.09);
    this.osc("square", 1560, t, 0.1, g);
  }

  sparks() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 3000;
    g.connect(f); f.connect(this.sfxBus);
    this.env(g, t, 0.22, 0.002, 0.16);
    this.noise(t, 0.2, g);
    const g2 = this.ctx.createGain();
    g2.connect(this.sfxBus);
    this.env(g2, t, 0.12, 0.002, 0.05);
    this.osc("square", 2400, t, 0.06, g2);
  }

  pickup() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, 0.12, 0.005, 0.16);
    this.osc("triangle", 740, t, 0.09, g);
    this.osc("triangle", 1108, t + 0.07, 0.12, g);
  }

  uiClick() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, 0.1, 0.003, 0.07);
    this.osc("square", 880, t, 0.06, g);
  }

  uiHover() {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.sfxBus);
    this.env(g, t, 0.04, 0.003, 0.05);
    this.osc("sine", 1320, t, 0.05, g);
  }

  startAlarm() {
    if (this.alarmNodes) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.sfxBus);
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 160;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    o.frequency.value = 460;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1400;
    o.connect(f); f.connect(g);
    o.start(); lfo.start();
    g.gain.linearRampToValueAtTime(0.055, this.ctx.currentTime + 0.4);
    this.alarmNodes = {
      stop: () => {
        g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
        setTimeout(() => { o.stop(); lfo.stop(); }, 800);
      },
    };
  }

  stopAlarm() {
    this.alarmNodes?.stop();
    this.alarmNodes = null;
  }

  // =========================================================================
  // Ambience
  // =========================================================================

  setAmbience(kind: AmbienceKind) {
    for (const n of this.ambNodes) {
      try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* already stopped */ }
      n.disconnect();
    }
    this.ambNodes = [];
    if (kind === "none") return;

    // base wind/sea bed: filtered looping noise
    const bed = this.ctx.createBufferSource();
    bed.buffer = this.noiseBuf; bed.loop = true;
    const bedF = this.ctx.createBiquadFilter();
    bedF.type = "lowpass";
    bedF.frequency.value = kind === "sea" ? 420 : 260;
    const bedG = this.ctx.createGain();
    bedG.gain.value = kind === "sea" ? 0.055 : 0.028;
    // slow swell LFO
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = kind === "sea" ? 0.09 : 0.05;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = bedG.gain.value * 0.5;
    lfo.connect(lfoG); lfoG.connect(bedG.gain);
    bed.connect(bedF); bedF.connect(bedG); bedG.connect(this.ambBus);
    bed.start(); lfo.start();
    this.ambNodes.push(bed, lfo, bedG, bedF, lfoG);

    // cicadas (day) or crickets (night): amplitude-modulated bandpassed noise
    if (kind === "day" || kind === "night") {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true; src.loopStart = 0.7;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = kind === "day" ? 4200 : 3400;
      f.Q.value = kind === "day" ? 9 : 22;
      const am = this.ctx.createGain();
      const amLfo = this.ctx.createOscillator();
      amLfo.type = "sine";
      amLfo.frequency.value = kind === "day" ? 24 : 9;
      const amLfoG = this.ctx.createGain();
      amLfoG.gain.value = 0.5;
      am.gain.value = 0.5;
      amLfo.connect(amLfoG); amLfoG.connect(am.gain);
      const out = this.ctx.createGain();
      out.gain.value = kind === "day" ? 0.016 : 0.012;
      src.connect(f); f.connect(am); am.connect(out); out.connect(this.ambBus);
      src.start(); amLfo.start();
      this.ambNodes.push(src, amLfo, f, am, out, amLfoG);
    }
  }

  // =========================================================================
  // Music: 16-step sequencer, spy score in E minor
  // =========================================================================

  setMusicState(s: MusicState) {
    this.pendingState = s;
    if (this.musicState === "off" && s !== "off") this.musicState = s; // start immediately
  }

  private pump() {
    const lookahead = 0.15;
    const stepDur = 60 / this.bpm / 4; // 16th notes
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      if (this.step % 16 === 0) this.musicState = this.pendingState; // state changes on bar lines
      if (this.musicState !== "off") this.scheduleStep(this.step % 32, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private pluck(freq: number, t: number, vol: number, bright = 1800) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(bright, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.28);
    g.connect(f); f.connect(this.musicBus);
    this.env(g, t, vol, 0.004, 0.3);
    this.osc("sawtooth", freq, t, 0.35, g);
    const o2 = this.osc("square", freq * 0.5, t, 0.35, g);
    o2.detune.value = 4;
  }

  private bassNote(freq: number, t: number, vol: number, dur = 0.22) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 420;
    g.connect(f); f.connect(this.musicBus);
    this.env(g, t, vol, 0.008, dur);
    this.osc("triangle", freq, t, dur + 0.05, g);
    this.osc("sine", freq / 2, t, dur + 0.05, g);
  }

  private hat(t: number, vol: number, open = false) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 7000;
    g.connect(f); f.connect(this.musicBus);
    this.env(g, t, vol, 0.002, open ? 0.14 : 0.035);
    this.noise(t, open ? 0.18 : 0.06, g);
  }

  private kick(t: number, vol: number) {
    const g = this.ctx.createGain();
    g.connect(this.musicBus);
    this.env(g, t, vol, 0.004, 0.12);
    const o = this.osc("sine", 150, t, 0.14, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  }

  private snare(t: number, vol: number) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.8;
    g.connect(f); f.connect(this.musicBus);
    this.env(g, t, vol, 0.002, 0.1);
    this.noise(t, 0.14, g);
    const g2 = this.ctx.createGain();
    g2.connect(this.musicBus);
    this.env(g2, t, vol * 0.6, 0.002, 0.07);
    this.osc("triangle", 210, t, 0.09, g2);
  }

  private stab(freqs: number[], t: number, vol: number) {
    for (const fr of freqs) {
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
      g.connect(f); f.connect(this.musicBus);
      this.env(g, t, vol / freqs.length, 0.01, 0.32);
      const o = this.osc("sawtooth", fr, t, 0.4, g);
      o.detune.value = (Math.random() - 0.5) * 10;
    }
  }

  private scheduleStep(s: number, t: number, stepDur: number) {
    const E1 = 41.2, G1 = 49.0, A1 = 55.0, B1 = 61.74, C2 = 65.41, D2 = 73.42;
    const bar = Math.floor(s / 16); // 0 or 1 (two-bar loop)
    const i = s % 16;
    const st = this.musicState;

    // --- bass: the spine, present in all states ---
    const bassLineA = [E1, 0, 0, E1, 0, 0, G1, 0, A1, 0, 0, A1, 0, G1, 0, B1];
    const bassLineB = [E1, 0, 0, E1, 0, 0, G1, 0, C2, 0, 0, B1, 0, A1, 0, G1];
    const bl = bar === 0 ? bassLineA : bassLineB;
    if (bl[i]) {
      const vol = st === "calm" ? 0.20 : st === "suspicious" ? 0.24 : 0.3;
      this.bassNote(bl[i], t, vol, st === "combat" ? 0.16 : 0.24);
    }

    // --- calm: sparse twangy guitar phrase, laid back ---
    if (st === "calm") {
      const E3 = 164.8, G3 = 196.0, Fs3 = 185.0, B3 = 246.9, E4 = 329.6;
      const phraseA: Record<number, number> = { 0: E3, 6: G3, 8: Fs3, 14: B3 };
      const phraseB: Record<number, number> = { 0: E4, 4: B3, 10: G3, 12: Fs3 };
      const p = bar === 0 ? phraseA : phraseB;
      if (p[i]) this.pluck(p[i], t, 0.12, 1500);
      if (i === 4 || i === 12) this.hat(t, 0.018);
    }

    // --- suspicious: add shaker pulse + tenser minor plucks ---
    if (st === "suspicious") {
      const E3 = 164.8, G3 = 196.0, As3 = 233.1, B3 = 246.9;
      const p: Record<number, number> = bar === 0 ? { 0: E3, 3: G3, 8: As3, 11: B3 } : { 0: B3, 3: As3, 8: G3, 12: E3 };
      if (p[i]) this.pluck(p[i], t, 0.11, 2100);
      if (i % 2 === 0) this.hat(t, i % 4 === 0 ? 0.035 : 0.02);
    }

    // --- search: driving percussion, urgent low stabs ---
    if (st === "search") {
      if (i % 4 === 0) this.kick(t, 0.3);
      if (i === 4 || i === 12) this.snare(t, 0.14);
      if (i % 2 === 0) this.hat(t, 0.03);
      if ((bar === 0 && i === 0) || (bar === 1 && i === 8)) this.stab([164.8, 196.0, 246.9], t, 0.22);
      if (bar === 1 && i === 14) this.pluck(233.1, t, 0.1, 2400);
    }

    // --- combat: full kit + brass-ish stabs ---
    if (st === "combat") {
      if (i % 4 === 0) this.kick(t, 0.4);
      if (i === 4 || i === 12) this.snare(t, 0.24);
      if (i === 10) this.kick(t, 0.26);
      this.hat(t, i % 4 === 2 ? 0.05 : 0.026, i % 8 === 6);
      const hits = bar === 0 ? [0, 3, 6] : [0, 3, 6, 10, 11];
      if (hits.includes(i)) this.stab([329.6, 392.0, 466.2], t, 0.3);
      if (bar === 1 && i === 12) this.stab([523.25, 622.25], t, 0.24);
    }
  }
}
