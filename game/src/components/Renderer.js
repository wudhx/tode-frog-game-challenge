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

  // A 3x retina display buys almost nothing at this art style but costs a
  // third of the fill rate; cap it so the post-processing headroom stays.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Filmic response: highlights roll off instead of clipping, which makes the
  // additive hit particles and the awakening flash read as light rather than
  // flat white.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return renderer;
}
