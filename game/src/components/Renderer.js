import * as THREE from 'three';

/**
 * Creates the WebGL renderer bound to the canvas declared in index.html.
 *
 * @returns {THREE.WebGLRenderer} The configured renderer.
 */
export function createRenderer() {
  const canvas = document.querySelector('canvas.game');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  return renderer;
}
