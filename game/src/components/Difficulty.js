/**
 * Dynamic difficulty scaling.
 *
 * As the player's score climbs, the world pushes back: enemies spawn faster
 * and move quicker, while the hero gets a smaller compensating boost. Enemy
 * parameters are deliberately tuned to scale *faster* than the player's, so
 * the hero never fully outgrows the threat.
 */

// ---------------------------------------------------------------------------
// Base (starting) values — imported piecemeal by the systems that own them.
// ---------------------------------------------------------------------------
export const BASE_ENEMY_SPAWN_DELAY = 3;
/**
 * Raised from the original 30 to keep the pace right on the much larger
 * board: insects now have roughly twice as far to travel before they reach
 * the hero.
 */
export const BASE_ENEMY_SPEED = 52;
export const BASE_PLAYER_MOVE_DURATION = 0.28;
export const BASE_ATTACK_COOLDOWN = 1;
export const BASE_ATTACK_RADIUS = 120;

// ---------------------------------------------------------------------------
// Growth rates
// ---------------------------------------------------------------------------
/** How aggressively difficulty ramps with score. Higher = harsher. */
export const GROWTH_RATE = 0.02;

/** Enemy multipliers per unit of difficulty (scale faster). */
const ENEMY_SPAWN_RATE = 0.6;
const ENEMY_SPEED_RATE = 0.8;

/** Player multipliers per unit of difficulty (gentler). */
const PLAYER_SPEED_RATE = 0.35;
const PLAYER_ATTACK_DELAY_RATE = 0.3;
const PLAYER_ATTACK_RANGE_RATE = 0.2;

// ---------------------------------------------------------------------------
// Arithmetic helpers
// ---------------------------------------------------------------------------
/** Never let a delay collapse to zero. */
const MIN_DELAY = 0.35;
/** Cap the difficulty factor so late game stays playable. */
const MAX_FACTOR = 4;

/**
 * Computes the current difficulty multiplier from the score.
 *
 * @param {number} score The player's current score.
 * @returns {number} A factor >= 1.
 */
export function difficultyFactor(score) {
  return Math.min(MAX_FACTOR, 1 + score * GROWTH_RATE);
}

/**
 * Derives every tunable game parameter for the current score.
 *
 * @param {number} score The player's current score.
 * @returns {{
 *   factor: number,
 *   enemySpawnDelay: number,
 *   enemySpeed: number,
 *   playerMoveDuration: number,
 *   attackCooldown: number,
 *   attackRadius: number,
 * }}
 */
export function scaledParameters(score) {
  const factor = difficultyFactor(score);

  // Delays shrink as difficulty rises; speeds/radii grow.
  const enemySpawnDelay = Math.max(
    MIN_DELAY,
    BASE_ENEMY_SPAWN_DELAY / (1 + (factor - 1) * ENEMY_SPAWN_RATE)
  );
  const enemySpeed = BASE_ENEMY_SPEED * (1 + (factor - 1) * ENEMY_SPEED_RATE);

  const playerMoveDuration = Math.max(
    0.1,
    BASE_PLAYER_MOVE_DURATION / (1 + (factor - 1) * PLAYER_SPEED_RATE)
  );
  const attackCooldown = Math.max(
    MIN_DELAY,
    BASE_ATTACK_COOLDOWN / (1 + (factor - 1) * PLAYER_ATTACK_DELAY_RATE)
  );
  const attackRadius = BASE_ATTACK_RADIUS * (1 + (factor - 1) * PLAYER_ATTACK_RANGE_RATE);

  return {
    factor,
    enemySpawnDelay,
    enemySpeed,
    playerMoveDuration,
    attackCooldown,
    attackRadius,
  };
}
