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
/** Thickness of the tongue at rest, in world units. */
const TONGUE_RADIUS = 4.5;
/** Radius of the tip bulb. */
const TONGUE_TIP_RADIUS = 7;
/** Height of the tongue root above the frog's feet. */
const TONGUE_Z = 18;

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
 * Pressing Space whips a pink tongue out from Tode's mouth. The damage is
 * still a radial check around the hero, so a lash that sweeps past an insect
 * on any side kills it; a thin ring on the ground communicates that radius.
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
    // Angle the lash was fired at, so a hop mid-lash does not twist it.
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
   * Builds the tongue once. Extension and retraction are a scale on the
   * group, not a geometry rebuild, so a Range power-up is free.
   */
  buildTongue() {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(BASE_LENGTH * 0.26, 0, 6),
      new THREE.Vector3(BASE_LENGTH * 0.62, 0, -5),
      new THREE.Vector3(BASE_LENGTH, 0, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 28, TONGUE_RADIUS, 8, false);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff5c7a,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0x4a0714,
      emissiveIntensity: 0.55,
    });

    this.tongue = new THREE.Group();
    this.tongue.visible = false;

    this.tongueTube = new THREE.Mesh(geometry, material);
    this.tongue.add(this.tongueTube);

    // The bulb at the root hides the hard cut where the tube meets the body.
    this.tongueRoot = new THREE.Mesh(new THREE.SphereGeometry(TONGUE_RADIUS * 1.15, 12, 10), material);
    this.tongue.add(this.tongueRoot);

    // The tip is a separate, heavier bulb so it reads as the part that hits.
    this.tongueTip = new THREE.Mesh(new THREE.SphereGeometry(TONGUE_TIP_RADIUS, 14, 12), material);
    this.tongueTip.position.set(BASE_LENGTH, 0, 0);
    this.tongue.add(this.tongueTip);

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

      // Out fast, hold for a beat, snap back. The return is deliberately
      // quicker than the extension so the mouth feels elastic.
      let reach;
      if (t < 0.26) reach = easeOutCubic(t / 0.26);
      else if (t < 0.58) reach = 1;
      else reach = 1 - easeInCubic((t - 0.58) / 0.42);
      reach = Math.max(0.04, reach);

      this.tongue.position.set(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z + TONGUE_Z
      );
      // A small whip bend as the lash travels; it settles by the time the
      // tongue retracts, so the root never looks detached from the mouth.
      this.tongue.rotation.z = this.tongueAngle + Math.sin(t * Math.PI) * 0.1;

      // Scale X for reach, Y/Z for thickness. The root and tip counter-scale
      // so they stay round instead of stretching with the group.
      this.tongue.scale.set(k * reach, k, k);
      const inverseX = 1 / (k * reach);
      const inverseYZ = 1 / k;
      this.tongueRoot.scale.set(inverseX, inverseYZ, inverseYZ);
      this.tongueTip.scale.set(inverseX, inverseYZ, inverseYZ);

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