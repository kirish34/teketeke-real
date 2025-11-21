import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "tt-staff-images",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "tt-staff-pages",
              networkTimeoutSeconds: 8
            }
          }
        ]
      },
      manifest: {
        name: "TekeTeke SACCO Staff Console",
        short_name: "TekeTeke Staff",
        id: "/",
        scope: "/",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f7fb",
        theme_color: "#0ea5e9",
        description:
          "Mobile-first console for SACCO staff to track and confirm daily fees.",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ],
        shortcuts: [
          {
            name: "Open Today",
            short_name: "Today",
            url: "/",
            icons: [
              {
                src: "icons/icon-192.png",
                sizes: "192x192",
                type: "image/png"
              }
            ]
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      // Local dev helper so the PWA can call the existing backend
      // without dealing with cross-origin/CORS. Any /u or /api calls
      // during `npm run dev` will be forwarded to the Node server.
      "/u": {
        target: "http://localhost:5001",
        changeOrigin: true
      },
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist"
  }
});
