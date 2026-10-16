import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BOARD_HALF, TILE_SIZE } from './Map.js';

/** Uniform scale applied to the house model. */
export const HOUSE_SCALE = 65;

/** How many houses are scattered across the board. */
const HOUSE_COUNT = 10;

// Keep houses away from the very edge and from the player's start point.
const SAFE_MARGIN = TILE_SIZE * 2;
const PLAYER_KEEPOUT = TILE_SIZE * 3;
/** Minimum gap between two houses. */
const HOUSE_SPACING = TILE_SIZE * 3;

/**
 * Lays a single house model flat on the ground at the given XY position.
 *
 * @param {THREE.Object3D} template The loaded house scene to clone.
 * @param {THREE.Vector2} position Where to place the house.
 * @returns {{ object: THREE.Object3D, radius: number }} The positioned clone
 *   plus the radius of the circle it actually occupies on the ground.
 */
function placeHouse(template, position) {
  // Outer pivot carries the horizontal facing (rotation around the world Z
  // axis). The model itself only carries the Y-up -> Z-up correction. Keeping
  // them on separate objects stops the two rotations from interfering with
  // each other (which made the houses lean over).
  const pivot = new THREE.Group();

  const house = template.clone(true);

  // Authored Y-up; rotate into our Z-up world.
  house.rotation.x = Math.PI / 2;

  pivot.add(house);

  // Measure the upright model and drop it so its lowest point sits on Z = 0.
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  house.position.z -= box.min.z;

  // Random 90-degree turns so the neighbourhood doesn't look copy-pasted.
  // Rotating the pivot around Z is a pure yaw, so the house stays upright.
  pivot.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2);

  pivot.position.set(position.x, position.y, 0);

  // Measure the house where it now stands. Deriving the collision circle from
  // the real model means the hero can hop right up against a wall, instead of
  // being stopped by a hard-coded radius that was far larger than the house.
  pivot.updateMatrixWorld(true);
  const placed = new THREE.Box3().setFromObject(pivot);
  const radius = Math.max(
    Math.abs(placed.max.x - position.x),
    Math.abs(position.x - placed.min.x),
    Math.abs(placed.max.y - position.y),
    Math.abs(position.y - placed.min.y)
  );

  return { object: pivot, radius };
}

/**
 * Loads the house model and scatters three of them across the map.
 *
 * @param {THREE.Group} housesGroup The group that should parent the houses.
 * @param {THREE.Group} playerGroup The player group, used for keep-out.
 */
export async function addHouses(housesGroup, playerGroup) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/small_house.glb`);

  const template = gltf.scene;
  template.scale.setScalar(HOUSE_SCALE);

  const half = BOARD_HALF - SAFE_MARGIN;
  const placed = [];

  let attempts = 0;
  while (placed.length < HOUSE_COUNT && attempts < 800) {
    attempts++;

    const candidate = new THREE.Vector2(
      THREE.MathUtils.randFloatSpread(half * 2),
      THREE.MathUtils.randFloatSpread(half * 2)
    );

    // Don't drop a house on top of the hero's starting spot.
    if (candidate.length() < PLAYER_KEEPOUT) continue;

    // Don't stack houses on each other.
    const tooClose = placed.some(
      (p) => p.position.distanceTo(candidate) < HOUSE_SPACING
    );
    if (tooClose) continue;

    placed.push({ position: candidate, object: null });
  }

  const houses = [];
  for (const slot of placed) {
    const { object, radius } = placeHouse(template, slot.position);
    housesGroup.add(object);
    houses.push({ object, position: slot.position, radius });
  }

  return houses;
}

/**
 * Checks whether a candidate ground position overlaps any circular obstacle.
 *
 * Despite living in House.js this is the shared collision test for the whole
 * game: houses, trees and bushes all contribute `{ position, radius }`
 * records, and every mover is checked against the same list.
 *
 * @param {THREE.Vector3} position The desired next position.
 * @param {Array<{position: THREE.Vector2, radius: number}>} obstacles Placed
 *   obstacle records, each carrying its own footprint radius.
 * @param {number} padding Radius of the thing being moved (frog, insect…),
 *   added to the obstacle radius so bodies stop when they touch, not when
 *   their centres meet.
 * @returns {boolean} True if the position collides with something.
 */
export function collidesWithObstacle(position, obstacles, padding) {
  return obstacles.some((obstacle) => {
    const dx = position.x - obstacle.position.x;
    const dy = position.y - obstacle.position.y;
    return Math.hypot(dx, dy) < obstacle.radius + padding;
  });
}
