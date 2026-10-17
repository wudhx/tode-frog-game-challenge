import * as THREE from 'three';
import { BOARD_HALF, TILE_SIZE } from './Map.js';

// ---------------------------------------------------------------------------
// How much of each prop to scatter across the board
// ---------------------------------------------------------------------------
const TREE_COUNT = 30;
const BUSH_COUNT = 25;
const FLOWER_START_COUNT = 8;
const FLOWER_MAX_COUNT = 20;
const FLOWER_GROWTH_SCORE_STEP = 200; // every N points another flower blooms
const POND_COUNT = 4;

/** Nothing may be placed closer than this to another prop's centre. */
const MIN_GAP = 10;

/** Seconds before a fruit tree can be struck again. */
export const FRUIT_COOLDOWN = 20;
/** Seconds a dropped fruit stays on the ground before rotting away. */
export const FRUIT_LIFETIME = 15;
/** How close the hero must hop to grab a fruit. */
export const FRUIT_PICKUP_RADIUS = 55;
/** Height a fruit floats at, in world units. */
const FRUIT_FLOAT = 40;
/** Seconds before an exposed bush can hide the hero again. */
export const BUSH_COOLDOWN = 8;

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
/** Three browns for the trunk gradient, dark at the base, lighter near the bark. */
const TRUNK_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x3d2814, roughness: 0.95, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x5e3a1f, roughness: 0.9, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85, flatShading: true }),
];
/**
 * Four greens, from deep evergreen to lime tip. Flat shading keeps the
 * low-poly canopies crisp instead of reading as smooth plastic balls.
 */
const LEAF_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x1e4d1a, roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.8, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x3f8a34, roughness: 0.75, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x74c04a, roughness: 0.7, flatShading: true }),
];
/** Bushes read as lighter, softer scrub — deliberately a different palette. */
const BUSH_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x63a844, roughness: 0.8, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x86c257, roughness: 0.75, flatShading: true }),
];
const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x2a6db4,
  roughness: 0.12,
  metalness: 0.55,
  emissive: 0x0a2540,
  emissiveIntensity: 0.2,
});
const SHORE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xb89a6c, roughness: 0.95 });
const GRASS_TUFT_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.7 });
const FLOWER_CENTER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffd23f,
  roughness: 0.55,
  emissive: 0x442200,
  emissiveIntensity: 0.3,
});
const PETAL_COLORS = [0xff6b9d, 0xffd23f, 0xffffff, 0xb08cff, 0xff8c1a, 0xff4d6d, 0x9be3ff];

// ---------------------------------------------------------------------------
// Prop builders
// ---------------------------------------------------------------------------
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Stands a Y-aligned primitive (cylinder, cone) upright in our Z-up world.
 *
 * three.js builds cylinders and cones along their own +Y. This game is Z-up,
 * so an untouched cylinder lies flat on the ground — which is what turned
 * every tree trunk into a log lying beside its canopy, and left the canopies
 * hovering in mid-air. This aligns the primitive's +Y with world +Z, with an
 * optional lean.
 *
 * @param {THREE.Object3D} mesh The mesh to orient.
 * @param {number} [leanX] Small lean towards +X (radians-ish, as a direction).
 * @param {number} [leanY] Small lean towards +Y.
 */
function standUp(mesh, leanX = 0, leanY = 0) {
  const direction = new THREE.Vector3(leanX, leanY, 1).normalize();
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction);
}

/**
 * Builds a broadleaf tree: a thick tapered trunk with a bark gradient and a
 * wide, layered crown of angular leaf clusters.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildBroadleafTree(rand) {
  const group = new THREE.Group();
  const scale = 0.9 + rand() * 0.35;

  // --- Trunk: three stacked cylinders, dark at the base. ---------------
  const trunkHeight = 105 + rand() * 30;
  const baseR = 13 + rand() * 4;
  const segs = [
    { h: trunkHeight * 0.5, rTop: baseR * 0.9, rBot: baseR, mat: 0, z: trunkHeight * 0.25 },
    { h: trunkHeight * 0.3, rTop: baseR * 0.74, rBot: baseR * 0.9, mat: 1, z: trunkHeight * 0.65 },
    { h: trunkHeight * 0.2, rTop: baseR * 0.55, rBot: baseR * 0.74, mat: 2, z: trunkHeight * 0.9 },
  ];
  for (const seg of segs) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(seg.rTop, seg.rBot, seg.h, 8), TRUNK_MATERIALS[seg.mat]);
    standUp(mesh);
    mesh.position.z = seg.z;
    group.add(mesh);
  }

  // A few branches angled up into the crown.
  for (let i = 0; i < 3; i++) {
    const angle = rand() * Math.PI * 2;
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 4.2, 44 + rand() * 18, 5),
      TRUNK_MATERIALS[2]
    );
    // Lean outward from the trunk while staying mostly upright.
    standUp(branch, Math.cos(angle) * 0.85, Math.sin(angle) * 0.85);
    branch.position.set(
      Math.cos(angle) * 13,
      Math.sin(angle) * 13,
      trunkHeight * 0.78 + rand() * 12
    );
    group.add(branch);
  }

  // --- Crown: a wide, flattened dome of angular clusters. --------------
  const crownZ = trunkHeight + 24;
  const clusters = 7 + Math.floor(rand() * 3);
  for (let i = 0; i < clusters; i++) {
    const r = 34 + rand() * 18;
    const lobe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      LEAF_MATERIALS[Math.floor(rand() * LEAF_MATERIALS.length)]
    );
    const angle = (i / clusters) * Math.PI * 2 + rand() * 0.5;
    // An outer ring plus a smaller inner cluster stacked on top.
    const ring = i < clusters - 2 ? 1 : 0.45;
    const dist = (32 + rand() * 22) * ring;
    lobe.position.set(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist,
      crownZ + (ring < 1 ? 22 + rand() * 16 : (rand() - 0.5) * 22)
    );
    lobe.scale.set(1.15 + rand() * 0.25, 1.15 + rand() * 0.25, 0.72 + rand() * 0.12);
    lobe.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6);
    group.add(lobe);
  }

  group.scale.setScalar(scale);
  // Broadleaf trees are the fruit-bearing kind.
  group.userData.treeKind = 'fruit';
  return group;
}

/**
 * Builds a conifer: a trunk plus four stacked cones, each leaning a little so
 * the silhouette is not a perfect cone.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildConiferTree(rand) {
  const group = new THREE.Group();
  const scale = 0.9 + rand() * 0.35;

  const trunkHeight = 58 + rand() * 16;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 13, trunkHeight, 7),
    TRUNK_MATERIALS[0]
  );
  standUp(trunk);
  trunk.position.z = trunkHeight / 2;
  group.add(trunk);

  const tiers = 4;
  let z = trunkHeight * 0.75;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const radius = 56 * (1 - t * 0.68) + rand() * 5;
    const height = 78 * (1 - t * 0.4);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 8),
      LEAF_MATERIALS[i % 2 === 0 ? 0 : 1]
    );
    standUp(cone, (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.14);
    cone.position.z = z + height / 2;
    group.add(cone);
    z += height * 0.5;
  }

  // A bright tip so the tree catches the light.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(10, 30, 7), LEAF_MATERIALS[3]);
  standUp(tip);
  tip.position.z = z + 8;
  group.add(tip);

  group.scale.setScalar(scale);
  // Conifers are decoration only — no fruit, no interaction.
  group.userData.treeKind = 'pine';
  return group;
}

/**
 * Picks one of the two tree species at random.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildTree(rand) {
  return rand() < 0.55 ? buildBroadleafTree(rand) : buildConiferTree(rand);
}

/**
 * Builds a low, wide bush out of many overlapping squashed spheres in the
 * lighter bush palette. Deliberately flat so it never reads as a small tree.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildBush(rand) {
  const group = new THREE.Group();
  const lobes = 6 + Math.floor(rand() * 3);
  const spread = 40 + rand() * 14;

  for (let i = 0; i < lobes; i++) {
    const radius = 15 + rand() * 9;
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 7, 5),
      BUSH_MATERIALS[Math.floor(rand() * BUSH_MATERIALS.length)]
    );
    // Flatten hard so the cluster reads as ground cover, not a shrub-tree.
    lobe.scale.set(1.15 + rand() * 0.2, 1.15 + rand() * 0.2, 0.5 + rand() * 0.12);
    lobe.position.set(
      (rand() - 0.5) * spread,
      (rand() - 0.5) * spread,
      radius * 0.42 + rand() * 4
    );
    lobe.rotation.set(rand() * 0.25, rand() * Math.PI, rand() * 0.25);
    group.add(lobe);
  }

  // A few bright accents poking out of the top.
  for (let i = 0; i < 3; i++) {
    const accent = new THREE.Mesh(
      new THREE.SphereGeometry(6 + rand() * 4, 6, 5),
      BUSH_MATERIALS[2]
    );
    accent.scale.set(1, 1, 0.55);
    accent.position.set((rand() - 0.5) * 34, (rand() - 0.5) * 34, 15 + rand() * 7);
    group.add(accent);
  }

  // A little larger than the raw cluster so the bush reads as real cover
  // rather than a tuft of grass the hero dwarfs.
  group.scale.setScalar(1.35);

  return group;
}

/**
 * Builds a small clump of 5-petal flowers with a yellow centre. Decorative
 * for now; their gameplay role is the 2-second-harvest power-up.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group}
 */
function buildFlowers(rand) {
  const group = new THREE.Group();
  const stems = 3 + Math.floor(rand() * 4);

  for (let i = 0; i < stems; i++) {
    const height = 18 + rand() * 18;
    const x = (rand() - 0.5) * 50;
    const y = (rand() - 0.5) * 50;
    const petalColor = PETAL_COLORS[Math.floor(rand() * PETAL_COLORS.length)];

    // Slender stem, stood upright for our Z-up world.
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, height, 5),
      LEAF_MATERIALS[1]
    );
    standUp(stem);
    stem.position.set(x, y, height / 2);
    group.add(stem);

    // One small leaf on the stem for character.
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 6, 5),
      LEAF_MATERIALS[2]
    );
    leaf.position.set(x + (rand() - 0.5) * 2, y + (rand() - 0.5) * 2, height * 0.6);
    leaf.scale.set(1.6, 0.7, 0.5);
    leaf.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.4);
    group.add(leaf);

    // 5 petals around a yellow centre.
    const petalMat = new THREE.MeshStandardMaterial({
      color: petalColor,
      roughness: 0.5,
      emissive: petalColor,
      emissiveIntensity: 0.12,
    });
    for (let p = 0; p < 5; p++) {
      const angle = (p / 5) * Math.PI * 2 + rand() * 0.1;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(2.6 + rand() * 0.6, 6, 5), petalMat);
      petal.position.set(
        x + Math.cos(angle) * 2.8,
        y + Math.sin(angle) * 2.8,
        height + 1.2
      );
      petal.scale.set(1.4, 1, 0.45);
      petal.rotation.set(0, 0, angle);
      group.add(petal);
    }
    // Centre.
    const centre = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), FLOWER_CENTER_MATERIAL);
    centre.position.set(x, y, height + 1.5);
    group.add(centre);
  }

  return group;
}

/**
 * Builds a pond: irregular sandy shore, a darker water disc below a glassy
 * surface, and a few tufts of grass at the edge. The water mesh is
 * returned separately so the main loop can bob it for a ripple animation.
 *
 * @param {() => number} rand Random source.
 * @returns {THREE.Group & { water: THREE.Mesh, surfaceRadius: number, shoreRadius: number }}
 */
function buildPond(rand) {
  const group = new THREE.Group();
  const radius = 110 + rand() * 60;

  // --- Shore: noisy circle, not a perfect disc.
  const shoreSegments = 40;
  const shoreGeom = new THREE.CircleGeometry(radius * 1.18, shoreSegments);
  // Jitter the rim vertices for an organic edge.
  const shorePos = shoreGeom.attributes.position;
  for (let i = 1; i < shorePos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(shorePos, i);
    const len = v.length();
    const jitter = 1 + (rand() - 0.5) * 0.12;
    v.multiplyScalar(jitter);
    shorePos.setXYZ(i, v.x, v.y, v.z);
  }
  shorePos.needsUpdate = true;
  const shore = new THREE.Mesh(shoreGeom, SHORE_MATERIAL);
  shore.scale.y = 0.78 + rand() * 0.18;
  shore.position.z = 0.6;
  group.add(shore);

  // --- Dark seabed peeks under the surface for depth.
  const seabed = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.97, 32),
    new THREE.MeshStandardMaterial({ color: 0x1a3a5a, roughness: 0.95 }));
  seabed.scale.y = 0.78 + rand() * 0.18;
  seabed.position.z = 1.4;
  group.add(seabed);

  // --- Water surface: low-roughness, slightly metallic for a glassy read.
  const water = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), WATER_MATERIAL);
  water.scale.y = 0.78 + rand() * 0.18;
  water.position.z = 2.4;
  group.add(water);

  // --- A few grass tufts at the rim for life.
  for (let i = 0; i < 8; i++) {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(4 + rand() * 2, 9 + rand() * 5, 5),
      GRASS_TUFT_MATERIAL
    );
    const angle = rand() * Math.PI * 2;
    const dist = radius * 1.05 + rand() * 18;
    standUp(tuft, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3);
    tuft.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 4);
    group.add(tuft);
  }

  // A couple of reeds poking up out of the water for character.
  for (let i = 0; i < 3; i++) {
    const reed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 28 + rand() * 8, 5),
      LEAF_MATERIALS[1]
    );
    standUp(reed, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2);
    const angle = rand() * Math.PI * 2;
    const dist = radius * 0.55 + rand() * (radius * 0.3);
    reed.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 14);
    group.add(reed);
  }

  group.userData.water = water;
  group.userData.surfaceRadius = radius;
  group.userData.shoreRadius = radius * 1.18;
  return group;
}

/**
 * Builds a dropped fruit: a red apple-like sphere with a stalk and a leaf,
 * glowing slightly so it stays findable among the grass.
 *
 * @returns {THREE.Group}
 */
function buildFruitMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(10, 14, 12),
    new THREE.MeshStandardMaterial({
      color: 0xe5484d,
      emissive: 0x8c1c1f,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  body.scale.set(1, 1, 0.92);
  group.add(body);

  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 7, 5),
    TRUNK_MATERIALS[2]
  );
  standUp(stalk);
  stalk.position.z = 11;
  group.add(stalk);

  const leaf = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 5), LEAF_MATERIALS[3]);
  standUp(leaf, 0.5, 0.2);
  leaf.position.set(4, 0, 12);
  group.add(leaf);

  return group;
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------
/**
 * Scatters trees, bushes, flowers and ponds across the board.
 *
 * Trees block movement and break line of sight to enemies. Bushes are
 * shorter cover that hosts a 4-second hide. Flowers are harvest points for
 * 2-second power-ups. Ponds restore health on the shore and unlock a random
 * bonus when waded into.
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
     * Bushes — short cover the player can hide in.
     * @type {Array<{position: THREE.Vector2, radius: number, height: number,
     *   materials: THREE.Material[], opacity: number, group: THREE.Group,
     *   alive: boolean, hiddenTimer: number}>}
     */
    this.bushes = [];

    /**
     * Flowers — left in place when spawned, harvested after 2s of contact.
     * @type {Array<{position: THREE.Vector2, radius: number, height: number,
     *   materials: THREE.Material[], opacity: number, group: THREE.Group,
     *   alive: boolean, regrowTimer: number}>}
     */
    this.flowers = [];

    /**
     * Ponds — entry into the water triggers a random bonus.
     * @type {Array<{position: THREE.Vector2, surfaceRadius: number,
     *   shoreRadius: number, group: THREE.Group, water: THREE.Mesh,
     *   bonusClaimed: boolean, bonusType: string}>}
     */
    this.ponds = [];

    /**
     * Every tree. `isFruit` separates the broadleaf (fruit-bearing) kind from
     * the conifers, which are decoration only.
     * @type {Array<{position: THREE.Vector2, radius: number, height: number,
     *   isFruit: boolean, cooldown: number, group: THREE.Group}>}
     */
    this.trees = [];

    /** Just the fruit-bearing trees, so the strike test stays cheap. */
    this.fruitTrees = [];

    /**
     * Fruits lying on the ground waiting to be eaten.
     * @type {Array<{position: THREE.Vector2, mesh: THREE.Group, life: number,
     *   phase: number, collected: boolean}>}
     */
    this.fruits = [];

    /**
     * All other props (trees etc.) that just need to fade when they block
     * the camera. Bushes, flowers and ponds are stored separately above and
     * also kept here so the fade code is shared.
     */
    this.props = [];

    /** Every prop placed so far, used to keep them from overlapping. */
    this.taken = keepClear.map((item) => ({
      position: item.position.clone(),
      radius: item.radius,
    }));

    const rand = Math.random;

    // Ponds are placed first and at a wider radius so trees and bushes can
    // settle around them rather than over their water.
    this.scatter(POND_COUNT, 200, buildPond, rand, 0, 'pond');
    this.scatter(TREE_COUNT, 62, buildTree, rand, 150, 'tree');
    this.scatter(BUSH_COUNT, 52, buildBush, rand, 120, 'bush');
    // Start with the first batch of flowers only — more will bloom with score.
    this.scatter(FLOWER_START_COUNT, 32, buildFlowers, rand, 90, 'flower');

    this.cameraPosition = new THREE.Vector3();
    this.lineDirection = new THREE.Vector3();
    this.toProp = new THREE.Vector3();
    this.elapsed = 0;
  }

  /**
   * Places `count` copies of a prop at free spots on the board.
   *
   * @param {number} count How many to place.
   * @param {number} obstacleRadius Collision radius, or 0 for decoration.
   * @param {(rand: () => number) => THREE.Group} build Prop factory.
   * @param {() => number} rand Random source.
   * @param {number} playerKeepout Keep this far from the hero's start.
   * @param {'tree'|'bush'|'flower'|'pond'} kind What kind of prop this is.
   */
  scatter(count, obstacleRadius, build, rand, playerKeepout, kind) {
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

      const bounds = new THREE.Box3().setFromObject(prop);

      const record = { position, radius: obstacleRadius };
      this.taken.push(record);

      // Only trees block movement now. Houses and bushes are meant to be
      // walked into — their effects trigger by standing inside them, and a
      // collision circle made that geometrically impossible.
      if (kind === 'tree' && obstacleRadius > 0) {
        this.obstacles.push(record);
      }

      // --- Ponds are flat: never fade them. -----------------------------
      // The camera fade exists so a tall tree can't swallow the frog. A pond
      // is a disc lying on the floor, so the sight-line test would flag it
      // whenever the hero stood near its centre and dissolve the water to
      // near-invisible. Ponds also keep their own opaque materials.
      if (kind === 'pond') {
        this.ponds.push({
          position: position.clone(),
          surfaceRadius: prop.userData.surfaceRadius,
          shoreRadius: prop.userData.shoreRadius,
          group: prop,
          water: prop.userData.water,
          bonusClaimed: false,
          bonusType: null,
          // Each pond cools down independently, so draining one does not lock
          // the others.
          cooldown: 0,
        });
        placed++;
        continue;
      }

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

      const fadeTarget = {
        position: position.clone(),
        radius: Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 2,
        height: bounds.max.z,
        materials,
        opacity: 1,
      };
      this.props.push(fadeTarget);

      if (kind === 'tree') {
        const isFruit = prop.userData.treeKind === 'fruit';
        const tree = {
          position: position.clone(),
          radius: obstacleRadius,
          height: bounds.max.z,
          isFruit,
          cooldown: 0,
          group: prop,
        };
        this.trees.push(tree);
        if (isFruit) this.fruitTrees.push(tree);
      } else if (kind === 'bush') {
        this.bushes.push({
          ...fadeTarget,
          group: prop,
          alive: true,
          hiddenTimer: 0,
          cooldown: 0,
        });
      } else if (kind === 'flower') {
        this.flowers.push({
          ...fadeTarget,
          group: prop,
          alive: true,
          regrowTimer: 0,
        });
      }

      placed++;
    }
  }

  /**
   * Adds more flowers as the player's score climbs. Caps at FLOWER_MAX_COUNT.
   *
   * @returns {Array<{position: THREE.Vector2, group: THREE.Group}>} Newly
   *   placed flowers (so the caller can animate them in), or [] if at cap.
   */
  growFlowers() {
    const room = FLOWER_MAX_COUNT - this.flowers.length;
    if (room <= 0) return [];

    // Find free ground — a slot that isn't inside any current prop.
    const newFlowers = [];
    let attempts = 0;
    while (newFlowers.length < 1 && attempts < 200) {
      attempts++;
      const position = new THREE.Vector2(
        THREE.MathUtils.randFloatSpread(BOARD_HALF * 2 - 160),
        THREE.MathUtils.randFloatSpread(BOARD_HALF * 2 - 160)
      );
      if (position.length() < 90) continue;
      const crowded = this.taken.some(
        (other) => position.distanceTo(other.position) < other.radius + 32 + MIN_GAP
      );
      if (crowded) continue;

      const prop = buildFlowers(Math.random);
      prop.position.set(position.x, position.y, 0);
      this.group.add(prop);

      const materials = [];
      prop.traverse((node) => {
        if (!node.material) return;
        node.material = node.material.clone();
        node.material.transparent = true;
        materials.push(node.material);
      });
      const bounds = new THREE.Box3().setFromObject(prop);

      this.taken.push({ position: position.clone(), radius: 32 });

      const record = {
        position: position.clone(),
        radius: 32,
        height: bounds.max.z,
        materials,
        opacity: 0,
        group: prop,
        alive: true,
        regrowTimer: 0,
      };
      this.props.push(record);
      this.flowers.push(record);
      newFlowers.push({ position, group: prop });
    }
    return newFlowers;
  }

  /**
   * Knocks a fruit off a tree, if that tree is a fruit tree and is not on
   * cooldown. The fruit lands a short distance away so the hero has to hop
   * over to it — dropping it at the trunk would let it be collected from
   * where he already stands.
   *
   * @param {object} tree A record from `fruitTrees`.
   * @returns {'ok' | 'not-fruit' | 'cooldown'} What happened.
   */
  dropFruit(tree) {
    if (!tree.isFruit) return 'not-fruit';
    if (tree.cooldown > 0) return 'cooldown';

    tree.cooldown = FRUIT_COOLDOWN;

    const angle = Math.random() * Math.PI * 2;
    const distance = 55 + Math.random() * 45;
    const position = new THREE.Vector2(
      tree.position.x + Math.cos(angle) * distance,
      tree.position.y + Math.sin(angle) * distance
    );

    const mesh = buildFruitMesh();
    mesh.position.set(position.x, position.y, FRUIT_FLOAT);
    this.group.add(mesh);

    this.fruits.push({
      position,
      mesh,
      life: FRUIT_LIFETIME,
      phase: Math.random() * Math.PI * 2,
      collected: false,
    });

    return 'ok';
  }

  /**
   * Animates dropped fruits, collects the ones the hero reaches, and counts
   * the fruit-tree cooldowns down.
   *
   * @param {number} delta Seconds since the previous frame.
   * @param {THREE.Vector3} playerPosition The hero's world position.
   * @returns {number} How many fruits were eaten this frame.
   */
  updateFruits(delta, playerPosition) {
    let eaten = 0;

    for (const fruit of this.fruits) {
      fruit.life -= delta;
      fruit.phase += delta * 3;

      fruit.mesh.position.z = FRUIT_FLOAT + Math.sin(fruit.phase) * 4;
      fruit.mesh.rotation.z += delta * 1.6;

      const distance = Math.hypot(
        fruit.position.x - playerPosition.x,
        fruit.position.y - playerPosition.y
      );
      if (distance < FRUIT_PICKUP_RADIUS) {
        fruit.collected = true;
        eaten++;
      }
    }

    this.fruits = this.fruits.filter((fruit) => {
      if (fruit.collected || fruit.life <= 0) {
        this.group.remove(fruit.mesh);
        return false;
      }
      return true;
    });

    for (const tree of this.fruitTrees) {
      if (tree.cooldown > 0) tree.cooldown = Math.max(0, tree.cooldown - delta);
    }

    // Bushes that were discovered stay "burned" for a while so the hero
    // cannot hop in and out of cover forever.
    for (const bush of this.bushes) {
      if (bush.cooldown > 0) bush.cooldown = Math.max(0, bush.cooldown - delta);
    }

    return eaten;
  }

  /**
   * Fades out any prop standing between the camera and the hero, so a tree or
   * bush can never swallow the frog. Also bobs pond water for life.
   *
   * @param {THREE.Camera} camera The active camera.
   * @param {THREE.Vector3} playerPosition The hero's world position.
   * @param {number} delta Seconds since the previous frame.
   */
  update(camera, playerPosition, delta) {
    this.elapsed += delta;

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

    // --- Pond ripple: small per-frame bob on the water surface.
    for (const pond of this.ponds) {
      const bob = Math.sin(this.elapsed * 2.4 + pond.position.x * 0.013) * 0.6;
      pond.water.position.z = 2.4 + bob;
    }
  }
}
