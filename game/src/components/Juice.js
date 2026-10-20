import * as THREE from 'three';

/**
 * Juice — the moment-to-moment feedback layer.
 *
 * The game already has the systems (levels, talents, genes, bosses); what it
 * lacks is the sensory answer to "did that do something?". This module owns
 * every non-gameplay response: hit-stop, screen shake, kill bursts, floating
 * score, the combo counter and the hurt vignette.
 *
 * It is deliberately self-contained:
 *   - it never touches game state, only reads positions;
 *   - it owns its own DOM (injected styles) and its own particle buffer;
 *   - `update(delta)` is called once per frame with *real* time, and the game
 *     loop multiplies its own delta by `timeScale` to get the hit-stop freeze.
 *
 * Integration is five calls: onKill, onBossHit, onHurt, onAwaken, update.
 */
export class Juice {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera Camera parented to the player group.
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    /** The camera's rest position, so shake can be added and removed cleanly. */
    this.cameraBase = camera.position.clone();

    /** Multiplier applied to the gameplay delta. 1 = normal, 0 = frozen. */
    this.timeScale = 1;

    // --- Hit-stop state ---------------------------------------------------
    this.hitstopTimer = 0;
    this.hitstopScale = 1;

    // --- Shake state ------------------------------------------------------
    /** 0..1, squared before use so small hits stay subtle. */
    this.trauma = 0;
    /** World-unit amplitude at trauma = 1. */
    this.shakeAmplitude = 26;

    // --- Combo ------------------------------------------------------------
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    /** Seconds a kill keeps the combo alive. */
    this.comboWindow = 2.2;

    // --- Scratch ----------------------------------------------------------
    this._proj = new THREE.Vector3();
    this._clock = 0;
    this._rand = Math.random;

    this._buildParticles();
    this._buildDom();
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * One insect died.
   *
   * @param {THREE.Vector3} position World position of the body.
   * @param {number} points Score awarded.
   * @param {boolean} [isBoss]
   */
  onKill(position, points, isBoss = false) {
    const size = isBoss ? 60 : 12 + Math.min(14, this.combo * 2);

    this.burst(position.x, position.y, size, isBoss ? 0xffb347 : 0xfff0a8, {
      speed: isBoss ? 320 : 190,
      spread: 0.6,
      z: 22,
    });

    this.popup(`+${points}`, position.x, position.y, isBoss ? '#ffd166' : '#fff6cf', isBoss ? 1.5 : 1);

    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = this.comboWindow;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    if (this.combo >= 3) this.showCombo(this.combo);

    // Short and non-stacking: at 2+ kills a second a long freeze reads as lag.
    this.hitstop(isBoss ? 0.16 : 0.038, isBoss ? 0.02 : 0.05);
    this.addTrauma(isBoss ? 0.8 : 0.18 + Math.min(0.25, this.combo * 0.015));
  }

  /**
   * A boss survived a hit (ordinary insects die in one blow, so this is the
   * only place a non-fatal impact can be felt).
   *
   * @param {THREE.Vector3} position
   */
  onBossHit(position) {
    this.burst(position.x, position.y, 5, 0xffc36b, { speed: 90, spread: 1.2, z: 40 });
    this.addTrauma(0.12);
    this.hitstop(0.03, 0.12);
  }

  /**
   * The hero took damage.
   *
   * @param {number} [damage]
   */
  onHurt(damage = 20) {
    const strength = Math.min(1, 0.45 + damage / 120);
    this.flash('rgba(255, 40, 70, 0.55)', strength, 0.45);
    this.addTrauma(0.55);
    this.hitstop(0.075, 0.1);
    this.combo = 0;
    this.comboTimer = 0;
    this.hideCombo();
  }

  /** The awakening button was spent. */
  onAwaken() {
    const p = this.camera.parent ? this.camera.parent.position : new THREE.Vector3();
    this.burst(p.x, p.y, 70, 0xffd76a, { speed: 360, spread: 2.2, z: 30 });
    this.flash('rgba(255, 210, 90, 0.35)', 0.9, 0.7);
    this.addTrauma(0.5);
  }

  /** A boss entered the board. */
  onBossSpawn() {
    this.addTrauma(0.35);
    this.flash('rgba(255, 61, 110, 0.22)', 0.5, 0.8);
  }

  /** Clears transient state between runs. */
  reset() {
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.timeScale = 1;
    // A run that ended mid-shake must not leave the camera parked off-centre.
    this.camera.position.copy(this.cameraBase);
    this.hideCombo();
    for (const p of this._particles) p.life = 0;
    for (const pop of this._popups) {
      pop.life = 0;
      pop.el.style.display = 'none';
    }
  }

  /**
   * Advances every effect. Call once per frame with REAL delta.
   *
   * @param {number} delta Seconds since the previous frame.
   */
  update(delta) {
    this._clock += delta;

    // --- Hit-stop ---------------------------------------------------------
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - delta);
      this.timeScale = this.hitstopScale;
    } else {
      this.timeScale = 1;
    }

    // --- Combo decay ------------------------------------------------------
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - delta);
      if (this.comboTimer === 0) this.hideCombo();
    }

    this._updateShake(delta);
    this._updateParticles(delta);
    this._updatePopups(delta);
    this._updateFlash(delta);
  }

  // =========================================================================
  // Effects
  // =========================================================================

  /**
   * Freezes the simulation for a moment.
   *
   * @param {number} seconds Real seconds.
   * @param {number} scale Time scale during the freeze.
   */
  hitstop(seconds, scale = 0) {
    // Never extend an existing freeze: stacked kills would stutter the game.
    if (this.hitstopTimer > 0) return;
    this.hitstopTimer = seconds;
    this.hitstopScale = scale;
  }

  /** @param {number} amount 0..1 of additional trauma. */
  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  _updateShake(delta) {
    // Linear decay is predictable; squared response keeps light hits light.
    this.trauma = Math.max(0, this.trauma - delta * 1.5);

    const shake = this.trauma * this.trauma;
    const amp = this.shakeAmplitude * shake;
    const t = this._clock;

    // Two incommensurate frequencies avoid a visible loop.
    const ox = Math.sin(t * 47.3) * amp;
    const oy = Math.cos(t * 39.7) * amp * 0.9;
    const oz = Math.sin(t * 61.1) * amp * 0.35;

    this.camera.position.set(
      this.cameraBase.x + ox,
      this.cameraBase.y + oy,
      this.cameraBase.z + oz
    );
  }

  /**
   * Emits a burst of particles.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} count
   * @param {number} color Hex.
   * @param {{speed?: number, spread?: number, z?: number}} [options]
   */
  burst(x, y, count, color, options = {}) {
    const { speed = 180, spread = 1.8, z = 24 } = options;
    const c = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      const p = this._nextParticle();
      if (!p) return;

      const angle = this._rand() * Math.PI * 2;
      const velocity = speed * (0.35 + this._rand() * 0.85);
      const elevation = (this._rand() - 0.25) * 130;

      p.x = x + Math.cos(angle) * this._rand() * 10;
      p.y = y + Math.sin(angle) * this._rand() * 10;
      p.z = z + this._rand() * 8;
      p.vx = Math.cos(angle) * velocity * spread * 0.5;
      p.vy = Math.sin(angle) * velocity * spread * 0.5;
      p.vz = elevation;
      p.maxLife = 0.35 + this._rand() * 0.45;
      p.life = p.maxLife;
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      p.size = 0.6 + this._rand() * 0.9;
    }
  }

  // =========================================================================
  // Particles
  // =========================================================================

  _buildParticles() {
    this.maxParticles = 600;

    const geometry = new THREE.BufferGeometry();
    this._positions = new Float32Array(this.maxParticles * 3);
    this._colors = new Float32Array(this.maxParticles * 3);

    // Park inactive particles far below the board.
    for (let i = 0; i < this.maxParticles; i++) {
      this._positions[i * 3 + 1] = -99999;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    geometry.setDrawRange(0, this.maxParticles);

    const material = new THREE.PointsMaterial({
      size: 15,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);

    this._particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this._particles.push({
        x: 0, y: 0, z: -99999,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1,
        r: 0, g: 0, b: 0, size: 1,
      });
    }
    this._particleCursor = 0;
  }

  _nextParticle() {
    // Ring buffer: the oldest particle is recycled when the pool is full.
    const p = this._particles[this._particleCursor];
    this._particleCursor = (this._particleCursor + 1) % this.maxParticles;
    return p;
  }

  _updateParticles(delta) {
    const positions = this._positions;
    const colors = this._colors;
    let dirty = false;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this._particles[i];
      if (p.life <= 0) continue;

      p.life -= delta;
      const alive = p.life > 0;

      if (alive) {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.z += p.vz * delta;
        // Ground drag and gravity: particles arc and settle instead of flying.
        p.vx *= 1 - 2.2 * delta;
        p.vy *= 1 - 2.2 * delta;
        p.vz -= 620 * delta;

        const fade = Math.min(1, (p.life / p.maxLife) * 1.6);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = Math.max(1, p.z);
        colors[i * 3] = p.r * fade;
        colors[i * 3 + 1] = p.g * fade;
        colors[i * 3 + 2] = p.b * fade;
      } else {
        positions[i * 3 + 1] = -99999;
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0;
      }
      dirty = true;
    }

    if (dirty) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }

  // =========================================================================
  // DOM: popups, combo, flashes
  // =========================================================================

  _buildDom() {
    const style = document.createElement('style');
    style.textContent = `
      .juice-layer { position: fixed; inset: 0; pointer-events: none; z-index: 30; overflow: hidden; }
      .juice-pop {
        position: absolute; left: 0; top: 0;
        font: 800 19px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-variant-numeric: tabular-nums;
        color: #fff; white-space: nowrap;
        text-shadow: 0 2px 0 rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.35);
        will-change: transform, opacity;
      }
      .juice-combo {
        position: fixed; left: 50%; top: 86px; transform: translate(-50%, -6px) scale(.8);
        font: 900 34px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-style: italic; letter-spacing: -1px;
        color: #ffe082;
        text-shadow: 0 0 18px rgba(255, 176, 32, .75), 0 3px 0 rgba(120, 60, 0, .35);
        opacity: 0; pointer-events: none; z-index: 31;
        transition: opacity .12s ease-out, transform .12s cubic-bezier(.2, 1.6, .4, 1);
      }
      .juice-combo.show { opacity: 1; transform: translate(-50%, 0) scale(1); }
      .juice-vignette, .juice-flash {
        position: fixed; inset: 0; pointer-events: none; z-index: 25; opacity: 0;
      }
      .juice-vignette {
        background: radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(150, 0, 20, .85) 100%);
      }
    `;
    document.head.appendChild(style);

    this.layer = document.createElement('div');
    this.layer.className = 'juice-layer';
    document.body.appendChild(this.layer);

    this.comboEl = document.createElement('div');
    this.comboEl.className = 'juice-combo';
    document.body.appendChild(this.comboEl);

    this.vignette = document.createElement('div');
    this.vignette.className = 'juice-vignette';
    document.body.appendChild(this.vignette);

    this.flashEl = document.createElement('div');
    this.flashEl.className = 'juice-flash';
    document.body.appendChild(this.flashEl);

    this._popups = [];
    for (let i = 0; i < 28; i++) {
      const el = document.createElement('div');
      el.className = 'juice-pop';
      el.style.display = 'none';
      this.layer.appendChild(el);
      this._popups.push({ el, x: 0, y: 0, z: 0, life: 0, maxLife: 1, rise: 0 });
    }
    this._popupCursor = 0;

    this._flash = { color: null, strength: 0, decay: 0 };
    this._vignetteStrength = 0;
  }

  /**
   * Floating text anchored in the world, projected to the screen every frame.
   *
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} [scale]
   */
  popup(text, x, y, color = '#fff', scale = 1) {
    const pop = this._popups[this._popupCursor];
    this._popupCursor = (this._popupCursor + 1) % this._popups.length;

    pop.el.textContent = text;
    pop.el.style.display = 'block';
    pop.el.style.color = color;
    pop.el.style.fontSize = `${Math.round(19 * scale)}px`;
    pop.x = x;
    pop.y = y;
    pop.z = 34;
    pop.rise = 0;
    pop.maxLife = 0.85;
    pop.life = pop.maxLife;
  }

  showCombo(combo) {
    this.comboEl.textContent = `×${combo}`;
    this.comboEl.classList.add('show');
  }

  hideCombo() {
    this.comboEl.classList.remove('show');
  }

  /**
   * Full-screen colour flash (hurt, awakening).
   *
   * @param {string} color CSS colour.
   * @param {number} strength 0..1.
   * @param {number} duration Seconds.
   */
  flash(color, strength = 1, duration = 0.5) {
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = String(strength);
    this._flash.strength = strength;
    this._flash.decay = strength / Math.max(0.05, duration);
  }

  _updateFlash(delta) {
    if (this._flash.strength > 0) {
      this._flash.strength = Math.max(0, this._flash.strength - this._flash.decay * delta);
      this.flashEl.style.opacity = String(this._flash.strength);
    }
  }

  _updatePopups(delta) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (const pop of this._popups) {
      if (pop.life <= 0) continue;

      pop.life -= delta;
      pop.rise += 46 * delta;

      if (pop.life <= 0) {
        pop.el.style.display = 'none';
        continue;
      }

      this._proj.set(pop.x, pop.y, pop.z + pop.rise).project(this.camera);
      const sx = (this._proj.x * 0.5 + 0.5) * width;
      const sy = (-this._proj.y * 0.5 + 0.5) * height;
      const t = pop.life / pop.maxLife;

      pop.el.style.transform =
        `translate(-50%, -50%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${(0.9 + t * 0.25).toFixed(2)})`;
      pop.el.style.opacity = String(Math.min(1, t * 1.8));
    }
  }
}