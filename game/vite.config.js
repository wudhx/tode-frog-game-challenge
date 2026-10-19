import { defineConfig } from 'vite';

/**
 * The repository name doubles as the GitHub Pages sub-path, so production
 * builds are served from https://<user>.github.io/tode-talent-awakening/.
 *
 * During development we keep the base at "/" so `npm run dev` continues to
 * serve the game at http://localhost:5173/ without a trailing folder.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tode-talent-awakening/' : '/',
}));
