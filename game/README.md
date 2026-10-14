# Tode the Frog — 3D Browser Survival Game

> Submission for the **JetBrains Academy "Build Your Game Challenge"** (October 2026)

A 3D survival game built with **Three.js**. Guide Tode the Frog through waves of monsters: hop to dodge, unleash an area-of-effect shockwave to clear a path, and survive as long as you can for a higher score.

**▶ Play online:** https://wudhx.github.io/tode-frog-game-challenge/

## Gameplay

| Action | Key |
|---|---|
| Move (hop) | ↑ ↓ ← → |
| Area attack | `Space` |
| Restart (after Game Over) | `Space` |

**Rules**

- **+1 point** for every 10 seconds survived
- **+10 points** for each enemy defeated
- Touching any enemy ends the run (Game Over)
- The higher your score, the faster enemies spawn and move — but Tode's speed and attack range grow too (enemies scale slightly faster, so the challenge never fades)

## Tech Stack

- **Three.js** 0.181 — 3D rendering, GLTF model loading
- **Vite** 7 — dev server and production bundling
- **JavaScript (ES Modules)** — no framework

## Project Structure

```
src/
├── main.js              entry: scene assembly + game loop
├── style.css            score UI and Game Over overlay
└── components/
    ├── Camera.js        perspective camera following the player
    ├── Renderer.js      WebGL renderer
    ├── Player.js        input queue + parabolic hop movement
    ├── Enemy.js         corner spawning + player tracking
    ├── Map.js           checkerboard ground
    ├── House.js         random house obstacles + collision
    ├── Attack.js        area attack + cooldown + visual ring
    ├── Score.js         scoring logic and top-of-screen UI
    └── Difficulty.js    dynamic difficulty scaling
```

## Implementation Highlights

**Hop-based movement** — Each move is not a teleport: a progress value `t ∈ [0, 1]` drives the hop. Horizontal position is linearly interpolated, while height follows `Math.sin(t · π)` to produce a parabolic arc that lands back on the ground.

**Collision detection** — Instead of bounding boxes (too coarse for rounded characters), collision uses a minimum-distance constant, with separate rules for enemy–enemy, enemy–player, and entity–house interactions.

**Dynamic difficulty** — A difficulty factor `1 + score × 0.02` (capped at 4) linearly scales spawn delay, movement speed, attack cooldown and attack range. Enemy parameters are deliberately tuned to scale slightly faster than the player's, so the challenge never fades.

**AI-assisted development** — The project was built in WebStorm in collaboration with JetBrains Junie, an AI coding agent. The developer defined the requirements, reviewed the generated code, tuned the parameters, and verified the results at every step.

## Run Locally

```bash
npm install
npm run dev      # dev server → http://localhost:5173
npm run build    # production build → dist/
```

## Credits

- `enemy.glb` — Armabee Evolved by Quaternius (Public Domain) via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ)
- `small_house.glb` — Small House by Jarlan Perez (CC-BY) via [Poly Pizza](https://poly.pizza/m/053kskrV4U_)
- Course and `tode.glb` — [JetBrains Academy](https://academy.jetbrains.com/course/30327)
