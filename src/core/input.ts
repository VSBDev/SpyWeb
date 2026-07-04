/**
 * Keyboard + mouse input with pointer lock. Actions are polled by game code;
 * "pressed" flags are true only on the frame the key went down.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  wheelDelta = 0;
  pointerLocked = false;
  /** while false all input reads as idle (menus open) */
  enabled = false;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (this.enabled && ["Space", "Tab", "KeyQ", "KeyE"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => { this.down.clear(); this.mouseDown = [false, false, false]; });

    canvas.addEventListener("mousedown", (e) => {
      if (e.button < 3) { this.mouseDown[e.button] = true; this.mousePressed[e.button] = true; }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button < 3) this.mouseDown[e.button] = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("wheel", (e) => { this.wheelDelta += e.deltaY; }, { passive: true });

    document.addEventListener("mousemove", (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  requestPointerLock() {
    if (!this.pointerLocked) this.canvas.requestPointerLock();
  }
  exitPointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** raw any-input check that ignores the enabled gate (used to skip cinematics) */
  get anyRawPressed(): boolean {
    return this.pressed.size > 0 || this.mousePressed.some(Boolean);
  }

  /** gamepad haptics; silently no-ops without a pad or actuator support */
  rumble(strong: number, weak: number, ms: number) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads).find((p) => p && p.connected) as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | undefined;
    gp?.vibrationActuator?.playEffect?.("dual-rumble", {
      duration: ms, strongMagnitude: strong, weakMagnitude: weak,
    })?.catch(() => {});
  }

  // ---- gamepad ----
  gamepadActive = false;
  private gpMoveX = 0;
  private gpMoveZ = 0;
  private prevButtons: boolean[] = [];

  /** poll the first connected gamepad; call once per frame before game update */
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) { this.gamepadActive = false; this.gpMoveX = 0; this.gpMoveZ = 0; return; }
    const dead = (v: number) => (Math.abs(v) > 0.22 ? v : 0);
    const lx = dead(gp.axes[0] ?? 0), ly = dead(gp.axes[1] ?? 0);
    const rx = dead(gp.axes[2] ?? 0), ry = dead(gp.axes[3] ?? 0);
    this.gpMoveX = lx;
    this.gpMoveZ = ly;
    this.mouseDX += rx * 22;
    this.mouseDY += ry * 16;
    const anyBtn = gp.buttons.some((b) => b.pressed);
    if (lx || ly || rx || ry || anyBtn) this.gamepadActive = true;

    // face buttons / bumpers / dpad -> synthetic key edges
    const keyMap: [number, string][] = [
      [0, "KeyE"], [1, "KeyC"], [2, "KeyF"], [3, "KeyG"],
      [4, "Tab"], [5, "Space"], [10, "ShiftLeft"],
      [12, "Digit1"], [15, "Digit2"], [13, "Digit3"],
    ];
    for (const [i, code] of keyMap) {
      const now = gp.buttons[i]?.pressed ?? false;
      const was = this.prevButtons[i] ?? false;
      if (now && !was) { this.down.add(code); this.pressed.add(code); }
      if (!now && was) this.down.delete(code);
    }
    // start -> Escape (real event so the pause handler fires)
    if ((gp.buttons[9]?.pressed ?? false) && !(this.prevButtons[9] ?? false)) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    }
    // LT hold = aim, RT edge = fire
    const lt = (gp.buttons[6]?.pressed ?? false) || (gp.buttons[6]?.value ?? 0) > 0.4;
    this.mouseDown[2] = this.mouseDown[2] || lt;
    if (!lt && (this.prevButtons[6] ?? false)) this.mouseDown[2] = false;
    const rt = (gp.buttons[7]?.pressed ?? false) || (gp.buttons[7]?.value ?? 0) > 0.4;
    if (rt && !(this.prevButtons[7] ?? false)) { this.mouseDown[0] = true; this.mousePressed[0] = true; }
    if (!rt && (this.prevButtons[7] ?? false)) this.mouseDown[0] = false;
    this.prevButtons = gp.buttons.map((b, i) =>
      i === 6 ? lt : i === 7 ? rt : b.pressed);
  }

  isDown(code: string): boolean { return this.enabled && this.down.has(code); }
  wasPressed(code: string): boolean { return this.enabled && this.pressed.has(code); }
  wasMousePressed(button: number): boolean { return this.enabled && this.mousePressed[button]; }
  isMouseDown(button: number): boolean { return this.enabled && this.mouseDown[button]; }

  /** consume per-frame deltas; call at end of each frame */
  endFrame() {
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }

  get moveX(): number {
    const kb = (this.isDown("KeyD") ? 1 : 0) - (this.isDown("KeyA") ? 1 : 0);
    const gp = this.enabled ? this.gpMoveX : 0;
    return Math.max(-1, Math.min(1, kb + gp));
  }
  get moveZ(): number {
    const kb = (this.isDown("KeyS") ? 1 : 0) - (this.isDown("KeyW") ? 1 : 0);
    const gp = this.enabled ? this.gpMoveZ : 0;
    return Math.max(-1, Math.min(1, kb + gp));
  }
}
