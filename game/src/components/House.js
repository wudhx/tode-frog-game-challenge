import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BOARD_HALF, TILE_SIZE } from './Map.js';

/** Uniform scale applied to the house model. */
export const HOUSE_SCALE = 65;

/** How many houses are scattered across the board. */
export const HOUSE_COUNT = 4;
/** Total structural durability a house starts with. */
export const HOUSE_DURABILITY = 100;
/** How much each insect hit drains from that durability. */
export const HOUSE_HIT_DAMAGE = 8;
/** How many cells are drawn in the floating health bar. */
const HOUSE_BAR_CELLS = 5;
/** How close an insect has to be before it switches to whacking a house. */
export const HOUSE_ATTACK_RANGE = 110;
/** Seconds between hits a single insect can land on a house. */
export const HOUSE_HIT_INTERVAL = 1.0;

// Keep houses away from the very edge and from the player's start point.
const SAFE_MARGIN = TILE_SIZE * 2;
const PLAYER_KEEPOUT = TILE_SIZE * 3;
/** Minimum gap between two houses. */
const HOUSE_SPACING = TILE_SIZE * 5;

/**
 * Paints a horizontal health bar texture for a house. Five red cells on a dark
 * background; the bar's mesh then picks a single crop width based on hp.
 *
 * @param {number} filledCells How many of the cells are currently red.
 * @returns {THREE.CanvasTexture}
 */
function healthBarTexture(filledCells) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');

  // Background pill.
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
  ctx.fill();

  // Red cells.
  const padX = 6;
  const padY = 5;
  const cellWidth = (canvas.width - padX * 2) / HOUSE_BAR_CELLS;
  for (let i = 0; i < HOUSE_BAR_CELLS; i++) {
    const x = padX + i * cellWidth + 1;
    const y = padY;
    const w = cellWidth - 2;
    const h = canvas.height - padY * 2;
    if (i < filledCells) {
      ctx.fillStyle = '#e5484d';
    } else {
      ctx.fillStyle = 'rgba(80, 20, 20, 0.5)';
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------
/** A destructible house with a floating health bar above the roof. */
class House {
  /**
   * @param {THREE.Object3D} template The loaded house scene to clone.
   * @param {THREE.Vector2} position Where to place the house.
   */
  constructor(template, position) {
    this.position = position.clone();
    this.hp = HOUSE_DURABILITY;
    this.maxHp = HOUSE_DURABILITY;
    this.alive = true;
    this.attackCooldown = 0;
    this.damagedFlash = 0;
    this.fallen = false;

    // --- Geometry: same model + pivot dance as before. -------------------
    this.pivot = new THREE.Group();

    const house = template.clone(true);
    house.rotation.x = Math.PI / 2;
    this.pivot.add(house);

    this.pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.pivot);
    house.position.z -= box.min.z;
    this.pivot.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2);
    this.pivot.position.set(position.x, position.y, 0);
    this.pivot.updateMatrixWorld(true);
    const placed = new THREE.Box3().setFromObject(this.pivot);
    this.height = placed.max.z;

    // --- Collision radius: ground footprint, not the roof overhang. ------
    // Measuring the whole bounding box gave a circle much wider than the
    // walls (the roof juts out well past them), so the hero came to rest a
    // visible distance short of the house and the "inside" test — which uses
    // a fraction of this radius — could never be satisfied. Only vertices
    // below the roof line count towards the footprint.
    const roofLine = placed.min.z + (placed.max.z - placed.min.z) * 0.42;
    const vertex = new THREE.Vector3();
    let footprintRadius = 0;
    this.pivot.traverse((node) => {
      if (!node.isMesh || !node.geometry?.attributes?.position) return;
      const pos = node.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        vertex.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (vertex.z > roofLine) continue;
        const d = Math.hypot(vertex.x - position.x, vertex.y - position.y);
        if (d > footprintRadius) footprintRadius = d;
      }
    });
    this.radius = footprintRadius > 1
      ? footprintRadius
      : Math.max(
          Math.abs(placed.max.x - position.x),
          Math.abs(position.x - placed.min.x),
          Math.abs(placed.max.y - position.y),
          Math.abs(position.y - placed.min.y)
        );

    // --- Own material instances, so fading one house fades only that one.
    this.materials = [];
    this.pivot.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      node.material = node.material.clone();
      node.material.transparent = true;
      this.materials.push(node.material);
    });
    this.opacity = 1;

    // --- Health bar above the roof. -------------------------------------
    this.healthBar = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: healthBarTexture(this.hp),
        transparent: true,
        depthTest: false,
      })
    );
    this.healthBar.scale.set(96, 12, 1);
    this.healthBar.position.set(0, 0, this.height + 10);
    this.healthBar.renderOrder = 100;
    this.pivot.add(this.healthBar);
  }

  /**
   * Fades the house so the hero is visible while standing inside it.
   *
   * @param {number} target 0 = invisible, 1 = solid.
   * @param {number} delta Seconds since the previous frame.
   */
  fadeTo(target, delta) {
    const step = delta * 4;
    if (Math.abs(this.opacity - target) < 0.01) {
      this.opacity = target;
    } else {
      this.opacity += Math.sign(target - this.opacity) * step;
      this.opacity = THREE.MathUtils.clamp(this.opacity, target, 1);
    }
    for (const material of this.materials) {
      material.opacity = this.opacity;
      material.depthWrite = this.opacity > 0.95;
    }
  }

  /**
   * Lands one hit on the house, draining structural durability.
   *
   * @returns {boolean} True if the house is now in ruins.
   */
  takeDamage() {
    if (!this.alive) return false;
    this.hp -= HOUSE_HIT_DAMAGE;
    this.damagedFlash = 0.5;
    const filled = Math.max(0, Math.ceil((this.hp / HOUSE_DURABILITY) * HOUSE_BAR_CELLS));
    this.healthBar.material.map = healthBarTexture(filled);
    this.healthBar.material.needsUpdate = true;

    if (this.hp <= 0) {
      this.alive = false;
      this.collapse();
    }
    return true;
  }

  /**
   * One insect hit per allowed interval.
   *
   * @param {number} delta Seconds since the previous frame.
   * @returns {boolean} True if the caller should land a hit this frame.
   */
  mayBeHit(delta) {
    if (!this.alive) return false;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    return this.attackCooldown <= 0;
  }

  /** Records that an insect has just hit us. */
  registerHit() {
    this.attackCooldown = HOUSE_HIT_INTERVAL;
  }

  /** Counts down the damage flash effect. */
  update(delta) {
    if (this.damagedFlash > 0) {
      this.damagedFlash = Math.max(0, this.damagedFlash - delta);
    }
  }

  /**
   * Removes the house from the board entirely.
   *
   * It used to turn into a grey, tilted ruin that stayed where it was, which
   * read as "the house is broken but still blocking me" — and left a phantom
   * obstacle behind. Now it is simply gone, and the caller drops it from the
   * collision list so the gap is genuinely open.
   */
  collapse() {
    this.fallen = true;
    this.pivot.remove(this.healthBar);
    if (this.healthBar.material.map) this.healthBar.material.map.dispose();
    this.healthBar.material.dispose();

    if (this.pivot.parent) this.pivot.parent.remove(this.pivot);

    // Only the per-house material clones are ours to free; geometry is
    // shared with the loaded template.
    for (const material of this.materials) material.dispose();
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
/**
 * Lays a single house model flat on the ground at the given XY position.
 *
 * @param {THREE.Object3D} template The loaded house scene to clone.
 * @param {THREE.Vector2} position Where to place the house.
 * @returns {House}
 */
function placeHouse(template, position) {
  return new House(template, position);
}

/**
 * Loads the house model and scatters a small number of them across the map.
 *
 * @param {THREE.Group} housesGroup The group that should parent the houses.
 * @returns {Promise<Array<House>>}
 */
export async function addHouses(housesGroup) {
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
      (p) => p.distanceTo(candidate) < HOUSE_SPACING
    );
    if (tooClose) continue;

    placed.push(candidate);
  }

  const houses = [];
  for (const slot of placed) {
    const house = placeHouse(template, slot);
    housesGroup.add(house.pivot);
    houses.push(house);
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
