/**
 * Talent awakenings.
 *
 * Every three minutes the run offers three random talents out of a pool of
 * sixteen. The player picks one, and the choice is permanent for that run.
 * Four can be held at once; the Lucky talent adds a fifth.
 *
 * Talents are pure stat modifiers — the main loop reads `stats()` once per
 * frame and layers them on top of level and gene bonuses, so a talent can
 * never bypass the damage-reduction ceiling.
 */

/** Seconds between talent offers. */
export const TALENT_INTERVAL = 180;
/** How many talents a single run may hold. */
export const TALENT_SLOTS = 4;
/** How many talents the Lucky talent adds on top of that. */
export const LUCKY_BONUS_SLOTS = 1;
/** How many cards are shown per offer. */
export const TALENT_CHOICES = 3;
/** How many talents the pool holds. */
export const TALENT_POOL_SIZE = 16;

/**
 * Every talent in the pool.
 *
 * `effect` is the raw shape consumed by `TalentSystem.stats()`; keep the
 * numbers small and additive so stacking stays predictable.
 */
export const TALENTS = [
  {
    key: 'thickHide',
    name: 'Thick Hide',
    blurb: 'Your skin hardens into a leathery shell.',
    effect: { damageReduction: 0.08 },
    describe: '+8% damage reduction',
  },
  {
    key: 'ironWall',
    name: 'Iron Wall',
    blurb: 'You plant yourself and let the hits land.',
    effect: { damageReduction: 0.06, moveSpeed: -0.05 },
    describe: '+6% damage reduction, -5% move speed',
  },
  {
    key: 'sharpTongue',
    name: 'Sharp Tongue',
    blurb: 'Every flick of the tongue lands harder.',
    effect: { attackPower: 1 },
    describe: '+1 attack power',
  },
  {
    key: 'quickDraw',
    name: 'Quick Draw',
    blurb: 'The tongue is back out before the last strike fades.',
    effect: { cooldownMult: -0.12 },
    describe: '-12% attack cooldown',
  },
  {
    key: 'longReach',
    name: 'Long Reach',
    blurb: 'You can pluck insects out of the air from afar.',
    effect: { attackRange: 90 },
    describe: '+90 attack range',
  },
  {
    key: 'bloodFeast',
    name: 'Blood Feast',
    blurb: 'Every kill feeds you a little.',
    effect: { lifesteal: 0.05 },
    describe: '+5% lifesteal',
  },
  {
    key: 'thickBlood',
    name: 'Thick Blood',
    blurb: 'You grow a sturdier body.',
    effect: { maxHp: 60 },
    describe: '+60 max HP',
  },
  {
    key: 'springLegs',
    name: 'Spring Legs',
    blurb: 'Your hops carry you further.',
    effect: { moveSpeed: 0.1 },
    describe: '+10% move speed',
  },
  {
    key: 'shieldShell',
    name: 'Shield Shell',
    blurb: 'A thin membrane of water clings to your back.',
    effect: { shieldMax: 40, shieldMaxPercent: 0.15 },
    describe: '+15% max shield, refilled',
  },
  {
    key: 'scavenger',
    name: 'Scavenger',
    blurb: 'You waste nothing, not even the scraps.',
    effect: { scoreMult: 0.15 },
    describe: '+15% score from every kill',
  },
  {
    key: 'hunterInstinct',
    name: 'Hunter Instinct',
    blurb: 'You spot the weak ones first.',
    effect: { attackPower: 0.5, attackRange: 40 },
    describe: '+0.5 attack power, +40 attack range',
  },
  {
    key: 'stoneSkin',
    name: 'Stone Skin',
    blurb: 'Hits that would stagger you barely register.',
    effect: { damageReduction: 0.1, moveSpeed: -0.08 },
    describe: '+10% damage reduction, -8% move speed',
  },
  {
    key: 'frenzy',
    name: 'Frenzy',
    blurb: 'You fire faster every time you are cornered.',
    effect: { cooldownMult: -0.08, attackPower: 0.5 },
    describe: '-8% cooldown, +0.5 attack power',
  },
  {
    key: 'vitality',
    name: 'Vitality',
    blurb: 'Your body simply refuses to quit.',
    effect: { maxHp: 30, lifesteal: 0.03 },
    describe: '+30 max HP, +3% lifesteal',
  },
  {
    key: 'lucky',
    name: 'Lucky',
    blurb: 'Fortune follows you. One more gene can be locked in.',
    effect: { extraGeneSlot: 1 },
    describe: '+1 gene slot (max 5)',
  },
  {
    key: 'bossSlayer',
    name: 'Boss Slayer',
    blurb: 'You hit the big ones where it hurts.',
    effect: { attackPower: 1.5, damageReduction: -0.03 },
    describe: '+1.5 attack power, -3% damage reduction',
  },
];

/** Fast lookup by key. */
const TALENT_BY_KEY = new Map(TALENTS.map((talent) => [talent.key, talent]));

/**
 * @param {string} key Talent key.
 * @returns {object|undefined}
 */
export function getTalent(key) {
  return TALENT_BY_KEY.get(key);
}

/** Rolls `count` distinct talents that are not already owned. */
export class TalentSystem {
  /**
   * @param {number} slotCount Starting number of talent slots.
   */
  constructor(slotCount = TALENT_SLOTS) {
    /** Talents held this run, in pick order. */
    this.owned = [];
    /** Base slots; the Lucky talent adds to this at read time. */
    this.baseSlots = slotCount;
    /** Choices on offer right now, or null when no offer is open. */
    this.offer = null;
    /** Seconds accumulated toward the next offer. */
    this.timer = 0;
    /** How many offers have been triggered this run. */
    this.offersGiven = 0;
    /** How many offers were declined. */
    this.skipped = 0;
  }

  /** Total slots, including the Lucky bonus. */
  get slotCount() {
    return (
      this.baseSlots +
      (this.owned.some((talent) => talent.key === 'lucky') ? LUCKY_BONUS_SLOTS : 0)
    );
  }

  /** True when the run cannot hold another talent. */
  get full() {
    return this.owned.length >= this.slotCount;
  }

  /**
   * Advances the offer timer.
   *
   * @param {number} delta Seconds elapsed.
   * @returns {boolean} True when a new offer should be shown.
   */
  update(delta) {
    if (this.offer || this.full) return false;
    this.timer += delta;
    if (this.timer < TALENT_INTERVAL) return false;
    this.timer -= TALENT_INTERVAL;
    // Keep the timer from banking more than one offer worth of time.
    this.timer = Math.min(this.timer, TALENT_INTERVAL);
    return true;
  }

  /** Forces the next offer, ignoring the timer. Used by the boot flow and tests. */
  primeOffer() {
    this.timer = TALENT_INTERVAL;
  }

  /**
   * Rolls three distinct talents the hero does not own yet.
   *
   * @returns {Array<object>|null} The offer, or null when slots are full.
   */
  roll() {
    if (this.full) {
      this.offer = null;
      return null;
    }
    const owned = new Set(this.owned.map((talent) => talent.key));
    const pool = TALENTS.filter((talent) => !owned.has(talent.key));
    // Shuffle a copy, then slice: never offer the same talent twice.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.offer = pool.slice(0, Math.min(TALENT_CHOICES, pool.length));
    this.offersGiven++;
    return this.offer;
  }

  /**
   * Takes the offered talent at `index`, or declines the whole offer.
   *
   * @param {number} index Index into `this.offer`, or -1 to skip.
   * @returns {object|null} The talent taken, if any.
   */
  resolve(index) {
    const offer = this.offer;
    this.offer = null;
    if (!offer || index < 0 || index >= offer.length) {
      if (offer) this.skipped++;
      return null;
    }
    const talent = offer[index];
    this.owned.push(talent);
    return talent;
  }

  /** Clears every talent and timer for a fresh run. */
  reset() {
    this.owned = [];
    this.offer = null;
    this.timer = 0;
    this.offersGiven = 0;
    this.skipped = 0;
  }

  /**
   * Sums every owned talent into one effect bag.
   *
   * Fields: attackPower, damageReduction, lifesteal, attackRange,
   * cooldownMult, moveSpeed, maxHp, shieldMax, shieldMaxPercent, scoreMult,
   * extraGeneSlot.
   */
  stats() {
    const total = {
      attackPower: 0,
      damageReduction: 0,
      lifesteal: 0,
      attackRange: 0,
      cooldownMult: 0,
      moveSpeed: 0,
      maxHp: 0,
      shieldMax: 0,
      shieldMaxPercent: 0,
      scoreMult: 0,
      extraGeneSlot: 0,
    };
    for (const talent of this.owned) {
      for (const [key, value] of Object.entries(talent.effect)) {
        if (key in total) total[key] += value;
      }
    }
    return total;
  }
}
