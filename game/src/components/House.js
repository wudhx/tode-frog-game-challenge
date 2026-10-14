import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TILE_COUNT, TILE_SIZE } from './Map.js';

/** Uniform scale applied to the house model. */
export const HOUSE_SCALE = 65;

// Keep houses away from the very edge and from the player's start point.
const SAFE_MARGIN = TILE_SIZE * 1.5;
const PLAYER_KEEPOUT = TILE_SIZE * 2;

/**
 * Lays a single house model flat on the ground at the given XY position.
 *
 * @param {THREE.Object3D} template The loaded house scene to clone.
 * @param {THREE.Vector2} position Where to place the house.
 * @returns {THREE.Object3D} The positioned clone.
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

  return pivot;
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

  const half = (TILE_COUNT * TILE_SIZE) / 2 - SAFE_MARGIN;
  const placed = [];

  let attempts = 0;
  while (placed.length < 3 && attempts < 200) {
    attempts++;

    const candidate = new THREE.Vector2(
      THREE.MathUtils.randFloatSpread(half * 2),
      THREE.MathUtils.randFloatSpread(half * 2)
    );

    // Don't drop a house on top of the hero's starting spot.
    if (candidate.length() < PLAYER_KEEPOUT) continue;

    // Don't stack houses on each other.
    const tooClose = placed.some(
      (p) => p.position.distanceTo(candidate) < TILE_SIZE * 1.2
    );
    if (tooClose) continue;

    placed.push({ position: candidate, object: null });
  }

  const houses = [];
  for (const slot of placed) {
    const house = placeHouse(template, slot.position);
    housesGroup.add(house);
    houses.push({ object: house, position: slot.position });
  }

  return houses;
}

/**
 * Checks whether a candidate ground position is blocked by any house.
 *
 * @param {THREE.Vector3} position The desired next position.
 * @param {Array<{position: THREE.Vector2}>} houses Placed house records.
 * @param {number} radius How close is "too close".
 * @returns {boolean} True if the position collides with a house.
 */
export function collidesWithHouse(position, houses, radius) {
  return houses.some((house) => {
    const dx = position.x - house.position.x;
    const dy = position.y - house.position.y;
    return Math.sqrt(dx * dx + dy * dy) < radius;
  });
}
