/**
 * Persistent local high-score table.
 *
 * Scores live in `localStorage`, so the board survives page reloads without
 * any backend. Every storage call is wrapped in try/catch: browsers throw in
 * private mode and when the quota is exhausted, and a missing scoreboard
 * should never stop the game from running.
 */

/** Where the table is stored. */
const STORAGE_KEY = 'tode-frog-highscores';
/** How many runs the board remembers. */
export const MAX_ENTRIES = 5;

/**
 * One recorded run.
 * @typedef {{ score: number, date: string }} ScoreEntry
 */
export class HighScores {
  constructor() {
    /** @type {ScoreEntry[]} Sorted best-first. */
    this.entries = this.load();
  }

  /**
   * Reads and sanitises the stored table.
   *
   * @returns {ScoreEntry[]} Best-first list, at most MAX_ENTRIES long.
   */
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((entry) => entry && Number.isFinite(entry.score))
        .map((entry) => ({
          score: Math.floor(entry.score),
          date: typeof entry.date === 'string' ? entry.date : '',
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    } catch {
      // Corrupt payload or storage blocked — start from an empty board.
      return [];
    }
  }

  /** Writes the table back out. Silently gives up if storage is unusable. */
  save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // Nothing we can do; the in-memory table still works for this session.
    }
  }

  /**
   * The best score ever recorded.
   *
   * @returns {number} Zero when the board is empty.
   */
  get best() {
    return this.entries.length > 0 ? this.entries[0].score : 0;
  }

  /**
   * Records a finished run.
   *
   * @param {number} score The run's final score.
   * @returns {{ rank: number, isBest: boolean, madeBoard: boolean }}
   *   `rank` is 1-based, or 0 if the run did not make the board.
   */
  submit(score) {
    const value = Math.floor(score);
    const previousBest = this.best;
    const isBest = value > previousBest;

    const entry = { score: value, date: new Date().toISOString().slice(0, 10) };

    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score);
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.save();

    const index = this.entries.indexOf(entry);
    return {
      rank: index >= 0 ? index + 1 : 0,
      isBest,
      madeBoard: index >= 0,
    };
  }

  /** Wipes the board (not wired to any key, kept for completeness). */
  clear() {
    this.entries = [];
    this.save();
  }
}
