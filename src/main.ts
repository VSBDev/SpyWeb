import * as THREE from "three";
import { Input } from "./core/input";
import { createPostStack } from "./core/post";
import { AudioEngine } from "./core/audio";
import { SaveSystem } from "./core/save";
import { HUD } from "./ui/hud";
import { Menus } from "./ui/menus";
import { Mission, type Checkpoint } from "./game/game";
import { buildLevel, type LevelDef, type LevelRuntime } from "./world/levelkit";
import { LEVELS, LEVEL_ORDER } from "./levels/levels";
import { CROUCH_TUNE } from "./world/characters";
import { envFor, ENV_INTENSITY } from "./core/env";
import { WIND } from "./world/materials";

type GameState = "title" | "select" | "briefing" | "playing" | "paused" | "debrief" | "gameover";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui-root") as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const post = createPostStack(renderer);
const input = new Input(canvas);
const audio = new AudioEngine();
const save = new SaveSystem();
const hud = new HUD(uiRoot);
const menus = new Menus(uiRoot);
menus.onHover = () => audio.uiHover();
menus.onClick = () => { audio.resume(); audio.uiClick(); };

let state: GameState = "title";
let mission: Mission | null = null;
let currentDef: LevelDef | null = null;

// ---------------------------------------------------------------------------
// Title-screen backdrop: the villa, unpopulated, slow orbit
// ---------------------------------------------------------------------------
let menuLevel: LevelRuntime | null = null;
let menuScene: THREE.Scene | null = null;
const menuCam = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
let menuAngle = 0;

function ensureMenuScene() {
  if (menuScene) return;
  menuLevel = buildLevel(LEVELS[1]); // Villa Anselmo backdrop
  menuScene = new THREE.Scene();
  menuScene.add(menuLevel.group);
  menuScene.background = new THREE.Color(menuLevel.skyColor);
  menuScene.fog = new THREE.FogExp2(0xdcd2b8, 0.0042);
  menuScene.environment = envFor(renderer, "day");
  menuScene.environmentIntensity = ENV_INTENSITY.day;
}

function disposeMenuScene() {
  if (!menuScene) return;
  menuScene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
  menuScene = null;
  menuLevel = null;
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function goTitle() {
  state = "title";
  ensureMenuScene();
  menus.showTitle(() => goSelect(), save, audio);
}

function goSelect() {
  state = "select";
  ensureMenuScene();
  input.enabled = false;
  menus.showMissionSelect(LEVELS, save, LEVEL_ORDER, (def) => goBriefing(def), () => goTitle());
}

function goBriefing(def: LevelDef) {
  state = "briefing";
  menus.showBriefing(def, () => startMission(def), () => goSelect());
}

function startMission(def: LevelDef, checkpoint: Checkpoint | null = null) {
  menus.clear();
  disposeMenuScene();
  mission?.dispose();
  currentDef = def;
  audio.resume();
  audio.setVolumes(save.data.settings.musicVolume, save.data.settings.sfxVolume);
  mission = new Mission(def, window.innerWidth / window.innerHeight, input, audio, hud, save.data.settings, {
    onComplete: (stats) => {
      state = "debrief";
      input.enabled = false;
      input.exitPointerLock();
      const prev = save.getMission(def.id);
      const prevScore = prev.completed ? rankScoreOf(prev.bestRank) : 0;
      const isNewBest = stats.rankScore > prevScore;
      save.recordMission(def.id, stats.rank, stats.time, stats.ghost, stats.rankScore, prevScore);
      const idx = LEVELS.indexOf(def);
      const hasNext = idx >= 0 && idx < LEVELS.length - 1;
      hud.hide();
      menus.showDebrief(def, stats, isNewBest, hasNext,
        () => goBriefing(LEVELS[idx + 1]),
        () => startMission(def),
        () => { endMission(); goSelect(); });
    },
    onFail: (reason) => {
      state = "gameover";
      input.enabled = false;
      input.exitPointerLock();
      hud.hide();
      const cp = mission?.checkpoint ?? null;
      menus.showGameOver(
        reason,
        cp ? () => startMission(def, cp) : null,
        () => startMission(def),
        () => { endMission(); goSelect(); }
      );
    },
  }, checkpoint);
  mission.scene.environment = envFor(renderer, def.time);
  mission.scene.environmentIntensity = ENV_INTENSITY[def.time];
  state = "playing";
  input.enabled = true;
  input.requestPointerLock();
}

function rankScoreOf(rank: string): number {
  return { "GHOST": 5, "PHANTOM": 4, "PRO": 3, "OPERATIVE": 2, "LOUD & ALIVE": 1 }[rank] ?? 0;
}

function endMission() {
  mission?.dispose();
  mission = null;
  currentDef = null;
}

function pauseGame() {
  if (state !== "playing" || !mission) return;
  state = "paused";
  mission.paused = true;
  input.enabled = false;
  input.exitPointerLock();
  menus.showPause(
    save, audio,
    () => resumeGame(),
    () => { menus.clear(); startMission(currentDef!); },
    () => { menus.clear(); endMission(); goSelect(); }
  );
}

function resumeGame() {
  if (!mission) return;
  menus.clear();
  state = "playing";
  mission.paused = false;
  input.enabled = true;
  input.requestPointerLock();
}

// Esc while locked: browser drops pointer lock -> pause.
document.addEventListener("pointerlockchange", () => {
  if (state === "playing" && !input.pointerLocked && mission && !mission.over) {
    pauseGame();
  }
});
// clicking back into the game canvas re-locks
canvas.addEventListener("click", () => {
  if (state === "playing" && !input.pointerLocked) input.requestPointerLock();
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && state === "paused") {
    // handled by menu buttons; Esc resume for convenience
    resumeGame();
  } else if (e.code === "Escape" && state === "playing" && !input.pointerLocked) {
    // pointer lock unavailable (or lost): still allow pausing
    pauseGame();
  }
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  menuCam.aspect = aspect;
  menuCam.updateProjectionMatrix();
  if (mission) {
    mission.rig.camera.aspect = aspect;
    mission.rig.camera.updateProjectionMatrix();
  }
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  WIND.value += dt;
  input.pollGamepad();

  if ((state === "playing" || state === "paused") && mission) {
    mission.update(dt);
    post.render(mission.scene, mission.rig.camera, dt);
  } else if (menuScene) {
    menuAngle += dt * 0.045;
    const r = 55;
    menuCam.position.set(Math.cos(menuAngle) * r, 26, Math.sin(menuAngle) * r);
    menuCam.lookAt(0, 2, 0);
    post.render(menuScene, menuCam, dt);
  }
  input.endFrame();
}

goTitle();
frame();

// dev/debug handle (harmless in production; enables scripted playtests)
declare global { interface Window { spyweb?: unknown } }
window.spyweb = {
  get mission() { return mission; },
  get state() { return state; },
  input, audio, save,
  startMission, LEVELS, CROUCH_TUNE,
};
