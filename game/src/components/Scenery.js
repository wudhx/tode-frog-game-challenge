import * as THREE from 'three';
import { BOARD_HALF, TILE_SIZE } from './Map.js';

// ---------------------------------------------------------------------------
// How much of each prop to scatter across the board
// ---------------------------------------------------------------------------
const TREE_COUNT = 30;
const BUSH_COUNT = 34;
const FLOWER_COUNT = 60;
const POND_COUNT = 4;

/** Nothing may be placed closer than this to another prop's centre. */
const MIN_GAP = 10;

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const TRUNK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85 });
const LEAF_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.75 }),
  new THREE.MeshStandardMaterial({ color: 0x3d8a34, roughness: 0.75 }),
  new THREE.MeshStandardMaterial({ color: 0x27541f, roughness: 0.8 }),
];
const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x2f7fd4,
  roughness: 0.2,
  metalness: 0.3,
});
const SHORE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xc9b487, roughness: 0.9 });
const PETAL_COLORS = [0xff6b9d, 0xffd23f, 0xffffff, 0xb08cff, 0xff8c1a];

// ---------------------------------------------------------------------------
// Prop builders
// ---------------------------------------------------------------------------

/**
 * Builds a conifer: a trunk plus three stacked cones.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildTree(rand) {
  const group = new THREE.Group();
  const scale = 0.8 + rand() * 0.5;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(8, 12, 90, 8), TRUNK_MATERIAL);
  trunk.position.z = 45;
  group.add(trunk);

  const tiers = [
    { radius: 55, height: 95, z: 118 },
    { radius: 43, height: 80, z: 176 },
    { radius: 29, height: 62, z: 224 },
  ];

  tiers.forEach((tier, index) => {
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(tier.radius, tier.height, 9),
      LEAF_MATERIALS[index % LEAF_MATERIALS.length]
    );
    canopy.position.z = tier.z;
    group.add(canopy);
  });

  group.scale.setScalar(scale);
  return group;
}

/**
 * Builds a low bush out of a few overlapping spheres.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildBush(rand) {
  const group = new THREE.Group();
  const lobes = 3 + Math.floor(rand() * 3);

  for (let i = 0; i < lobes; i++) {
    const radius = 22 + rand() * 14;
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 9),
      LEAF_MATERIALS[Math.floor(rand() * LEAF_MATERIALS.length)]
    );
    lobe.position.set((rand() - 0.5) * 46, (rand() - 0.5) * 46, radius * 0.62);
    lobe.scale.z = 0.8;
    group.add(lobe);
  }

  return group;
}

/**
 * Builds a small clump of flowers. Purely decorative — no collision.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildFlowers(rand) {
  const group = new THREE.Group();
  const stems = 4 + Math.floor(rand() * 5);

  for (let i = 0; i < stems; i++) {
    const height = 26 + rand() * 22;
    const x = (rand() - 0.5) * 62;
    const y = (rand() - 0.5) * 62;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, height, 5),
      LEAF_MATERIALS[1]
    );
    stem.position.set(x, y, height / 2);
    group.add(stem);

    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(5.5 + rand() * 2.5, 9, 7),
      new THREE.MeshStandardMaterial({
        color: PETAL_COLORS[Math.floor(rand() * PETAL_COLORS.length)],
        roughness: 0.55,
      })
    );
    petal.position.set(x, y, height + 2);
    petal.scale.z = 0.65;
    group.add(petal);
  }

  return group;
}

/**
 * Builds a pond: a sandy rim with a slightly smaller water surface inside.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildPond(rand) {
  const group = new THREE.Group();
  const radius = 120 + rand() * 70;

  const shore = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.16, 40), SHORE_MATERIAL);
  shore.scale.y = 0.72 + rand() * 0.2;
  shore.position.z = 0.12;
  group.add(shore);

  // Keep a clear gap from the shore. Sitting them a fraction apart made the
  // two surfaces z-fight into a starburst pattern from a distance.
  const water = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), WATER_MATERIAL);
  water.scale.y = 0.72 + rand() * 0.2;
  water.position.z = 0.9;
  group.add(water);

  return group;
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------
/**
 * Scatters trees, bushes, flowers and ponds across the board.
 *
 * Trees and bushes are returned as circular obstacles so they join the same
 * collision list the houses use — they are real cover, not wallpaper. Flowers
 * and ponds are decorative for now; their gameplay roles are still to be
 * designed.
 */
export class Scenery {
  /**
   * @param {THREE.Scene} scene The scene to attach the props to.
   * @param {Array<{position: THREE.Vector2, radius: number}>} keepClear
   *   Existing obstacles (houses) that props must not overlap.
   */
  constructor(scene, keepClear = []) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    /** @type {Array<{position: THREE.Vector2, radius: number}>} */
    this.obstacles = [];

    /**
     * Every prop, with the material instances that fade it out when it gets
     * between the camera and the hero.
     * @type {Array<{position: THREE.Vector2, radius: number, height: number, materials: THREE.Material[], opacity: number}>}
     */
    this.props = [];

    /** Every prop placed so far, used to keep them from overlapping. */
    this.taken = keepClear.map((item) => ({
      position: item.position.clone(),
      radius: item.radius,
    }));

    const rand = Math.random;

    this.scatter(POND_COUNT, 210, buildPond, rand, 0, true);
    this.scatter(TREE_COUNT, 62, buildTree, rand, 150);
    this.scatter(BUSH_COUNT, 52, buildBush, rand, 120);
    this.scatter(FLOWER_COUNT, 40, buildFlowers, rand, 90, false);

    this.cameraPosition = new THREE.Vector3();
    this.lineDirection = new THREE.Vector3();
    this.toProp = new THREE.Vector3();
  }

  /**
   * Places `count` copies of a prop at free spots on the board.
   *
   * @param {number} count How many to place.
   * @param {number} obstacleRadius Collision radius, or 0 for decoration.
   * @param {(rand: () => number) => THREE.Group} build Prop factory.
   * @param {() => number} rand Random source.
   * @param {number} playerKeepout Keep this far from the hero's start.
   * @param {boolean} [solid] Whether it blocks movement.
   */
  scatter(count, obstacleRadius, build, rand, playerKeepout, solid = true) {
    let placed = 0;
    let attempts = 0;

    while (placed < count && attempts < count * 60) {
      attempts++;

      const position = new THREE.Vector2(
        THREE.MathUtils.randFloatSpread(BOARD_HALF * 2 - 160),
        THREE.MathUtils.randFloatSpread(BOARD_HALF * 2 - 160)
      );

      // Leave the hero somewhere to stand.
      if (position.length() < playerKeepout) continue;

      // Keep props from growing inside each other.
      const crowded = this.taken.some(
        (other) =>
          position.distanceTo(other.position) < other.radius + obstacleRadius + MIN_GAP
      );
      if (crowded) continue;

      const prop = build(rand);
      prop.position.set(position.x, position.y, 0);
      this.group.add(prop);

      // Give every prop its own material instances. Sharing them (as the
      // builders do by default) would mean fading one tree fades the whole
      // forest.
      const materials = [];
      prop.traverse((node) => {
        if (!node.material) return;
        node.material = node.material.clone();
        node.material.transparent = true;
        materials.push(node.material);
      });

      const bounds = new THREE.Box3().setFromObject(prop);

      const record = { position, radius: obstacleRadius };
      this.taken.push(record);
      if (solid && obstacleRadius > 0) this.obstacles.push(record);

      this.props.push({
        position: position.clone(),
        radius: Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 2,
        height: bounds.max.z,
        materials,
        opacity: 1,
      });

      placed++;
    }
  }

  /**
   * Fades out any prop standing between the camera and the hero, so a tree or
   * bush can never swallow the frog.
   *
   * @param {THREE.Camera} camera The active camera.
   * @param {THREE.Vector3} playerPosition The hero's world position.
   * @param {number} delta Seconds since the previous frame.
   */
  update(camera, playerPosition, delta) {
    camera.getWorldPosition(this.cameraPosition);
    this.lineDirection.subVectors(playerPosition, this.cameraPosition);
    const lineLength = this.lineDirection.length();
    if (lineLength < 1e-3) return;
    this.lineDirection.divideScalar(lineLength);

    // Fade quickly when something gets in the way, restore a little slower so
    // props don't flicker on the boundary.
    const fadeStep = delta * 6;

    for (const prop of this.props) {
      this.toProp.set(
        prop.position.x - this.cameraPosition.x,
        prop.position.y - this.cameraPosition.y,
        prop.height * 0.5 - this.cameraPosition.z
      );

      const along = this.toProp.dot(this.lineDirection);
      let blocked = false;

      if (along > 0 && along < lineLength) {
        const perpendicular = this.toProp
          .clone()
          .addScaledVector(this.lineDirection, -along)
          .length();
        blocked = perpendicular < prop.radius;
      }

      const target = blocked ? 0.22 : 1;
      if (Math.abs(prop.opacity - target) < 0.01) {
        prop.opacity = target;
      } else {
        prop.opacity += Math.sign(target - prop.opacity) * fadeStep;
        prop.opacity = THREE.MathUtils.clamp(prop.opacity, 0.22, 1);
      }

      for (const material of prop.materials) {
        material.opacity = prop.opacity;
        // Fully opaque props can keep writing depth; faded ones must not, or
        // they punch holes in whatever is behind them.
        material.depthWrite = prop.opacity > 0.98;
      }
    }
  }
}
