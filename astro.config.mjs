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
        description: "A local-first flashcard app",
        theme_color: "#4f46e5",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/app",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      workbox: {
        navigateFallback: "/app",
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
