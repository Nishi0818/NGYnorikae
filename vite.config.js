import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: '名古屋市営地下鉄 乗り換え案内',
        short_name: '地下鉄乗換案内',
        description: '名古屋市営地下鉄の乗り換え案内（オフライン対応）',
        start_url: '.',
        display: 'standalone',
        background_color: '#f7f6f4',
        theme_color: '#e0935c',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
