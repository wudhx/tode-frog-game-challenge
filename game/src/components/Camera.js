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
    34,                                          // field of view
    window.innerWidth / window.innerHeight,      // aspect ratio
    0.1,                                         // near clipping plane
    9000                                         // far clipping plane
  );

  // Pulled back from the original 300 so more of the map is visible at once.
  camera.position.set(420, -420, 420);
  // Z-up coordinate system: the "up" direction is the Z axis.
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  // Follow the player.
  player.add(camera);

  return camera;
}
