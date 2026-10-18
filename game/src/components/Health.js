/**
 * The hero's health pool.
 *
 * Shown as a number and a horizontal bar rather than a row of hearts. The bar
 * carries fractional values naturally, which the pond's percentage
 * regeneration and its 20% soak both need — a row of whole hearts could not
 * express "healed 3 HP this second" without a half-heart renderer.
 *
 * The pool starts at 100 and grows by 20 for every Heart pickup, up to 200.
 */

/** HP the hero starts a run with. */
export const STARTING_MAX_HP = 100;
/** HP a single insect touch costs. */
export const HIT_DAMAGE = 20;
/** HP the Heart pickup adds to the pool, and restores. */
export const HEART_PICKUP = 20;
/** Seconds of invulnerability granted after taking a hit. */
export const HIT_INVULNERABILITY = 1.5;

export class Health {
  constructor() {
    /** Maximum HP for this run. Grows when a Heart pickup is collected. */
    this.maxHp = STARTING_MAX_HP;
    /** Current HP. Fractional — regen and soak both produce decimals. */
    this.hp = this.maxHp;
    /** Seconds of remaining mercy time. */
    this.invulnerable = 0;

    /**
     * Heal-over-time effects. A label identifies the source, so eating a
     * second fruit refreshes the timer instead of stacking the rate.
     * @type {Array<{label: string, rate: number, remaining: number, total: number}>}
     */
    this.regenBuffs = [];

    /** Flash timers that drive the hurt / heal animations. */
    this.hurtFlash = 0;
    this.healFlash = 0;

    // Cached values so a 60fps regen does not rewrite the DOM every frame.
    this._lastPct = -1;
    this._lastText = '';
    this._lastLevelText = '';
    this._lastBuffSig = '';

    this.buildHud();
  }

  /** Creates the HP panel in the top-left corner. */
  buildHud() {
    this.element = document.createElement('div');
    this.element.className = 'health';
    this.element.innerHTML = [
      '<div class="hp-head">',
      '  <span class="hp-avatar" title="Character panel (C)"></span>',
      '  <span class="hp-name">HP</span>',
      '  <span class="hp-level">Lv.1</span>',
      '  <span class="hp-value">100 / 100</span>',
      '</div>',
      '<div class="hp-track"><div class="hp-fill"></div></div>',
      '<div class="hp-buffs"></div>',
    ].join('');

    this.avatarEl = this.element.querySelector('.hp-avatar');
    this.valueEl = this.element.querySelector('.hp-value');
    this.levelEl = this.element.querySelector('.hp-level');
    this.fillEl = this.element.querySelector('.hp-fill');
    this.buffsEl = this.element.querySelector('.hp-buffs');

    document.body.appendChild(this.element);
    this.render();
  }

  /**
   * Takes HP off, unless the hero is still in their mercy window.
   *
   * @param {number} [damage] HP to remove. The pond soaks 20% by passing 16.
   * @returns {boolean} True if the hit actually landed.
   */
  takeHit(damage = HIT_DAMAGE) {
    if (this.invulnerable > 0) return false;

    this.hp = Math.max(0, this.hp - damage);
    this.invulnerable = HIT_INVULNERABILITY;
    this.hurtFlash = 0.4;
    this.render();
    return true;
  }

  /**
   * Permanently raises the pool and restores the same amount. Used by the
   * Heart pickup, so health can be built up over a run.
   *
   * @param {number} [amount] HP to add to the maximum.
   */
  addMaxHp(amount = HEART_PICKUP) {
    this.maxHp += amount;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healFlash = 0.3;
    this.render();
  }

  /**
   * Raises the maximum (and current) HP without the heart-pickup flash.
   *
   * Used for the small per-kill growth that drives the level curve, so the
   * panel does not strobe green on every single kill.
   *
   * @param {number} amount HP to add.
   */
  growMaxHp(amount) {
    if (amount <= 0) return;
    this.maxHp += amount;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.render();
  }

  /**
   * Hero level, derived from maximum HP: 100 HP = level 1, +100 per level,
   * capped at 15. HP may keep growing past level 15.
   *
   * @returns {number}
   */
  get level() {
    return Math.min(15, Math.max(1, Math.floor(this.maxHp / 100)));
  }

  /**
   * Tops the hero back up without raising the maximum.
   *
   * @param {number} [amount] HP to restore.
   */
  heal(amount = HEART_PICKUP) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.hp > before) this.healFlash = 0.3;
    this.render();
  }

  /**
   * Starts a heal-over-time effect.
   *
   * Eating a second fruit while the first is still working refreshes the
   * timer rather than doubling the rate — otherwise a lucky fruit run would
   * out-heal the insects entirely.
   *
   * @param {number} rate HP per second.
   * @param {number} duration Seconds the effect lasts.
   * @param {string} [label] Source name, shown in the HUD.
   */
  addRegen(rate, duration, label = 'Regen') {
    const existing = this.regenBuffs.find((b) => b.label === label);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, duration);
      existing.total = Math.max(existing.total, duration);
      existing.rate = rate;
    } else {
      this.regenBuffs.push({ label, rate, remaining: duration, total: duration });
    }
    this.render();
  }

  /**
   * Whether a regen buff with this label is currently running.
   *
   * @param {string} label
   * @returns {boolean}
   */
  hasRegen(label) {
    return this.regenBuffs.some((b) => b.label === label && b.remaining > 0);
  }

  /**
   * Counts the mercy window and every regen buff down. Called once per frame.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  update(delta) {
    if (this.invulnerable > 0) {
      this.invulnerable = Math.max(0, this.invulnerable - delta);
    }

    let changed = false;

    for (const buff of this.regenBuffs) {
      if (buff.remaining <= 0) continue;
      if (this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + buff.rate * delta);
      }
      buff.remaining = Math.max(0, buff.remaining - delta);
      changed = true;
    }

    if (this.regenBuffs.some((b) => b.remaining <= 0)) {
      this.regenBuffs = this.regenBuffs.filter((b) => b.remaining > 0);
      changed = true;
    }

    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - delta);
      changed = true;
    }
    if (this.healFlash > 0) {
      this.healFlash = Math.max(0, this.healFlash - delta);
      changed = true;
    }

    if (changed) this.render();
  }

  /** True once the hero has run out of HP. */
  get dead() {
    return this.hp <= 0;
  }

  /** True while the hero cannot be hurt. */
  get shielded() {
    return this.invulnerable > 0;
  }

  /** Clears the panel for a fresh run. */
  reset() {
    this.maxHp = STARTING_MAX_HP;
    this.hp = this.maxHp;
    this.invulnerable = 0;
    this.regenBuffs = [];
    this.hurtFlash = 0;
    this.healFlash = 0;
    this._lastPct = -1;
    this._lastText = '';
    this._lastLevelText = '';
    this._lastBuffSig = '';
    this.render();
  }

  /** Mirrors the current HP into the number, bar and buff chips. */
  render() {
    const pct = this.maxHp > 0 ? (this.hp / this.maxHp) * 100 : 0;

    // Only touch the DOM when the visible value actually moves.
    if (Math.abs(pct - this._lastPct) >= 0.05) {
      this._lastPct = pct;
      this.fillEl.style.width = `${pct.toFixed(2)}%`;
      // Three-band colour: healthy, wounded, critical.
      this.element.dataset.level = pct > 60 ? 'ok' : pct > 30 ? 'warn' : 'danger';
    }

    // Ceil so a living hero never reads "0".
    const text = `${Math.ceil(this.hp)} / ${this.maxHp}`;
    if (text !== this._lastText) {
      this._lastText = text;
      this.valueEl.textContent = text;
    }

    const levelText = `Lv.${this.level}`;
    if (levelText !== this._lastLevelText) {
      this._lastLevelText = levelText;
      this.levelEl.textContent = levelText;
    }

    this.element.classList.toggle('is-hurt', this.hurtFlash > 0);
    this.element.classList.toggle('is-heal', this.healFlash > 0);

    const sig = this.regenBuffs
      .map((b) => `${b.label}:${b.remaining.toFixed(1)}`)
      .join('|');
    if (sig !== this._lastBuffSig) {
      this._lastBuffSig = sig;
      if (this.regenBuffs.length === 0) {
        this.buffsEl.style.display = 'none';
      } else {
        this.buffsEl.style.display = 'flex';
        this.buffsEl.innerHTML = this.regenBuffs
          .map((b) => `<span class="hp-buff">${b.label} · ${b.remaining.toFixed(1)}s</span>`)
          .join('');
      }
    }
  }
}
