import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
/** Base delay between enemy spawns, in seconds. */
export const ENEMY_SPAWN_DELAY = 2.5;
/** Base enemy movement speed (world units per second). */
export const ENEMY_SPEED = 45;
/** Height an enemy hovers at, in world units. */
export const ENEMY_HOVER = 38;
/** Body radius, in world units. */
export const ENEMY_RADIUS = 22;

// The four corners of the map, in world coordinates. Kept inside the
// playfield but outside the camera's initial view, so monsters walk into
// sight within a few seconds instead of taking 20 to cross the map.
export const SPAWN_POINTS = [
  new THREE.Vector2(-260, 260),
  new THREE.Vector2(260, 260),
  new THREE.Vector2(-260, -260),
  new THREE.Vector2(260, -260),
];

// ---------------------------------------------------------------------------
// Shared assets
// ---------------------------------------------------------------------------
// Enemies are flying insects (flies/mosquitoes) — a natural fit for a frog's
// diet. They are built from primitives rather than the bundled enemy.glb,
// because that GLB is a SKINNED mesh whose scale we could not control (the
// monsters rendered invisibly no matter what factor we applied).
let bodyGeometry = null;
let bodyMaterial = null;
let wingGeometry = null;
let wingMaterial = null;
let eyeGeometry = null;
let eyeMaterial = null;

function ensureSharedAssets() {
  if (bodyGeometry) return;

  // Dark, slightly elongated thorax.
  bodyGeometry = new THREE.SphereGeometry(ENEMY_RADIUS * 0.72, 16, 12);
  bodyGeometry.scale(1.35, 1, 0.95);
  bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f3038,
    roughness: 0.35,
    metalness: 0.4,
  });

  // Translucent wings.
  wingGeometry = new THREE.CircleGeometry(ENEMY_RADIUS * 0.95, 16);
  wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xdce8f5,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Bulging red compound eyes.
  eyeGeometry = new THREE.SphereGeometry(ENEMY_RADIUS * 0.3, 12, 10);
  eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0xd93b2b,
    roughness: 0.25,
  });
}

/**
 * A single flying insect that hunts the hero.
 */
export class Enemy {
  /**
   * @param {THREE.Scene} scene The scene the enemy should be added to.
   * @param {THREE.Vector2} spawnPoint Starting position on the ground plane.
   */
  constructor(scene, spawnPoint) {
    this.scene = scene;
    this.speed = ENEMY_SPEED;

    // World-space holder. Positioned on the ground plane; the insect body
    // itself is lifted to ENEMY_HOVER so it reads as "flying".
    this.group = new THREE.Group();
    this.group.position.set(spawnPoint.x, spawnPoint.y, 0);
    scene.add(this.group);

    ensureSharedAssets();

    // --- Body -------------------------------------------------------------
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.z = ENEMY_HOVER;
    this.group.add(body);

    // --- Wings ------------------------------------------------------------
    // A circle's default plane is XY, which is already horizontal in our
    // Z-up world, so no extra rotation is needed.
    this.wings = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeometry, wingMaterial);
      wing.position.set(
        -ENEMY_RADIUS * 0.1,
        side * ENEMY_RADIUS * 0.85,
        ENEMY_HOVER + ENEMY_RADIUS * 0.35
      );
      wing.rotation.x = side * 0.25;
      this.group.add(wing);
      this.wings.push({ mesh: wing, side });
    }

    // --- Eyes -------------------------------------------------------------
    // Placed on the +X face, which is the direction the group faces at rest.
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(
        ENEMY_RADIUS * 0.6,
        side * ENEMY_RADIUS * 0.32,
        ENEMY_HOVER + ENEMY_RADIUS * 0.2
      );
      this.group.add(eye);
    }

    // Wing-flap phase, randomised so a swarm doesn't beat in lockstep.
    this.flapPhase = Math.random() * Math.PI * 2;

    this.loaded = true;
  }

  /**
   * Steps this enemy towards the target and animates the wings.
   *
   * @param {number} delta Seconds since the previous frame.
   * @param {THREE.Vector3} targetPosition The player's world position.
   */
  update(delta, targetPosition) {
    const current = this.group.position;
    const direction = new THREE.Vector2(
      targetPosition.x - current.x,
      targetPosition.y - current.y
    );
    if (direction.lengthSq() > 1e-6) {
      direction.normalize();
      const step = this.speed * delta;
      current.x += direction.x * step;
      current.y += direction.y * step;
      this.group.rotation.z = Math.atan2(direction.y, direction.x);
    }

    // Flap the wings.
    this.flapPhase += delta * 26;
    const flap = Math.sin(this.flapPhase) * 0.45;
    for (const { mesh, side } of this.wings) {
      mesh.rotation.x = side * (0.25 + flap);
    }
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
