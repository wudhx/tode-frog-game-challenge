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
/** Thickness where the tongue leaves the mouth. */
const TONGUE_ROOT_RADIUS = 5.2;
/** Thickness at the tip, before the bulb. */
const TONGUE_TIP_RADIUS = 1.8;
/** Radius of the tip bulb. */
const TONGUE_TIP_BULB = 4.4;
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
 * Pressing Space shoots a straight, tapered tongue out of Tode's mouth along
 * his facing. The damage check remains radial around the hero, so the lash
 * does not have to physically touch every insect it kills; a thin ground ring
 * communicates that radius.
 */
export class Attack {
  /**
   * @param {THREE.Scene} scene The scene to attach the tongue to.
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
    // Mouth angle frozen at fire time, so a hop mid-lash does not drag the
    // root sideways across the frog's face.
    this.tongueAngle = 0;

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
   * Builds a straight, tapered cylinder. The root sits slightly inside the
   * mouth so the cut is hidden by the body; only the tongue that clears the
   * lips is visible. Length is animated by scaling X, so the cross-section
   * never stretches.
   */
  buildTongue() {
    const geometry = new THREE.CylinderGeometry(
      TONGUE_TIP_RADIUS,
      TONGUE_ROOT_RADIUS,
      BASE_LENGTH,
      14,
      1,
      false
    );
    // Cylinder is authored along +Y with its root at -Y. Lay it along +X and
    // move the root to the group origin, so scaling X extends from the mouth.
    geometry.rotateZ(-Math.PI / 2);
    geometry.translate(BASE_LENGTH / 2, 0, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0xff5c7a,
      roughness: 0.42,
      metalness: 0.03,
      emissive: 0x4a0714,
      emissiveIntensity: 0.45,
    });

    this.tongue = new THREE.Group();
    this.tongue.visible = false;

    // Pitch is a child so the root stays at the mouth while the tip rises.
    this.tonguePitch = new THREE.Group();
    this.tongue.add(this.tonguePitch);

    this.tongueTube = new THREE.Mesh(geometry, material);
    this.tonguePitch.add(this.tongueTube);

    // A single bulb at the tip; no root bulb, which is what made the old
    // version look like a growth on the frog's back.
    this.tongueTip = new THREE.Mesh(new THREE.SphereGeometry(TONGUE_TIP_BULB, 14, 12), material);
    this.tongueTip.position.set(BASE_LENGTH, 0, 0);
    this.tonguePitch.add(this.tongueTip);

    this.scene.add(this.tongue);

    // A thin, expanding ground ring communicates the radial damage without
    // becoming the old flat yellow disc.
    const ringGeometry = new THREE.RingGeometry(0.88, 1, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a9a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shockwave = new THREE.Mesh(ringGeometry, ringMaterial);
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

    this.tongueAngle = this.player.yaw ? this.player.yaw.rotation.z : 0;
    this.tongue.rotation.z = this.tongueAngle;
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
      const k = this.radius / BASE_LENGTH;

      // Out fast, hold for a beat, snap back.
      let reach;
      if (t < 0.24) reach = easeOutCubic(t / 0.24);
      else if (t < 0.56) reach = 1;
      else reach = 1 - easeInCubic((t - 0.56) / 0.44);
      reach = Math.max(0.04, reach);

      // Anchor at the mouth: forward along the frozen facing, at the mouth's
      // height. The root is a few units inside the lips so the cut disappears.
      const mouth = this.player.mouth;
      const forward = mouth ? mouth.x : 8;
      const height = mouth ? mouth.z : 8;
      const angle = this.tongueAngle;
      // Point the tip at the swarm's hover height; a longer Range talent
      // flattens the angle instead of lifting the tip into the sky.
      this.tonguePitch.rotation.y = -Math.atan2(
        TONGUE_TARGET_Z - height,
        Math.max(1, this.radius)
      );
      this.tongue.position.set(
        this.player.position.x + Math.cos(angle) * forward,
        this.player.position.y + Math.sin(angle) * forward,
        this.player.position.z + height
      );

      // Straight: no wiggle, no curve. Only the reach changes.
      this.tongue.rotation.z = angle;
      this.tongue.scale.set(k * reach, k, k);
      this.tongueTip.scale.set(1 / (k * reach), 1 / k, 1 / k);

      this.shockwave.position.set(this.player.position.x, this.player.position.y, 1.5);
      this.shockwave.scale.setScalar(this.radius * (0.35 + 0.75 * t));
      this.shockwave.material.opacity = 0.3 * Math.pow(1 - t, 1.3);

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