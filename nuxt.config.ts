export default defineNuxtConfig({
  compatibilityDate: '2026-09-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css', '~/assets/css/visual-assets.css'],
  app: { head: { title: 'ShowUp', link: [{ rel: 'icon', type: 'image/svg+xml', href: '/showup-icon.svg' }], meta: [
    { name: 'theme-color', content: '#10251e' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: 'ShowUp' },
    { property: 'og:description', content: 'Event commitments and paid admission with wallet-signed check-in.' },
    { property: 'og:image', content: '/images/showup-social-card.webp' },
    { name: 'twitter:card', content: 'summary_large_image' }
  ] } },
  nitro: { preset: process.env.NITRO_PRESET || (process.env.VERCEL ? 'vercel' : 'node-server'), esbuild: { options: { target: 'es2022' } }, externals: { external: ['@nimiq/core', '@libsql/client'] } },
  vite: { build: { target: 'es2022' } },
  typescript: { strict: true },
});
