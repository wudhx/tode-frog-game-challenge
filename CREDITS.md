# Credits

**Tode: Talent Awakening** — entry for the JetBrains Academy *Build Your Game Challenge*
(October 2026).

## Game

Design, code, balance, UI and playtesting: **WUDHX**.

Built with assistance from:

| Tool | Used for |
|---|---|
| **JetBrains Junie** (in WebStorm) | The twelve course tasks: scene setup, hop movement, enemy spawning, collision, attack, scoring, difficulty scaling. |
| **WorkBuddy AI** | The expansion on top of the course build: hero levels and HP, talent draft and rank table, genes and merging, Awakening charges, boss profiles and signature abilities, HUD and character sheet, balance tuning, and the Playwright smoke suite. |

All requirements, design decisions, review and playtesting were done by the author.

## Course and base asset

The game is based on the JetBrains Academy course
*Build a Game with an AI Coding Agent* ([course 30327](https://academy.jetbrains.com/course/30327)).

- `game/public/models/tode.glb` — course-provided hero asset, used for this course
  project. The scaffold ships under the MIT license in [`LICENSE`](LICENSE);
  copyright (c) 2025 JetBrains Academy.

## Third-party 3D assets

| Asset | Author | License | Source | Changes |
|---|---|---|---|---|
| `small_house.glb` — "Small House" | Jarlan Perez | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Poly Pizza](https://poly.pizza/m/053kskrV4U_) | Converted from OBJ to glTF; scaled in-engine. Otherwise unmodified. |

No other third-party art, fonts, music or sound recordings are used.

## Audio

Every sound is generated at runtime with the Web Audio API
(`game/src/components/Sound.js`). There are no audio files in the repository and no
commercial recordings.

## Fonts

The UI uses the system font stack; no font files are bundled.

## Code and libraries

- Game code — MIT, see [`LICENSE`](LICENSE).
- [three.js](https://threejs.org/) — MIT.
- [Vite](https://vite.dev/) — MIT.
- Course scaffold — MIT, copyright (c) 2025 JetBrains Academy.

The MIT license applies to the code. Third-party assets remain under the licenses listed
above.