import * as THREE from 'three';

/**
 * Creates a perspective camera pointed at the origin and attaches it to the
 * player group so it follows the hero around the scene.
 *
 * The near plane sits at 5 rather than 0.1 on purpose. Depth-buffer precision
 * scales with the near plane, and with the camera ~800 units back a near of
 * 0.1 left only ~0.4 units of precision at ground level — enough for the
 * pond's shore and water discs to z-fight into a radial starburst. Nothing
 * ever comes within 5 units of the camera, so this costs nothing.
 *
 * @param {THREE.Group} player The player group the camera should ride along with.
 * @returns {THREE.PerspectiveCamera} The configured camera.
 */
export function createCamera(player) {
  const camera = new THREE.PerspectiveCamera(
    36,                                          // field of view
    window.innerWidth / window.innerHeight,      // aspect ratio
    5,                                           // near clipping plane
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
