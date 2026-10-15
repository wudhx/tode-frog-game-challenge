import * as THREE from 'three';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { Player } from './components/Player.js';
import { Enemy, SPAWN_POINTS } from './components/Enemy.js';
import { Map, TILE_COUNT, TILE_SIZE } from './components/Map.js';
import { addHouses, collidesWithHouse } from './components/House.js';
import { Attack } from './components/Attack.js';
import { Score } from './components/Score.js';
import { sound } from './components/Sound.js';
import { scaledParameters } from './components/Difficulty.js';
import './style.css';

// ---------------------------------------------------------------------------
// Tunables for the gameplay loop
// ---------------------------------------------------------------------------
/** Enemy vs. player: how close counts as a fatal touch. */
const PLAYER_HIT_DISTANCE = 45;
/** Enemy vs. enemy: how close two monsters may get. */
const ENEMY_HIT_DISTANCE = 55;
/** Player vs. house: the hero cannot hop into a wall. */
const PLAYER_HOUSE_DISTANCE = 70;
/** Enemy vs. house: keep them from walking through walls. */
const ENEMY_HOUSE_DISTANCE = 75;

/**
 * How far from the origin the hero may roam. The board is
 * TILE_COUNT * TILE_SIZE wide, so this leaves a half-tile of ground in front
 * of the invisible wall instead of letting the frog hop into empty space.
 */
const PLAYFIELD_HALF = (TILE_COUNT * TILE_SIZE) / 2 - TILE_SIZE;

/**
 * Clamps a ground position into the playfield. Used as a hard backstop so a
 * hop can never carry the hero past the edge, no matter what triggered it.
 *
 * @param {THREE.Vector3} position Position to clamp, modified in place.
 */
function clampToPlayfield(position) {
  position.x = THREE.MathUtils.clamp(position.x, -PLAYFIELD_HALF, PLAYFIELD_HALF);
  position.y = THREE.MathUtils.clamp(position.y, -PLAYFIELD_HALF, PLAYFIELD_HALF);
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

/** Placed house records, filled in asynchronously. */
let houses = [];

addHouses(map.housesGroup, null).then((placed) => {
  houses = placed;
});

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------
const player = new Player(scene);
const camera = createCamera(player.group);

const score = new Score();
const attack = new Attack(scene, player);

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

// Game-over overlay (created lazily on first loss).
let gameOverOverlay = null;

/**
 * Shows the "Game Over" overlay and freezes the world.
 */
function showGameOver() {
  gameState = 'game-over';

  if (!gameOverOverlay) {
    gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'game-over';
    gameOverOverlay.textContent = 'Game Over';
    document.body.appendChild(gameOverOverlay);
  }
  gameOverOverlay.style.display = 'flex';

  player.group.visible = false;
  player.controlsEnabled = false;
  player.stop();
  attack.enabled = false;

  sound.gameOver();
}

/**
 * Clears the board and restarts a fresh run.
 */
function resetGame() {
  player.group.visible = true;
  player.group.position.copy(PLAYER_START);
  player.group.position.z = 0;
  player.yaw.rotation.z = 0;
  player.controlsEnabled = true;
  player.stop();

  enemies.forEach((enemy) => enemy.dispose());
  enemies = [];
  spawnTimer = 0;

  score.reset();
  attack.enabled = true;
  attack.reset();

  if (gameOverOverlay) {
    gameOverOverlay.style.display = 'none';
  }

  gameState = 'playing';

  // Seed the new run with a single enemy.
  spawnEnemy();
}

// Space restarts the game once it is over.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  if (gameState === 'game-over') {
    event.preventDefault();
    resetGame();
  }
});

// M toggles all sound effects.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyM') return;
  sound.muted = !sound.muted;
});

// ---------------------------------------------------------------------------
// Enemy spawning
// ---------------------------------------------------------------------------
/**
 * Spawns one enemy at a random corner of the map.
 *
 * @param {number} [speed] Initial speed for the new monster.
 */
function spawnEnemy(speed) {
  const point = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  const enemy = new Enemy(scene, point);
  if (typeof speed === 'number') enemy.speed = speed;
  enemies.push(enemy);
}

// ---------------------------------------------------------------------------
// Gameplay helpers
// ---------------------------------------------------------------------------

/**
 * Detects whether any enemy is close enough to fatally touch the hero.
 *
 * @returns {boolean} True on a fatal collision.
 */
function playerHitsEnemy() {
  return enemies.some((enemy) => {
    const dx = enemy.position.x - player.position.x;
    const dy = enemy.position.y - player.position.y;
    return Math.sqrt(dx * dx + dy * dy) < PLAYER_HIT_DISTANCE;
  });
}

/**
 * Checks whether an enemy may stand at the given ground coordinates.
 *
 * Enemies respect walls and each other's personal space, but are never
 * blocked by the player — see the movement loop for why that matters.
 *
 * @param {number} x Candidate X coordinate.
 * @param {number} y Candidate Y coordinate.
 * @param {import('./components/Enemy.js').Enemy} self The moving enemy.
 * @returns {boolean} True if the spot is free.
 */
function canEnemyStep(x, y, self) {
  // Walls block movement.
  const probe = new THREE.Vector3(x, y, 0);
  if (collidesWithHouse(probe, houses, ENEMY_HOUSE_DISTANCE)) return false;

  // Other enemies block movement.
  return !enemies.some((other) => {
    if (other === self) return false;
    return (
      Math.hypot(other.position.x - x, other.position.y - y) < ENEMY_HIT_DISTANCE
    );
  });
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

// Track the visual ring's lifetime so an attack only "lands" once.
let attackWasActive = false;

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1); // clamp big hitches

  // --- Frozen? Only render. ----------------------------------------------
  if (gameState === 'game-over') {
    renderer.render(scene, camera);
    return;
  }

  // --- Difficulty scaling -------------------------------------------------
  const params = scaledParameters(score.value);
  player.setMoveDuration(params.playerMoveDuration);
  attack.cooldownDuration = params.attackCooldown;
  attack.radius = params.attackRadius;

  // --- Player movement ----------------------------------------------------
  // The hero may not hop into a wall, nor off the edge of the board. Clamping
  // the landing spot (rather than only rejecting the hop) means a hero
  // standing on the boundary stays put instead of building up illegal moves.
  player.isBlocked = (target) => collidesWithHouse(target, houses, PLAYER_HOUSE_DISTANCE);
  player.confine = clampToPlayfield;
  player.update(delta);

  // --- Attack lifecycle ---------------------------------------------------
  attack.update(delta);
  const attackActive = attack.visualTimer > 0;

  // On the rising edge of an attack, resolve who got hit.
  if (attackActive && !attackWasActive) {
    const hit = attack.enemiesInRange(enemies);
    if (hit.length > 0) {
      hit.forEach((enemy) => {
        enemy.dispose();
        score.addKillPoints();
      });
      enemies = enemies.filter((enemy) => !hit.includes(enemy));

      // One chirp per attack, no matter how many flies were caught.
      sound.kill();
    }
  }
  attackWasActive = attackActive;

  // --- Enemy spawning -----------------------------------------------------
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnEnemy(params.enemySpeed);
    spawnTimer = params.enemySpawnDelay;
  }

  // --- Enemies ------------------------------------------------------------
  enemies.forEach((enemy) => {
    enemy.speed = params.enemySpeed;

    const current = enemy.position;
    const dir = new THREE.Vector2(
      player.position.x - current.x,
      player.position.y - current.y
    );
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();

    // Face the player whether or not the step below succeeds.
    enemy.group.rotation.z = Math.atan2(dir.y, dir.x);

    const step = enemy.speed * delta;
    const dx = dir.x * step;
    const dy = dir.y * step;

    // Enemies are deliberately NOT blocked by the player. If they were, they
    // would stall just outside the kill radius (distance ~45) and the run
    // could never end. Letting them close the gap is what makes the
    // "Game Over" check fire reliably.
    if (canEnemyStep(current.x + dx, current.y + dy, enemy)) {
      current.x += dx;
      current.y += dy;
    } else if (canEnemyStep(current.x + dx, current.y, enemy)) {
      // Slide along X to walk around a wall or a crowded neighbour.
      current.x += dx;
    } else if (canEnemyStep(current.x, current.y + dy, enemy)) {
      // Slide along Y instead.
      current.y += dy;
    }

    // Monsters hunt, but they stay on the board like everyone else.
    clampToPlayfield(current);
  });

  // --- Scoring: survival --------------------------------------------------
  score.addSurvivalPoints(delta);

  // --- Lose condition (highest priority) ----------------------------------
  if (playerHitsEnemy()) {
    showGameOver();
  }

  // --- Final safety net ---------------------------------------------------
  // Whatever the frame did, the hero ends it inside the board.
  clampToPlayfield(player.group.position);

  renderer.render(scene, camera);
});

// Give the player a starting wave immediately.
spawnEnemy();
