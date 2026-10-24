# Tode: Talent Awakening

**A frog. A meadow. An endless swarm.**

Tode has one attack: a tongue lash that clears a circle around him. Insects arrive from every
direction, and every insect you kill with it raises his maximum health — so the health bar is
also the level bar. Every minute, you choose a talent that shapes the rest of the run.

> Submission for the **JetBrains Academy "Build Your Game Challenge"** — October 2026

### ▶ Play in your browser

## **[https://wudhx.github.io/tode-talent-awakening](https://wudhx.github.io/tode-talent-awakening/)**

No install, no download, no account. Built for desktop Chrome, Edge, Firefox and Safari.

<a href="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/gameplay.png"><img src="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/gameplay.png" width="760" alt="Gameplay — Tode surrounded by a swarm, tongue firing"></a>

---

## How a run plays out

You begin with 100 HP and no upgrades. Nothing carries over from the previous run.

**The tongue is your only attack.** Arrow keys hop; `Space` attacks. Holding `Space` keeps
attacking while you move, so you never have to stop to deal damage. The blast covers a circle
centred on Tode, so the only real decision is where to stand: close enough to clear the
swarm, not so close that contact damage lands first.

**Every tongue kill raises your maximum health.** Your level is derived from your maximum health, so
the health bar is the progression curve — fifteen levels, each one paid for in insects. There
is no separate experience bar and no upgrade screen.

**Every sixty seconds, you choose one of three talents.** You have four slots (five with Lucky),
filled over a run. A talent's rank is not fixed when you pick it: it rises automatically when
your hero reaches levels 2, 3, 5 and 7, so the talent you choose at minute two keeps improving
at minute twelve.

**Tongue kills can drop gene orbs.** Orbs drift toward you when you get close; taking one
locks it in for the run and adds a stack. There are six species, each in three qualities; three
orbs of the same quality merge into the next tier.

**Score also charges the Awakening bar.** Every 1,500 points adds one charge, up to three.
`E` spends one for ten seconds of triple damage, 65% less damage taken, longer attack range
and faster hops.

**Bosses arrive on a score schedule** — the first at 2,000 points, then every 3,000 after
that. A stag beetle charges in a straight line, a centipede leaves toxic ground behind it, a
mole burrows and surfaces under your feet. Each one punishes a different habit.

**The pressure keeps rising.** Spawn rate, insect speed, your attack cooldown, your attack
range and your hop speed all scale with your score — and the insects scale faster than you do.

**When the health bar empties, the game is over.** You see your score and your best score,
then start again.

---

## Screens

**The talent draft.** Three cards, one pick, every minute. Cards are colour-coded by role —
offense, defense, mobility, fortune — and each shows the rank you would get right now plus
the hero level that unlocks the next one.

<a href="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/talent-draft.png"><img src="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/talent-draft.png" width="700" alt="Talent draft — three cards, pick one"></a>

**The stat sheet.** Every number is shown with the sources that produced it — base, levels,
genes, talents, boss kills, Awakening.

<a href="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/character-sheet.png"><img src="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/character-sheet.png" width="300" alt="Character panel — every stat with its sources"></a>

---

## Systems

| System | What it does |
|---|---|
| **Hero levels** | 15 levels, 100 max HP each. Every tongue kill raises maximum HP by 2.5, so the level curve is the health bar. |
| **Tongue blast** | Short-range area attack. Hold `Space` to keep attacking; movement never interrupts it. |
| **Awakening** | Score fills a bank of up to 3 charges (1,500 points each). `E` spends one for 10 seconds of 3× damage, 65% less damage taken, +60% attack range and +30% hop speed. |
| **Talents** | 16 talents, 4 base slots (5 with Lucky), one offer every 60 seconds. Rank is driven by hero level (thresholds 1 / 2 / 3 / 5 / 7), so a talent keeps improving after you take it. |
| **Genes** | 6 species × 3 qualities. Orbs drop from tongue kills and drift toward a nearby hero; taking one locks it in for the run and adds a stack. Three of the same quality merge into the next tier. |
| **Bosses** | The first at 2,000 points, then every 3,000 after that. Each has a signature move: horn charge, venom pools, burrow ambush. |
| **Dynamic difficulty** | Spawn rate, insect speed, your attack cooldown, your reach and your hop speed all scale with score. Insects scale faster than you do. |

---

## Controls

| Key | Action |
|---|---|
| `↑ ↓ ← →` | Hop |
| `Space` | Tongue blast (hold to keep attacking) |
| `E` | Awakening — spend one banked charge |
| `1` `2` `3` | Pick a talent card |
| `Esc` | Decline the talent offer |
| `F` | Take the gene orb |
| `G` / `Esc` | Skip the gene orb |
| `C` | Character panel |
| `P` / `Esc` | Pause |
| `M` | Mute |

---

## Implementation notes

A few decisions that shaped the codebase:

**One source of truth per number.** Talent ranks are never stored. `talentEffectAt(talent,
rank)` computes an effect bag, and the panel, the offer cards and the combat math all call
it. A talent cannot display one value and apply another, because there is only one value.

**One damage pipeline.** Every hazard — insect contact, boss charge, venom tick, burrow
ambush — goes through `hurtHero()`. Damage reduction, Awakening mitigation, the pond's 20%
soak and the shield are applied in one place, so a new hazard cannot quietly bypass them.

**Collision without physics.** Rounded characters do not fit axis-aligned boxes. Every
interaction is a minimum-distance test with its own tuned constant: enemy–enemy,
enemy–player, entity–obstacle.

**Insects that cannot get stuck.** When a body stops making progress, it picks one tangent
around the obstacle and slides along it; if both tangents are blocked it flips; after 2.5
seconds of no progress it is moved to the nearest verified-clear spot. The board is also
generated with a minimum gap between trees, so the trap is rare in the first place.

**The build was tested with Playwright during development.** A smoke suite covered the
level curve, talent mapping, damage ceiling, boss abilities, shield regeneration, pond
geometry, collision, UI behavior, and a check that twelve insects spawned in a ring all
move. The suite lives in the author's development workspace and is not shipped in this
repository.

---

## Project structure

```
game/
├── index.html
├── vite.config.js
├── public/
│   ├── models/            tode / small_house (GLB)
│   └── tode.svg
└── src/
    ├── main.js            scene assembly, game loop, UI wiring   (~3.5k lines)
    ├── style.css
    └── components/
        ├── Player.js        input queue + parabolic hop movement
        ├── Enemy.js         species table, boss profiles, signature abilities
        ├── Attack.js        tongue blast, cooldown, hit resolution
        ├── Health.js        HP pool, level derivation, heal-over-time
        ├── Score.js         scoring and top-of-screen readout
        ├── Difficulty.js    score-driven scaling for enemies and hero
        ├── Talents.js       talent pool, rank table, effect formatting
        ├── Genes.js         species/quality table, stacks, merging, drops
        ├── Awakening.js     charge bank and boost multipliers
        ├── PowerUp.js       pickups and their timed multipliers
        ├── Interactables.js HUD prompts and toasts
        ├── Scenery.js       trees, bushes, ponds, flowers
        ├── House.js         destructible houses and their collision
        ├── Map.js           checkerboard board
        ├── Camera.js        follows the hero, keeps the world upright
        ├── Renderer.js      WebGL setup
        ├── Sound.js         WebAudio cues, no audio files
        └── HighScores.js    local best scores
```

Roughly 10,400 lines of JavaScript, no framework, no game engine.

---

## Run locally

```bash
cd game
npm install
npm run dev      # → http://localhost:5173
npm run build    # → game/dist
```

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds the game and publishes it
to GitHub Pages.

---

## Attribution

### Course and base assets

- Course scaffold, task structure and `tode.glb` — **JetBrains Academy**,
  *Build a Game with an AI Coding Agent* ([course 30327](https://academy.jetbrains.com/course/30327)).
  The scaffold ships under the MIT license in [`LICENSE`](LICENSE).

### Third-party 3D assets

| Asset | Author | License | Source |
|---|---|---|---|
| `small_house.glb` — "Small House" | Jarlan Perez | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Poly Pizza](https://poly.pizza/m/053kskrV4U_) |

The house model was converted from OBJ to glTF and is scaled in-engine; otherwise it is
unmodified. Full attribution, license notes and third-party software credits are in
[`CREDITS.md`](CREDITS.md).

No other third-party art, fonts, music or sound recordings are used. Every sound in the
game is generated at runtime with the Web Audio API — there are no audio files in the
repository.

### AI tools used

| Tool | Used for |
|---|---|
| **JetBrains Junie** (in WebStorm) | The twelve course tasks: scene setup, hop movement, enemy spawning, collision, attack, scoring, difficulty scaling. |
| **WorkBuddy AI** | The expansion on top of the course build: hero levels and HP, the talent draft and its rank table, genes and merging, Awakening charges, boss profiles and signature abilities, the HUD and character sheet, balance tuning, and headless build/smoke checks. |

All requirements, design decisions, review and playtesting were done by the author; the
code was written in collaboration with these agents.

---

## License

MIT — see [`LICENSE`](LICENSE). The license text and copyright notice belong to the
course scaffold; the game code in `game/` is the author's work built on top of it.

See [`CREDITS.md`](CREDITS.md) for asset attribution. The MIT license covers the code;
third-party assets remain under their own licenses.

