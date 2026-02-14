// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

export default defineConfig({
  output: 'server',
  build: {
    format: 'file',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: netlify(),
});
