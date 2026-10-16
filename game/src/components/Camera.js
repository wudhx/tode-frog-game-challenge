import * as THREE from 'three';

/**
 * Creates a perspective camera pointed at the origin and attaches it to the
 * player group so it follows the hero around the scene.
 *
 * @param {THREE.Group} player The player group the camera should ride along with.
 * @returns {THREE.PerspectiveCamera} The configured camera.
 */
export function createCamera(player) {
  const camera = new THREE.PerspectiveCamera(
    36,                                          // field of view
    window.innerWidth / window.innerHeight,      // aspect ratio
    0.1,                                         // near clipping plane
    20000                                        // far clipping plane
  );

  // Pulled back so a good slice of the enlarged 3000x3000 board is visible
  // at once, without the frog shrinking to a dot.
  camera.position.set(470, -470, 470);
  // Z-up coordinate system: the "up" direction is the Z axis.
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  // Follow the player.
  player.add(camera);

  return camera;
}
