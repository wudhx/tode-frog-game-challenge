/**
 * Procedural sound effects for the game.
 *
 * Every sound is synthesised on the fly with the Web Audio API — no audio
 * files are shipped with the project. That keeps the bundle tiny and, just as
 * importantly, means the game contains no third-party or commercially
 * released recordings.
 *
 * Browsers refuse to start audio until the user has interacted with the page,
 * so `unlock()` is wired to the first key press or click. Until that happens
 * every sound call is a silent no-op.
 */
class Sound {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.master = null;

    /** Global volume for all effects (0–1). */
    this.volume = 0.3;

    /** Muting toggles all effects without tearing down the context. */
    this.muted = false;

    this.bindUnlock();
  }

  /**
   * Creates the AudioContext on the first user gesture, which is the only
   * moment a browser will allow audio to start.
   */
  bindUnlock() {
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  /**
   * Lazily builds the audio graph. Safe to call repeatedly.
   */
  unlock() {
    if (this.ctx) {
      // Some browsers suspend the context when the tab is backgrounded.
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return; // Web Audio unavailable — stay silent.

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  /**
   * Plays a single synthesised tone.
   *
   * @param {object} options Tone description.
   * @param {number} options.freq Starting frequency in Hz.
   * @param {number} [options.endFreq] Frequency to glide to (optional).
   * @param {number} options.duration Length of the tone in seconds.
   * @param {OscillatorType} [options.type] Waveform.
   * @param {number} [options.gain] Peak gain, 0–1.
   * @param {number} [options.delay] Seconds to wait before starting.
   */
  tone({ freq, endFreq, duration, type = 'sine', gain = 1, delay = 0 }) {
    if (!this.ctx || this.muted) return;

    const start = this.ctx.currentTime + delay;
    const stop = start + duration;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq && endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, stop);
    }

    const env = this.ctx.createGain();
    // Quick attack, exponential decay — reads as a short "blip".
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, stop);

    osc.connect(env);
    env.connect(this.master);

    osc.start(start);
    osc.stop(stop + 0.02);
  }

  /** Plays a short arpeggio from a list of frequencies. */
  arpeggio(freqs, { step = 0.08, duration = 0.14, type = 'sine', gain = 0.7, offset = 0 } = {}) {
    freqs.forEach((freq, index) => {
      this.tone({ freq, duration, type, gain, delay: offset + index * step });
    });
  }

  // -------------------------------------------------------------------------
  // Game events
  // -------------------------------------------------------------------------

  /** A springy upward blip for a hop. */
  jump() {
    this.tone({ freq: 340, endFreq: 660, duration: 0.11, type: 'triangle', gain: 0.5 });
  }

  /** A falling sweep for the attack shockwave. */
  attack() {
    this.tone({ freq: 760, endFreq: 180, duration: 0.2, type: 'sawtooth', gain: 0.4 });
    this.tone({ freq: 380, endFreq: 90, duration: 0.24, type: 'sine', gain: 0.35 });
  }

  /** A bright two-note chirp when a fly is swallowed. */
  kill() {
    this.tone({ freq: 900, endFreq: 1500, duration: 0.08, type: 'square', gain: 0.3 });
    this.tone({ freq: 1500, endFreq: 2100, duration: 0.09, type: 'square', gain: 0.26, delay: 0.07 });
  }

  /** A dull thud for losing a heart. */
  hurt() {
    this.tone({ freq: 320, endFreq: 110, duration: 0.2, type: 'square', gain: 0.38 });
    this.tone({ freq: 150, endFreq: 65, duration: 0.26, type: 'triangle', gain: 0.34 });
  }

  /** A short chime for gaining a heart. */
  heal() {
    this.arpeggio([659, 880, 1175], { step: 0.06, duration: 0.14, type: 'sine', gain: 0.5 });
  }

  /** A deep boom for the Bomb pickup. */
  bomb() {
    this.tone({ freq: 190, endFreq: 38, duration: 0.6, type: 'sawtooth', gain: 0.5 });
    this.tone({ freq: 95, endFreq: 28, duration: 0.85, type: 'square', gain: 0.38 });
  }

  /** A long descending growl for a lost run. */
  gameOver() {
    this.tone({ freq: 420, endFreq: 80, duration: 0.85, type: 'sawtooth', gain: 0.45 });
    this.tone({ freq: 210, endFreq: 60, duration: 1.0, type: 'triangle', gain: 0.35, delay: 0.08 });
  }

  /** An ascending major triad for collecting a power-up. */
  powerUp() {
    this.arpeggio([523, 659, 784], { step: 0.07, duration: 0.13, type: 'sine', gain: 0.5 });
  }

  /** A protective bell when the shield is up. */
  shield() {
    this.tone({ freq: 720, endFreq: 1100, duration: 0.18, type: 'sine', gain: 0.4 });
    this.tone({ freq: 1100, endFreq: 1500, duration: 0.22, type: 'sine', gain: 0.3, delay: 0.18 });
  }

  /** A heavy thunk when an insect hits a house. */
  houseHit() {
    this.tone({ freq: 140, endFreq: 60, duration: 0.12, type: 'square', gain: 0.4 });
    this.tone({ freq: 90, endFreq: 30, duration: 0.16, type: 'sawtooth', gain: 0.25, delay: 0.04 });
  }

  /**
   * A celebratory fanfare for beating the previous best score.
   *
   * @param {number} [offset] Seconds to wait, so it can follow the
   *   game-over sting instead of colliding with it.
   */
  newBest(offset = 0) {
    this.arpeggio([523, 659, 784, 1047, 1319], {
      step: 0.09,
      duration: 0.16,
      type: 'triangle',
      gain: 0.55,
      offset,
    });
  }
}

/**
 * Shared singleton. Importing this module anywhere gives access to the same
 * audio graph, so components never have to thread a Sound instance around.
 */
export const sound = new Sound();
