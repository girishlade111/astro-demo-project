import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";

// https://astro.build/config
export default defineConfig({
  site: "https://flashstack.app",
  integrations: [
    react(),
    AstroPWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "FlashStack",
        short_name: "FlashStack",
        description: "A local-first flashcard app with spaced repetition. Your data stays on your device.",
        theme_color: "#4f46e5",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/app",
        scope: "/",
        lang: "en",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
        categories: ["education", "productivity"],
        screenshots: [],
        shortcuts: [
          {
            name: "Start Studying",
            short_name: "Study",
            description: "Open the app and start reviewing cards",
            url: "/app",
          },
        ],
      },
      workbox: {
        navigateFallback: "/app",
        globPatterns: ["**/*.{js,css,html,svg,woff2,wasm}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.(anthropic|openai)\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              networkTimeoutSeconds: 30,
              cacheName: "ai-api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
