// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
// Fully static build, deployed to GitHub Pages (.github/workflows/deploy.yml).
// Content comes from src/content/ and is edited through Pages CMS (.pages.yml).
export default defineConfig({
  site: 'https://devitska.com',
  output: 'static',
  // On some Windows setups (especially when working from other drives),
  // filesystem events can be unreliable and dev HMR may not pick up changes.
  // Polling is slightly heavier but makes updates consistent.
  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 200,
      },
    },
  },
});
