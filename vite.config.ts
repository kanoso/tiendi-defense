import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the built site works from any folder: GitHub Pages serves
  // it under /<repository>/ instead of the root of the domain.
  base: './',
});
