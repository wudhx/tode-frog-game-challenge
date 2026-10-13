import * as THREE from 'three';

// Checkerboard colors, per the task specification.
const DARK_GREEN = 0x228b22;
const LIGHT_GREEN = 0x90ee90;

/** Size of a single floor tile, in world units. */
export const TILE_SIZE = 100;
/** How many tiles make up one side of the square board. */
export const TILE_COUNT = 12;

/**
 * Builds the game map: a checkerboard ground plane plus a group that will
 * host obstacles such as houses.
 */
export class Map {
  /**
   * @param {THREE.Scene} scene The scene the map should be added to.
   */
  constructor(scene) {
    this.scene = scene;

    // Everything the map owns lives under this group.
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildFloor();
    this.buildHousesGroup();
  }

  /**
   * Lays out the alternating-color checkerboard floor.
   */
  buildFloor() {
    const half = (TILE_COUNT * TILE_SIZE) / 2;
    const tileGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

    for (let row = 0; row < TILE_COUNT; row++) {
      for (let col = 0; col < TILE_COUNT; col++) {
        const isDark = (row + col) % 2 === 0;
        const material = new THREE.MeshStandardMaterial({
          color: isDark ? DARK_GREEN : LIGHT_GREEN,
          side: THREE.DoubleSide,
        });

        const tile = new THREE.Mesh(tileGeometry, material);
        tile.position.set(
          col * TILE_SIZE - half + TILE_SIZE / 2,
          row * TILE_SIZE - half + TILE_SIZE / 2,
          0
        );

        this.group.add(tile);
      }
    }
  }

  /**
   * Creates the group that houses (pun intended) the obstacles.
   */
  buildHousesGroup() {
    this.housesGroup = new THREE.Group();
    this.group.add(this.housesGroup);
  }
}
