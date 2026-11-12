import { defineConfig } from 'astro/config';
export default defineConfig({ site: process.env.SITE_URL || 'https://evonymasters.jaynmegepicadventure.workers.dev', output: 'static' });
