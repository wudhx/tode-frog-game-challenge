/**
 * Awakening — the panic button.
 *
 * Score charges one bar every `AWAKEN_SCORE_PER_CHARGE` points. Only one charge
 * can be banked. Pressing E spends it for `AWAKEN_DURATION` seconds of greatly
 * boosted power, and the run goes back to normal when it runs out.
 *
 * Everything here is a multiplier the main loop folds into the same derived
 * stats it already computes, so an awakening can never bypass the global
 * damage-reduction ceiling or the attack-cooldown floor.
 */

/** Points needed to earn one awakening charge. */
export const AWAKEN_SCORE_PER_CHARGE = 1000;
/**
 * A single huge payout (a boss kill) can bank a charge but cannot overflow
 * the counter: whatever is left after the charge is dropped. Without this a
 * boss kill would hand back most of a second bar.
 */
export const AWAKEN_MAX_PAYOUT_CARRY = AWAKEN_SCORE_PER_CHARGE;
/** How many charges can be banked at once. */
export const AWAKEN_MAX_CHARGES = 1;
/** How long an awakening lasts, in seconds. */
export const AWAKEN_DURATION = 10;
/** Attack multiplier while awakened. */
export const AWAKEN_ATTACK_MULT = 3;
/** Incoming-damage multiplier while awakened (i.e. 65% less damage). */
export const AWAKEN_DAMAGE_TAKEN_MULT = 0.35;
/** Attack-range multiplier while awakened. */
export const AWAKEN_RANGE_MULT = 1.6;
/** Move-speed bonus while awakened, as a fraction (0.3 = +30%). */
export const AWAKEN_SPEED_BONUS = 0.3;

export class Awakening {
  constructor() {
    /** Banked charges; at most AWAKEN_MAX_CHARGES. */
    this.charges = 0;
    /** Seconds left on the active awakening, 0 when idle. */
    this.remaining = 0;
    /** Score already counted toward the next charge, carried across charges. */
    this.scoreProgress = 0;
    /** Set briefly when a charge becomes ready, for the HUD flash. */
    this.justCharged = false;
  }

  /** True while the boost is running. */
  get active() {
    return this.remaining > 0;
  }

  /** Fraction of the way to the next charge, 0–1. */
  get progress() {
    if (this.charges >= AWAKEN_MAX_CHARGES) return 1;
    return Math.min(1, this.scoreProgress / AWAKEN_SCORE_PER_CHARGE);
  }

  /** True when the hero can press E. */
  get ready() {
    return this.charges > 0 && !this.active;
  }

  /**
   * Feeds new score into the charge counter.
   *
   * @param {number} amount Points earned this frame.
   * @returns {boolean} True if a charge was just completed.
   */
  addScore(amount) {
    if (!(amount > 0)) return false;
    this.scoreProgress += amount;
    let charged = false;
    while (this.scoreProgress >= AWAKEN_SCORE_PER_CHARGE) {
      this.scoreProgress -= AWAKEN_SCORE_PER_CHARGE;
      if (this.charges < AWAKEN_MAX_CHARGES) {
        this.charges += 1;
        charged = true;
      } else {
        // Bank is full: hold the leftover points instead of letting them
        // vanish, but do not accumulate more than one charge worth.
        this.scoreProgress = Math.min(this.scoreProgress, AWAKEN_SCORE_PER_CHARGE);
        break;
      }
    }
    if (charged) this.justCharged = true;
    return charged;
  }

  /**
   * Spends a charge and starts the boost.
   *
   * @returns {boolean} True if the awakening actually started.
   */
  activate() {
    if (!this.ready) return false;
    this.charges = 0;
    this.remaining = AWAKEN_DURATION;
    return true;
  }

  /**
   * Ticks the timer down.
   *
   * @param {number} delta Seconds elapsed.
   * @returns {boolean} True on the frame the awakening ended.
   */
  update(delta) {
    this.justCharged = false;
    if (this.remaining <= 0) return false;
    this.remaining = Math.max(0, this.remaining - delta);
    return this.remaining === 0;
  }

  /** Multipliers the main loop applies while the boost is active. */
  multipliers() {
    if (!this.active) {
      return { attack: 1, damageTaken: 1, range: 1, speedBonus: 0 };
    }
    return {
      attack: AWAKEN_ATTACK_MULT,
      damageTaken: AWAKEN_DAMAGE_TAKEN_MULT,
      range: AWAKEN_RANGE_MULT,
      speedBonus: AWAKEN_SPEED_BONUS,
    };
  }

  /** Clears the bar for a fresh run. */
  reset() {
    this.charges = 0;
    this.remaining = 0;
    this.scoreProgress = 0;
    this.justCharged = false;
  }
}
