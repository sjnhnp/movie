// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';

const isCloudflare = !!process.env.CF_PAGES;
const isNetlify = !!process.env.NETLIFY;

function getAdapter() {
  if (isCloudflare) return cloudflare();
  if (isNetlify) return netlify();
  return node({ mode: 'standalone' });
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  build: {
    format: 'directory'
  },
  vite: {
    plugins: [tailwindcss()]
  },
  adapter: getAdapter()
});