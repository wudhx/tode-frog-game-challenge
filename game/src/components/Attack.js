import * as THREE from 'three';
import { sound } from './Sound.js';

// ---------------------------------------------------------------------------
// Attack tuning constants
// ---------------------------------------------------------------------------
/** Seconds the player must wait between attacks. */
export const ATTACK_COOLDOWN = 1;
/** How far the attack reaches, in world units. */
export const ATTACK_RADIUS = 120;
/** How long the tongue lash stays on screen, in seconds. */
export const ATTACK_VISUAL_DURATION = 0.3;

/** Geometry is authored at this length; the live radius scales it. */
const BASE_LENGTH = ATTACK_RADIUS;
/**
 * Longest the tongue is drawn, even when the damage radius is far larger.
 * Late-game range can reach 1600 units; drawing that full length put a huge
 * slab across the frog and the screen. The shockwave ring still shows the
 * real damage radius, so the lash is only the visual snap.
 */
const TONGUE_VISUAL_MAX = 240;
/** Thickness where the tongue leaves the mouth. */
const TONGUE_ROOT_RADIUS = 2.8;
/** Thickness at the tip, before the rounded end. */
const TONGUE_TIP_RADIUS = 1.4;
/** The tongue is a flat blade: wider than it is thick. */
const TONGUE_FLAT_Y = 2.1;
const TONGUE_FLAT_Z = 0.62;
/** Radius of the rounded tip. */
const TONGUE_TIP_BULB = 2.0;
/**
 * Height the tip should meet. The mouth sits low on the frog while the
 * insects hover at 38; aiming the straight tongue at this height keeps it
 * from passing under the swarm without bending the tongue.
 */
const TONGUE_TARGET_Z = 38;

/** Fast start, soft finish. */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Slow start, fast finish. */
function easeInCubic(t) {
  return t * t * t;
}

/**
 * Implements the player's area-of-effect tongue attack.
 *
 * Pressing Space shoots a flat, rounded tongue out of Tode's mouth along his
 * facing. The tongue is parented to the same yaw pivot as the model, so it
 * cannot drift to his side or back when he turns. The damage check remains
 * radial around the hero; a thin ground ring communicates that radius.
 */
export class Attack {
  /**
   * @param {THREE.Scene} scene The scene to attach the effects to.
   * @param {import('./Player.js').Player} player The attacking player.
   */
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    this.cooldown = 0;
    this.cooldownDuration = ATTACK_COOLDOWN;
    this.radius = ATTACK_RADIUS;
    this.enabled = true;

    // Seconds the lash has been visible for.
    this.visualTimer = 0;

    // True while Space is held down. Driving auto-fire from the game loop
    // (rather than relying on OS key-repeat) means holding Space keeps firing
    // even while arrow keys are pressed.
    this.spaceHeld = false;

    // Set by every successful shot and consumed by the main loop, so a hit is
    // never lost when one visual overlaps the next.
    this.pendingHit = false;

    this.buildTongue();
    this.bindInput();
  }

  /**
   * Builds a flat, tapered blade with a rounded tip.
   *
   * A cylinder on its own reads as a spike, especially with a flat cap at the
   * mouth. Flattening the cross-section, rounding the end and hiding the root
   * just inside the head makes the silhouette read as a tongue instead.
   */
  buildTongue() {
    const geometry = new THREE.CylinderGeometry(
      TONGUE_TIP_RADIUS,
      TONGUE_ROOT_RADIUS,
      BASE_LENGTH,
      18,
      1,
      false
    );
    // Cylinder is authored along +Y with its root at -Y. Lay it along +X and
    // move the root to the group origin, so scaling X extends from the mouth.
    geometry.rotateZ(-Math.PI / 2);
    geometry.translate(BASE_LENGTH / 2, 0, 0);
    // Wide and flat, like a tongue, instead of a round cone.
    geometry.scale(1, TONGUE_FLAT_Y, TONGUE_FLAT_Z);

    const material = new THREE.MeshStandardMaterial({
      color: 0xff5577,
      roughness: 0.38,
      metalness: 0,
      emissive: 0x4a0714,
      emissiveIntensity: 0.35,
    });

    this.tongue = new THREE.Group();
    this.tongue.visible = false;

    // Pitch is a child so the root stays at the mouth while the tip rises.
    this.tonguePitch = new THREE.Group();
    this.tongue.add(this.tonguePitch);

    this.tongueTube = new THREE.Mesh(geometry, material);
    this.tonguePitch.add(this.tongueTube);

    // A flattened sphere rounds off the end; it also covers the tube's cap.
    const tipGeometry = new THREE.SphereGeometry(TONGUE_TIP_BULB, 18, 14);
    tipGeometry.scale(1, TONGUE_FLAT_Y, TONGUE_FLAT_Z);
    this.tongueTip = new THREE.Mesh(tipGeometry, material);
    this.tongueTip.position.set(BASE_LENGTH, 0, 0);
    this.tonguePitch.add(this.tongueTip);

    // Parent to the model's yaw pivot, not the world: then every turn moves
    // the mouth and the tongue together. The former world-space maths could
    // drift to the side or back when the frog changed direction.
    this.tongueParent = this.player.yaw || this.scene;
    this.tongueParent.add(this.tongue);

    // A thin, expanding ground ring communicates the radial damage without
    // becoming the old flat yellow disc. A line loop stays hairline-thin at
    // any radius; a scaled ring mesh became a wide band late in a run.
    const ringPoints = [];
    for (let i = 0; i < 96; i += 1) {
      const angle = (i / 96) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
    }
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0xff7a9a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.shockwave = new THREE.LineLoop(ringGeometry, ringMaterial);
    this.shockwave.position.z = 1.5;
    this.shockwave.visible = false;
    this.scene.add(this.shockwave);
  }

  /**
   * Listens for the Space key to fire an attack.
   */
  bindInput() {
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      this.spaceHeld = true;
      this.tryAttack();
    });

    window.addEventListener('keyup', (event) => {
      if (event.code !== 'Space') return;
      this.spaceHeld = false;
    });
  }

  /**
   * Fires an attack if the cooldown has elapsed.
   *
   * @returns {boolean} True if the attack actually went off.
   */
  tryAttack() {
    if (!this.enabled || this.cooldown > 0) return false;

    this.cooldown = this.cooldownDuration;

    // Start from the mouth at zero length, so the first frame cannot show a
    // full-size tongue popping out of the frog's feet.
    const mouth = this.player.mouth;
    const visual = Math.min(this.radius, TONGUE_VISUAL_MAX) / BASE_LENGTH;
    const thickness = Math.min(1.35, 1 + (visual - 1) * 0.08);
    this.tongue.position.set(mouth ? mouth.x : 4, 0, mouth ? mouth.z : 8);
    this.tongue.rotation.z = 0;
    this.tongue.scale.set(visual * 0.04, thickness, thickness);
    this.tongueTip.scale.set(1 / (visual * 0.04), 1 / thickness, 1 / thickness);

    this.tongue.visible = true;
    this.shockwave.visible = true;
    this.visualTimer = ATTACK_VISUAL_DURATION;

    sound.attack();

    this.pendingHit = true;

    return true;
  }

  /**
   * Returns true exactly once per fired attack, then clears the flag.
   *
   * The main loop uses this instead of watching the visual, so a shot can
   * never be swallowed by an overlapping effect (which happened when the
   * attack cooldown was shorter than the visual lifetime).
   *
   * @returns {boolean}
   */
  consumeHit() {
    if (!this.pendingHit) return false;
    this.pendingHit = false;
    return true;
  }

  /**
   * Advances the cooldown timer and animates the lash.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  update(delta) {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - delta);
    }

    // Holding Space keeps firing as soon as the cooldown allows, regardless
    // of movement keys or OS key-repeat behaviour.
    if (this.spaceHeld && this.enabled && this.cooldown <= 0) {
      this.tryAttack();
    }

    if (this.visualTimer > 0) {
      this.visualTimer = Math.max(0, this.visualTimer - delta);

      const t = 1 - this.visualTimer / ATTACK_VISUAL_DURATION;
      const visual = Math.min(this.radius, TONGUE_VISUAL_MAX) / BASE_LENGTH;
      const thickness = Math.min(1.35, 1 + (visual - 1) * 0.08);

      // Out fast, hold for a beat, snap back.
      let reach;
      if (t < 0.24) reach = easeOutCubic(t / 0.24);
      else if (t < 0.56) reach = 1;
      else reach = 1 - easeInCubic((t - 0.56) / 0.44);
      reach = Math.max(0.04, reach);

      // Local mouth position: the yaw pivot already supplies the facing.
      const mouth = this.player.mouth;
      const mouthX = mouth ? mouth.x : 4;
      const mouthZ = mouth ? mouth.z : 8;
      this.tongue.position.set(mouthX, 0, mouthZ);
      this.tongue.rotation.z = 0;

      // Aim the tip at the swarm's hover height. A longer Range talent
      // flattens the angle instead of lifting the tip into the sky.
      const playerZ = this.player.group ? this.player.group.position.z : this.player.position.z;
      this.tonguePitch.rotation.y = -Math.atan2(
        TONGUE_TARGET_Z - (playerZ + mouthZ),
        Math.max(1, this.radius)
      );

      this.tongue.scale.set(visual * reach, thickness, thickness);
      this.tongueTip.scale.set(1 / (visual * reach), 1 / thickness, 1 / thickness);

      this.shockwave.position.set(this.player.position.x, this.player.position.y, 1.5);
      this.shockwave.scale.setScalar(this.radius * (0.35 + 0.75 * t));
      this.shockwave.material.opacity = 0.55 * Math.pow(1 - t, 1.2);

      if (this.visualTimer === 0) {
        this.tongue.visible = false;
        this.shockwave.visible = false;
      }
    }
  }

  /**
   * Returns the enemies lying inside the current attack radius.
   *
   * Large insects are measured to their body edge rather than their centre,
   * so a boss is hittable when the lash touches its shell instead of only
   * when it reaches the middle of a 4.5x body.
   *
   * @param {import('./Enemy.js').Enemy[]} enemies Active enemies.
   * @returns {import('./Enemy.js').Enemy[]} Enemies to defeat.
   */
  enemiesInRange(enemies) {
    const origin = this.player.position;

    return enemies.filter((enemy) => {
      const dx = enemy.position.x - origin.x;
      const dy = enemy.position.y - origin.y;
      const reach = this.radius + (enemy.boss ? enemy.radius : 0);
      return Math.sqrt(dx * dx + dy * dy) <= reach;
    });
  }

  /**
   * Clears the cooldown and hides the lash (used on game reset).
   */
  reset() {
    this.cooldown = 0;
    this.visualTimer = 0;
    this.pendingHit = false;
    this.tongue.visible = false;
    this.shockwave.visible = false;
  }
}