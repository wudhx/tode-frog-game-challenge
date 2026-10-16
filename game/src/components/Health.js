/**
 * The hero's health: a small pool of hearts, a mercy window after each hit,
 * and the HUD that shows it.
 *
 * Touching an insect used to end the run instantly, which made the first few
 * seconds brutally unforgiving. Now a touch costs one heart and buys the
 * player a moment of invulnerability to hop clear.
 */

/** Hearts the hero starts a run with. */
export const STARTING_MAX_HP = 3;
/** Seconds of invulnerability granted after taking a hit. */
export const HIT_INVULNERABILITY = 1.5;
/** Never let a run snowball into an unrecoverable wall of hearts. */
export const MAX_HP_CAP = 12;

/** Crisp inline heart glyph, filled or hollow. */
function heartSvg(filled) {
  const fill = filled ? '#e5484d' : 'none';
  const stroke = filled ? '#8c1c1f' : 'rgba(255,255,255,0.45)';
  return (
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    `<path d="M12 20.5S4.2 15.6 2.6 11.4C1.3 7.9 3.2 5 6.3 5c1.9 0 3.3 1 4.2 2.2C11.4 6 12.8 5 14.7 5c3.1 0 5 2.9 3.7 6.4C16.8 15.6 12 20.5 12 20.5z" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`
  );
}

export class Health {
  constructor() {
    /** Maximum hearts for this run. Grows when a Heart pickup is collected. */
    this.maxHp = STARTING_MAX_HP;
    /** Current hearts. */
    this.hp = this.maxHp;
    /** Seconds of remaining mercy time. */
    this.invulnerable = 0;

    this.buildHud();
  }

  /** Creates the row of hearts in the top-left corner. */
  buildHud() {
    this.element = document.createElement('div');
    this.element.className = 'health';
    document.body.appendChild(this.element);
    this.render();
  }

  /**
   * Takes one heart off, unless the hero is still in their mercy window.
   *
   * @returns {boolean} True if the hit actually landed.
   */
  takeHit() {
    if (this.invulnerable > 0) return false;

    this.hp = Math.max(0, this.hp - 1);
    this.invulnerable = HIT_INVULNERABILITY;
    this.render();
    return true;
  }

  /**
   * Permanently raises the heart pool. Used by the Heart pickup, so health
   * can be built up over a run rather than only drained.
   *
   * @param {number} [amount] Hearts to add to the maximum.
   */
  addMaxHp(amount = 1) {
    this.maxHp = Math.min(MAX_HP_CAP, this.maxHp + amount);
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.render();
  }

  /**
   * Tops the hero back up without raising the maximum.
   *
   * @param {number} [amount] Hearts to restore.
   */
  heal(amount = 1) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.render();
  }

  /**
   * Like `heal`, but for the steady trickle from a pond shore — fractional
   * values are allowed and the HUD is not redrawn every frame (the player
   * is already there to see the bar fill).
   *
   * @param {number} targetHp New hp value, clamped to the maximum.
   */
  _silentHeal(targetHp) {
    this.hp = Math.min(this.maxHp, targetHp);
  }

  /**
   * Counts the mercy window down. Called once per frame.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  update(delta) {
    if (this.invulnerable > 0) {
      this.invulnerable = Math.max(0, this.invulnerable - delta);
    }
  }

  /** True once the hero has run out of hearts. */
  get dead() {
    return this.hp <= 0;
  }

  /** True while the hero cannot be hurt. */
  get shielded() {
    return this.invulnerable > 0;
  }

  /** Clears the board for a fresh run. */
  reset() {
    this.maxHp = STARTING_MAX_HP;
    this.hp = this.maxHp;
    this.invulnerable = 0;
    this.render();
  }

  /** Mirrors the current hearts into the HUD. */
  render() {
    let markup = '';
    for (let i = 0; i < this.maxHp; i++) {
      markup += `<span class="heart${i < this.hp ? ' is-full' : ''}">${heartSvg(i < this.hp)}</span>`;
    }
    this.element.innerHTML = markup;

    // Flash the whole row when the hero is in their mercy window.
    this.element.classList.toggle('is-hurt', this.invulnerable > 0);
  }
}
