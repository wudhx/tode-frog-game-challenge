import * as THREE from 'three';
import { sound } from './Sound.js';

// ---------------------------------------------------------------------------
// Attack tuning constants
// ---------------------------------------------------------------------------
/** Seconds the player must wait between attacks. */
export const ATTACK_COOLDOWN = 1;
/** How far the attack reaches, in world units. */
export const ATTACK_RADIUS = 120;
/** How long the visual ring stays on screen, in seconds. */
export const ATTACK_VISUAL_DURATION = 0.25;

/**
 * Implements the player's area-of-effect attack.
 *
 * Pressing Space triggers a short-lived yellow ring around the player. Any
 * enemy caught inside the radius is reported back to the caller for removal.
 */
export class Attack {
  /**
   * @param {THREE.Scene} scene The scene to attach the effect ring to.
   * @param {import('./Player.js').Player} player The attacking player.
   */
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    this.cooldown = 0;
    this.cooldownDuration = ATTACK_COOLDOWN;
    this.radius = ATTACK_RADIUS;
    this.enabled = true;

    // --- Visual ring -------------------------------------------------------
    const geometry = new THREE.CircleGeometry(this.radius, 40);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.ring = new THREE.Mesh(geometry, material);
    this.ring.visible = false;
    // Float just above the ground so it doesn't z-fight with the floor.
    this.ring.position.z = 0.25;
    scene.add(this.ring);

    // Seconds the ring has been visible for.
    this.visualTimer = 0;

    this.bindInput();
  }

  /**
   * Listens for the Space key to fire an attack.
   */
  bindInput() {
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      this.tryAttack();
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

    // Snap the ring to the player and show it.
    this.ring.position.x = this.player.position.x;
    this.ring.position.y = this.player.position.y;
    this.ring.visible = true;
    this.visualTimer = ATTACK_VISUAL_DURATION;

    sound.attack();

    return true;
  }

  /**
   * Advances the cooldown timer and fades the effect ring.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  update(delta) {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - delta);
    }

    if (this.visualTimer > 0) {
      this.visualTimer = Math.max(0, this.visualTimer - delta);

      if (this.visualTimer === 0) {
        this.ring.visible = false;
      }
    }

    // Keep the ring glued to the player while it is visible so it reads as
    // "centered on Tode" even if he is mid-hop.
    if (this.ring.visible) {
      this.ring.position.x = this.player.position.x;
      this.ring.position.y = this.player.position.y;
    }
  }

  /**
   * Returns the enemies lying inside the current attack radius.
   *
   * @param {import('./Enemy.js').Enemy[]} enemies Active enemies.
   * @returns {import('./Enemy.js').Enemy[]} Enemies to defeat.
   */
  enemiesInRange(enemies) {
    const origin = this.player.position;

    return enemies.filter((enemy) => {
      const dx = enemy.position.x - origin.x;
      const dy = enemy.position.y - origin.y;
      return Math.sqrt(dx * dx + dy * dy) <= this.radius;
    });
  }

  /**
   * Clears the cooldown and hides the ring (used on game reset).
   */
  reset() {
    this.cooldown = 0;
    this.visualTimer = 0;
    this.ring.visible = false;
  }
}
