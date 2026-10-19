# Tode: Talent Awakening

**A frog. A meadow. An endless swarm.**

Tode has one attack: a tongue that fires in a circle around him. Insects arrive from every
direction, and every one you kill raises your maximum health — so the health bar is also the
level bar. Every minute the game offers a choice that shapes the rest of the game.

> Submission for the **JetBrains Academy "Build Your Game Challenge"** — October 2026

### ▶ Play in your browser

## **[wudhx.github.io/tode-talent-awakening](https://wudhx.github.io/tode-talent-awakening/)**

No install, no download, no account. Runs in desktop Chrome, Edge, Firefox and Safari.

<a href="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/gameplay.png"><img src="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/gameplay.png" width="760" alt="Gameplay — the frog in the middle of a game, tongue firing into the swarm"></a>

---

## How a game plays out

You begin with 100 HP and no upgrades. Nothing carries over from the previous game.

**The tongue is your only attack.** Arrow keys hop; `Space` attacks. Holding `Space` keeps
attacking while you move, so you never have to stop to deal damage. The blast covers a circle
centred on Tode, so the only real decision is where to stand: close enough to clear the
swarm, not so close that contact damage lands first.

**Every kill raises your maximum health.** Maximum health *is* your level, so the health bar
is the progression curve — fifteen levels, each one paid for in insects. There is no separate
experience bar and no upgrade screen.

**Every sixty seconds, take one of three talents.** Four slots, filled over a game. A talent's
rank is not fixed when you pick it: it is derived from your current level (1, 2, 3, 5, 7), so
the one you choose at minute two keeps improving at minute twelve.

**Genes drop from what you kill.** Taking one commits it to the game and stacks it. There are
six species, each in three qualities; three of the same quality merge into the next tier.

**Score also charges the awakening bar.** Every 1,500 points adds one charge, up to three.
`E` spends one for ten seconds of triple damage, 65% less damage taken, longer reach and
faster hops.

**Bosses arrive on a score schedule** — the first at 2,000 points, then every 3,000 after
that. A stag beetle charges in a straight line, a centipede leaves toxic ground behind it, a
mole burrows and surfaces under your feet. Each one punishes a different habit.

**The pressure never stops rising.** Spawn rate, insect speed, your cooldown and your reach
all scale with your score, and the insects are tuned to scale slightly faster than you do.

**When the health bar empties, the game is over.** You see your score and your best score,
then start again.

---

## Screens

**The talent draft.** Three cards, one pick, every minute. Each card shows the rank you
would get right now, and the hero level that unlocks the next one.

<a href="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/talent-offer.png"><img src="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/talent-offer.png" width="700" alt="Talent draft — three cards, pick one"></a>

**The stat sheet.** Every number with the sources that produced it — base, levels, genes,
talents, boss kills, awakening.

<a href="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/character-panel.png"><img src="https://cdn.jsdelivr.net/gh/wudhx/tode-talent-awakening@main/docs/screenshots/character-panel.png" width="300" alt="Character panel — every stat with its sources"></a>

---

## Systems

| System | What it does |
|---|---|
| **Hero levels** | 15 levels, 100 HP each. Every kill raises maximum HP by 2.5, so the level curve is the health bar. |
| **Tongue blast** | Short-range area attack. Hold `Space` to keep attacking; movement never interrupts it. |
| **Awakening** | Score fills a bank of up to 3 charges (1,500 points each). `E` spends one for 10 seconds of 3× damage, 65% less damage taken, +60% reach and +30% hop speed. |
| **Talents** | 16 talents, 4 slots, one offer every 60 seconds. Rank is driven by hero level (thresholds 1 / 2 / 3 / 5 / 7), so a talent keeps improving after you take it. |
| **Genes** | 6 species × 3 qualities. Orbs drop from kills; taking one locks it in for the game and stacks it. Three of the same quality merge into the next tier. |
| **Bosses** | The first at 2,000 points, then every 3,000 after that. Each has a signature move: horn charge, venom pools, burrow ambush. |
| **Dynamic difficulty** | Spawn rate, insect speed, your cooldown and your reach all scale with score. Insects scale slightly faster than you do. |

---

## Controls

| Key | Action |
|---|---|
| `↑ ↓ ← →` | Hop |
| `Space` | Tongue blast (hold to keep attacking) |
| `E` | Awakening — spends one banked charge |
| `1` `2` `3` | Pick a talent card |
| `Esc` | Decline the talent offer |
| `F` | Take the gene on the ground |
| `G` / `Esc` | Skip that gene |
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
surfaced — goes through `hurtHero()`. Damage reduction, awakening mitigation, the pond's
20% soak and the shield are applied in one place, so a new hazard cannot quietly bypass
them.

**Collision without physics.** Rounded characters do not want axis-aligned boxes. Every
interaction is a minimum-distance test with its own tuned constant: enemy–enemy,
enemy–player, entity–obstacle.

**Insects that cannot get stuck.** When a body stops making progress it commits to one
tangent along the trunk and slides; if both tangents are blocked it flips; after 2.5
seconds of no progress it is moved to the nearest verified-clear spot. The board is also
generated with a minimum gap between trees, so the trap is rare in the first place.

**The whole thing is tested.** 190 Playwright checks run against the real build in a
headless browser — level curve, talent mapping, damage ceiling, boss abilities, shield
regeneration, pond geometry, collision, UI contracts, and a check that twelve insects
spawned in a ring all actually move.

---

## Project structure

```
game/
├── index.html
├── vite.config.js
├── public/
│   ├── models/            tode / enemy / small_house (GLB)
│   └── tode.svg
└── src/
    ├── main.js            scene assembly, game loop, UI wiring   (~3.1k lines)
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
        ├── Interactables.js hearts, fruit, flowers, bushes
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
| `enemy.glb` — Armabee Evolved | Quaternius | Public Domain (CC0) | [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ) |
| `small_house.glb` — Small House | Jarlan Perez | CC-BY 4.0 | [Poly Pizza](https://poly.pizza/m/053kskrV4U_) |

No other third-party art, fonts, music or sound recordings are used. Every sound in the
game is synthesised at runtime with the Web Audio API — there are no audio files in the
repository.

### AI tools used

| Tool | Used for |
|---|---|
| **JetBrains Junie** (in WebStorm) | The twelve course tasks: scene setup, hop movement, enemy spawning, collision, attack, scoring, difficulty scaling. |
| **WorkBuddy AI** | The expansion on top of the course build: hero levels and HP, the talent draft and its rank table, genes and merging, awakening charges, boss profiles and signature abilities, the HUD and character sheet, balance tuning, and the Playwright test suite. |

All requirements, design decisions, review and playtesting were done by the author; the
code was written in collaboration with these agents.

---

## License

MIT — see [`LICENSE`](LICENSE). The license text and copyright notice belong to the
course scaffold; the game code in `game/` is the author's work built on top of it.

