import * as THREE from 'three';
import { sound } from './Sound.js';

// ---------------------------------------------------------------------------
// Procedural hero
// ---------------------------------------------------------------------------
/**
 * Builds the hero entirely from primitives.
 *
 * The frog used to be a 1.8 MB GLB, but that file was unreliable to serve from
 * GitHub Pages for some players — the request got dropped and the hero never
 * appeared. Geometry built in code is instant, tiny, and always renders, so the
 * frog can never silently vanish again.
 *
 * Assembled directly in our Z-up world, facing +X, so the yaw pivot can spin
 * him to face his travel direction.
 *
 * @returns {THREE.Group}
 */
function buildFrog() {
  const frog = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: 0x57b357, roughness: 0.6 });
  const belly = new THREE.MeshStandardMaterial({ color: 0x9ccc65, roughness: 0.7 });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x3f8f3f, roughness: 0.7 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf5f7f2, roughness: 0.4 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 0.3 });

  // Fat, low-sitting body.
  const body = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 16), skin);
  body.scale.set(1.3, 1, 0.82);
  body.position.z = 13;
  frog.add(body);

  // Lighter belly on the front-lower side.
  const bellyMesh = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 14), belly);
  bellyMesh.scale.set(1.1, 1, 0.7);
  bellyMesh.position.set(3, 0, 7);
  frog.add(bellyMesh);

  // Two eyes on top, facing +X.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 12), eyeWhite);
    eye.position.set(9, side * 9, 25);
    frog.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), pupil);
    pup.position.set(12, side * 9, 27);
    frog.add(pup);
  }

  // Four flattened foot pads at the corners.
  for (const fx of [15, -15]) {
    for (const fy of [-12, 12]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), footMat);
      foot.scale.set(1.3, 1, 0.5);
      foot.position.set(fx, fy, 2.5);
      frog.add(foot);
    }
  }

  // Two raised haunches at the back for a frog silhouette.
  for (const side of [-1, 1]) {
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(11, 14, 12), skin);
    haunch.scale.set(1, 1, 0.9);
    haunch.position.set(-13, side * 12, 12);
    frog.add(haunch);
  }

  return frog;
}

// ---------------------------------------------------------------------------
// Movement tuning constants
// ---------------------------------------------------------------------------
/** Base duration of a single hop, in seconds (shrinks as difficulty rises). */
export const MOVE_DURATION = 0.28;
/** How high the hero arcs off the ground during a hop. */
export const JUMP_HEIGHT = 22;
/** How far (in world units) a single hop covers. */
export const JUMP_DISTANCE = 70;
/** Fastest a hop may ever become. */
const MIN_MOVE_DURATION = 0.1;

/**
 * The Player is a THREE.Group that hosts the Tode the Frog model.
 *
 * The group is what the game logic moves around in world space, while the
 * inner model keeps its own orientation offsets (needed because the GLB was
 * authored in a Y-up convention and our scene is Z-up).
 */
export class Player {
  /**
   * @param {THREE.Scene} scene The scene the player group should be added to.
   */
  constructor(scene) {
    this.scene = scene;

    // The movable entity in world space. The camera rides along with THIS
    // group, so it must never be rotated — spinning it would spin the whole
    // view and make the controls feel like they only work in one direction.
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    // Facing pivot. Only the model is parented here, so turning the hero
    // towards its travel direction never disturbs the camera.
    this.yaw = new THREE.Group();
    this.group.add(this.yaw);

    // Reference to the raw loaded model (rotated/offset independently).
    this.model = null;

    // Populated once the model finishes loading.
    this.loaded = false;

    // Pending keyboard inputs, processed one hop at a time.
    /** @type {THREE.Vector2[]} */
    this.inputQueue = [];

    // Current movement state, driven by the input queue.
    this.moveState = {
      active: false,
      progress: 0,
      startPosition: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      // Direction the model should be facing (radians around Z).
      rotation: 0,
      // How much of a full-length hop this one is (1 = unobstructed).
      fraction: 1,
    };

    // Freeze all player input while the game-over overlay is showing.
    this.controlsEnabled = true;

    // Seconds a single hop takes. Adjusted by the difficulty system.
    this.moveDuration = MOVE_DURATION;

    // Lets the world trim a hop so the hero comes to rest right against a
    // wall instead of stopping a whole hop short of it. Returns the adjusted
    // landing spot, or null when there is nowhere to go. Set by main.js.
    this.resolveTarget = (from, target) => target;

    // Hard backstop applied to every hop's landing spot, so the frog can
    // never leave the board. Set by main.js.
    this.confine = () => {};

    // Half the frog's widest horizontal extent. Measured from the model once
    // it loads, so collision uses his real size rather than a guess.
    this.radius = 22;

    /** Timestamp of the last "blocked" thud, so it cannot machine-gun. */
    this.lastBumpAt = 0;

    this.bindInput();
    this.load();
  }

  /**
   * Builds the hero model.
   *
   * Kept synchronous and dependency-free: the frog is made of primitives, so he
   * always appears even where a large GLB would fail to download.
   */
  load() {
    const model = buildFrog();

    // Fixed footprint radius — the frog is a known size, so collision uses his
    // real extent directly instead of guessing from a loaded mesh.
    const box = new THREE.Box3().setFromObject(model);
    this.radius = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2;

    this.model = model;
    this.yaw.add(model);
    this.loaded = true;
  }

  /**
   * Listens for arrow-key presses and enqueues the matching direction.
   */
  bindInput() {
    const DIRECTION_KEYS = {
      ArrowUp: new THREE.Vector2(0, 1),
      ArrowDown: new THREE.Vector2(0, -1),
      ArrowLeft: new THREE.Vector2(-1, 0),
      ArrowRight: new THREE.Vector2(1, 0),
    };

    window.addEventListener('keydown', (event) => {
      if (!this.controlsEnabled) return;

      const direction = DIRECTION_KEYS[event.key];
      if (!direction) return;

      event.preventDefault();
      this.inputQueue.push(direction);
    });
  }

  /**
   * Starts a new hop towards the given direction.
   *
   * The hop is trimmed to whatever the world allows: hopping straight at a
   * house lands the frog against its wall rather than refusing to move.
   *
   * @param {THREE.Vector2} direction Unit vector in the XY plane.
   */
  startMove(direction) {
    const state = this.moveState;

    state.active = true;
    state.progress = 0;
    state.startPosition.copy(this.group.position);

    // Where a full-length hop would land.
    const target = this.group.position.clone();
    target.x += direction.x * JUMP_DISTANCE;
    target.y += direction.y * JUMP_DISTANCE;

    // Let the world trim the hop. A null result means we are wedged and
    // cannot move at all in this direction.
    const resolved = this.resolveTarget(this.group.position, target);
    if (!resolved) {
      state.active = false;
      this.reportBlocked();
      return;
    }

    // Keep the landing spot on the board. This is a clamp rather than a
    // reject, so hopping straight into the edge simply stops at the edge.
    this.confine(resolved);

    const deltaX = resolved.x - this.group.position.x;
    const deltaY = resolved.y - this.group.position.y;
    const distance = Math.hypot(deltaX, deltaY);

    // Nowhere to go — don't start a zero-length hop.
    if (distance < 1e-3) {
      state.active = false;
      this.reportBlocked();
      return;
    }

    state.targetPosition.copy(resolved);
    // How much of a full hop this turned out to be. Drives the arc height and
    // the timing, so a trimmed hop looks like a small hop, not a slow one.
    state.fraction = Math.min(1, distance / JUMP_DISTANCE);

    // Face the direction actually travelled. When the world trimmed or slid
    // the hop, that is not the same as the key that was pressed — facing the
    // key instead would make a slide look like the frog is moonwalking.
    state.rotation = Math.atan2(deltaY, deltaX);
  }

  /**
   * Fires a dull thud when a hop is refused, so "a wall stopped me" is
   * distinguishable from "the controls stopped working".
   */
  reportBlocked() {
    const now = performance.now();
    if (now - this.lastBumpAt < 250) return;
    this.lastBumpAt = now;
    sound.bump();
  }

  /**
   * Advances the current hop. Called once per animation frame.
   *
   * @param {number} delta Seconds elapsed since the previous frame.
   */
  update(delta) {
    // If idle, pick up the next queued input.
    if (!this.moveState.active) {
      if (this.inputQueue.length === 0) return;
      const next = this.inputQueue.shift();
      this.startMove(next);

      // startMove() leaves us idle when the hop is blocked or zero-length.
      if (!this.moveState.active) return;

      // The hop is confirmed — let it be heard.
      sound.jump();
    }

    const state = this.moveState;

    // A trimmed hop covers less ground, so it also takes less time and arcs
    // lower. The floor keeps a wall-hugging hop from becoming a twitch.
    const fraction = state.fraction || 1;
    const duration = this.moveDuration * Math.max(0.45, fraction);

    state.progress = Math.min(1, state.progress + delta / duration);

    // Linear interpolation across the ground plane.
    const x = THREE.MathUtils.lerp(state.startPosition.x, state.targetPosition.x, state.progress);
    const y = THREE.MathUtils.lerp(state.startPosition.y, state.targetPosition.y, state.progress);

    // Parabolic arc for the hop: sin() peaks at progress = 0.5.
    const z =
      Math.sin(state.progress * Math.PI) * JUMP_HEIGHT * Math.max(0.5, fraction);

    this.group.position.set(x, y, z);

    // Smoothly swing the model to face the travel direction. This turns the
    // yaw pivot, NOT the group the camera is attached to.
    this.yaw.rotation.z = state.rotation;

    if (state.progress >= 1) {
      this.group.position.z = 0;
      state.active = false;
    }

    // Belt-and-braces: never let a single frame place the hero off-board.
    this.confine(this.group.position);
  }

  /**
   * Sets how long a single hop takes (driven by dynamic difficulty).
   *
   * @param {number} duration Seconds per hop.
   */
  setMoveDuration(duration) {
    this.moveDuration = Math.max(MIN_MOVE_DURATION, duration);
  }

  /**
   * Returns the player's current position on the ground plane.
   *
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.group.position;
  }

  /**
   * Cancels any in-flight hop and clears queued input.
   */
  stop() {
    this.inputQueue.length = 0;
    this.moveState.active = false;
    this.group.position.z = 0;
  }
}
