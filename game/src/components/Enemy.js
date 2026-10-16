import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
/** Base delay between enemy spawns, in seconds. */
export const ENEMY_SPAWN_DELAY = 2.5;
/** Base enemy movement speed (world units per second). */
export const ENEMY_SPEED = 45;
/** Height the insects hover at, in world units. */
export const ENEMY_HOVER = 38;

// Spawn positions are chosen by main.js: on a board this large, insects have
// to appear relative to the hero rather than at fixed map corners.

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
/**
 * Paints a repeating two-colour band texture on a canvas. Used for the bee's
 * abdomen so we get stripes without shipping any image files.
 *
 * @param {string} base Fill colour for the body.
 * @param {string} band Colour of the stripes.
 * @param {number} bands How many stripes to draw.
 * @returns {THREE.CanvasTexture}
 */
function bandTexture(base, band, bands) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bandWidth = canvas.width / (bands * 2);
  ctx.fillStyle = band;
  for (let i = 0; i < bands; i++) {
    ctx.fillRect(i * bandWidth * 2 + bandWidth, 0, bandWidth, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const wingMaterial = new THREE.MeshStandardMaterial({
  color: 0xdce8f5,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const flyEyeMaterial = new THREE.MeshStandardMaterial({
  color: 0xd93b2b,
  roughness: 0.25,
});

/**
 * Builds one wing mesh, tagged so the animation loop can find it later.
 *
 * @param {THREE.BufferGeometry} geometry Wing shape.
 * @param {number} side -1 for left, +1 for right.
 * @param {number} scale Relative wing size.
 * @returns {THREE.Mesh}
 */
function makeWing(geometry, side, scale = 1) {
  const wing = new THREE.Mesh(geometry, wingMaterial);
  wing.name = 'wing';
  wing.userData.side = side;
  wing.scale.setScalar(scale);
  return wing;
}

// ---------------------------------------------------------------------------
// Enemy blueprints
// ---------------------------------------------------------------------------
// Each blueprint returns a fresh Group whose origin sits at the insect's
// centre of mass. Meshes named "wing" are collected by the Enemy class and
// flapped every frame.

/** Common house fly: the baseline enemy. */
function buildFly(cfg) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.72, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2f3038, roughness: 0.35, metalness: 0.4 })
  );
  body.scale.set(1.35, 1, 0.95);
  group.add(body);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius * 0.3, 12, 10), flyEyeMaterial);
    eye.position.set(cfg.radius * 0.6, side * cfg.radius * 0.32, cfg.radius * 0.2);
    group.add(eye);
  }

  const wingGeo = new THREE.CircleGeometry(cfg.radius * 0.95, 16);
  for (const side of [-1, 1]) {
    const wing = makeWing(wingGeo, side);
    wing.position.set(-cfg.radius * 0.1, side * cfg.radius * 0.85, cfg.radius * 0.35);
    wing.rotation.x = side * 0.25;
    group.add(wing);
  }

  return group;
}

/** Mosquito: smaller, slimmer and noticeably faster. */
function buildMosquito(cfg) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.6 });

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.6, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.5, metalness: 0.2 })
  );
  body.scale.set(2.4, 0.85, 0.85);
  group.add(body);

  // Long needle-like proboscis.
  const proboscis = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.radius * 0.05, cfg.radius * 0.02, cfg.radius * 1.6, 6),
    dark
  );
  proboscis.rotation.z = -Math.PI / 2;
  proboscis.position.set(cfg.radius * 1.15, 0, 0);
  group.add(proboscis);

  // Two swept-back antennae.
  for (const side of [-1, 1]) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.radius * 0.035, cfg.radius * 0.02, cfg.radius * 1.1, 5),
      dark
    );
    antenna.rotation.z = -Math.PI / 2;
    antenna.rotation.x = side * 0.5;
    antenna.position.set(cfg.radius * 0.75, side * cfg.radius * 0.3, cfg.radius * 0.15);
    group.add(antenna);
  }

  // Dark eyes.
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius * 0.22, 10, 8), eyeMaterial);
    eye.position.set(cfg.radius * 0.5, side * cfg.radius * 0.25, cfg.radius * 0.18);
    group.add(eye);
  }

  const wingGeo = new THREE.CircleGeometry(cfg.radius * 0.8, 14);
  for (const side of [-1, 1]) {
    const wing = makeWing(wingGeo, side);
    wing.position.set(-cfg.radius * 0.15, side * cfg.radius * 0.7, cfg.radius * 0.3);
    wing.rotation.x = side * 0.3;
    group.add(wing);
  }

  return group;
}

/** Bee: sturdy, banded, with two pairs of wings and a stinger. */
function buildBee(cfg) {
  const group = new THREE.Group();

  const stripedMaterial = new THREE.MeshStandardMaterial({
    map: bandTexture('#f2c14e', '#2b2118', 3),
    roughness: 0.45,
    metalness: 0.15,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius * 0.85, 18, 14), stripedMaterial);
  body.scale.set(1.35, 1, 1);
  group.add(body);

  // Dark head at the front.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.45, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.5 })
  );
  head.position.x = cfg.radius * 0.95;
  group.add(head);

  // Stinger at the back.
  const stinger = new THREE.Mesh(
    new THREE.ConeGeometry(cfg.radius * 0.16, cfg.radius * 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.4 })
  );
  stinger.rotation.z = Math.PI / 2;
  stinger.position.x = -cfg.radius * 1.05;
  group.add(stinger);

  const wingGeo = new THREE.CircleGeometry(cfg.radius * 0.62, 14);
  for (const side of [-1, 1]) {
    // Two wings per side; the front pair is slightly larger.
    const front = makeWing(wingGeo, side, 1);
    front.position.set(cfg.radius * 0.2, side * cfg.radius * 0.8, cfg.radius * 0.45);
    front.rotation.x = side * 0.22;
    group.add(front);

    const rear = makeWing(wingGeo, side, 0.78);
    rear.position.set(-cfg.radius * 0.4, side * cfg.radius * 0.75, cfg.radius * 0.4);
    rear.rotation.x = side * 0.34;
    group.add(rear);
  }

  return group;
}

/** Beetle: slow, armoured, takes two hits to bring down. */
function buildBeetle(cfg) {
  const group = new THREE.Group();

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d4a2a,
    roughness: 0.25,
    metalness: 0.75,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius * 0.8, 18, 14), shellMaterial);
  body.scale.set(1.2, 1.1, 0.8);
  group.add(body);

  // Raised elytra (wing case) sitting on top of the abdomen.
  const elytra = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.82, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    shellMaterial
  );
  elytra.scale.set(1.15, 1, 0.55);
  elytra.position.set(-cfg.radius * 0.15, 0, cfg.radius * 0.12);
  group.add(elytra);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.42, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x1d2f1c, roughness: 0.35, metalness: 0.7 })
  );
  head.position.x = cfg.radius * 0.9;
  group.add(head);

  // Rhino-beetle style horn.
  const horn = new THREE.Mesh(
    new THREE.ConeGeometry(cfg.radius * 0.16, cfg.radius * 0.85, 8),
    new THREE.MeshStandardMaterial({ color: 0x1d2f1c, roughness: 0.3, metalness: 0.7 })
  );
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(cfg.radius * 1.25, 0, cfg.radius * 0.18);
  group.add(horn);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xe8d44d, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius * 0.14, 10, 8), eyeMaterial);
    eye.position.set(cfg.radius * 1.0, side * cfg.radius * 0.26, cfg.radius * 0.2);
    group.add(eye);
  }

  // Beetles are armoured fliers: small wings tucked under the shell.
  const wingGeo = new THREE.CircleGeometry(cfg.radius * 0.5, 12);
  for (const side of [-1, 1]) {
    const wing = makeWing(wingGeo, side, 0.9);
    wing.position.set(-cfg.radius * 0.2, side * cfg.radius * 0.72, cfg.radius * 0.32);
    wing.rotation.x = side * 0.3;
    group.add(wing);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Type table
// ---------------------------------------------------------------------------
/**
 * Every enemy archetype. `speedScale` multiplies the difficulty-driven base
 * speed; `hp` is how many attacks it survives; `points` is the kill reward.
 */
export const ENEMY_TYPES = {
  fly: { key: 'fly', label: 'Fly', radius: 22, hp: 1, points: 10, speedScale: 1.0, build: buildFly },
  mosquito: { key: 'mosquito', label: 'Mosquito', radius: 15, hp: 1, points: 15, speedScale: 1.65, build: buildMosquito },
  bee: { key: 'bee', label: 'Bee', radius: 20, hp: 1, points: 25, speedScale: 1.15, build: buildBee },
  beetle: { key: 'beetle', label: 'Beetle', radius: 30, hp: 2, points: 40, speedScale: 0.7, build: buildBeetle },
};

/**
 * Chooses which insect to spawn, weighting the mix towards tougher species as
 * the score climbs. Early game stays gentle so new players can find their feet.
 *
 * @param {number} score The player's current score.
 * @returns {string} A key into ENEMY_TYPES.
 */
export function pickEnemyType(score) {
  const pool = ['fly', 'fly', 'fly'];

  if (score >= 15) pool.push('mosquito', 'fly');
  if (score >= 35) pool.push('mosquito', 'bee');
  if (score >= 60) pool.push('bee', 'beetle');
  if (score >= 100) pool.push('beetle', 'mosquito');

  return pool[Math.floor(Math.random() * pool.length)];
}

// Blueprints are built once and cloned per spawn — geometry and materials are
// shared, so a swarm of twenty insects costs almost nothing extra.
const blueprintCache = new Map();

function getBlueprint(typeKey) {
  if (!blueprintCache.has(typeKey)) {
    const cfg = ENEMY_TYPES[typeKey];
    blueprintCache.set(typeKey, cfg.build(cfg));
  }
  return blueprintCache.get(typeKey);
}

// ---------------------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------------------
/**
 * A single flying insect that hunts the hero. Archetypes differ in speed,
 * size, durability and kill value — see ENEMY_TYPES.
 *
 * Each insect runs a tiny state machine: it is either `chasing` the hero or
 * `disengaged` after losing line of sight for too long. A disengaged insect
 * drifts away from the player for a few seconds, then asks the caller to
 * remove it.
 */
export class Enemy {
  /**
   * @param {THREE.Scene} scene The scene the enemy should be added to.
   * @param {THREE.Vector2} spawnPoint Starting position on the ground plane.
   * @param {string} [typeKey] Which archetype to spawn.
   */
  constructor(scene, spawnPoint, typeKey = 'fly') {
    this.scene = scene;

    /** Archetype definition. */
    this.type = ENEMY_TYPES[typeKey] || ENEMY_TYPES.fly;
    /** Archetype key, handy for debugging. */
    this.typeKey = this.type.key;

    /** How much of the difficulty-driven base speed this species uses. */
    this.speedScale = this.type.speedScale;
    /** Current speed in world units per second. */
    this.speed = ENEMY_SPEED * this.speedScale;

    /** Remaining hit points. */
    this.maxHp = this.type.hp;
    this.hp = this.maxHp;

    // World-space holder on the ground plane; the body is lifted to hover.
    this.group = new THREE.Group();
    this.group.position.set(spawnPoint.x, spawnPoint.y, 0);
    scene.add(this.group);

    // Fresh copy of the blueprint, lifted so the insect flies above the board.
    this.visual = getBlueprint(this.typeKey).clone(true);
    this.visual.position.z = ENEMY_HOVER;
    this.group.add(this.visual);

    // Collect the wings so they can be flapped.
    this.wings = [];
    this.visual.traverse((node) => {
      if (node.name === 'wing') this.wings.push(node);
    });

    // Wing-flap phase, randomised so a swarm doesn't beat in lockstep.
    this.flapPhase = Math.random() * Math.PI * 2;

    // Countdown for the "took a hit but survived" swell.
    this.hitFlash = 0;

    // ---- State machine ----------------------------------------------------
    /** @type {'chasing' | 'disengaged'} */
    this.state = 'chasing';
    /** Seconds since the enemy last saw the hero. */
    this.lostSightTimer = 0;
    /** Seconds since the enemy disengaged; once it crosses 4s the caller removes it. */
    this.disengageTimer = 0;
    /** Cached unit vector pointing away from the hero when disengaging. */
    this.disengageDirection = new THREE.Vector2(1, 0);

    this.loaded = true;
  }

  /**
   * Updates the base speed from the difficulty system, preserving this
   * species' relative pace.
   *
   * @param {number} baseSpeed The shared, difficulty-scaled base speed.
   */
  setBaseSpeed(baseSpeed) {
    this.speed = baseSpeed * this.speedScale;
  }

  /**
   * Applies one hit.
   *
   * @returns {boolean} True if the insect was destroyed, false if it survived.
   */
  takeHit() {
    this.hp -= 1;
    if (this.hp > 0) {
      this.hitFlash = 0.25;
      return false;
    }
    return true;
  }

  /**
   * Animates the wings and the damage swell. Called once per frame.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  animate(delta) {
    this.flapPhase += delta * 26;
    const flap = Math.sin(this.flapPhase) * 0.45;

    for (const wing of this.wings) {
      const side = wing.userData.side;
      wing.rotation.x = side * (0.25 + flap);
    }

    // A brief swell makes a non-fatal hit legible.
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - delta);
      const t = this.hitFlash / 0.25;
      this.visual.scale.setScalar(1 + 0.35 * t);
    } else if (this.visual.scale.x !== 1) {
      this.visual.scale.setScalar(1);
    }
  }

  /**
   * Updates the state machine. The caller passes in whether this particular
   * enemy can currently see the player (line-of-sight test against trees).
   *
   * @param {number} delta Seconds since the previous frame.
   * @param {boolean} canSeePlayer True if there is no tree between us and the hero.
   */
  updateBehavior(delta, canSeePlayer) {
    if (this.state === 'chasing') {
      if (canSeePlayer) {
        this.lostSightTimer = 0;
      } else {
        this.lostSightTimer += delta;
        if (this.lostSightTimer >= 1.5) {
          this.state = 'disengaged';
          this.disengageTimer = 0;
          // Pick a unit vector pointing away from the player. The caller will
          // give us a target point along this ray; the insect will follow it
          // until it leaves the board, at which point it is removed.
          this.disengageDirection.set(
            this.group.position.x - this.lastSeenX,
            this.group.position.y - this.lastSeenY
          );
          if (this.disengageDirection.lengthSq() < 1e-4) {
            this.disengageDirection.set(1, 0);
          } else {
            this.disengageDirection.normalize();
          }
        }
      }
    } else if (this.state === 'disengaged') {
      this.disengageTimer += delta;
    }
  }

  /**
   * Records where the player was last seen. Drives the disengage fly-away
   * direction, and is what the chaser still chases towards.
   *
   * @param {number} x
   * @param {number} y
   */
  rememberPlayerPosition(x, y) {
    this.lastSeenX = x;
    this.lastSeenY = y;
  }

  /**
   * True once the insect has been disengaged long enough to clean up.
   *
   * @returns {boolean}
   */
  get readyToRemove() {
    return this.state === 'disengaged' && this.disengageTimer >= 4;
  }

  /**
   * Returns the enemy's position on the ground plane.
   *
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.group.position;
  }

  /**
   * Removes this enemy from the scene.
   */
  dispose() {
    this.scene.remove(this.group);
  }
}
