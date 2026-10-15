/**
 * Tracks the player's score and mirrors it into a DOM overlay.
 *
 * Scoring rules (per the course specification):
 *   - Survival: 1 point per 10 seconds  ->  SCORE_PER_SECOND = 0.1
 *   - Kills:    10 points per enemy defeated
 */
export class Score {
  constructor() {
    /** Reward for staying alive, in points per second. */
    this.SCORE_PER_SECOND = 0.1;
    /** Reward for defeating one enemy. */
    this.SCORE_PER_KILL = 10;

    // Exact (fractional) score. The UI shows the floored value.
    this.value = 0;

    // --- DOM overlay -------------------------------------------------------
    this.element = document.createElement('div');
    this.element.className = 'score';
    this.element.textContent = '0';
    document.body.appendChild(this.element);

    this.render();
  }

  /**
   * Adds survival points based on elapsed time.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  addSurvivalPoints(delta) {
    this.value += this.SCORE_PER_SECOND * delta;
    this.render();
  }

  /**
   * Awards points for a defeated enemy.
   *
   * @param {number} [points] Reward for this kill. Different insect species
   *   are worth different amounts; defaults to the standard kill value.
   */
  addKillPoints(points = this.SCORE_PER_KILL) {
    this.value += points;
    this.render();
  }

  /**
   * Resets the score back to zero (used when restarting).
   */
  reset() {
    this.value = 0;
    this.render();
  }

  /**
   * Pushes the current score into the DOM as a whole number.
   */
  render() {
    this.element.textContent = String(Math.floor(this.value));
  }
}
