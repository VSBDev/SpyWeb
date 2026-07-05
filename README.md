# SPYWEB

*A Mediterranean Infiltration — 1963*

A game by **Victor Sanchez Belmar** ([@VSBDev](https://github.com/VSBDev))

A 3D stealth game for the browser, built with Three.js + TypeScript. Every mesh, texture,
and sound is generated procedurally in code — there are no asset files.

You are **Agent MIRA**, sent to unravel the Serpe syndicate's web across the Riviera:
a training cove, a paymaster's villa, a smuggler's harbor at dusk, a moonlit monastery
listening post, the fortress at the heart of it all, one blacked-out night to cut the
head off the snake — and a descent into LA CRIPTA, a procedurally generated underground
archive vault of galleries, brazier-lit vaults, and patrolled tunnels.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # production bundle in dist/ (fully static, host anywhere)
```

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Shift | Run (loud) |
| C / Ctrl | Crouch (quiet; hide in tall grass) |
| Mouse | Camera orbit |
| Q or RMB tap | Toggle aim (RMB hold also works) |
| LMB | Fire (while aiming) |
| G | Throw stone (distraction) |
| 1 | Smoke grenade (blocks sight; hide inside it) |
| 2 | Decoy beacon (beeps for 8s, lures whole patrols) |
| 3 | EMP charge (blacks out cameras & searchlights for 14s) |
| E | Silent takedown (behind a guard) / interact with objectives (hold) |
| F | Drag / drop a body (E near a well: dump it forever) |
| Space | Take cover against a wall / slide along it |
| Tab or T | Tactical recon cam (see guard vision cones) |
| Esc | Pause (with settings) |

Gamepad supported: left stick move, right stick camera, LT aim, RT fire, A action,
B crouch, X drag, Y stone, LB recon, RB cover, D-pad gadgets, Start pause.

## How the stealth works

- **Vision** — guards have view cones with distance falloff, peripheral vision at close
  range, and true line-of-sight occlusion. Crouching shrinks your profile; tall grass
  makes you invisible beyond arm's reach. Night missions shorten sightlines but add
  flashlights.
- **Hearing** — running footsteps, shots, ricochets, and falling bodies emit noise
  radii. Thrown stones pull guards out of position.
- **Alert states** — calm → suspicious → investigate → search → combat. Alerted guards
  may sprint for an alarm panel and raise the whole compound. Kill them before they
  reach it — or don't let it get that far.
- **Bodies are evidence** — takedowns and suppressed kills are quiet, but a discovered
  corpse raises the alarm. Drag bodies into the grass.
- **Electronic security** — panning security cameras beep as they acquire you and raise
  the alarm if you linger; one suppressed round puts them out. Watchtower searchlights
  sweep the grounds on the night operations — stay out of the beams.
- **Supplies** — ammunition and stone caches glint around each compound; walk over
  them to restock.
- **Q-branch gadgets** — a per-mission loadout of smoke grenades (line-of-sight
  breaker and mobile hiding spot), decoy beacons (a beeping lure that drags guards
  across the map), and EMP charges (14 seconds of dead electronics). Later
  operations carry more.
- **Minimap** — a live tactical minimap tracks walls, objectives, the exfil point,
  and every guard's alert state at a glance.
- **Ranking** — GHOST (no kills, never seen, no alarms) → PHANTOM → PRO → OPERATIVE →
  LOUD & ALIVE. Best ranks and times are saved locally; missions unlock in sequence.

## Tech notes

- Vite + TypeScript + Three.js; ~160 KB gzipped total.
- All textures painted on `<canvas>` at runtime (plaster, terracotta, stone, gravel…).
- All audio synthesized with WebAudio — SFX plus a 16-step sequenced spy score that
  shifts layers with the alert state (calm plucks → shaker tension → full combat kit).
- Guard navigation is grid A* with line-of-sight path smoothing over the level's
  collider footprint.
- Characters are procedurally animated low-poly rigs (walk/run/crouch/aim/death poses
  computed per frame — no keyframe data).
