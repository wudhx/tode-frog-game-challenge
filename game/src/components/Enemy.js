import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
/** Base delay between enemy spawns, in seconds. */
export const ENEMY_SPAWN_DELAY = 3;
/** Base enemy movement speed (world units per second). */
export const ENEMY_SPEED = 30;
/** Uniform scale applied to the enemy model. */
export const ENEMY_SCALE = 5;

// The four corners of the map, in world coordinates.
export const SPAWN_POINTS = [
  new THREE.Vector2(-400, 400),
  new THREE.Vector2(400, 400),
  new THREE.Vector2(-400, -400),
  new THREE.Vector2(400, -400),
];

// A single shared loader & template, so the GLB is only fetched once.
let modelTemplatePromise = null;

/**
 * Loads (once) and caches the enemy model template.
 *
 * @returns {Promise<THREE.Object3D>} A cloneable template scene.
 */
function loadEnemyTemplate() {
  if (!modelTemplatePromise) {
    const loader = new GLTFLoader();
    modelTemplatePromise = loader.loadAsync('/models/enemy.glb').then((gltf) => {
      const template = gltf.scene;

      // Authored Y-up; rotate into our Z-up world.
      template.rotation.x = Math.PI / 2;
      template.scale.setScalar(ENEMY_SCALE);

      return template;
    });
  }
  return modelTemplatePromise;
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

    this.model = null;
    this.loaded = false;

    this.load();
  }

  /**
   * Instantiates the cached enemy model inside this enemy's group.
   */
  async load() {
    const template = await loadEnemyTemplate();
    const model = template.clone(true);

    // Make sure the clone lies flat on the ground.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.z -= box.min.z;

    this.model = model;
    this.group.add(model);
    this.loaded = true;
  }

  /**
   * Steps this enemy towards the target each frame.
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
    this.group.position.x += direction.x * step;
    this.group.position.y += direction.y * step;

    // Face the player while hunting.
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
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        // Materials are cached/cloned from the shared template, so only
        // dispose geometry here to avoid breaking sibling enemies.
      }
    });
  }
}
