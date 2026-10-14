import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
/** Base delay between enemy spawns, in seconds. */
export const ENEMY_SPAWN_DELAY = 2.5;
/** Base enemy movement speed (world units per second). */
export const ENEMY_SPEED = 45;
/** Height of an enemy, in world units. */
export const ENEMY_HEIGHT = 60;
/** Radius of an enemy's base, in world units. */
export const ENEMY_RADIUS = 24;

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
// The enemies are built from primitives rather than a GLB. The bundled
// enemy.glb is a SKINNED mesh (its vertices are driven by bone matrices), and
// scaling it had no visible effect — the monsters stayed invisible on screen.
// Primitives give us fully predictable dimensions.
let bodyGeometry = null;
let bodyMaterial = null;
let eyeGeometry = null;
let eyeMaterial = null;

function ensureSharedAssets() {
  if (bodyGeometry) return;

  // A cone reads clearly as a "creature" and, being a primitive, its size is
  // exactly what we ask for.
  bodyGeometry = new THREE.ConeGeometry(ENEMY_RADIUS, ENEMY_HEIGHT, 20);
  bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0392b,
    roughness: 0.55,
    metalness: 0.1,
  });

  eyeGeometry = new THREE.SphereGeometry(ENEMY_RADIUS * 0.2, 12, 8);
  eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
}

/**
 * A single chasing enemy.
 */
export class Enemy {
  /**
   * @param {THREE.Scene} scene The scene the enemy should be added to.
   * @param {THREE.Vector2} spawnPoint Starting position on the ground plane.
   */
  constructor(scene, spawnPoint) {
    this.scene = scene;
    this.speed = ENEMY_SPEED;

    // World-space holder for this enemy.
    this.group = new THREE.Group();
    this.group.position.set(spawnPoint.x, spawnPoint.y, 0);
    scene.add(this.group);

    ensureSharedAssets();

    // Body. A cone points along +Y by default; rotate it so the tip aims at
    // +Z (our "up"), then lift it so its base rests on the ground.
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.position.z = ENEMY_HEIGHT / 2;
    this.group.add(body);

    // Two eyes on the front face so the hunting direction is readable.
    for (const dx of [-ENEMY_RADIUS * 0.34, ENEMY_RADIUS * 0.34]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(dx, ENEMY_RADIUS * 0.62, ENEMY_HEIGHT * 0.58);
      this.group.add(eye);
    }

    this.loaded = true;
  }

  /**
   * Steps this enemy towards the target. (The main loop performs the actual
   * integration so it can arbitrate collisions; this is kept for parity with
   * the course specification.)
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
    if (direction.lengthSq() < 1e-6) return;
    direction.normalize();

    const step = this.speed * delta;
    current.x += direction.x * step;
    current.y += direction.y * step;
    this.group.rotation.z = Math.atan2(direction.y, direction.x);
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
