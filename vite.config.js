import { defineConfig } from 'vite';
import fs from 'node:fs';

// Injects the sampled ground colour into <meta name="theme-color"> so index.html carries no literal.
const palette = JSON.parse(fs.readFileSync(new URL('./scripts/palette.json', import.meta.url), 'utf8'));
const injectPalette = () => ({
  name: 'inject-palette',
  transformIndexHtml: (html) => html.replaceAll('%BG%', palette['c-bg']),
});

export default defineConfig({
  plugins: [injectPalette()],
  build: { target: 'es2022', cssCodeSplit: false, assetsInlineLimit: 0 },
});
