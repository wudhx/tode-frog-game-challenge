import * as THREE from 'three';

/**
 * Gene system: killing an insect can drop a gene orb of that species. Orbs
 * carry a quality tier (common / rare / legendary). Picking one up locks that
 * species into a permanent slot and adds a stack; three same-tier pickups
 * upgrade the tier, and a higher-tier drop upgrades immediately.
 *
 * Only the highest three (or however many slots are unlocked) species count,
 * and each slot must be a different species.
 */

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------
/** Quality tiers, weakest to strongest. */
export const GENE_TIERS = ['common', 'rare', 'legendary'];

/** Human-readable tier names (English, shown in the HUD). */
export const TIER_LABELS = {
  common: 'Common',
  rare: 'Rare',
  legendary: 'Legendary',
};

/** Emissive colours used by the orb meshes and the HUD pips. */
export const TIER_COLORS = {
  common: 0xd8dde3,
  rare: 0x4da6ff,
  legendary: 0xffc83d,
};

// ---------------------------------------------------------------------------
// Gene definitions
// ---------------------------------------------------------------------------
/**
 * Per-tier, per-layer values. `cap` is the absolute ceiling for that tier
 * (null means no cap). `floor` is used by the attack-cooldown gene.
 */
export const GENE_TYPES = {
  fly: {
    key: 'fly',
    label: 'Fly',
    stat: 'attackCooldown',
    description: 'Attack cooldown',
    perLayer: { common: 0.01, rare: 0.015, legendary: 0.02 },
    floor: { common: 0.35, rare: 0.2, legendary: 0.1 },
  },
  mosquito: {
    key: 'mosquito',
    label: 'Mosquito',
    stat: 'lifesteal',
    description: 'Lifesteal',
    perLayer: { common: 0.003, rare: 0.004, legendary: 0.005 },
    cap: { common: 0.25, rare: 0.3, legendary: 0.35 },
  },
  bee: {
    key: 'bee',
    label: 'Bee',
    stat: 'attackRange',
    description: 'Attack range',
    perLayer: { common: 5, rare: 7, legendary: 10 },
    cap: { common: 800, rare: 1200, legendary: 1600 },
  },
  beetle: {
    key: 'beetle',
    label: 'Beetle',
    stat: 'maxHp',
    description: 'Max HP',
    perLayer: { common: 2, rare: 2.5, legendary: 3 },
    cap: null,
  },
  centipede: {
    key: 'centipede',
    label: 'Centipede',
    stat: 'attackPower',
    description: 'Attack power',
    perLayer: { common: 1, rare: 2, legendary: 3 },
    cap: null,
  },
  mole: {
    key: 'mole',
    label: 'Mole',
    stat: 'damageReduction',
    description: 'Damage reduction',
    perLayer: { common: 0.03, rare: 0.045, legendary: 0.06 },
    cap: { common: 0.3, rare: 0.45, legendary: 0.6 },
  },
};

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
/** How close the hero must be to pick up an orb. */
export const GENE_PICKUP_RADIUS = 48;
/** Consecutive kills without a drop before one is forced. */
export const GENE_PITY = 10;

/**
 * The gene system.
 */
export class GeneSystem {
  /**
   * @param {THREE.Scene} scene The scene the orbs live in.
   * @param {number} [slotCount] How many genes can be locked at once.
   */
  constructor(scene, slotCount = 3) {
    this.scene = scene;
    this.slotCount = slotCount;
    /** @type {Array<{key: string, tier: string, stacks: number, merge: number}|null>} */
    this.slots = new Array(slotCount).fill(null);
    /** @type {Array<{key: string, tier: string, mesh: THREE.Mesh, x: number, y: number, phase: number}>} */
    this.orbs = [];
    /** The orb currently awaiting a Take/Skip choice. */
    this.pending = null;
    /** Kills since the last drop, for the pity timer. */
    this.killsSinceDrop = 0;
    /** Set to true once every slot is a legendary gene. */
    this.finished = false;
  }

  /** How many slots are currently filled. */
  get lockedCount() {
    return this.slots.filter(Boolean).length;
  }

  /** True once every slot holds a legendary gene. */
  get allLegendary() {
    const filled = this.slots.filter(Boolean);
    return filled.length >= this.slotCount && filled.every((g) => g.tier === 'legendary');
  }

  /** Adds a slot (used by the Lucky talent later). */
  addSlot() {
    this.slotCount += 1;
    this.slots.push(null);
  }

  /**
   * Base drop chance by elapsed run time: generous early, tighter later.
   *
   * @param {number} runTime Seconds since the run started.
   * @returns {number}
   */
  dropChance(runTime) {
    if (runTime < 60) return 0.35;
    if (runTime < 180) return 0.35 - ((runTime - 60) / 120) * 0.15;
    return 0.15;
  }

  /**
   * Rolls a quality tier for a drop.
   *
   * @param {boolean} isElite Whether the killed insect was an elite.
   * @param {boolean} [isBoss] Whether it was a boss.
   * @returns {'common'|'rare'|'legendary'}
   */
  rollTier(isElite = false, isBoss = false) {
    const r = Math.random();
    if (isBoss) return r < 0.1 ? 'common' : r < 0.6 ? 'rare' : 'legendary';
    if (isElite) return r < 0.4 ? 'common' : r < 0.85 ? 'rare' : 'legendary';
    return r < 0.7 ? 'common' : r < 0.95 ? 'rare' : 'legendary';
  }

  /**
   * Rolls a drop for a killed insect and spawns an orb when it succeeds.
   *
   * @param {{type: {key: string}, position: {x: number, y: number}, elite?: boolean}} enemy
   * @param {number} runTime Seconds since the run started.
   * @param {boolean} [isBoss]
   * @returns {object|null} The spawned orb, or null.
   */
  maybeDrop(enemy, runTime, isBoss = false) {
    if (this.allLegendary) {
      this.finished = true;
      return null;
    }

    const key = enemy.type.key;
    const isLocked = this.slots.some((g) => g && g.key === key);
    const hasFreeSlot = this.slots.some((g) => g === null);
    // A species that is neither locked nor able to take a free slot is useless.
    if (!isLocked && !hasFreeSlot) return null;

    this.killsSinceDrop += 1;

    let chance = this.dropChance(runTime);
    if (enemy.elite) chance = 1;
    if (isBoss) chance = 1;
    if (this.killsSinceDrop >= GENE_PITY) chance = 1;

    if (Math.random() >= chance) return null;

    this.killsSinceDrop = 0;
    const tier = this.rollTier(enemy.elite, isBoss);
    return this.spawnOrb(key, tier, enemy.position.x, enemy.position.y);
  }

  /**
   * Creates a floating gene orb.
   *
   * @param {string} key Species key.
   * @param {'common'|'rare'|'legendary'} tier Quality tier.
   * @param {number} x World X.
   * @param {number} y World Y.
   * @returns {object} The orb record.
   */
  spawnOrb(key, tier, x, y) {
    const color = TIER_COLORS[tier];
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(13, 1),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.75,
        roughness: 0.3,
        metalness: 0.2,
      })
    );
    mesh.position.set(x, y, 26);
    this.scene.add(mesh);

    const orb = { key, tier, mesh, x, y, phase: Math.random() * Math.PI * 2 };
    this.orbs.push(orb);
    return orb;
  }

  /**
   * Animates the orbs and reports the first one the hero has touched.
   *
   * @param {number} delta Seconds since the previous frame.
   * @param {THREE.Vector3} playerPosition The hero's position.
   * @returns {object|null} An orb awaiting a choice, or null.
   */
  updateOrbs(delta, playerPosition) {
    for (const orb of this.orbs) {
      orb.phase += delta * 2.5;
      orb.mesh.position.z = 26 + Math.sin(orb.phase) * 5;
      orb.mesh.rotation.y += delta * 2;
      orb.mesh.rotation.x += delta * 1.3;
    }

    if (this.pending) return this.pending;

    const touched = this.orbs.find(
      (orb) =>
        Math.hypot(orb.x - playerPosition.x, orb.y - playerPosition.y) < GENE_PICKUP_RADIUS
    );
    if (touched) this.pending = touched;
    return this.pending;
  }

  /**
   * Removes an orb from the scene and the list.
   *
   * @param {object} orb
   */
  removeOrb(orb) {
    this.scene.remove(orb.mesh);
    orb.mesh.geometry.dispose();
    orb.mesh.material.dispose();
    this.orbs = this.orbs.filter((o) => o !== orb);
  }

  /**
   * Resolves the pending orb.
   *
   * @param {boolean} take True to take it, false to skip.
   * @returns {boolean} True if a gene was applied.
   */
  resolve(take) {
    const orb = this.pending;
    if (!orb) return false;
    this.pending = null;
    this.removeOrb(orb);
    if (!take) return false;
    this.apply(orb.key, orb.tier);
    return true;
  }

  /**
   * Applies one pickup to a species: locks a free slot, or stacks an existing
   * gene and advances its merge / tier.
   *
   * @param {string} key Species key.
   * @param {'common'|'rare'|'legendary'} tier Quality of the drop.
   * @returns {boolean} True if it was applied.
   */
  apply(key, tier) {
    const slot = this.slots.find((g) => g && g.key === key);

    if (slot) {
      slot.stacks += 1;

      const dropIndex = GENE_TIERS.indexOf(tier);
      const currentIndex = GENE_TIERS.indexOf(slot.tier);

      if (dropIndex > currentIndex) {
        // A better drop replaces the quality outright.
        slot.tier = tier;
        slot.merge = 0;
      } else if (dropIndex === currentIndex) {
        // Three same-quality pickups upgrade one tier.
        slot.merge += 1;
        if (slot.merge >= 3 && currentIndex < GENE_TIERS.length - 1) {
          slot.tier = GENE_TIERS[currentIndex + 1];
          slot.merge = 0;
        }
      }
      return true;
    }

    const free = this.slots.indexOf(null);
    if (free < 0) return false;

    // The first pickup already counts towards the three-gene merge.
    this.slots[free] = { key, tier, stacks: 1, merge: 1 };
    return true;
  }

  /**
   * Describes what taking the pending orb would do, for the choice card.
   *
   * @returns {object|null}
   */
  preview() {
    const orb = this.pending;
    if (!orb) return null;

    const cfg = GENE_TYPES[orb.key];
    const slot = this.slots.find((g) => g && g.key === orb.key);
    const free = this.slots.indexOf(null);

    if (!slot) {
      return {
        kind: free >= 0 ? 'new' : 'full',
        key: orb.key,
        label: cfg.label,
        tier: orb.tier,
        description: cfg.description,
        slotIndex: free,
        stacks: 1,
      };
    }

    const dropIndex = GENE_TIERS.indexOf(orb.tier);
    const currentIndex = GENE_TIERS.indexOf(slot.tier);
    const upgrades = dropIndex > currentIndex;
    const mergeStep = !upgrades && dropIndex === currentIndex ? slot.merge + 1 : slot.merge;

    return {
      kind: upgrades ? 'upgrade' : 'stack',
      key: orb.key,
      label: cfg.label,
      tier: orb.tier,
      description: cfg.description,
      stacks: slot.stacks + 1,
      currentTier: slot.tier,
      nextTier:
        upgrades
          ? orb.tier
          : mergeStep >= 3 && currentIndex < GENE_TIERS.length - 1
            ? GENE_TIERS[currentIndex + 1]
            : null,
      merge: mergeStep,
    };
  }

  /**
   * Sums every locked gene's contribution.
   *
   * @returns {{
   *   attackPower: number,
   *   damageReduction: number,
   *   lifesteal: number,
   *   attackRange: number,
   *   cooldownMult: number,
   *   cooldownFloor: number,
   *   maxHp: number,
   * }}
   */
  stats() {
    const out = {
      attackPower: 0,
      damageReduction: 0,
      lifesteal: 0,
      attackRange: 0,
      cooldownMult: 1,
      cooldownFloor: 0,
      maxHp: 0,
    };

    for (const slot of this.slots) {
      if (!slot) continue;
      const cfg = GENE_TYPES[slot.key];
      const per = cfg.perLayer[slot.tier];

      if (cfg.stat === 'attackPower') {
        out.attackPower += slot.stacks * per;
      } else if (cfg.stat === 'damageReduction') {
        out.damageReduction += Math.min(cfg.cap[slot.tier], slot.stacks * per);
      } else if (cfg.stat === 'lifesteal') {
        out.lifesteal += Math.min(cfg.cap[slot.tier], slot.stacks * per);
      } else if (cfg.stat === 'attackRange') {
        out.attackRange += Math.min(cfg.cap[slot.tier], slot.stacks * per);
      } else if (cfg.stat === 'maxHp') {
        out.maxHp += slot.stacks * per;
      } else if (cfg.stat === 'attackCooldown') {
        out.cooldownMult *= Math.max(0.05, 1 - slot.stacks * per);
        out.cooldownFloor = Math.max(out.cooldownFloor, cfg.floor[slot.tier]);
      }
    }

    return out;
  }

  /** Clears everything for a fresh run. */
  reset() {
    for (const orb of this.orbs) this.removeOrb(orb);
    this.orbs = [];
    this.pending = null;
    this.slots = new Array(this.slotCount).fill(null);
    this.killsSinceDrop = 0;
    this.finished = false;
  }
}
