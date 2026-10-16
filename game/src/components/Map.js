import * as THREE from 'three';

// Checkerboard colors, per the task specification.
const DARK_GREEN = '#228b22';
const LIGHT_GREEN = '#90ee90';
// Softer green for the decorative apron surrounding the board.
const APRON_GREEN = 0x3f9c46;

/** Size of a single floor tile, in world units. */
export const TILE_SIZE = 100;
/**
 * How many tiles make up one side of the square board.
 *
 * 30 x 30 = 3000 x 3000 world units. The original course board was 12 x 12,
 * so this is 2.5x per side and 6.25x the area — enough room for the extra
 * scenery and the gameplay systems still to come.
 */
export const TILE_COUNT = 30;
/**
 * Distance from the origin to the edge of the board. Everything that moves
 * clamps to `BOARD_HALF - its own radius`, so bodies come to rest with their
 * edge exactly on the painted boundary instead of stopping short of it.
 */
export const BOARD_HALF = (TILE_COUNT * TILE_SIZE) / 2;
/**
 * How far the decorative apron extends beyond the board. The camera sits
 * ~470 units back with a 36° field of view, so from the far corner of the
 * board it can see roughly 1600 units past the last tile. This leaves a very
 * generous margin so no blank sky ever shows through at the rim.
 */
export const APRON_SIZE = 12000;

/**
 * Builds the game map: a checkerboard ground plane plus groups that host the
 * obstacles and the scenery.
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
   *
   * The whole board is a single plane painted with a procedurally generated
   * one-pixel-per-tile texture. That keeps an 18x18 board at one draw call
   * instead of 324, which matters now that the map is 1.5x larger.
   */
  buildFloor() {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_COUNT;
    canvas.height = TILE_COUNT;
    const ctx = canvas.getContext('2d');

    for (let row = 0; row < TILE_COUNT; row++) {
      for (let col = 0; col < TILE_COUNT; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? DARK_GREEN : LIGHT_GREEN;
        ctx.fillRect(col, row, 1, 1);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    // Nearest filtering keeps every tile edge crisp at any distance.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    const size = TILE_COUNT * TILE_SIZE;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide })
    );
    this.group.add(floor);
  }

  /**
   * Creates the group that houses (pun intended) the obstacles.
   */
  buildHousesGroup() {
    this.housesGroup = new THREE.Group();
    this.group.add(this.housesGroup);
  }
}
