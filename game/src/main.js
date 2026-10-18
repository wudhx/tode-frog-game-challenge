import * as THREE from 'three';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { Player } from './components/Player.js';
import { Enemy, pickEnemyType, bossProfile, bossAbilityCooldown, BOSS_SPECIES, BOSS_SUMMON_COUNT, BOSS_ABILITIES } from './components/Enemy.js';
import { Map, BOARD_HALF, TILE_SIZE } from './components/Map.js';
import {
  addHouses,
  collidesWithObstacle,
  HOUSE_ATTACK_RANGE,
  HOUSE_DURABILITY,
  HOUSE_HIT_DAMAGE,
  HOUSE_HIT_INTERVAL,
} from './components/House.js';
import { Scenery, BUSH_COOLDOWN } from './components/Scenery.js';
import { Attack } from './components/Attack.js';
import { Score } from './components/Score.js';
import { HighScores } from './components/HighScores.js';
import { Health, HIT_DAMAGE, HEART_PICKUP, HIT_INVULNERABILITY } from './components/Health.js';
import { sound } from './components/Sound.js';
import { PowerUpManager } from './components/PowerUp.js';
import { GeneSystem, GENE_TYPES, TIER_LABELS, TIER_COLORS, formatPerLayer, formatCap, LEGENDARY_ORB_SCORE } from './components/Genes.js';
import { TalentSystem, TALENT_INTERVAL, TALENT_SLOTS, TALENTS } from './components/Talents.js';
import {
  Awakening,
  AWAKEN_SCORE_PER_CHARGE,
  AWAKEN_MAX_CHARGES,
  AWAKEN_DURATION,
} from './components/Awakening.js';
import { scaledParameters } from './components/Difficulty.js';
import { hud } from './components/Interactables.js';
import './style.css';

// ---------------------------------------------------------------------------
// Tunables for the gameplay loop
// ---------------------------------------------------------------------------
/** Enemy vs. player: how close counts as a fatal touch. */
const PLAYER_HIT_DISTANCE = 45;
/** Enemy vs. enemy: how close two insects may get. */
const ENEMY_HIT_DISTANCE = 45;

/** Maximum HP gained per kill — this is what drives the level curve. */
const KILL_MAX_HP_GAIN = 3;

/**
 * Level-based damage reduction is capped at 15%. Level alone must never make
 * the hero tanky enough that stacking genes/talents could approach immunity.
 */
const LEVEL_DAMAGE_REDUCTION_MAX = 0.15;
/**
 * Hard ceiling on combined damage reduction from EVERY source (level, mole
 * gene, Iron Wall talent, awakening…). Without this, additive stacking could
 * reach 100% and the frog would be invincible.
 */
const MAX_TOTAL_DAMAGE_REDUCTION = 0.8;

// --- Bosses ---------------------------------------------------------------
/** Score at which the first boss appears. */
const FIRST_BOSS_SCORE = 2000;
/** Score gap between later bosses. */
const BOSS_SCORE_STEP = 3000;
/** Permanent stat bonus ranges for downing a boss. */
const BOSS_BONUS_HP_MIN = 10;
const BOSS_BONUS_HP_MAX = 40;
const BOSS_BONUS_ATK_MIN = 0.1;
const BOSS_BONUS_ATK_MAX = 0.4;
const BOSS_BONUS_DEF_MIN = 0.01;
const BOSS_BONUS_DEF_MAX = 0.04;
/** How much the bonus range scales up per boss already killed. */
const BOSS_BONUS_GROWTH = 0.25;
/**
 * An active awakening is much less effective against a boss.
 *
 * The awakening is a panic button, not a boss-skip button: triple damage on
 * a boss would delete a 50-hit encounter in a handful of blasts and the
 * summon/enrage phases would never happen. At 0.6x the boost is still
 * clearly worth spending — it shaves real time off the fight and the extra
 * range keeps the hero safe — but the boss survives long enough to be a boss.
 */
const BOSS_AWAKEN_DAMAGE_MULT = 0.6;

// --- Boss signature abilities ---------------------------------------------
/** Poison applied by a centipede pool: ticks and their cadence live here. */
const VENOM_STACK_LIMIT = 3;
/** How far ahead of the boss a stag beetle's charge telegraphs, in units. */
const CHARGE_REACH = 520;

/**
 * The hero's derived combat stats.
 *
 * Phase 1 wires the damage pipeline (attack power, damage reduction, shield).
 * Later phases feed level, genes, talents and awakening into these numbers.
 */
const playerStats = {
  /** Damage per tongue blast, in "hit units". */
  attackPower: 1,
  /** Fraction of incoming contact damage ignored (0–1). */
  damageReduction: 0,
  /** Shield points, absorbed before HP. */
  shield: 0,
  /** Shield ceiling, set by talents/gear. */
  shieldMax: 0,
  /** Fraction of damage dealt returned as HP (0–1). */
  lifesteal: 0,
  /** Current tongue-blast reach, for the character panel. */
  attackRange: 0,
  /** Current tongue-blast cooldown, for the character panel. */
  attackCooldown: 1,
  /** Move-speed multiplier from level, for the character panel. */
  moveSpeedMult: 1,
};

/**
 * Breathing room between a body and a wall. Kept small so the hero stops
 * flush against a tree; the old value of 6 left a visible gap that made
 * movement feel stuck.
 */
const WALL_CLEARANCE = 3;
const POWERUP_WALL_CLEARANCE = 26;

// --- House ----------------------------------------------------------------
/** Fraction of the footprint radius that counts as "inside". */
const HOUSE_INTERIOR_RADIUS_RATIO = 0.9;
/** How translucent the house goes while the hero is inside it. */
const HOUSE_INTERIOR_OPACITY = 0.3;

// --- Bush -----------------------------------------------------------------
/** How long the hide lasts before the hero is spotted. */
const BUSH_HIDE_DURATION = 4;
/** How close the hero must be to count as "in" a bush. */
const BUSH_INTERIOR_DISTANCE = 70;
/** How close an insect must be to whack a bush apart. */
const BUSH_ATTACK_RANGE = 90;

// --- Flower ---------------------------------------------------------------
/** How long the player has to stand next to a flower to harvest it. */
const FLOWER_HARVEST_TIME = 2.0;
/** Distance at which a flower notices the hero. */
const FLOWER_TRIGGER_DISTANCE = 48;
/** How long before a harvested flower grows back. */
const FLOWER_REGROW = 15;

// --- Pond -----------------------------------------------------------------
/** How close to the pond centre counts as "in the water". */
const POND_INNER_RADIUS_RATIO = 0.72;
/** How close to the pond edge still shows the pond hint. */
const POND_NEAR_RADIUS_RATIO = 1.18;
/** How long the hero must wade in before the bonus fires. */
const POND_BONUS_WADE_TIME = 0.5;
/** Cooldown before the same pond pays out again. */
const POND_COOLDOWN = 25;
/** Fraction of max HP restored per second while in the water. */
const POND_HEAL_PERCENT = 0.03;
/** Cap on a single soak, as a fraction of max HP. */
const POND_HEAL_CAP_PERCENT = 0.2;
/** Fraction of incoming damage soaked while in the water. */
const POND_DAMAGE_SOAK = 0.2;
/**
 * How long a single soak lasts, in seconds. At 3%/s this is enough to reach
 * the 20% cap; the hard limit also ends the soak when the hero is already at
 * full HP, so the bonus cannot re-fire every frame.
 */
const POND_SOAK_DURATION = 7;

// --- Fruit trees ----------------------------------------------------------
/** How close a fruit tree must be for the tongue blast to knock a fruit off. */
const TREE_STRIKE_RANGE = 100;
/** How close the hero must be for the fruit-tree hint to show. */
const TREE_PROXIMITY_DISTANCE = 110;
/** HP per second granted by eating a fruit. */
const FRUIT_REGEN_RATE = 5;
/** Seconds the fruit's regeneration lasts. */
const FRUIT_REGEN_DURATION = 6;

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
let currentHouse = null;
/** Scenery (trees, bushes, flowers, ponds), once loaded. */
let scenery = null;

/**
 * What blocks the *hero*: trees only.
 *
 * Houses and bushes have to be walkable. Their effects trigger by standing
 * inside them, and while they were in the collision list the hero could never
 * get closer than `radius + clearance` — always further out than the
 * "inside" test asked for, so those mechanics could never fire in real play.
 */
let obstacles = [];

/**
 * What blocks the *insects*: trees plus houses. Insects still cannot walk
 * into a house, which is exactly what makes it a shelter.
 */
let enemyObstacles = [];

addHouses(map.housesGroup).then((placed) => {
  houses = placed;
  scenery = new Scenery(scene, placed);
  obstacles = [...scenery.obstacles];
  enemyObstacles = [...scenery.obstacles, ...placed];
});

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------
const player = new Player(scene);
const camera = createCamera(player.group);

const score = new Score();
const health = new Health();
health.avatarEl.addEventListener('click', () => openCharPanel());

// Shelter durability readout shown while the hero is inside a house.
const shelterReadout = document.createElement('div');
shelterReadout.className = 'shelter-readout';
document.body.appendChild(shelterReadout);
const highScores = new HighScores();
const attack = new Attack(scene, player);
const powerUps = new PowerUpManager(scene);

// ---------------------------------------------------------------------------
// Genes
// ---------------------------------------------------------------------------
const genes = new GeneSystem(scene, 3);
const talents = new TalentSystem(TALENT_SLOTS);
const awakening = new Awakening();

/** Permanent stats earned from bosses this run. */
const bossBonus = { maxHp: 0, attack: 0, defense: 0 };
/** The live boss (also present in `enemies`), or null. */
let currentBoss = null;
/** Frozen while a gene card or the pause menu is open. */
let paused = false;
/** Seconds since the run started, used for the drop-rate curve. */
let runTime = 0;
/** Beetle genes raise max HP; track the last applied bonus to grant only the delta. */
let lastGeneMaxHp = 0;
/** Same delta rule for the talent max-HP bonus. */
let lastTalentMaxHp = 0;
/** Last shield ceiling granted by talents, so refills happen only on gain. */
let lastTalentShieldMax = 0;

// ---------------------------------------------------------------------------
// Gene HUD (locked genes) and the pickup card
// ---------------------------------------------------------------------------
const geneBar = document.createElement('div');
geneBar.className = 'gene-bar';
document.body.appendChild(geneBar);

/** One-decimal stack display, so converted (fractional) stacks stay readable. */
function formatStacks(value) {
  return String(Math.round(value * 10) / 10);
}

/** Rewrites the three (or more) locked-gene pips. */
function renderGeneBar() {
  const cells = [];
  for (let i = 0; i < genes.slotCount; i++) {
    const slot = genes.slots[i];
    if (!slot) {
      cells.push(
        '<div class="gene-slot empty">' +
          '<span class="gene-dot"></span>' +
          '<span class="gene-name">Empty</span>' +
        '</div>'
      );
      continue;
    }
    const cfg = GENE_TYPES[slot.key];
    const color = `#${TIER_COLORS[slot.tier].toString(16).padStart(6, '0')}`;
    cells.push(
      `<div class="gene-slot" data-tier="${slot.tier}">` +
        `<span class="gene-dot" style="background:${color}"></span>` +
        `<span class="gene-name">${cfg.label}</span>` +
        `<span class="gene-stacks">x${formatStacks(slot.stacks)}</span>` +
      '</div>'
    );
  }
  geneBar.innerHTML = cells.join('');
}
renderGeneBar();

const geneCard = document.createElement('div');
geneCard.className = 'gene-card';
geneCard.style.display = 'none';
document.body.appendChild(geneCard);

// ---------------------------------------------------------------------------
// Talent HUD
// ---------------------------------------------------------------------------
const talentBar = document.createElement('div');
talentBar.className = 'talent-bar';
document.body.appendChild(talentBar);

/** Rewrites the talent pips and the countdown to the next offer. */
function renderTalentPips() {
  const pips = [];
  for (let i = 0; i < talents.slotCount; i++) {
    const talent = talents.owned[i];
    if (!talent) {
      pips.push('<span class="talent-pip empty" title="Empty talent slot"></span>');
    } else {
      pips.push(`<span class="talent-pip filled" title="${talent.name} — ${talent.describe}">${
        talent.name
          .split(' ')
          .map((word) => word[0])
          .join('')
      }</span>`);
    }
  }
  const left = Math.max(0, TALENT_INTERVAL - talents.timer);
  const hint = talents.full
    ? 'Talent slots full'
    : `Next talent in ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  talentBar.innerHTML =
    `<span class="talent-bar-label">Talents</span>${pips.join('')}` +
    `<span class="talent-bar-hint">${hint}</span>`;
}
renderTalentPips();

// ---------------------------------------------------------------------------
// Awakening bar
// ---------------------------------------------------------------------------
const awakenBar = document.createElement('div');
awakenBar.className = 'awaken-bar';
document.body.appendChild(awakenBar);

// ---------------------------------------------------------------------------
// Boss health bar
// ---------------------------------------------------------------------------
const bossBar = document.createElement('div');
bossBar.className = 'boss-bar';
bossBar.style.display = 'none';
document.body.appendChild(bossBar);

/** Rewrites the awakening meter: charge state, progress and timer. */
function renderAwakenBar() {
  const pct = Math.round(awakening.progress * 100);
  const charges = Array.from({ length: AWAKEN_MAX_CHARGES }, (_, i) =>
    `<span class="awaken-charge${i < awakening.charges ? ' full' : ''}"></span>`
  ).join('');

  let label;
  if (awakening.active) {
    label = `Awakened ${awakening.remaining.toFixed(1)}s`;
  } else if (awakening.ready) {
    label = 'Ready · press E';
  } else {
    const need = Math.max(0, AWAKEN_SCORE_PER_CHARGE - awakening.scoreProgress);
    label = `${Math.round(need)} pts to charge`;
  }

  awakenBar.dataset.state = awakening.active ? 'active' : awakening.ready ? 'ready' : 'charging';
  awakenBar.innerHTML =
    '<div class="awaken-head">' +
    '<span class="awaken-label">Awakening</span>' +
    `<span class="awaken-charges">${charges}</span>` +
    `<span class="awaken-text">${label}</span>` +
    '</div>' +
    `<div class="awaken-track"><span style="width:${pct}%"></span></div>`;
}
renderAwakenBar();

/** Spends a charge and turns the boost on. */
function triggerAwakening() {
  if (!awakening.activate()) return;
  sound.awaken();
  hud.showAction(
    `Awakening — ${AWAKEN_DURATION}s of triple damage`,
    'awaken',
    '#7c5cff',
    1600
  );
  renderAwakenBar();
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyE') return;
  if (gameState !== 'playing') return;
  if (paused) return;
  if (!awakening.ready) return;
  event.preventDefault();
  triggerAwakening();
});

/** Opens the Take/Skip card for the orb the hero just touched. */
function showGeneCard() {
  const info = genes.preview();
  if (!info) return;

  paused = true;
  // Do not let a stray Space fire an attack while the world is frozen.
  attack.enabled = false;
  geneCard.style.display = 'flex';

  const tierColor = `#${TIER_COLORS[info.tier].toString(16).padStart(6, '0')}`;
  const fmt = (v) => String(Math.round(v * 10) / 10);

  let actionText;
  let mergeText;
  if (info.kind === 'new') {
    actionText = `Lock into slot ${info.slotIndex + 1} · permanent`;
    mergeText = 'First stack · locks this species permanently';
  } else if (info.kind === 'full') {
    actionText = 'All slots locked — cannot take this gene';
    mergeText = 'Skip this one';
  } else if (info.kind === 'upgrade') {
    actionText =
      `${TIER_LABELS[info.currentTier]} → ${TIER_LABELS[info.nextTier]} · ` +
      `stacks ${fmt(info.currentStacks)} → ${fmt(info.stacks)}`;
    mergeText = 'Quality upgraded · stacks converted proportionally';
  } else {
    actionText = `Stacks ${fmt(info.currentStacks)} → ${fmt(info.stacks)}`;
    mergeText = info.maxed
      ? 'Max quality · stacks keep growing'
      : `Merge ${info.merge}/3`;
  }

  geneCard.innerHTML = [
    '<div class="gene-card-box">',
    `  <div class="gene-card-tier" style="color:${tierColor}">${TIER_LABELS[info.tier]}</div>`,
    `  <div class="gene-card-title">${info.label} Gene</div>`,
    `  <div class="gene-card-per">${info.perLayerText}</div>`,
    `  <div class="gene-card-cap">${info.capText}</div>`,
    `  <div class="gene-card-action">${actionText}</div>`,
    `  <div class="gene-card-stacks">${mergeText}</div>`,
    `  <div class="gene-card-rule">${info.stackRule}</div>`,
    '  <div class="gene-card-buttons">',
    `    <button class="gene-take"${info.kind === 'full' ? ' disabled' : ''}>Take <kbd>F</kbd></button>`,
    '    <button class="gene-skip">Skip <kbd>G</kbd></button>',
    '  </div>',
    '</div>',
  ].join('');

  geneCard.querySelector('.gene-take').onclick = () => resolveGene(true);
  geneCard.querySelector('.gene-skip').onclick = () => resolveGene(false);
}

/**
 * Closes the card and either applies or discards the gene.
 *
 * @param {boolean} take
 */
function resolveGene(take) {
  const stacksBefore = genes.slots.reduce((sum, slot) => sum + (slot ? slot.stacks : 0), 0);
  genes.resolve(take);
  if (take) {
    const stacksAfter = genes.slots.reduce((sum, slot) => sum + (slot ? slot.stacks : 0), 0);
    // Late game the orbs only carry stacks. Pay a little score for them so the
    // awakening bar keeps charging at the same beat it did all run.
    if (genes.allLegendary && stacksAfter > stacksBefore) {
      score.addKillPoints(LEGENDARY_ORB_SCORE);
      if (awakening.addScore(LEGENDARY_ORB_SCORE)) {
        hud.showAction('Awakening charged — press E', 'awaken', '#7c5cff', 1600);
      }
    }
  }
  geneCard.style.display = 'none';
  paused = false;
  attack.enabled = true;
  // Drop any arrow keys pressed while the card was up.
  player.stop();
  // Throw away the frozen time so the world does not jump on resume.
  clock.getDelta();
  renderGeneBar();
}

// Keyboard shortcuts for the gene card: F takes, G (or Esc) skips.
window.addEventListener('keydown', (event) => {
  if (geneCard.style.display === 'none') return;
  if (event.code === 'KeyF' || event.code === 'Enter') {
    event.preventDefault();
    resolveGene(true);
  } else if (event.code === 'KeyG' || event.code === 'Escape') {
    event.preventDefault();
    resolveGene(false);
  }
});

// ---------------------------------------------------------------------------
// Talent offer (every three minutes)
// ---------------------------------------------------------------------------
const talentCard = document.createElement('div');
talentCard.className = 'talent-card';
talentCard.style.display = 'none';
document.body.appendChild(talentCard);

/** Opens the three-talent offer and freezes the run. */
function showTalentOffer() {
  const offer = talents.roll();
  if (!offer || offer.length === 0) return;

  paused = true;
  attack.enabled = false;
  player.stop();
  talentCard.style.display = 'flex';

  const cards = offer
    .map(
      (talent, index) =>
        '<button class="talent-choice" data-index="' + index + '">' +
        '  <div class="talent-key">' + (index + 1) + '</div>' +
        '  <div class="talent-name">' + talent.name + '</div>' +
        '  <div class="talent-effect">' + talent.describe + '</div>' +
        '  <div class="talent-blurb">' + talent.blurb + '</div>' +
        '</button>'
    )
    .join('');

  const filled = talents.owned.length;
  talentCard.innerHTML = [
    '<div class="talent-box">',
    '  <div class="talent-tier">Talent Awakening</div>',
    '  <div class="talent-title">Choose one</div>',
    '  <div class="talent-sub">' +
      'Talent ' + (filled + 1) + ' of ' + talents.slotCount +
      ' · locked in for the rest of this run</div>',
    '  <div class="talent-choices">' + cards + '</div>',
    '  <button class="talent-skip">Skip this one <kbd>Esc</kbd></button>',
    '</div>',
  ].join('');

  for (const button of talentCard.querySelectorAll('.talent-choice')) {
    button.onclick = () => resolveTalent(Number(button.dataset.index));
  }
  talentCard.querySelector('.talent-skip').onclick = () => resolveTalent(-1);
}

/**
 * Applies the chosen talent (or declines the offer) and resumes the run.
 *
 * @param {number} index Index into the current offer, or -1 to skip.
 */
function resolveTalent(index) {
  const taken = talents.resolve(index);
  talentCard.style.display = 'none';
  paused = false;
  attack.enabled = true;
  player.stop();
  clock.getDelta();
  if (taken) {
    sound.pickup(1);
    // Lucky widens the gene bar immediately, not on the next frame.
    genes.setSlotCount(3 + talents.stats().extraGeneSlot);
    renderGeneBar();
  }
}

// 1/2/3 pick a talent; Esc declines the whole offer.
window.addEventListener('keydown', (event) => {
  if (talentCard.style.display === 'none') return;
  const digit = { Digit1: 0, Digit2: 1, Digit3: 2 }[event.code];
  if (digit !== undefined) {
    event.preventDefault();
    resolveTalent(digit);
  } else if (event.code === 'Escape' || event.code === 'KeyG') {
    event.preventDefault();
    resolveTalent(-1);
  }
});

// ---------------------------------------------------------------------------
// Pause menu
// ---------------------------------------------------------------------------
let pauseMenuOpen = false;
let charPanelOpen = false;

const pauseMenu = document.createElement('div');
pauseMenu.className = 'pause-overlay';
pauseMenu.style.display = 'none';
document.body.appendChild(pauseMenu);

/** Fills the pause overlay with the current build and controls. */
function renderPauseMenu() {
  const geneRows = genes.slots.map((slot) => {
    if (!slot) return '<div class="pause-gene empty">Empty slot</div>';
    const cfg = GENE_TYPES[slot.key];
    const color = `#${TIER_COLORS[slot.tier].toString(16).padStart(6, '0')}`;
    return (
      '<div class="pause-gene">' +
      `<span class="gene-dot" style="background:${color}"></span>` +
      `${cfg.label} · ${TIER_LABELS[slot.tier]} · x${formatStacks(slot.stacks)}` +
      '</div>'
    );
  });

  const stats = [
    `Level ${health.level}`,
    `HP ${Math.ceil(health.hp)} / ${health.maxHp}`,
    `ATK ${playerStats.attackPower.toFixed(2)}`,
    `DEF ${(playerStats.damageReduction * 100).toFixed(1)}%`,
    `Lifesteal ${(playerStats.lifesteal * 100).toFixed(1)}%`,
  ].join(' · ');

  const talentRows = talents.owned.length
    ? talents.owned
        .map(
          (talent) =>
            '<div class="pause-talent">' +
            `<b>${talent.name}</b> · ${talent.describe}` +
            '</div>'
        )
        .join('')
    : '<div class="pause-talent empty">No talents yet — one is offered every 3 minutes.</div>';

  pauseMenu.innerHTML = [
    '<div class="pause-box">',
    '  <div class="pause-title">Paused</div>',
    '  <div class="pause-sub">Press P or Esc to continue</div>',
    '  <div class="pause-section">',
    '    <div class="pause-label">Genes</div>',
    `    <div class="pause-genes">${geneRows.join('')}</div>`,
    '  </div>',
    '  <div class="pause-section">',
    '    <div class="pause-label">Talents</div>',
    `    <div class="pause-talents">${talentRows}</div>`,
    '  </div>',
    '  <div class="pause-section">',
    '    <div class="pause-label">Stats</div>',
    `    <div class="pause-stats">${stats}</div>`,
    '  </div>',
    '  <div class="pause-section">',
    '    <div class="pause-label">Controls</div>',
    '    <div class="pause-controls">',
    '      Arrow keys — hop · Space — tongue blast (hold to keep firing)<br>',
    '      E — awakening · 1 / 2 / 3 — pick a talent<br>',
    '      F — take gene · G / Esc — skip gene · C — character panel · P / Esc — pause',
    '    </div>',
    '  </div>',
    '  <button class="pause-continue">Continue</button>',
    '</div>',
  ].join('');

  pauseMenu.querySelector('.pause-continue').onclick = () => closePauseMenu();
}

/** Freezes the world and shows the pause overlay. */
function openPauseMenu() {
  if (gameState !== 'playing') return;
  // A gene or talent card owns the screen while it is up; the pause menu must
  // not open on top of it.
  if (geneCard.style.display !== 'none') return;
  if (talentCard.style.display !== 'none') return;
  pauseMenuOpen = true;
  paused = true;
  attack.enabled = false;
  player.stop();
  renderPauseMenu();
  pauseMenu.style.display = 'flex';
}

/** Unfreezes the world and hides the pause overlay. */
function closePauseMenu() {
  pauseMenuOpen = false;
  paused = false;
  attack.enabled = true;
  player.stop();
  clock.getDelta();
  pauseMenu.style.display = 'none';
}

// P / Esc toggles the pause menu. Ignored while the gene or talent card and
// the game-over overlay are up, so those keep their own keys.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyP' && event.code !== 'Escape') return;
  if (gameState !== 'playing') return;
  // A card that handled this very keypress has already marked the event, even
  // though its container is hidden again by now. Without this check the same
  // Escape would resolve the card and then immediately open the pause menu.
  if (event.defaultPrevented) return;
  if (geneCard.style.display !== 'none') return;
  if (talentCard.style.display !== 'none') return;
  event.preventDefault();
  if (charPanelOpen) {
    closeCharPanel();
    return;
  }
  if (pauseMenuOpen) closePauseMenu();
  else openPauseMenu();
});

// ---------------------------------------------------------------------------
// Character panel
// ---------------------------------------------------------------------------
const charPanel = document.createElement('div');
charPanel.className = 'char-overlay';
charPanel.style.display = 'none';
document.body.appendChild(charPanel);

/** Fills the character panel with the final computed build. */
function renderCharPanel() {
  const geneRows = genes.slots.map((slot) => {
    if (!slot) return '<div class="char-gene empty">Empty slot</div>';
    const cfg = GENE_TYPES[slot.key];
    const color = `#${TIER_COLORS[slot.tier].toString(16).padStart(6, '0')}`;
    return (
      '<div class="char-gene">' +
      `<span class="gene-dot" style="background:${color}"></span>` +
      `<b>${cfg.label}</b> · ${TIER_LABELS[slot.tier]} · x${formatStacks(slot.stacks)}` +
      `<div class="char-gene-detail">${formatPerLayer(cfg, slot.tier)} · ${formatCap(
        cfg,
        slot.tier
      )}</div>` +
      '</div>'
    );
  });

  const talentRows = talents.owned.length
    ? talents.owned
        .map(
          (talent) =>
            '<div class="char-talent">' +
            `<b>${talent.name}</b> · ${talent.describe}` +
            `<div class="char-gene-detail">${talent.blurb}</div>` +
            '</div>'
        )
        .join('')
    : '<div class="char-talent empty">' +
      `No talents yet — ${talents.slotCount} slots, one offer every 3 minutes.</div>`;

  const awakenText = awakening.active
    ? `Active · ${awakening.remaining.toFixed(1)}s left`
    : awakening.ready
      ? 'Charged · press E'
      : `${Math.round(awakening.progress * 100)}%`;

  const stats = [
    ['Level', `${health.level} / 15`],
    ['HP', `${Math.ceil(health.hp)} / ${health.maxHp}`],
    ['Attack', playerStats.attackPower.toFixed(2)],
    ['Defense', `${(playerStats.damageReduction * 100).toFixed(1)}%`],
    ['Lifesteal', `${(playerStats.lifesteal * 100).toFixed(1)}%`],
    ['Attack range', `${Math.round(playerStats.attackRange)}`],
    ['Cooldown', `${playerStats.attackCooldown.toFixed(2)}s`],
    ['Move speed', `${Math.round((playerStats.moveSpeedMult - 1) * 100)}%`],
    ['Shield', `${Math.round(playerStats.shield)} / ${Math.round(playerStats.shieldMax)}`],
    ['Awakening', awakenText],
  ]
    .map(([label, value]) => `<div class="char-stat"><span>${label}</span><b>${value}</b></div>`)
    .join('');

  charPanel.innerHTML = [
    '<div class="char-box">',
    '  <div class="char-head">',
    '    <div class="char-portrait"></div>',
    '    <div class="char-heading">',
    '      <div class="char-name">Tode</div>',
    `      <div class="char-level">Level ${health.level}</div>`,
    '    </div>',
    '    <button class="char-close">Close <kbd>C</kbd></button>',
    '  </div>',
    '  <div class="char-section">',
    '    <div class="char-label">Vitals</div>',
    `    <div class="char-stats">${stats}</div>`,
    '  </div>',
    '  <div class="char-section">',
    '    <div class="char-label">Genes</div>',
    `    <div class="char-genes">${geneRows.join('')}</div>`,
    '  </div>',
    '  <div class="char-section">',
    '    <div class="char-label">Talents</div>',
    `    <div class="char-talents">${talentRows}</div>`,
    '  </div>',
    '  <div class="char-section">',
    '    <div class="char-label">Skills</div>',
    '    <div class="char-skills">',
    '      <div><b>Space</b> — tongue blast. Hold to keep firing.</div>',
    '      <div><b>F / G</b> — take or skip a gene.</div>',
    '      <div><b>1 / 2 / 3</b> — pick a talent; <b>Esc</b> declines.</div>',
    `      <div><b>E</b> — awakening (${AWAKEN_SCORE_PER_CHARGE} points per charge, one stored).</div>`,
    '      <div><b>C</b> — open or close this panel.</div>',
    '      <div><b>P / Esc</b> — pause.</div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('');

  charPanel.querySelector('.char-close').onclick = () => closeCharPanel();
}

/** Freezes the world and opens the character panel. */
function openCharPanel() {
  if (gameState !== 'playing') return;
  if (geneCard.style.display !== 'none') return;
  if (pauseMenuOpen) closePauseMenu();
  charPanelOpen = true;
  paused = true;
  attack.enabled = false;
  player.stop();
  renderCharPanel();
  charPanel.style.display = 'flex';
}

/** Closes the character panel and resumes the run. */
function closeCharPanel() {
  charPanelOpen = false;
  paused = false;
  attack.enabled = true;
  player.stop();
  clock.getDelta();
  charPanel.style.display = 'none';
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyC') return;
  if (gameState !== 'playing') return;
  if (geneCard.style.display !== 'none') return;
  event.preventDefault();
  if (charPanelOpen) closeCharPanel();
  else openCharPanel();
});

// ---------------------------------------------------------------------------
// Per-frame interaction state
// ---------------------------------------------------------------------------
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
  /** HP already restored during this soak, so the per-soak cap can be enforced. */
  healAccum: 0,
  /** Whether this soak has already rolled its random bonus. */
  bonusFired: false,
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
  bushState.active = false;
  bushState.bush = null;
  bushState.timer = 0;
  bushState.exposed = false;
  flowerState.flower = null;
  flowerState.timer = 0;
  pondState.inWater = false;
  pondState.pond = null;
  pondState.timer = 0;
  pondState.healAccum = 0;
  pondState.bonusFired = false;
  if (scenery) for (const pond of scenery.ponds) pond.cooldown = 0;
  lastFlowerMilestone = 0;
  damagedBushes.clear();

  // Genes and their HUD reset with the run.
  genes.reset(3);
  lastGeneMaxHp = 0;
  // Talents too; the Lucky bonus slot goes away with them.
  talents.reset();
  talentCard.style.display = 'none';
  lastTalentMaxHp = 0;
  lastTalentShieldMax = 0;
  playerStats.shield = 0;
  playerStats.shieldMax = 0;
  // The awakening bar empties with the run.
  awakening.reset();
  renderAwakenBar();

  // Bosses and their rewards reset with the run.
  boss = null;
  nextBossScore = FIRST_BOSS_SCORE;
  bossesSpawned = 0;
  bossBonus.maxHp = 0;
  bossBonus.attack = 0;
  bossBonus.defense = 0;
  renderBossBar();
  runTime = 0;
  paused = false;
  geneCard.style.display = 'none';
  renderGeneBar();
  renderTalentPips();

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
    if (collidesWithObstacle(new THREE.Vector3(point.x, point.y, 0), enemyObstacles, 40)) {
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
  return enemy;
}

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------
/** The boss currently alive, or null. */
let boss = null;
let nextBossScore = FIRST_BOSS_SCORE;
let bossesSpawned = 0;
/** Live venom puddles left by a centipede boss. */
const venomPools = [];
/** Lingering poison on the hero after standing in venom. */
const poison = { stacks: 0, timer: 0, tick: 0, damage: 0, interval: 1 };
/** Ground ring marking where a mole boss will surface. */
let burrowMarker = null;

/**
 * Spawns a boss and prepares the HUD for it.
 *
 * The boss replaces the ordinary swarm pressure: while one is alive the normal
 * spawner pauses, so the fight reads as a duel instead of a pile-on.
 */
function spawnBoss() {
  const species = BOSS_SPECIES[Math.floor(Math.random() * BOSS_SPECIES.length)];
  const angle = Math.random() * Math.PI * 2;
  const point = new THREE.Vector2(
    player.position.x + Math.cos(angle) * 620,
    player.position.y + Math.sin(angle) * 620
  );
  clampToBoard(point, 120);

  const enemy = new Enemy(scene, point, species, false, {
    boss: true,
    bossIndex: bossesSpawned,
    // The pool is scaled to the hero's current damage so a late boss survives
    // long enough to summon and enrage.
    heroAttack: playerStats.attackPower,
  });
  enemies.push(enemy);
  boss = enemy;
  bossesSpawned += 1;
  bossBar.style.display = 'block';
  renderBossBar();
  sound.awaken();
  hud.showAction(
    `A giant ${enemy.type.label} appears!`,
    'boss',
    '#ff3d6e',
    2200
  );
  return enemy;
}

/** Rewrites the boss health bar; hides it when no boss is alive. */
function renderBossBar() {
  if (!boss) {
    bossBar.style.display = 'none';
    return;
  }
  const pct = Math.max(0, Math.round((boss.hp / boss.maxHp) * 100));
  bossBar.innerHTML =
    '<div class="boss-head">' +
    `<span class="boss-name">Giant ${boss.type.label}</span>` +
    `<span class="boss-pct">${pct}%</span>` +
    '</div>' +
    `<div class="boss-track"><span style="width:${pct}%"></span></div>`;
  bossBar.dataset.enraged = boss.enraged ? 'yes' : 'no';
}

/**
 * Awards a random permanent stat bonus for downing a boss.
 *
 * Later bosses roll bigger numbers, and the roll is weighted upward each time
 * so the reward keeps pace with the difficulty curve.
 */
function grantBossBonus() {
  const tier = Math.min(1, bossesSpawned * BOSS_BONUS_GROWTH);
  const roll = (min, max) => min + Math.random() * (max - min) * (1 + tier);

  const hpGain = Math.round(roll(BOSS_BONUS_HP_MIN, BOSS_BONUS_HP_MAX));
  const atkGain = Math.round(roll(BOSS_BONUS_ATK_MIN, BOSS_BONUS_ATK_MAX) * 10) / 10;
  const defGain = roll(BOSS_BONUS_DEF_MIN, BOSS_BONUS_DEF_MAX);

  bossBonus.maxHp += hpGain;
  bossBonus.attack += atkGain;
  bossBonus.defense += defGain;
  health.growMaxHp(hpGain);

  hud.showAction(
    `Boss slain: +${hpGain} HP · +${atkGain.toFixed(1)} ATK · +${(defGain * 100).toFixed(0)}% DEF`,
    'boss',
    '#ffc83d',
    2600
  );
}


// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/**
 * Picks the nearest tree to the hero. Used for the fruit-tree hint and for
 * the tongue-strike test.
 *
 * @param {THREE.Vector2} playerPosition The hero's ground position.
 * @param {Array<object>} trees Tree records from Scenery.
 * @returns {{tree: object|null, distance: number}}
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
/**
 * Contact radius for a given insect.
 *
 * Ordinary insects are small enough that the flat 45-unit threshold still
 * feels fair, but a boss is 4.5x bigger: judging it by the same distance let
 * the hero stand inside a giant beetle and take no damage at all.
 *
 * @param {import('./components/Enemy.js').Enemy} enemy
 * @returns {number}
 */
function contactDistance(enemy) {
  return enemy.boss ? enemy.radius : PLAYER_HIT_DISTANCE;
}

/**
 * Returns the closest insect currently touching the hero, or null.
 *
 * Returning the enemy (rather than a boolean) lets the damage step read that
 * species' contact damage — a centipede bites for 30, a fly for 20.
 *
 * @returns {import('./components/Enemy.js').Enemy|null}
 */
function enemyTouchingPlayer() {
  let closest = null;
  let closestDistance = Infinity;

  for (const enemy of enemies) {
    const dx = enemy.position.x - player.position.x;
    const dy = enemy.position.y - player.position.y;
    const distance = Math.hypot(dx, dy);
    const reach = contactDistance(enemy);
    if (distance < reach && distance < closestDistance) {
      closestDistance = distance;
      closest = enemy;
    }
  }

  return closest;
}

function canEnemyStep(x, y, self) {
  const probe = new THREE.Vector3(x, y, 0);
  if (collidesWithObstacle(probe, enemyObstacles, self.radius * 0.7 + WALL_CLEARANCE)) {
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

/**
 * Shortens a hop along its own direction until it lands clear of a wall.
 *
 * @param {THREE.Vector3} from Where the hop starts.
 * @param {THREE.Vector3} target Where an unobstructed hop would land.
 * @returns {THREE.Vector3|null} The furthest clear spot along the hop.
 */
function trimAlong(from, target) {
  if (!hitsWall(target, player.radius)) return target;
  for (let fraction = 0.95; fraction > 0.02; fraction -= 0.04) {
    const candidate = from.clone().lerp(target, fraction);
    if (!hitsWall(candidate, player.radius)) return candidate;
  }
  return null;
}

/**
 * Trims a hop so it lands as close as possible to its target without ending
 * up inside a tree.
 *
 * Rejecting the hop outright is what left the frog stranded a whole hop-length
 * away from every wall. Instead we walk back along the hop direction and keep
 * the furthest spot that is still clear. If even that fails — the hero is
 * wedged between two obstacles — the direction is rotated a little and tried
 * again, so he slips along the wall instead of freezing in place.
 *
 * @param {THREE.Vector3} from Where the hop starts.
 * @param {THREE.Vector3} target Where an unobstructed hop would land.
 * @returns {THREE.Vector3|null} The trimmed landing spot, or null if wedged.
 */
function trimHopToWalls(from, target) {
  const direct = trimAlong(from, target);
  if (direct) return direct;

  const dx = target.x - from.x;
  const dy = target.y - from.y;

  for (const angle of [Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3]) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotated = new THREE.Vector3(
      from.x + dx * cos - dy * sin,
      from.y + dx * sin + dy * cos,
      from.z
    );
    const slid = trimAlong(from, rotated);
    if (slid) return slid;
  }

  return null;
}

function unstickEnemy(enemy) {
  const current = enemy.position;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const obstacle of enemyObstacles) {
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
  if (collidesWithObstacle(probe, enemyObstacles, POWERUP_WALL_CLEARANCE)) return false;
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
    if (collidesWithObstacle(new THREE.Vector3(x, y, 0), enemyObstacles, POWERUP_WALL_CLEARANCE)) continue;

    return { x, y };
  }
  return { x: fx, y: fy };
}

/**
 * Rolls one of three pond bonuses and applies it.
 *
 * Called once per soak; the pond then goes on a long cooldown. The pool used
 * to heal unconditionally every frame while the hero stood near it, which
 * made him effectively unkillable — that is what this replaces.
 */
function triggerPondBonus() {
  const roll = Math.random();

  if (roll < 0.4) {
    health.heal(30);
    hud.showAction('Pond blessing: +30 HP', 'heart', '#e5484d');
    sound.heal();
  } else if (roll < 0.7) {
    for (const enemy of enemies) {
      enemy.fleeFrom(player.position.x, player.position.y);
    }
    hud.showAction('Pond repels the swarm!', 'pond', '#4da6ff');
    sound.shield();
  } else {
    powerUps.pondSlowTimer = 12;
    hud.showAction('Pond chill: insects slowed for 12s', 'freeze', '#8ee8ff');
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

// Scratch vector reused across frames.
const _dir = new THREE.Vector2();
const _target = new THREE.Vector2();

function gameLoop() {
  const delta = Math.min(clock.getDelta(), 0.1);

  if (gameState === 'game-over') {
    renderer.render(scene, camera);
    return;
  }

  // A gene card (or the pause menu) freezes the world but keeps rendering.
  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  runTime += delta;

  const params = scaledParameters(score.value);
  const boosts = powerUps.multipliers;

  // --- Level-driven bonuses ------------------------------------------------
  // 100 HP = level 1, +100 per level, capped at 15. Each level adds attack,
  // damage reduction and a little move speed. Level reduction is capped at
  // 15% so it cannot combine with genes/talents into near-immunity.
  const level = health.level;
  const levelReduction = Math.min(
    LEVEL_DAMAGE_REDUCTION_MAX,
    (level - 1) * (LEVEL_DAMAGE_REDUCTION_MAX / 14)
  );
  playerStats.attackPower = 1 + (level - 1) * 0.05;
  playerStats.damageReduction = Math.min(MAX_TOTAL_DAMAGE_REDUCTION, levelReduction);
  const levelSpeed = 1 - (level - 1) * 0.01;

  // --- Talent contributions ------------------------------------------------
  const talentStats = talents.stats();
  const talentReduction = Math.max(0, talentStats.damageReduction);
  const talentSpeed = Math.max(-0.5, talentStats.moveSpeed);

  // --- Awakening boost -----------------------------------------------------
  // Applied as multipliers on top of everything else, so it never changes the
  // reductions/floors that keep the hero from becoming invincible.
  const awakenEnded = awakening.update(delta);
  const awaken = awakening.multipliers();
  if (awakenEnded) renderAwakenBar();

  const awakenSpeed = Math.max(-0.5, awaken.speedBonus);
  player.setMoveDuration(
    params.playerMoveDuration *
      boosts.hopDuration *
      levelSpeed *
      (1 - talentSpeed) *
      (1 - awakenSpeed)
  );

  // --- Gene contributions --------------------------------------------------
  const geneStats = genes.stats();
  playerStats.attackPower =
    (1 + (level - 1) * 0.05 + geneStats.attackPower + talentStats.attackPower + bossBonus.attack) *
    awaken.attack;
  playerStats.damageReduction = Math.min(
    MAX_TOTAL_DAMAGE_REDUCTION,
    Math.max(
      0,
      levelReduction + geneStats.damageReduction + talentReduction + bossBonus.defense
    )
  );
  playerStats.lifesteal = Math.min(0.35, geneStats.lifesteal + talentStats.lifesteal);

  attack.cooldownDuration = Math.max(
    geneStats.cooldownFloor,
    params.attackCooldown * geneStats.cooldownMult * (1 + talentStats.cooldownMult)
  );
  attack.radius = Math.min(
    1600,
    (params.attackRadius * boosts.attackRadius + geneStats.attackRange + talentStats.attackRange) *
      awaken.range
  );

  // Mirror the derived values for the character panel.
  playerStats.attackRange = attack.radius;
  playerStats.attackCooldown = attack.cooldownDuration;
  playerStats.moveSpeedMult = levelSpeed * (1 - talentSpeed) * (1 + awakenSpeed);
  playerStats.awakened = awakening.active;
  playerStats.awakenRemaining = awakening.remaining;

  // Beetle genes raise max HP; grant only the newly gained amount so the
  // pool is not topped up every frame.
  if (geneStats.maxHp > lastGeneMaxHp) {
    health.growMaxHp(geneStats.maxHp - lastGeneMaxHp);
    lastGeneMaxHp = geneStats.maxHp;
  }

  // Talent max-HP bonuses follow the same delta rule.
  if (talentStats.maxHp > lastTalentMaxHp) {
    health.growMaxHp(talentStats.maxHp - lastTalentMaxHp);
    lastTalentMaxHp = talentStats.maxHp;
  }

  // Shield talents raise the ceiling and top it up by the same amount once.
  const talentShieldMax = Math.round(health.maxHp * talentStats.shieldMaxPercent);
  playerStats.shieldMax = talentShieldMax;
  if (talentShieldMax > lastTalentShieldMax) {
    playerStats.shield = Math.min(
      talentShieldMax,
      playerStats.shield + (talentShieldMax - lastTalentShieldMax)
    );
    lastTalentShieldMax = talentShieldMax;
  }

  // Offer a talent every three minutes. `update` only ticks while no offer is
  // open, so a declined offer returns exactly one interval later.
  const talentDue = talents.update(delta);
  if (talentDue) {
    sound.awaken();
    showTalentOffer();
  }
  renderTalentPips();
  renderAwakenBar();

  // Gene orbs bob; touching one opens the Take/Skip card and freezes the game.
  if (!talentDue && genes.updateOrbs(delta, player.position)) {
    showGeneCard();
  }

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
  // Houses are walkable now, so "inside" really is "close to the middle".
  let inHouse = null;
  for (const house of houses) {
    if (!house.alive) continue;
    if (house.position.distanceTo(playerPos2) < house.radius * HOUSE_INTERIOR_RADIUS_RATIO) {
      inHouse = house;
      break;
    }
  }
  currentHouse = inHouse;

  // Fade whichever house the hero is standing in, so he never vanishes inside
  // the model.
  for (const house of houses) {
    if (!house.alive) continue;
    house.fadeTo(house === inHouse ? HOUSE_INTERIOR_OPACITY : 1, delta);
  }

  // --- House interaction --------------------------------------------------
  // Protection is continuous while the house still has structural durability.
  // Insects whack the house, not the hero, but every hit drains that bar.
  // When it reaches zero the house collapses and the frog is exposed again.
  if (inHouse) {
    const pct = Math.max(0, Math.round((inHouse.hp / inHouse.maxHp) * 100));
    const drainPerSec = Math.round(HOUSE_HIT_DAMAGE / HOUSE_HIT_INTERVAL);
    shelterReadout.innerHTML = [
      '<div class="shelter-label">House durability</div>',
      `<div class="shelter-bar"><span style="width:${pct}%"></span></div>`,
      `<div class="shelter-rate">-${drainPerSec}% / second</div>`,
    ].join('');
    shelterReadout.style.display = 'block';
  } else {
    shelterReadout.style.display = 'none';
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
      // Stepped into a new bush. One that was already discovered refuses to
      // hide him again until it regrows.
      bushState.bush = inBush;
      if (inBush.cooldown > 0) {
        bushState.timer = 0;
        bushState.exposed = true;
        bushState.active = false;
      } else {
        bushState.timer = BUSH_HIDE_DURATION;
        bushState.exposed = false;
        bushState.active = true;
      }
    } else if (!bushState.exposed) {
      bushState.timer = Math.max(0, bushState.timer - delta);
      if (bushState.timer === 0) {
        bushState.exposed = true;
        bushState.active = false;
        inBush.cooldown = BUSH_COOLDOWN;
        hud.showAction('Spotted! Insects are closing in', 'bush', '#ff6b6b', 2500);
        sound.hurt();
      }
    }
  } else if (bushState.bush) {
    // Left the bush. Burn its cooldown only if he actually used the hide, so
    // brushing past one by accident does not waste it.
    if (bushState.timer < BUSH_HIDE_DURATION - 0.01) {
      bushState.bush.cooldown = BUSH_COOLDOWN;
    }
    bushState.bush = null;
    bushState.timer = 0;
    bushState.exposed = false;
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
        hud.showAction('A flower blooms into a 1.5x power-up!', 'flower', '#ff6b9d');
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
  // The pond used to heal unconditionally every frame for anyone standing
  // within 110 units of it, which made the hero unkillable. It now runs a
  // bounded soak: a capped trickle heal, one random bonus, then a long
  // cooldown before it pays out again.
  let nearPond = null;
  let inWater = null;
  if (scenery) {
    for (const pond of scenery.ponds) {
      const d = pond.position.distanceTo(playerPos2);
      if (d < pond.shoreRadius * POND_NEAR_RADIUS_RATIO) nearPond = pond;
      if (d < pond.surfaceRadius * POND_INNER_RADIUS_RATIO) inWater = pond;
    }
  }

  if (inWater) {
    if ((inWater.cooldown || 0) <= 0) {
      if (!pondState.inWater) {
        // Start a fresh soak.
        pondState.inWater = true;
        pondState.pond = inWater;
        pondState.timer = 0;
        pondState.healAccum = 0;
        pondState.bonusFired = false;
      }

      pondState.timer += delta;

      // Trickle heal, capped per soak.
      const cap = health.maxHp * POND_HEAL_CAP_PERCENT;
      if (pondState.healAccum < cap && health.hp < health.maxHp) {
        const amount = Math.min(
          health.maxHp * POND_HEAL_PERCENT * delta,
          cap - pondState.healAccum,
          health.maxHp - health.hp
        );
        if (amount > 0) {
          health.hp = Math.min(health.maxHp, health.hp + amount);
          health.render();
          pondState.healAccum += amount;
        }
      }

      // One random bonus per soak, shortly after wading in.
      if (!pondState.bonusFired && pondState.timer >= POND_BONUS_WADE_TIME) {
        pondState.bonusFired = true;
        triggerPondBonus();
      }

      // End the soak on the cap or on the hard time limit.
      const capped = pondState.healAccum >= cap - 0.01;
      if (capped || pondState.timer >= POND_SOAK_DURATION) {
        const finished = pondState.pond;
        pondState.inWater = false;
        pondState.pond = null;
        pondState.timer = 0;
        pondState.healAccum = 0;
        // Only THIS pond goes on cooldown; the others stay available.
        if (finished) finished.cooldown = POND_COOLDOWN;
      }
    }
  } else if (pondState.inWater) {
    // Left the water mid-soak — burn that pond's cooldown so dipping in and
    // out cannot be used to farm heals.
    const abandoned = pondState.pond;
    pondState.inWater = false;
    pondState.pond = null;
    pondState.timer = 0;
    pondState.healAccum = 0;
    if (abandoned) abandoned.cooldown = POND_COOLDOWN;
  }

  // Each pond's cooldown ticks down independently.
  if (scenery) {
    for (const pond of scenery.ponds) {
      if (pond.cooldown > 0) pond.cooldown = Math.max(0, pond.cooldown - delta);
    }
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
  // One line, in Chinese, always showing the most relevant thing nearby —
  // including live cooldowns, so the player is never left guessing why an
  // interaction refused to fire.
  let hintState = null;

  if (inHouse) {
    const pct = Math.max(0, Math.round((inHouse.hp / inHouse.maxHp) * 100));
    hintState = {
      key: 'house',
      tone: pct > 30 ? 'active' : 'warn',
      text: `Safe inside · ${pct}% durability`,
    };
  }

  if (!hintState && inBush) {
    if (bushState.exposed) {
      hintState = {
        key: 'bush',
        tone: 'danger',
        text: inBush.cooldown > 0
          ? `This bush is blown · ${Math.ceil(inBush.cooldown)}s`
          : 'Spotted!',
      };
    } else {
      hintState = {
        key: 'bush',
        tone: 'active',
        text: `Hidden · ${bushState.timer.toFixed(1)}s left`,
      };
    }
  }

  if (!hintState && inWater) {
    const pondCd = inWater.cooldown || 0;
    hintState = pondCd > 0
      ? {
          key: 'pond',
          tone: 'cooldown',
          text: `This pond is cooling down · ${Math.ceil(pondCd)}s`,
        }
      : {
          key: 'pond',
          tone: 'active',
          text: `In the water: +${Math.round(POND_HEAL_PERCENT * 100)}% HP/s, ${Math.round(POND_DAMAGE_SOAK * 100)}% damage soaked`,
        };
  }

  if (!hintState && nearPond) {
    const pondCd = nearPond.cooldown || 0;
    hintState = pondCd > 0
      ? {
          key: 'pond',
          tone: 'cooldown',
          text: `This pond is cooling down · ${Math.ceil(pondCd)}s`,
        }
      : {
          key: 'pond',
          tone: 'ready',
          text: `Wade in: +${Math.round(POND_HEAL_PERCENT * 100)}% HP/s and a random bonus`,
        };
  }

  if (!hintState && onFlower) {
    hintState = flowerState.flower === onFlower
      ? {
          key: 'flower',
          tone: 'active',
          text: `Blooming · ${Math.max(0, FLOWER_HARVEST_TIME - flowerState.timer).toFixed(1)}s to go`,
        }
      : {
          key: 'flower',
          tone: 'ready',
          text: `Stay ${FLOWER_HARVEST_TIME}s to bloom a 1.5x power-up`,
        };
  }

  if (!hintState && scenery) {
    const { tree, distance } = nearestTree(playerPos2, scenery.fruitTrees);
    if (tree && distance < TREE_PROXIMITY_DISTANCE) {
      hintState = tree.cooldown > 0
        ? {
            key: 'tree',
            tone: 'cooldown',
            text: `This tree is resting · ${Math.ceil(tree.cooldown)}s`,
          }
        : {
            key: 'tree',
            tone: 'ready',
            text: 'Tongue-blast (Space) a fruit tree to knock fruit loose',
          };
    }
  }

  hud.setProximity(hintState);

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

  // Every successful fire queues exactly one hit. Watching the visual ring
  // instead used to swallow shots when the cooldown was shorter than the ring.
  if (attack.consumeHit()) {
    const hit = attack.enemiesInRange(enemies);
    if (hit.length > 0) {
      const destroyed = hit.filter((enemy) => {
        // Bosses take a tempered share of the awakened attack: huge, but not
        // enough to erase the encounter in a couple of blasts.
        const power = enemy.boss ? playerStats.attackPower * BOSS_AWAKEN_DAMAGE_MULT : playerStats.attackPower;
        // Damage actually dealt (armour + remaining HP both matter).
        const dealt = Math.min(power * (1 - enemy.armor), Math.max(0, enemy.hp));
        const killed = enemy.takeHit(power);

        // Mosquito genes return a share of the damage as HP.
        if (playerStats.lifesteal > 0 && dealt > 0) {
          health.heal(dealt * playerStats.lifesteal);
        }
        return killed;
      });

      if (destroyed.length > 0) {
        destroyed.forEach((enemy) => {
          enemy.dispose();
          // The Scavenger talent scales every kill reward; bosses carry their
          // own much larger point value.
          const points = Math.round((enemy.points || enemy.type.points) * (1 + talentStats.scoreMult));
          score.addKillPoints(points);
          // Those same points charge the awakening bar.
          if (awakening.addScore(points)) {
            hud.showAction('Awakening charged — press E', 'awaken', '#7c5cff', 1600);
            renderAwakenBar();
          }
          // Every kill nudges the hero's maximum HP, which is what raises
          // his level over a run.
          health.growMaxHp(KILL_MAX_HP_GAIN);
          // And it may drop a gene orb of that species.
          genes.maybeDrop(enemy, runTime, enemy.boss);

          // Bosses pay out a permanent stat bonus on top of the orb.
          if (enemy.boss) {
            if (boss === enemy) boss = null;
            renderBossBar();
            grantBossBonus();
          }

          // Once every gene is legendary, orbs stop; kills feed stacks instead.
          const grown = genes.grantStackOnKill(enemy.elite || enemy.boss);
          if (grown) {
            hud.showAction(
              `${GENE_TYPES[grown.key].label} gene: +1 stack`,
              'gene',
              '#ffc83d',
              1200
            );
            renderGeneBar();
          }
        });
        enemies = enemies.filter((enemy) => !destroyed.includes(enemy));
        sound.kill();
      }
    }

    // The same blast knocks a fruit off a nearby fruit tree.
    if (scenery) {
      const { tree, distance } = nearestTree(playerPos2, scenery.fruitTrees);
      if (tree && distance < TREE_STRIKE_RANGE) {
        const outcome = scenery.dropFruit(tree);
        if (outcome === 'ok') {
          hud.showAction('Fruit dropped — go grab it!', 'fruit', '#e5484d');
          sound.powerUp();
        } else if (outcome === 'cooldown') {
          hud.showAction(
            `This tree is still recovering · ${Math.ceil(tree.cooldown)}s`,
            'tree',
            '#888780',
            1500
          );
        }
      }
    }
  }

  // =======================================================================
  // 5. FRUITS
  // =======================================================================
  if (scenery) {
    const eaten = scenery.updateFruits(delta, player.position);
    if (eaten > 0) {
      health.addRegen(FRUIT_REGEN_RATE, FRUIT_REGEN_DURATION, 'Fed');
      hud.showAction(
        `Fruit eaten: regenerating for ${FRUIT_REGEN_DURATION}s`,
        'fruit',
        '#e5484d'
      );
      sound.heal();
    }
  }

  // =======================================================================
  // 5. ENEMY SPAWNING
  // =======================================================================
  // Bosses arrive on a score schedule. While one is alive the ordinary
  // spawner takes a break so the fight stays readable.
  if (!boss && score.value >= nextBossScore) {
    spawnBoss();
    nextBossScore += BOSS_SCORE_STEP;
  }

  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    if (!boss) spawnEnemy(params.enemySpeed);
    spawnTimer = params.enemySpawnDelay;
  }

  // Boss behaviour: summon waves and read the enrage flag.
  if (boss) {
    if (boss.tickBoss(delta)) {
      for (let i = 0; i < BOSS_SUMMON_COUNT; i++) {
        const minion = spawnEnemy(params.enemySpeed);
        if (minion) {
          // Minions join the fight at once, so they appear on a ring around
          // the boss rather than all on top of it: spawning them at the exact
          // centre left them inside the boss's collision bubble, where the
          // step test refused to let them move.
          const ring = Math.max(boss.radius + minion.radius + ENEMY_HIT_DISTANCE + 20, 150);
          const angle = Math.random() * Math.PI * 2;
          minion.group.position.set(
            boss.group.position.x + Math.cos(angle) * ring,
            boss.group.position.y + Math.sin(angle) * ring,
            0
          );
        }
      }
      hud.showAction('The boss calls its brood!', 'boss', '#ff3d6e', 1500);
    }
    renderBossBar();
    updateBossAbility(delta);
  }

  // =======================================================================
  // 6. ENEMIES (state machine, AI, movement, attacks)
  // =======================================================================
  // Slow factor stacks with the existing freeze power-up.
  const pondSlowFactor = powerUps.pondSlowTimer > 0 ? 0.4 : 1;
  const playerHidden = bushState.active;

  for (const enemy of enemies) {
    enemy.setBaseSpeed(params.enemySpeed * boosts.enemySpeed * pondSlowFactor);
    enemy.animate(delta);

    const current = enemy.position;

    if (enemy.state === 'chasing' && !bushState.active) {
      enemy.rememberPlayerPosition(playerPos2.x, playerPos2.y);
    }

    enemy.updateBehavior(delta);

    // -- Pick a target ----------------------------------------------------
    let target = null;
    let isHouseAttack = false;
    let isBushAttack = false;

    // Distances are computed by hand: `current` is a Vector3 and the props
    // below are Vector2, and Vector3.distanceTo(Vector2) yields NaN because
    // the prop has no `z`.
    const distanceTo = (p) => Math.hypot(current.x - p.x, current.y - p.y);

    // When the hero is hidden in a bush, chasing insects lose his trail and
    // wander aimlessly instead of homing on his last position.
    if (playerHidden) {
      enemy.wanderTimer -= delta;
      if (enemy.wanderTimer <= 0) enemy.pickWander(current.x, current.y);
      target = { x: enemy.wanderTarget.x, y: enemy.wanderTarget.y };
    }

    // 1. House whacking — only when the hero is actually sheltering inside
    //    that house. Insects used to chew through any house they happened to
    //    pass, which made the roof health bars meaningless.
    if (enemy.state === 'chasing' && inHouse) {
      for (const house of houses) {
        if (!house.alive || house !== inHouse) continue;
        if (distanceTo(house.position) < HOUSE_ATTACK_RANGE) {
          target = house.position;
          isHouseAttack = true;
          if (house.mayBeHit(delta)) {
            const destroyed = house.takeDamage();
            house.registerHit();
            sound.houseHit();
            if (destroyed) {
              hud.showAction('A house has been destroyed!', 'house', '#e5484d', 2500);
              // The ruin is gone from the scene; drop it from the enemy
              // collision list so insects stop pathing around a hole.
              enemyObstacles = enemyObstacles.filter((o) => o !== house);
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
          hud.showAction('A bush was torn apart', 'bush', '#ff6b6b');
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
  const scoreBefore = score.value;
  score.addSurvivalPoints(delta);
  // Survival points charge the awakening bar too, so a passive run still builds.
  if (awakening.addScore(score.value - scoreBefore)) {
    hud.showAction('Awakening charged — press E', 'awaken', '#7c5cff', 1600);
  }

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
    inHouse ||
    bushState.active;

  // --- Contact damage ------------------------------------------------------
  const attacker = safe ? null : enemyTouchingPlayer();
  if (attacker && health.invulnerable <= 0) {
    // A mid-charge body-check already landed its own hit this cast; the
    // ordinary contact tick would double-dip on the same collision.
    const charging = attacker.boss && attacker.abilityPhase === 'dash';
    if (!charging) {
      // The full reduction chain (pond soak, damage reduction, awakening,
      // shield) lives in `hurtHero` so every hazard is mitigated the same way.
      hurtHero(attacker.contactDamage || HIT_DAMAGE);
    }
  }

  // Vemon puddles, burrow warnings and the death of a boss all need ageing
  // even on frames where nothing else happens.
  updateVenom(delta);

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
}

/**
 * Applies one damage packet to the hero through the full pipeline.
 *
 * Contact damage used to be the only source, so the reduction chain lived
 * inline in the contact branch. Boss abilities are separate sources, and
 * copying that chain into each one would guarantee they drift apart — the
 * venom would ignore the shield, the charge would skip the awakening, and
 * so on. Everything that hurts the hero now goes through here.
 *
 * @param {number} raw Incoming damage before any mitigation.
 * @param {{ignoreInvulnerability?: boolean}} [options]
 * @returns {number} Damage actually taken after shields and reduction.
 */
function hurtHero(raw, options = {}) {
  if (health.dead) return 0;
  if (!options.ignoreInvulnerability && health.invulnerable > 0) return 0;

  let damage = raw;
  // `inWater` and `awaken` are locals of the animation loop; the module-level
  // equivalents are what a helper outside the loop can read.
  if (pondState.inWater) damage *= 1 - POND_DAMAGE_SOAK;
  damage *= 1 - Math.min(MAX_TOTAL_DAMAGE_REDUCTION, playerStats.damageReduction);
  damage *= awakening.multipliers().damageTaken;

  if (playerStats.shield > 0) {
    const absorbed = Math.min(playerStats.shield, damage);
    playerStats.shield -= absorbed;
    damage -= absorbed;
  }

  if (damage > 0.01) {
    health.takeHit(damage);
    sound.hurt();
    return damage;
  }

  // The shield ate the whole packet. Start the mercy window anyway so a
  // lingering hazard is not drained once per frame.
  health.invulnerable = Math.max(health.invulnerable, HIT_INVULNERABILITY * 0.5);
  return 0;
}

/**
 * Advances the live boss's signature ability.
 *
 * Each giant owns a move set no ordinary insect has. They share one phase
 * machine (`windup → resolve → cooldown`) but resolve differently, so the
 * three bosses ask for three different answers: sidestep the stag beetle's
 * charge, keep moving out of the centipede's venom, and clear the mole's
 * burrow marker before it surfaces.
 *
 * @param {number} delta Seconds since the previous frame.
 */
function updateBossAbility(delta) {
  if (!boss || !boss.abilityKey) return;

  const ability = boss.ability;

  // ---- Not casting: count down, then start the next one ----------------
  if (boss.abilityPhase === 'idle') {
    boss.abilityTimer -= delta;
    if (boss.abilityTimer > 0) return;

    boss.abilityPhase = 'windup';
    boss.abilityPhaseTimer = ability.windup || 0.6;
    boss.abilityActive = true;
    boss.setAuraIntensity(3);
    sound.awaken();

    if (boss.abilityKey === 'charge') {
      // Lock the dash direction at telegraph time. Following the hero *during*
      // the wind-up would make the move unavoidable, which defeats the point.
      const dx = player.position.x - boss.position.x;
      const dy = player.position.y - boss.position.y;
      const len = Math.hypot(dx, dy) || 1;
      boss.chargeDir = new THREE.Vector2(dx / len, dy / len);
      hud.showAction('The giant winds up a charge — move!', 'boss', ability.color, 1200);
    } else if (boss.abilityKey === 'venom') {
      hud.showAction('Venom spray!', 'boss', ability.color, 1200);
    } else if (boss.abilityKey === 'burrow') {
      // The mole dives immediately: the danger zone locks onto wherever the
      // hero is standing right now, so standing still is what kills you.
      boss.danger = {
        x: player.position.x,
        y: player.position.y,
        radius: ability.dangerRadius,
      };
      boss.visual.visible = false;
      startedBurrowMarker();
      hud.showAction('The ground shakes — get clear!', 'boss', ability.color, 1400);
    }
    return;
  }

  // ---- Resolve the phase ------------------------------------------------
  boss.abilityPhaseTimer -= delta;

  if (boss.abilityKey === 'charge') {
    if (boss.abilityPhase === 'windup') {
      if (boss.abilityPhaseTimer > 0) return;
      boss.abilityPhase = 'dash';
      boss.abilityPhaseTimer = ability.duration;
      boss.chargeHit = false;
      boss.chargeTravelled = 0;
    }

    // Drive the body along the locked vector.
    //
    // The dash advances by a fraction of `distance` per frame, not by
    // "speed x delta". Frame-time scaling made the same move land at wildly
    // different ranges depending on the machine — a headless run covered
    // 126 units where a smooth 60fps run covered 500 — which made the move
    // feel random. Counting frames keeps the reach constant.
    const travelled = boss.chargeTravelled || 0;
    const legStep = ability.distance / Math.max(1, ability.dashFrames);
    const probe = new THREE.Vector3(
      boss.position.x + boss.chargeDir.x * legStep,
      boss.position.y + boss.chargeDir.y * legStep,
      0
    );
    boss.chargeTravelled = travelled + legStep;
    if (collidesWithObstacle(probe, enemyObstacles, boss.radius * 0.6)) {
      // Slammed into a tree or a wall: the charge ends early.
      boss.abilityPhaseTimer = 0;
      hud.showAction('The charge crashes into the scenery!', 'boss', '#ffd166', 1200);
    } else {
      boss.group.position.x = probe.x;
      boss.group.position.y = probe.y;
      clampToBoard(boss.position, boss.radius * 0.5);
      if (!boss.chargeHit) {
        const reach = boss.radius + player.radius;
        if (
          !safeFromHazards() &&
          Math.hypot(
            boss.position.x - player.position.x,
            boss.position.y - player.position.y
          ) < reach
        ) {
          boss.chargeHit = true;
          hurtHero(boss.contactDamage * ability.damageMult, {
            ignoreInvulnerability: true,
          });
          hud.showAction('Charged!', 'boss', ability.color, 900);
        }
      }
    }
    if (boss.abilityPhaseTimer <= 0) finishBossAbility();
    return;
  }

  if (boss.abilityKey === 'venom') {
    if (boss.abilityPhaseTimer > 0) return;

    // Scatter pools in a fan ahead of the boss.
    const baseAngle = Math.atan2(
      player.position.y - boss.position.y,
      player.position.x - boss.position.x
    );
    for (let i = 0; i < ability.pools; i++) {
      const spread = (i - (ability.pools - 1) / 2) * 0.5;
      const distance = 130 + i * 55;
      const px = boss.position.x + Math.cos(baseAngle + spread) * distance;
      const py = boss.position.y + Math.sin(baseAngle + spread) * distance;
      venomPools.push({
        x: px,
        y: py,
        radius: ability.poolRadius,
        life: ability.life,
        tickTimer: 0,
        // Each puddle carries its own numbers. Reading them off the live boss
        // meant a puddle went inert the moment the boss died — and puddles
        // outlive their caster by several seconds.
        tickDamage: ability.tickDamage,
        tickInterval: ability.tickInterval,
        poisonDamage: ability.poisonDamage,
        poisonInterval: ability.poisonInterval,
        poisonDuration: ability.poisonDuration,
        mesh: makeVenomPatch(px, py, ability.poolRadius),
      });
    }
    finishBossAbility();
    return;
  }

  if (boss.abilityKey === 'burrow') {
    if (boss.abilityPhaseTimer > 0) return;

    // Surface. Anyone still inside the marker takes the burst.
    boss.visual.visible = true;
    boss.group.position.set(boss.danger.x, boss.danger.y, 0);
    const inside =
      !safeFromHazards() &&
      Math.hypot(
        player.position.x - boss.danger.x,
        player.position.y - boss.danger.y
      ) < boss.danger.radius + player.radius;

    clearBurrowMarker();
    boss.danger = null;

    if (inside) {
      hurtHero(ability.burstDamage, { ignoreInvulnerability: true });
      hud.showAction('The giant surfaces beneath you!', 'boss', ability.color, 1400);
    } else {
      hud.showAction('The giant bursts out of the ground!', 'boss', ability.color, 1200);
    }
    finishBossAbility();
  }
}

/** Returns the boss to its cooldown state after a cast resolves. */
function finishBossAbility() {
  if (!boss) return;
  boss.abilityPhase = 'idle';
  boss.abilityActive = false;
  boss.abilityTimer = boss.abilityCooldown;
  boss.setAuraIntensity(boss.enraged ? 2 : 1);
}

/**
 * Builds the translucent ground ring that marks a mole's burrow target.
 *
 * @param {number} x World X.
 * @param {number} y World Y.
 * @param {number} radius Ring radius in world units.
 * @returns {THREE.Mesh}
 */
function makeDangerMarker(x, y, radius) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.85, radius, 48),
    new THREE.MeshBasicMaterial({
      color: 0xc98cff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  marker.position.set(x, y, 2.5);
  scene.add(marker);
  return marker;
}

/** Adds the burrow warning ring to the scene. */
function startedBurrowMarker() {
  clearBurrowMarker();
  if (!boss || !boss.danger) return;
  burrowMarker = makeDangerMarker(boss.danger.x, boss.danger.y, boss.danger.radius);
}

/** Removes the burrow warning ring, if one exists. */
function clearBurrowMarker() {
  if (!burrowMarker) return;
  scene.remove(burrowMarker);
  burrowMarker.geometry.dispose();
  burrowMarker.material.dispose();
  burrowMarker = null;
}

/**
 * Builds a venom puddle on the ground.
 *
 * @param {number} x World X.
 * @param {number} y World Y.
 * @param {number} radius Puddle radius in world units.
 * @returns {THREE.Mesh}
 */
function makeVenomPatch(x, y, radius) {
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({
      color: 0x6bdc4a,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  patch.position.set(x, y, 2);
  scene.add(patch);
  return patch;
}

/**
 * Ages the venom puddles and applies their damage to a standing hero.
 *
 * Venom is a damage-over-time zone, not an instant hit: a single packet per
 * puddle would just be contact damage with extra steps. The poison also
 * lingers for a few seconds after the hero escapes, which is what makes
 * standing in it a real mistake instead of a scratch.
 *
 * @param {number} delta Seconds since the previous frame.
 */
function updateVenom(delta) {
  const defaults = BOSS_ABILITIES.centipede;

  for (let i = venomPools.length - 1; i >= 0; i--) {
    const pool = venomPools[i];
    pool.life -= delta;

    // Fade out over the last second so the puddle visibly expires.
    if (pool.life < 1) {
      pool.mesh.material.opacity = 0.42 * Math.max(0, pool.life);
    }

    if (pool.life <= 0) {
      scene.remove(pool.mesh);
      pool.mesh.geometry.dispose();
      pool.mesh.material.dispose();
      venomPools.splice(i, 1);
      continue;
    }

    const inside =
      Math.hypot(player.position.x - pool.x, player.position.y - pool.y) < pool.radius;
    if (inside && !safeFromHazards()) {
      pool.tickTimer -= delta;
      if (pool.tickTimer <= 0) {
        pool.tickTimer = pool.tickInterval || defaults.tickInterval;
        hurtHero(pool.tickDamage || defaults.tickDamage);
        poison.stacks = Math.min(VENOM_STACK_LIMIT, poison.stacks + 1);
        poison.timer = pool.poisonDuration || defaults.poisonDuration;
        poison.tick = pool.poisonInterval || defaults.poisonInterval;
        // Latch the numbers onto the poison state itself, so lingering ticks
        // keep working after the puddle (and its caster) are gone.
        poison.damage = pool.poisonDamage || defaults.poisonDamage;
        poison.interval = pool.poisonInterval || defaults.poisonInterval;
      }
    }
  }

  // Lingering poison keeps ticking after the hero leaves the puddle.
  if (poison.timer > 0) {
    poison.timer -= delta;
    poison.tick -= delta;
    if (poison.tick <= 0) {
      poison.tick = poison.interval || defaults.poisonInterval;
      hurtHero((poison.damage || defaults.poisonDamage) * poison.stacks);
    }
    if (poison.timer <= 0) {
      poison.stacks = 0;
      poison.timer = 0;
    }
  }
}

/**
 * True while the hero is somewhere the boss's ground hazards cannot reach.
 *
 * Uses the module-level power-up state rather than the animation loop's
 * `boosts` local — helpers defined outside the loop cannot see its locals.
 *
 * @returns {boolean}
 */
function safeFromHazards() {
  return (
    powerUps.multipliers.shielded ||
    health.shielded ||
    currentHouse ||
    bushState.active
  );
}

spawnEnemy();
// This avoids the old "procedural frog, then sudden swap" pop at the start.
const loadingScreen = document.createElement('div');
loadingScreen.className = 'loading-screen';
loadingScreen.textContent = 'Loading…';
document.body.appendChild(loadingScreen);

player.ready.then(() => {
  loadingScreen.remove();
  renderer.setAnimationLoop(gameLoop);
});

// ---------------------------------------------------------------------------
// Debug hook for automated testing. Exposes the live world state so a headless
// browser can assert on it without reaching into module scope. Not used by the
// game itself.
// ---------------------------------------------------------------------------
window.__hud = {
  get houses() { return houses; },
  get trees() { return scenery ? scenery.trees : []; },
  get fruitTrees() { return scenery ? scenery.fruitTrees : []; },
  get fruits() { return scenery ? scenery.fruits : []; },
  get bushes() { return scenery ? scenery.bushes : []; },
  get flowers() { return scenery ? scenery.flowers : []; },
  get ponds() { return scenery ? scenery.ponds : []; },
  get enemies() { return enemies; },
  get pickups() { return powerUps.pickups; },
  get powerUps() { return powerUps; },
  get scene() { return scene; },
  get score() { return score; },
  get health() { return health; },
  get playerStats() { return playerStats; },
  get attack() { return attack; },
  get genes() { return genes; },
  get talents() { return talents; },
  get awakening() { return awakening; },
  get boss() { return boss; },
  get bossBonus() { return bossBonus; },
  get nextBossScore() { return nextBossScore; },
  get bossesSpawned() { return bossesSpawned; },
  /** Pure boss-stat derivation, shared with the constructor. For tests. */
  bossProfile,

  /** Ability cooldown for a given species and boss number. For tests. */
  bossAbilityCooldown,

  /** Spawns a boss right now. Only for arranging a test. */
  forceBoss(species = 'beetle') {
    const angle = Math.random() * Math.PI * 2;
    const point = new THREE.Vector2(
      player.position.x + Math.cos(angle) * 500,
      player.position.y + Math.sin(angle) * 500
    );
    clampToBoard(point, 120);
    const enemy = new Enemy(scene, point, species, false, {
      boss: true,
      bossIndex: bossesSpawned,
      heroAttack: playerStats.attackPower,
    });
    enemies.push(enemy);
    boss = enemy;
    bossesSpawned += 1;
    bossBar.style.display = 'block';
    renderBossBar();
    return enemy;
  },

  /** Fires the live boss's signature ability immediately. For tests. */
  triggerBossAbility() {
    if (!boss) return null;
    boss.abilityTimer = 0;
    return boss.abilityKey;
  },

  /**
   * Brings the hero back after a death, without reloading the page.
   *
   * A test that damages the hero often wants to keep measuring afterwards;
   * reloading loses the whole arranged world, so this restores just enough
   * state for the loop to keep running.
   */
  revive() {
    // `dead` is derived from `hp`, so restoring the pool is the whole job.
    health.hp = health.maxHp;
    health.invulnerable = 0;
    gameState = 'playing';
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    return health.hp;
  },

  /** Live venom puddles, so a test can count them. */
  get venomPools() {
    return venomPools;
  },

  /** Lingering poison state on the hero. */
  poison,

  /** Applies one damage packet through the full mitigation pipeline. */
  hurtHero,

  /**
   * Puts the live boss into its enraged state without waiting for the bar
   * to drain.
   */
  forceEnrage() {
    if (!boss) return false;
    boss.hp = Math.min(boss.hp, boss.maxHp * boss.enrageThreshold);
    return boss.enraged;
  },

  /** Closes the boss bar without killing anything. Only for arranging a test. */
  /**
   * Removes the boss without paying a reward.
   *
   * @param {boolean} [rewind] Put the boss counter back, so the next spawn
   *   is the same number boss again. Tests that compare "first boss" against
   *   "second boss" need this, otherwise every scenario silently walks the
   *   difficulty ramp forward.
   */
  clearBoss(rewind = false) {
    if (boss) boss.dispose();
    boss = null;
    enemies = enemies.filter((enemy) => !enemy.boss);
    if (rewind) {
      bossesSpawned = Math.max(0, bossesSpawned - 1);
      nextBossScore = Math.max(FIRST_BOSS_SCORE, nextBossScore - BOSS_SCORE_STEP);
    }
    renderBossBar();
    bossBar.style.display = 'none';
  },
  get paused() { return paused; },
  get scenery() { return scenery; },

  /**
   * Spawns a gene orb at a point. Only for arranging a test.
   *
   * @param {string} key Species key.
   * @param {string} tier Quality tier.
   * @param {number} x World X.
   * @param {number} y World Y.
   */
  spawnGene(key, tier, x, y) {
    return genes.spawnOrb(key, tier, x, y);
  },

  /** Clears every gene and unpauses. Only for arranging a test. */
  clearGenes() {
    genes.reset(3);
    geneCard.style.display = 'none';
    paused = false;
    renderGeneBar();
  },

  /** Forces the next talent offer to appear. Only for arranging a test. */
  primeTalentOffer() {
    talents.primeOffer();
  },

  /**
   * Fills the awakening bar for a test.
   *
   * @param {number} [charges] Charges to bank.
   */
  chargeAwakening(charges = 1) {
    awakening.charges = charges;
    awakening.scoreProgress = 0;
    renderAwakenBar();
  },

  /**
   * Applies a talent by key without opening the card. Only for arranging a test.
   *
   * @param {string} key A key into TALENTS.
   * @returns {string[]} The talents owned afterwards.
   */
  grantTalent(key) {
    const talent = TALENTS.find((entry) => entry.key === key);
    // Respect the slot ceiling even when called directly: a debug hook that
    // can overfill the build would let a bug hide behind it.
    if (talent && !talents.owned.some((entry) => entry.key === key) && !talents.full) {
      talents.owned.push(talent);
    }
    genes.setSlotCount(3 + talents.stats().extraGeneSlot);
    renderGeneBar();
    renderTalentPips();
    return talents.owned.map((entry) => entry.key);
  },

  /**
   * Spawns a specific insect at a point. Only for arranging a test.
   *
   * @param {string} typeKey A key into ENEMY_TYPES.
   * @param {number} x World X.
   * @param {number} y World Y.
   * @returns {import('./components/Enemy.js').Enemy}
   */
  spawnEnemy(typeKey, x, y) {
    const enemy = new Enemy(scene, new THREE.Vector2(x, y), typeKey);
    enemies.push(enemy);
    return enemy;
  },
  get player() { return player; },
  get obstacles() { return obstacles; },
  get houseAttackRange() { return HOUSE_ATTACK_RANGE; },

  /**
   * Move the hero instantly. Only for arranging a test — never use this to
   * answer "can he reach it", because it skips collision entirely.
   */
  teleport(x, y) {
    player.group.position.set(x, y, 0);
    player.stop();
  },

  /**
   * Walk towards a point through the real hop pipeline: collision, hop
   * trimming and board clamping all apply. This is the honest way to test
   * whether the hero can actually get somewhere.
   *
   * @returns {Promise<boolean>} True if he arrived within `tolerance`.
   */
  async walkToward(tx, ty, maxHops = 40, tolerance = 20) {
    for (let i = 0; i < maxHops; i++) {
      const dx = tx - player.position.x;
      const dy = ty - player.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= tolerance) return true;
      player.inputQueue.push(new THREE.Vector2(dx / dist, dy / dist));
      await new Promise((resolve) => setTimeout(resolve, 340));
    }
    return Math.hypot(tx - player.position.x, ty - player.position.y) <= tolerance;
  },

  get playerPos2() { return { x: player.position.x, y: player.position.y }; },

  state: {
    get inHouse() { return currentHouse; },
    get bushState() { return bushState; },
    get flowerState() { return flowerState; },
    get pondState() { return pondState; },
  },
};
