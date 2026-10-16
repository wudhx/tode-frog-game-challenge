import * as THREE from 'three';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { Player } from './components/Player.js';
import { Enemy, pickEnemyType } from './components/Enemy.js';
import { Map, BOARD_HALF, TILE_SIZE } from './components/Map.js';
import {
  addHouses,
  collidesWithObstacle,
  HOUSE_ATTACK_RANGE,
  HOUSE_HP,
} from './components/House.js';
import { Scenery } from './components/Scenery.js';
import { Attack } from './components/Attack.js';
import { Score } from './components/Score.js';
import { HighScores } from './components/HighScores.js';
import { Health } from './components/Health.js';
import { sound } from './components/Sound.js';
import { PowerUpManager } from './components/PowerUp.js';
import { scaledParameters } from './components/Difficulty.js';
import { hud, highestPriorityKey } from './components/Interactables.js';
import './style.css';

// ---------------------------------------------------------------------------
// Tunables for the gameplay loop
// ---------------------------------------------------------------------------
/** Enemy vs. player: how close counts as a fatal touch. */
const PLAYER_HIT_DISTANCE = 45;
/** Enemy vs. enemy: how close two insects may get. */
const ENEMY_HIT_DISTANCE = 45;

const WALL_CLEARANCE = 6;
const POWERUP_WALL_CLEARANCE = 26;

// --- Interactive prop constants --------------------------------------------
/** Seconds of invulnerability the hero gets inside a house. */
const HOUSE_INVULN_DURATION = 1.5;
/** Cooldown between house invulnerability uses. */
const HOUSE_COOLDOWN = 30;
/** Distance the hero must be within to be "inside" a house. */
const HOUSE_INTERIOR_RADIUS_RATIO = 0.8;

/** How long the bush hide lasts before the hero is exposed. */
const BUSH_HIDE_DURATION = 4;
/** How close the hero must be to count as "in" a bush. */
const BUSH_INTERIOR_DISTANCE = 38;

/** How long the player has to stand next to a flower to harvest it. */
const FLOWER_HARVEST_TIME = 2.0;
/** Distance at which a flower notices the hero. */
const FLOWER_TRIGGER_DISTANCE = 48;
/** How long before a harvested flower grows back. */
const FLOWER_REGROW = 15;

/** How close to the pond shore counts as "near the water". */
const POND_SHORE_DISTANCE = 110;
/** Heal rate per second when standing on the shore. */
const POND_SHORE_HEAL_RATE = 0.5;
/** How long the hero must wade in before the bonus fires. */
const POND_BONUS_WADE_TIME = 0.5;
/** How close to the pond centre counts as "in the water". */
const POND_INNER_RADIUS_RATIO = 0.72;
/** Cooldown after leaving the water before the hero can wade in again. */
const POND_COOLDOWN = 1.5;

/** Tree canopy radius used for line-of-sight blocking. */
const TREE_LOS_RADIUS = 55;
/** How far the hero can be from a tree to count as "near" it (proximity hint). */
const TREE_PROXIMITY_DISTANCE = 90;
/** How close the hero has to be to a bush for an enemy to be willing to whack it. */
const BUSH_ATTACK_RANGE = 90;

/**
 * Clamps a ground position to the board.
 *
 * @param {THREE.Vector3} position Position to clamp, modified in place.
 * @param {number} [radius] Radius of the body being clamped.
 */
function clampToBoard(position, radius = 0) {
  const limit = Math.max(0, BOARD_HALF - radius);
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.y = THREE.MathUtils.clamp(position.y, -limit, limit);
}

// ---------------------------------------------------------------------------
// Core three.js setup
// ---------------------------------------------------------------------------
const renderer = createRenderer();
const scene = new THREE.Scene();

scene.add(new THREE.AmbientLight(0xffffff, 1.5));

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(-100, -100, 200);
scene.add(directionalLight);

// ---------------------------------------------------------------------------
// Game world
// ---------------------------------------------------------------------------
const map = new Map(scene);

/** Houses, once loaded. Each has hp, position, radius, alive. */
let houses = [];
/** Scenery (trees, bushes, flowers, ponds), once loaded. */
let scenery = null;
/** Everything that blocks movement: alive houses, trees, bushes. */
let obstacles = [];

addHouses(map.housesGroup).then((placed) => {
  houses = placed;
  scenery = new Scenery(scene, placed);
  obstacles = [...placed, ...scenery.obstacles];
});

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------
const player = new Player(scene);
const camera = createCamera(player.group);

const score = new Score();
const health = new Health();
const highScores = new HighScores();
const attack = new Attack(scene, player);
const powerUps = new PowerUpManager(scene);

// ---------------------------------------------------------------------------
// Per-frame interaction state
// ---------------------------------------------------------------------------
/** Tracks the invulnerability window the house gives the hero. */
const houseShield = {
  active: false,
  timer: 0,
  cooldown: 0,
};
/** Tracks the bush hide / expose window. */
const bushState = {
  active: false,
  bush: null,
  timer: 0,
  exposed: false,
};
/** Tracks the flower the hero is currently harvesting. */
const flowerState = {
  flower: null,
  timer: 0,
};
/** Tracks the pond the hero is currently wading in. */
const pondState = {
  inWater: false,
  pond: null,
  timer: 0,
  cooldown: 0,
};
/** Tracks the highest score milestone that has already bloomed a flower. */
let lastFlowerMilestone = 0;
/** Set of bushes enemies have recently whacked. */
const damagedBushes = new Set();

// ---------------------------------------------------------------------------
// On-screen controls reminder
// ---------------------------------------------------------------------------
const hint = document.createElement('div');
hint.className = 'hint';
hint.innerHTML = [
  '<div><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&larr;</kbd><kbd>&rarr;</kbd> hop around</div>',
  '<div><kbd>Space</kbd> tongue blast</div>',
  '<div><kbd>M</kbd> mute sound</div>',
].join('');
document.body.appendChild(hint);

/** Currently active enemies. */
let enemies = [];
/** Countdown until the next enemy spawns. */
let spawnTimer = 0;

const PLAYER_START = new THREE.Vector3(0, 0, 0);

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
/** @type {'playing' | 'game-over'} */
let gameState = 'playing';

let gameOverOverlay = null;

function buildGameOverOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'game-over';
  overlay.innerHTML = [
    '<div class="go-title">Game Over</div>',
    '<div class="go-badge">New Best!</div>',
    '<div class="go-score">Score <b>0</b></div>',
    '<div class="go-board">',
    '  <div class="go-board-title">Best runs</div>',
    '  <ol></ol>',
    '</div>',
    '<div class="go-hint">Press SPACE to play again</div>',
  ].join('');

  document.body.appendChild(overlay);
  return overlay;
}

function showGameOver() {
  gameState = 'game-over';

  if (!gameOverOverlay) gameOverOverlay = buildGameOverOverlay();

  const result = highScores.submit(score.value);

  gameOverOverlay.querySelector('.go-score b').textContent = String(Math.floor(score.value));
  gameOverOverlay.querySelector('.go-badge').style.display = result.isBest
    ? 'inline-block'
    : 'none';

  gameOverOverlay.querySelector('.go-board ol').innerHTML = highScores.entries
    .map(
      (entry, index) =>
        `<li${index === 0 ? ' class="top"' : ''}>` +
        `<span class="rank">${index + 1}</span>` +
        `<span class="val">${entry.score}</span>` +
        `<span class="date">${entry.date}</span>` +
        '</li>'
    )
    .join('');

  gameOverOverlay.style.display = 'flex';

  player.group.visible = false;
  player.controlsEnabled = false;
  player.stop();
  attack.enabled = false;

  sound.gameOver();
  if (result.isBest) sound.newBest(1.1);
}

function resetGame() {
  player.group.visible = true;
  player.group.position.copy(PLAYER_START);
  player.group.position.z = 0;
  player.yaw.rotation.z = 0;
  player.controlsEnabled = true;
  player.stop();

  if (player.model) player.model.visible = true;

  enemies.forEach((enemy) => enemy.dispose());
  enemies = [];
  spawnTimer = 0;

  score.reset();
  health.reset();
  attack.enabled = true;
  attack.reset();
  powerUps.reset();

  // Reset interaction state.
  houseShield.active = false;
  houseShield.timer = 0;
  houseShield.cooldown = 0;
  bushState.active = false;
  bushState.bush = null;
  bushState.timer = 0;
  bushState.exposed = false;
  flowerState.flower = null;
  flowerState.timer = 0;
  pondState.inWater = false;
  pondState.pond = null;
  pondState.timer = 0;
  pondState.cooldown = 0;
  lastFlowerMilestone = 0;
  damagedBushes.clear();

  if (gameOverOverlay) {
    gameOverOverlay.style.display = 'none';
  }

  gameState = 'playing';

  spawnEnemy();
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  if (gameState === 'game-over') {
    event.preventDefault();
    resetGame();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyM') return;
  sound.muted = !sound.muted;
});

// ---------------------------------------------------------------------------
// Enemy spawning
// ---------------------------------------------------------------------------
function pickSpawnPoint() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = THREE.MathUtils.randFloat(660, 820);

    const point = new THREE.Vector2(
      player.position.x + Math.cos(angle) * distance,
      player.position.y + Math.sin(angle) * distance
    );

    clampToBoard(point, 70);
    if (collidesWithObstacle(new THREE.Vector3(point.x, point.y, 0), obstacles, 40)) {
      continue;
    }

    return point;
  }

  const fallback = new THREE.Vector2(player.position.x + 700, player.position.y);
  clampToBoard(fallback, 70);
  return fallback;
}

function spawnEnemy(speed) {
  const enemy = new Enemy(scene, pickSpawnPoint(), pickEnemyType(score.value));
  if (typeof speed === 'number') enemy.setBaseSpeed(speed);
  enemies.push(enemy);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/**
 * True if the segment from `from` to `to` passes within `radius` of any tree.
 * Used to drop enemy aggro when the hero hides behind a tree.
 *
 * @param {THREE.Vector2} from One endpoint.
 * @param {THREE.Vector2} to The other endpoint.
 * @param {Array<{position: THREE.Vector2}>} trees Trees to test against.
 * @param {number} radius Tree canopy radius.
 * @returns {boolean}
 */
function isBlockedByTree(from, to, trees, radius) {
  for (const tree of trees) {
    // Distance from the tree centre to the segment.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((tree.position.x - from.x) * dx + (tree.position.y - from.y) * dy) / len2));
    const cx = from.x + dx * t;
    const cy = from.y + dy * t;
    if (Math.hypot(tree.position.x - cx, tree.position.y - cy) < radius) {
      return true;
    }
  }
  return false;
}

/**
 * Picks the nearest tree within a generous radius, for proximity-hint purposes.
 */
function nearestTree(playerPosition, trees) {
  let best = null;
  let bestDistance = Infinity;
  for (const tree of trees) {
    const distance = playerPosition.distanceTo(tree.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tree;
    }
  }
  return { tree: best, distance: bestDistance };
}

// ---------------------------------------------------------------------------
// Gameplay helpers
// ---------------------------------------------------------------------------
function playerHitsEnemy() {
  return enemies.some((enemy) => {
    const dx = enemy.position.x - player.position.x;
    const dy = enemy.position.y - player.position.y;
    return Math.sqrt(dx * dx + dy * dy) < PLAYER_HIT_DISTANCE;
  });
}

function canEnemyStep(x, y, self) {
  const probe = new THREE.Vector3(x, y, 0);
  if (collidesWithObstacle(probe, obstacles, self.type.radius * 0.7 + WALL_CLEARANCE)) {
    return false;
  }
  return !enemies.some((other) => {
    if (other === self) return false;
    return (
      Math.hypot(other.position.x - x, other.position.y - y) < ENEMY_HIT_DISTANCE
    );
  });
}

function hitsWall(position, radius) {
  return collidesWithObstacle(position, obstacles, radius + WALL_CLEARANCE);
}

function trimHopToWalls(from, target) {
  if (!hitsWall(target, player.radius)) return target;
  for (let fraction = 0.95; fraction > 0.02; fraction -= 0.04) {
    const candidate = from.clone().lerp(target, fraction);
    if (!hitsWall(candidate, player.radius)) return candidate;
  }
  return null;
}

function unstickEnemy(enemy) {
  const current = enemy.position;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const obstacle of obstacles) {
    const distance = Math.hypot(
      current.x - obstacle.position.x,
      current.y - obstacle.position.y
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = obstacle;
    }
  }
  if (!nearest || nearestDistance < 1e-3) return;
  const awayX = (current.x - nearest.position.x) / nearestDistance;
  const awayY = (current.y - nearest.position.y) / nearestDistance;
  current.x += awayX * 4;
  current.y += awayY * 4;
}

function isPowerUpSpotFree(x, y) {
  const probe = new THREE.Vector3(x, y, 0);
  if (collidesWithObstacle(probe, obstacles, POWERUP_WALL_CLEARANCE)) return false;
  return Math.hypot(x - player.position.x, y - player.position.y) > TILE_SIZE * 1.5;
}

// ---------------------------------------------------------------------------
// Pond bonuses
// ---------------------------------------------------------------------------
/**
 * Finds a clear spot just outside the hero's pickup radius, so a flower's
 * reward pops out beside it and has to be hopped to — dropping it under the
 * hero's feet would collect it on the same frame and the bloom would never be
 * seen.
 *
 * @param {number} fx Flower X.
 * @param {number} fy Flower Y.
 * @returns {{x: number, y: number}} A clear spot, or the flower itself as a
 *   last resort.
 */
function findFlowerDropSpot(fx, fy) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 40;
    const x = fx + Math.cos(angle) * distance;
    const y = fy + Math.sin(angle) * distance;

    if (Math.abs(x) > BOARD_HALF - 80 || Math.abs(y) > BOARD_HALF - 80) continue;
    if (collidesWithObstacle(new THREE.Vector3(x, y, 0), obstacles, POWERUP_WALL_CLEARANCE)) continue;

    return { x, y };
  }
  return { x: fx, y: fy };
}

/**
 * Picks one of three pond bonuses at random and applies it.
 */
function triggerPondBonus(pond) {
  const roll = Math.random();
  if (roll < 0.4) {
    // +3 hearts
    health.addMaxHp(2);
    health.heal(2);
    hud.showAction('+3 hearts from the pond!', 'heart', '#e5484d');
    sound.heal();
  } else if (roll < 0.7) {
    // Repel — every insect is forced into the disengaged state for 6 seconds.
    for (const enemy of enemies) {
      enemy.state = 'disengaged';
      enemy.disengageTimer = 0;
      enemy.disengageDirection.set(
        enemy.position.x - player.position.x,
        enemy.position.y - player.position.y
      );
      if (enemy.disengageDirection.lengthSq() < 1e-4) {
        enemy.disengageDirection.set(1, 0);
      } else {
        enemy.disengageDirection.normalize();
      }
    }
    hud.showAction('Repelled! Insects flee for 6s', 'pond', '#4da6ff');
    sound.shield();
  } else {
    // Slow — every insect drops to 40% speed for 12 seconds.
    powerUps.pondSlowTimer = 12;
    hud.showAction('Pond chill: insects slowed 12s', 'freeze', '#8ee8ff');
    sound.powerUp();
  }
}

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let attackWasActive = false;

// Scratch vector reused across frames.
const _dir = new THREE.Vector2();
const _target = new THREE.Vector2();

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);

  if (gameState === 'game-over') {
    renderer.render(scene, camera);
    return;
  }

  const params = scaledParameters(score.value);
  const boosts = powerUps.multipliers;

  player.setMoveDuration(params.playerMoveDuration * boosts.hopDuration);
  attack.cooldownDuration = params.attackCooldown;
  attack.radius = params.attackRadius * boosts.attackRadius;

  // --- Player movement ----------------------------------------------------
  player.resolveTarget = trimHopToWalls;
  player.confine = (position) => clampToBoard(position, player.radius);
  player.update(delta);

  // --- Hide any prop that lines up between the camera and the frog. ------
  if (scenery) scenery.update(camera, player.position, delta);

  // =======================================================================
  // 1. INTERACTIONS WITH THE WORLD
  // =======================================================================
  const playerPos2 = new THREE.Vector2(player.position.x, player.position.y);

  // --- House interaction --------------------------------------------------
  let inHouse = null;
  for (const house of houses) {
    if (!house.alive) continue;
    if (house.position.distanceTo(playerPos2) < house.radius * HOUSE_INTERIOR_RADIUS_RATIO) {
      inHouse = house;
      break;
    }
  }
  if (inHouse && !houseShield.active && houseShield.cooldown <= 0) {
    houseShield.active = true;
    houseShield.timer = HOUSE_INVULN_DURATION;
    houseShield.cooldown = HOUSE_COOLDOWN;
    health.heal(1);
    hud.showAction('Safe inside! +1 ❤', 'house', '#a3e635');
    sound.shield();
  }
  if (houseShield.active) {
    houseShield.timer = Math.max(0, houseShield.timer - delta);
    if (houseShield.timer === 0) {
      houseShield.active = false;
    }
  }
  if (houseShield.cooldown > 0) {
    houseShield.cooldown = Math.max(0, houseShield.cooldown - delta);
  }

  // --- Bush interaction ---------------------------------------------------
  let inBush = null;
  if (scenery) {
    for (const bush of scenery.bushes) {
      if (!bush.alive) continue;
      if (bush.position.distanceTo(playerPos2) < BUSH_INTERIOR_DISTANCE) {
        inBush = bush;
        break;
      }
    }
  }
  if (inBush) {
    if (bushState.bush !== inBush) {
      // Entered a new bush.
      bushState.bush = inBush;
      bushState.timer = BUSH_HIDE_DURATION;
      bushState.exposed = false;
    } else if (!bushState.exposed) {
      bushState.timer = Math.max(0, bushState.timer - delta);
      if (bushState.timer === 0) {
        bushState.exposed = true;
        hud.showAction('Spotted! Insects are coming for you', 'bush', '#ff6b6b');
        sound.hurt();
      }
    }
    bushState.active = !bushState.exposed;
  } else {
    // Left any bush.
    if (bushState.bush) {
      bushState.bush = null;
      bushState.timer = 0;
      bushState.exposed = false;
    }
    bushState.active = false;
  }

  // --- Flower interaction -------------------------------------------------
  let onFlower = null;
  if (scenery) {
    for (const flower of scenery.flowers) {
      if (!flower.alive) continue;
      if (flower.position.distanceTo(playerPos2) < FLOWER_TRIGGER_DISTANCE) {
        onFlower = flower;
        break;
      }
    }
  }
  if (onFlower) {
    if (flowerState.flower !== onFlower) {
      flowerState.flower = onFlower;
      flowerState.timer = 0;
    } else {
      flowerState.timer = Math.min(FLOWER_HARVEST_TIME, flowerState.timer + delta);
      if (flowerState.timer >= FLOWER_HARVEST_TIME) {
        // Bloom into a 1.5x power-up, dropped just beside the flower.
        const f = flowerState.flower;
        f.alive = false;
        f.group.visible = false;
        f.regrowTimer = FLOWER_REGROW;
        const spot = findFlowerDropSpot(f.position.x, f.position.y);
        powerUps.spawnAt(spot.x, spot.y, ['speed', 'range', 'freeze', 'shield'], 1.5);
        hud.showAction('A flower bloomed into a 1.5x power-up!', 'flower', '#ff6b9d');
        sound.powerUp();
        flowerState.flower = null;
        flowerState.timer = 0;
      }
    }
  } else if (flowerState.flower) {
    flowerState.flower = null;
    flowerState.timer = 0;
  }

  // Flower and bush regrowth.
  if (scenery) {
    for (const flower of scenery.flowers) {
      if (!flower.alive) {
        flower.regrowTimer -= delta;
        if (flower.regrowTimer <= 0) {
          flower.alive = true;
          flower.group.visible = true;
        }
      }
    }
    for (const bush of scenery.bushes) {
      if (!bush.alive) {
        bush.regrowTimer = (bush.regrowTimer || 0) - delta;
        if (bush.regrowTimer <= 0) {
          bush.alive = true;
          bush.group.visible = true;
          damagedBushes.delete(bush);
        }
      }
    }
  }

  // --- Pond interaction ---------------------------------------------------
  let nearPond = null;
  let inWater = null;
  if (scenery) {
    for (const pond of scenery.ponds) {
      const d = pond.position.distanceTo(playerPos2);
      if (d < pond.shoreRadius) nearPond = pond;
      if (d < pond.surfaceRadius * POND_INNER_RADIUS_RATIO) inWater = pond;
    }
  }
  if (nearPond && health.hp < health.maxHp) {
    // Heal while standing on the shore.
    health._silentHeal(health.hp + POND_SHORE_HEAL_RATE * delta);
  }
  if (inWater && pondState.cooldown <= 0) {
    if (!pondState.inWater) {
      pondState.inWater = true;
      pondState.pond = inWater;
      pondState.timer = 0;
    } else {
      pondState.timer += delta;
      if (pondState.timer >= POND_BONUS_WADE_TIME && !pondState.pond.bonusClaimed) {
        pondState.pond.bonusClaimed = true;
        triggerPondBonus(pondState.pond);
      }
    }
  } else if (pondState.inWater) {
    pondState.inWater = false;
    pondState.pond = null;
    pondState.timer = 0;
    pondState.cooldown = POND_COOLDOWN;
  }
  if (pondState.cooldown > 0) {
    pondState.cooldown = Math.max(0, pondState.cooldown - delta);
  }

  // --- Pond-driven slow effect -------------------------------------------
  if (powerUps.pondSlowTimer && powerUps.pondSlowTimer > 0) {
    powerUps.pondSlowTimer -= delta;
  } else {
    powerUps.pondSlowTimer = 0;
  }

  // =======================================================================
  // 2. PROXIMITY HINT
  // =======================================================================
  const presentKeys = [];
  if (inHouse) presentKeys.push('house');
  if (inBush) presentKeys.push('bush');
  if (onFlower) presentKeys.push('flower');
  if (nearPond) presentKeys.push('pond');
  if (scenery) {
    const { tree, distance } = nearestTree(playerPos2, scenery.trees);
    if (tree && distance < TREE_PROXIMITY_DISTANCE) presentKeys.push('tree');
  }
  hud.setProximity(highestPriorityKey(presentKeys));

  // =======================================================================
  // 3. POWER-UPS
  // =======================================================================
  const picked = powerUps.update(delta, player.position, isPowerUpSpotFree);
  for (const type of picked) {
    if (type.key === 'heart') {
      health.addMaxHp(1);
      sound.heal();
    } else if (type.key === 'bomb') {
      enemies.forEach((enemy) => enemy.dispose());
      enemies = [];
      sound.bomb();
    }
  }

  // =======================================================================
  // 4. ATTACK LIFECYCLE
  // =======================================================================
  attack.update(delta);
  const attackActive = attack.visualTimer > 0;

  if (attackActive && !attackWasActive) {
    const hit = attack.enemiesInRange(enemies);
    if (hit.length > 0) {
      const destroyed = hit.filter((enemy) => enemy.takeHit());

      if (destroyed.length > 0) {
        destroyed.forEach((enemy) => {
          enemy.dispose();
          score.addKillPoints(enemy.type.points);
        });
        enemies = enemies.filter((enemy) => !destroyed.includes(enemy));
        sound.kill();
      }
    }
  }
  attackWasActive = attackActive;

  // =======================================================================
  // 5. ENEMY SPAWNING
  // =======================================================================
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnEnemy(params.enemySpeed);
    spawnTimer = params.enemySpawnDelay;
  }

  // =======================================================================
  // 6. ENEMIES (state machine, AI, movement, attacks)
  // =======================================================================
  // Tree list is shared across enemies.
  const trees = scenery ? scenery.trees : [];

  // Slow factor stacks with the existing freeze power-up.
  const pondSlowFactor = powerUps.pondSlowTimer > 0 ? 0.4 : 1;

  // First pass: behaviour + bookkeeping. Then move.
  for (const enemy of enemies) {
    enemy.setBaseSpeed(params.enemySpeed * boosts.enemySpeed * pondSlowFactor);
    enemy.animate(delta);

    const current = enemy.position;

    // Where is the player right now? Disengaged insects have already
    // forgotten it.
    if (enemy.state === 'chasing') {
      enemy.rememberPlayerPosition(playerPos2.x, playerPos2.y);
    }

    const canSee = enemy.state === 'chasing'
      ? !isBlockedByTree(current, { x: enemy.lastSeenX, y: enemy.lastSeenY }, trees, TREE_LOS_RADIUS)
      : true;

    enemy.updateBehavior(delta, canSee);

    // -- Pick a target ----------------------------------------------------
    let target = null;
    let isHouseAttack = false;
    let isBushAttack = false;

    // Distances are computed by hand: `current` is a Vector3 and the props
    // below are Vector2, and Vector3.distanceTo(Vector2) yields NaN because
    // the prop has no `z`.
    const distanceTo = (p) => Math.hypot(current.x - p.x, current.y - p.y);

    // 1. House whacking: if a live house is in range, prioritise it.
    if (enemy.state === 'chasing') {
      for (const house of houses) {
        if (!house.alive) continue;
        if (distanceTo(house.position) < HOUSE_ATTACK_RANGE) {
          target = house.position;
          isHouseAttack = true;
          if (house.mayBeHit(delta)) {
            const destroyed = house.takeDamage();
            house.registerHit();
            sound.houseHit();
            if (destroyed) {
              hud.showAction('A house has fallen!', 'house', '#e5484d');
              // Open up the gap: the house is no longer an obstacle, so
              // the player and other insects can walk through the ruins.
              obstacles = obstacles.filter((o) => o !== house);
            }
          }
          break;
        }
      }
    }

    // 2. Bush whacking: a *discovered* hero hiding in a bush.
    if (!isHouseAttack && enemy.state === 'chasing' && bushState.exposed && bushState.bush && bushState.bush.alive) {
      if (distanceTo(bushState.bush.position) < BUSH_ATTACK_RANGE) {
        target = bushState.bush.position;
        isBushAttack = true;
        if (!damagedBushes.has(bushState.bush)) {
          // One hit clears the bush.
          damagedBushes.add(bushState.bush);
          bushState.bush.alive = false;
          bushState.bush.group.visible = false;
          bushState.bush.regrowTimer = 25; // bushes take longer to regrow than flowers
          hud.showAction('A bush was whacked apart', 'bush', '#ff6b6b');
          sound.hurt();
        }
      }
    }

    // 3. Default: chase player, or fly away when disengaged.
    if (!target) {
      if (enemy.state === 'disengaged') {
        // Pick a point along the disengage direction well off-screen.
        _target.set(
          current.x + enemy.disengageDirection.x * 500,
          current.y + enemy.disengageDirection.y * 500
        );
        clampToBoard(_target, 60);
        target = _target;
      } else {
        target = { x: enemy.lastSeenX, y: enemy.lastSeenY };
      }
    }

    // -- Move towards target ---------------------------------------------
    _dir.set(target.x - current.x, target.y - current.y);
    if (_dir.lengthSq() < 1e-6) continue;
    _dir.normalize();

    enemy.group.rotation.z = Math.atan2(_dir.y, _dir.x);

    const step = enemy.speed * delta;
    const dx = _dir.x * step;
    const dy = _dir.y * step;

    const candidates = [[dx, dy], [dx, 0], [0, dy], [dy, -dx], [-dy, dx]];
    let moved = false;
    for (const [moveX, moveY] of candidates) {
      if (moveX === 0 && moveY === 0) continue;
      if (canEnemyStep(current.x + moveX, current.y + moveY, enemy)) {
        current.x += moveX;
        current.y += moveY;
        moved = true;
        break;
      }
    }
    if (!moved) unstickEnemy(enemy);

    clampToBoard(current, enemy.type.radius * 0.5);
  }

  // Remove insects that have finished their disengage animation.
  enemies = enemies.filter((enemy) => {
    if (enemy.readyToRemove) {
      enemy.dispose();
      return false;
    }
    return true;
  });

  // =======================================================================
  // 7. SCORE / FLOWER GROWTH
  // =======================================================================
  score.addSurvivalPoints(delta);

  const milestone = Math.floor(score.value / 200);
  if (milestone > lastFlowerMilestone) {
    lastFlowerMilestone = milestone;
    if (scenery) {
      const grown = scenery.growFlowers();
      if (grown.length > 0) {
        hud.showAction('A new flower has bloomed!', 'flower', '#ff6b9d');
      }
    }
  }

  // =======================================================================
  // 8. DAMAGE
  // =======================================================================
  health.update(delta);

  const safe =
    boosts.shielded ||
    health.shielded ||
    houseShield.active ||
    bushState.active;

  if (!safe && playerHitsEnemy()) {
    health.takeHit();
    sound.hurt();
  }

  if (player.model) {
    const blinking = health.shielded && Math.floor(health.invulnerable * 12) % 2 === 1;
    player.model.visible = !blinking;
  }

  if (health.dead) {
    showGameOver();
  }

  // =======================================================================
  // 9. HOUSE VISUAL UPKEEP
  // =======================================================================
  for (const house of houses) house.update(delta);

  // =======================================================================
  // 10. FINAL SAFETY NET
  // =======================================================================
  clampToBoard(player.group.position, player.radius);

  renderer.render(scene, camera);
});

spawnEnemy();

// ---------------------------------------------------------------------------
// Debug hook for automated testing. Exposes the live world state so a headless
// browser can assert on it without reaching into module scope. Not used by the
// game itself.
// ---------------------------------------------------------------------------
window.__hud = {
  get houses() { return houses; },
  get trees() { return scenery ? scenery.trees : []; },
  get bushes() { return scenery ? scenery.bushes : []; },
  get flowers() { return scenery ? scenery.flowers : []; },
  get ponds() { return scenery ? scenery.ponds : []; },
  get enemies() { return enemies; },
  get pickups() { return powerUps.pickups; },
  get powerUps() { return powerUps; },
  get scene() { return scene; },
  get score() { return score; },
  get health() { return health; },
  get scenery() { return scenery; },
  get houseAttackRange() { return HOUSE_ATTACK_RANGE; },
  /** Move the hero to a world position (test only). */
  teleport(x, y) {
    player.group.position.set(x, y, 0);
    player.stop();
  },
  /** Current hero ground position as {x, y}. */
  get playerPos2() { return { x: player.position.x, y: player.position.y }; },
  /** Force a given interaction's internal state for inspection. */
  state: {
    get houseShield() { return houseShield; },
    get bushState() { return bushState; },
    get flowerState() { return flowerState; },
    get pondState() { return pondState; },
  },
};
