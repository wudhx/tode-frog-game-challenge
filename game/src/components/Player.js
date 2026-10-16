import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sound } from './Sound.js';

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

    this.bindInput();
    this.load();
  }

  /**
   * Loads the tode.glb model and mounts it inside the player group.
   */
  load() {
    const loader = new GLTFLoader();

    // Resolve against Vite's base URL so the asset loads correctly both in
    // dev (/) and when deployed under a sub-path (e.g. GitHub Pages).
    loader.load(`${import.meta.env.BASE_URL}models/tode.glb`, (gltf) => {
      const model = gltf.scene;

      // The asset is authored "lying down" for a Y-up world; rotate it into
      // our Z-up coordinate system so the frog stands upright.
      model.rotation.x = Math.PI / 2;

      // Scale the frog to a sensible size for the map.
      model.scale.setScalar(20);

      // Sit the model exactly on the ground plane (Z = 0) by measuring how
      // far the geometry extends below its own origin after rotation.
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      model.position.z -= box.min.z;

      // Half of the widest horizontal extent is the frog's footprint radius.
      // main.js adds this to a house's radius so he stops when he *touches*
      // a wall rather than when his centre reaches it.
      this.radius = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2;

      this.model = model;
      this.yaw.add(model);
      this.loaded = true;
    });
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
      return;
    }

    // Keep the landing spot on the board. This is a clamp rather than a
    // reject, so hopping straight into the edge simply stops at the edge.
    this.confine(resolved);

    const distance = Math.hypot(
      resolved.x - this.group.position.x,
      resolved.y - this.group.position.y
    );

    // Nowhere to go — don't start a zero-length hop.
    if (distance < 1e-3) {
      state.active = false;
      return;
    }

    state.targetPosition.copy(resolved);
    // How much of a full hop this turned out to be. Drives the arc height and
    // the timing, so a trimmed hop looks like a small hop, not a slow one.
    state.fraction = Math.min(1, distance / JUMP_DISTANCE);

    // Face the direction of travel. atan2 gives 0 for +X and grows CCW.
    state.rotation = Math.atan2(direction.y, direction.x);
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
