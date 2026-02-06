import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'MOSY Operator',
        short_name: 'MOSY',
        description: 'Mobile Crane Operator Safety & Productivity System',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        theme_color: '#0A0F1C',
        background_color: '#0A0F1C',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/192\.168\.4\.\d+/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mosy-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mosy/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@mosy/mqtt-schemas': path.resolve(__dirname, '../../packages/mqtt-schemas/src/index.ts'),
    },
  },
  server: {
    port: 3001,
  },
});
