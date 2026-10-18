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
 *
 * ## Talent levels
 *
 * A talent is not a flat number. Each one starts at level 1 when taken, and
 * every later offer on the *same* talent raises it a level instead of giving
 * the player a dead pick. Levels scale the base effect linearly:
 *
 *     value(n) = base + perLevel * (n - 1)
 *
 * The panel therefore has to show both the level and what that level is
 * currently worth, or the player cannot tell whether a second copy is
 * worth taking.
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
/** Highest level a single talent can reach. */
export const TALENT_MAX_LEVEL = 5;

/**
 * Every talent in the pool.
 *
 * `effect` is the level-1 value consumed by `TalentSystem.stats()`.
 * `perLevel` is added for every level beyond the first, so level 3 of Sharp
 * Tongue is `1 + 0.5 * 2 = 2` attack power.
 */
export const TALENTS = [
  {
    key: 'thickHide',
    name: 'Thick Hide',
    blurb: 'Your skin hardens into a leathery shell.',
    effect: { damageReduction: 0.08 },
    perLevel: { damageReduction: 0.04 },
    describe: '+8% damage reduction',
  },
  {
    key: 'ironWall',
    name: 'Iron Wall',
    blurb: 'You plant yourself and let the hits land.',
    effect: { damageReduction: 0.06, moveSpeed: -0.05 },
    perLevel: { damageReduction: 0.03, moveSpeed: -0.01 },
    describe: '+6% damage reduction, -5% move speed',
  },
  {
    key: 'sharpTongue',
    name: 'Sharp Tongue',
    blurb: 'Every flick of the tongue lands harder.',
    effect: { attackPower: 1 },
    perLevel: { attackPower: 0.5 },
    describe: '+1 attack power',
  },
  {
    key: 'quickDraw',
    name: 'Quick Draw',
    blurb: 'The tongue is back out before the last strike fades.',
    effect: { cooldownMult: -0.12 },
    perLevel: { cooldownMult: -0.05 },
    describe: '-12% attack cooldown',
  },
  {
    key: 'longReach',
    name: 'Long Reach',
    blurb: 'You can pluck insects out of the air from afar.',
    effect: { attackRange: 90 },
    perLevel: { attackRange: 55 },
    describe: '+90 attack range',
  },
  {
    key: 'bloodFeast',
    name: 'Blood Feast',
    blurb: 'Every kill feeds you a little.',
    effect: { lifesteal: 0.05 },
    perLevel: { lifesteal: 0.025 },
    describe: '+5% lifesteal',
  },
  {
    key: 'thickBlood',
    name: 'Thick Blood',
    blurb: 'You grow a sturdier body.',
    effect: { maxHp: 60 },
    perLevel: { maxHp: 45 },
    describe: '+60 max HP',
  },
  {
    key: 'springLegs',
    name: 'Spring Legs',
    blurb: 'Your hops carry you further.',
    effect: { moveSpeed: 0.1 },
    perLevel: { moveSpeed: 0.05 },
    describe: '+10% move speed',
  },
  {
    key: 'shieldShell',
    name: 'Shield Shell',
    blurb: 'A thin membrane of water clings to your back.',
    effect: { shieldMaxPercent: 0.15 },
    perLevel: { shieldMaxPercent: 0.07 },
    describe: '+15% max shield, refilled',
  },
  {
    key: 'scavenger',
    name: 'Scavenger',
    blurb: 'You waste nothing, not even the scraps.',
    effect: { scoreMult: 0.15 },
    perLevel: { scoreMult: 0.1 },
    describe: '+15% score from every kill',
  },
  {
    key: 'hunterInstinct',
    name: 'Hunter Instinct',
    blurb: 'You spot the weak ones first.',
    effect: { attackPower: 0.5, attackRange: 40 },
    perLevel: { attackPower: 0.4, attackRange: 30 },
    describe: '+0.5 attack power, +40 attack range',
  },
  {
    key: 'stoneSkin',
    name: 'Stone Skin',
    blurb: 'Hits that would stagger you barely register.',
    effect: { damageReduction: 0.1, moveSpeed: -0.08 },
    perLevel: { damageReduction: 0.045, moveSpeed: -0.015 },
    describe: '+10% damage reduction, -8% move speed',
  },
  {
    key: 'frenzy',
    name: 'Frenzy',
    blurb: 'You fire faster every time you are cornered.',
    effect: { cooldownMult: -0.08, attackPower: 0.5 },
    perLevel: { cooldownMult: -0.04, attackPower: 0.3 },
    describe: '-8% cooldown, +0.5 attack power',
  },
  {
    key: 'vitality',
    name: 'Vitality',
    blurb: 'Your body simply refuses to quit.',
    effect: { maxHp: 30, lifesteal: 0.03 },
    perLevel: { maxHp: 25, lifesteal: 0.015 },
    describe: '+30 max HP, +3% lifesteal',
  },
  {
    key: 'lucky',
    name: 'Lucky',
    blurb: 'Fortune follows you. One more gene can be locked in.',
    effect: { extraGeneSlot: 1 },
    perLevel: {},
    /** Lucky does not stack: the slot is the whole effect. */
    maxLevel: 1,
    describe: '+1 gene slot (max 5)',
  },
  {
    key: 'bossSlayer',
    name: 'Boss Slayer',
    blurb: 'You hit the big ones where it hurts.',
    effect: { attackPower: 1.5, damageReduction: -0.03 },
    perLevel: { attackPower: 0.8, damageReduction: -0.01 },
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

/**
 * Highest level this talent can reach (Lucky is capped at 1).
 *
 * @param {object} talent Definition from TALENTS.
 * @returns {number}
 */
export function talentMaxLevel(talent) {
  return talent.maxLevel || TALENT_MAX_LEVEL;
}

/**
 * The effect bag of one talent at a given level.
 *
 * This is the single source of truth for "what is this talent worth right
 * now": `stats()` sums it, and the character panel prints it, so the number
 * the player reads is the number the game uses.
 *
 * @param {object} talent Definition from TALENTS.
 * @param {number} level 1-based level.
 * @returns {Record<string, number>}
 */
export function talentEffectAt(talent, level = 1) {
  const steps = Math.max(0, Math.min(level, talentMaxLevel(talent)) - 1);
  const out = {};
  for (const [key, base] of Object.entries(talent.effect)) {
    const per = talent.perLevel && talent.perLevel[key] ? talent.perLevel[key] : 0;
    out[key] = base + per * steps;
  }
  return out;
}

/**
 * Formats an effect bag as a human sentence, e.g. "+2 attack power, +180 range".
 *
 * @param {Record<string, number>} effect
 * @returns {string}
 */
export function formatTalentEffect(effect) {
  const parts = [];
  for (const [key, value] of Object.entries(effect)) {
    if (Math.abs(value) < 1e-9) continue;
    const sign = value > 0 ? '+' : '';
    switch (key) {
      case 'attackPower':
        parts.push(`${sign}${trim(value)} attack`);
        break;
      case 'damageReduction':
        parts.push(`${sign}${trim(value * 100)}% reduction`);
        break;
      case 'lifesteal':
        parts.push(`${sign}${trim(value * 100)}% lifesteal`);
        break;
      case 'attackRange':
        parts.push(`${sign}${trim(value)} range`);
        break;
      case 'cooldownMult':
        parts.push(`${sign}${trim(value * 100)}% cooldown`);
        break;
      case 'moveSpeed':
        parts.push(`${sign}${trim(value * 100)}% speed`);
        break;
      case 'maxHp':
        parts.push(`${sign}${Math.round(value)} max HP`);
        break;
      case 'scoreMult':
        parts.push(`${sign}${trim(value * 100)}% score`);
        break;
      case 'shieldMaxPercent':
        parts.push(`${sign}${trim(value * 100)}% max shield`);
        break;
      case 'extraGeneSlot':
        parts.push(`${sign}${value} gene slot`);
        break;
      default:
        parts.push(`${sign}${trim(value)} ${key}`);
    }
  }
  return parts.join(', ');
}

/** Drops trailing zeros: 1.5 -> "1.5", 2 -> "2". */
function trim(value) {
  return Number(value.toFixed(2)).toString();
}

/** Rolls `count` distinct talents that are not already owned. */
export class TalentSystem {
  /**
   * @param {number} slotCount Starting number of talent slots.
   */
  constructor(slotCount = TALENT_SLOTS) {
    /**
     * Talents held this run, in pick order.
     *
     * Each entry is `{ ...talent, level }`. Keeping the level on the entry
     * (rather than in a side map) means every consumer that already walks
     * `owned` sees it for free.
     */
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
   * Finds the owned entry for a talent key.
   *
   * @param {string} key
   * @returns {object|undefined}
   */
  ownedEntry(key) {
    return this.owned.find((talent) => talent.key === key);
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
   * Rolls three distinct talents worth offering.
   *
   * A talent that is already owned is still offered while it has levels left:
   * taking it again levels it up. Without that, a four-slot build would run
   * out of interesting picks and every later offer would be a talent the
   * player has no use for.
   *
   * @returns {Array<object>|null} The offer, or null when slots are full.
   */
  roll() {
    if (this.full) {
      this.offer = null;
      return null;
    }
    const pool = TALENTS.filter((talent) => {
      const entry = this.ownedEntry(talent.key);
      if (!entry) return true;
      return entry.level < talentMaxLevel(talent);
    });
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
    const existing = this.ownedEntry(talent.key);
    if (existing) {
      // A repeat pick levels the talent up instead of spending a slot.
      existing.level = Math.min(talentMaxLevel(talent), existing.level + 1);
      return existing;
    }
    this.owned.push({ ...talent, level: 1 });
    return this.owned[this.owned.length - 1];
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
   *
   * Each talent contributes `talentEffectAt(talent, level)`, so a levelled
   * talent is worth more without any extra bookkeeping here.
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
    for (const entry of this.owned) {
      const effect = talentEffectAt(entry, entry.level || 1);
      for (const [key, value] of Object.entries(effect)) {
        if (key in total) total[key] += value;
      }
    }
    return total;
  }
}
