import * as THREE from 'three';

// Checkerboard colors, per the task specification.
const DARK_GREEN = 0x228b22;
const LIGHT_GREEN = 0x90ee90;
// Softer green for the decorative apron surrounding the board.
const APRON_GREEN = 0x3f9c46;

/** Size of a single floor tile, in world units. */
export const TILE_SIZE = 100;
/** How many tiles make up one side of the square board. */
export const TILE_COUNT = 12;
/**
 * How far the decorative apron extends beyond the board. The camera sits
 * ~420 units back with a 34° field of view, so from the far corner of the
 * board it can see roughly 1500 units past the last tile. 6000 leaves a very
 * generous margin so no blank sky ever shows through at the rim.
 */
export const APRON_SIZE = 6000;

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

    this.buildApron();
    this.buildFloor();
    this.buildHousesGroup();
  }

  /**
   * Lays a large grass-colored plane under everything, so the area visible
   * outside the checkerboard reads as more meadow rather than blank sky.
   */
  buildApron() {
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(APRON_SIZE, APRON_SIZE),
      new THREE.MeshStandardMaterial({ color: APRON_GREEN, side: THREE.DoubleSide })
    );
    // Sit a hair below the tiles to avoid z-fighting along their shared edge.
    apron.position.z = -1;
    this.group.add(apron);
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
