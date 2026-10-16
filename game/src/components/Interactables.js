/**
 * On-screen prompts for the world's interactive points (houses, bushes,
 * flowers, ponds, trees).
 *
 * The game is full of props the player can stand on, hide in, harvest from
 * or hide behind — but if they don't know what each one does, it reads as
 * wallpaper. Two HUD elements carry the information:
 *
 * 1. A persistent "proximity" bar at the top of the screen. The single line
 *    updates to the most relevant prop the hero is currently standing near,
 *    so he always knows what each cluster of props can do for him.
 *
 * 2. A short-lived toast (also top of the screen, but higher) that confirms
 *    a triggered effect ("+1 ❤ from a flower", "Hide acquired"…).
 *
 * Both are HTML elements managed by the singleton `hud` instance.
 */

const ICONS = {
  house: '🏠',
  bush: '🌿',
  flower: '🌸',
  pond: '💧',
  tree: '🌲',
  heart: '❤',
  speed: '⚡',
  range: '◎',
  freeze: '❄',
  shield: '🛡',
  bomb: '💣',
};

/**
 * Friendly descriptions for each interactive prop. These are the lines the
 * proximity bar shows when the hero stands within range of the prop.
 */
const PROXIMITY = {
  house: {
    text: 'House — walk in for safety + 1 ❤',
    priority: 100,
  },
  bush: {
    text: 'Bush — crouch inside to hide (4s)',
    priority: 60,
  },
  flower: {
    text: 'Flower — stay 2s to bloom a power-up',
    priority: 50,
  },
  pond: {
    text: 'Pond — wade in for a random bonus',
    priority: 70,
  },
  tree: {
    text: 'Tree — break line of sight to drop aggro',
    priority: 40,
  },
};

/**
 * Centralised HUD manager. One instance is created in main.js and reused.
 */
export class InteractionHud {
  constructor() {
    this.buildProximity();
    this.buildToast();
  }

  /** Builds the persistent "what is nearby" bar. */
  buildProximity() {
    this.proximityEl = document.createElement('div');
    this.proximityEl.className = 'interaction-proximity';
    this.proximityEl.style.display = 'none';
    document.body.appendChild(this.proximityEl);
    this.proximityIcon = document.createElement('span');
    this.proximityIcon.className = 'interaction-icon';
    this.proximityText = document.createElement('span');
    this.proximityText.className = 'interaction-text';
    this.proximityEl.append(this.proximityIcon, this.proximityText);
    this.currentKey = null;
  }

  /** Builds the transient effect confirmation toast. */
  buildToast() {
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'interaction-toast';
    this.toastEl.style.display = 'none';
    document.body.appendChild(this.toastEl);
    this.toastTimer = null;
  }

  /**
   * Update the persistent proximity bar. Only the highest-priority prop the
   * hero is touching wins, so a flower growing under a tree shows the tree
   * hint (more important right now), while a flower next to a house shows
   * the house hint.
   *
   * @param {string|null} key One of PROXIMITY's keys, or null to hide.
   */
  setProximity(key) {
    if (key === this.currentKey) return;
    this.currentKey = key;
    if (!key) {
      this.proximityEl.style.display = 'none';
      return;
    }
    const def = PROXIMITY[key];
    if (!def) {
      this.proximityEl.style.display = 'none';
      return;
    }
    this.proximityIcon.textContent = ICONS[key] || '';
    this.proximityText.textContent = def.text;
    this.proximityEl.style.display = 'flex';
  }

  /**
   * Pop a one-shot toast confirming that something just happened.
   *
   * @param {string} message Short, sentence-case line.
   * @param {string} [iconKey] Icon key from the ICONS table.
   * @param {string} [color] CSS colour for the icon and title.
   * @param {number} [duration] How long to keep the toast on screen (ms).
   */
  showAction(message, iconKey = '', color = '#ffe066', duration = 2000) {
    this.toastEl.innerHTML = [
      `<span class="interaction-toast-icon" style="color:${color}">${ICONS[iconKey] || iconKey}</span>`,
      `<span class="interaction-toast-text">${message}</span>`,
    ].join('');
    this.toastEl.style.display = 'flex';
    this.toastEl.classList.remove('is-shown');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('is-shown');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, duration);
  }
}

/** The shared instance. main.js imports and uses it. */
export const hud = new InteractionHud();

/** Priority helper used by the caller when picking the most relevant prop. */
export function highestPriorityKey(presentKeys) {
  let best = null;
  let bestPriority = -Infinity;
  for (const key of presentKeys) {
    const def = PROXIMITY[key];
    if (!def) continue;
    if (def.priority > bestPriority) {
      bestPriority = def.priority;
      best = key;
    }
  }
  return best;
}
