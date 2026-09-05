# FlashStack

A local-first flashcard app built with Astro, TypeScript, Tailwind CSS v4, and React islands.

## Features

- **Local-first** — all data (decks, cards, review logs) stored in IndexedDB via [Dexie](https://dexie.org)
- **Spaced repetition** — SM-2 algorithm in `src/lib/srs.ts`
- **PWA / offline** — via `@vite-pwa/astro` with auto-updating service worker
- **Dark/light theme** — toggle persisted to localStorage, respects `prefers-color-scheme`
- **Bulk import** — paste cards as `front :: back`, TSV, or `front - back` lines

## Structure

```
src/
  pages/        Static marketing page (/) and app shell (/app)
  components/   React islands (DeckEditor, ReviewSession, ThemeToggle)
  layouts/      BaseLayout with theme bootstrap
  lib/          db.ts (Dexie + models), srs.ts (SM-2), parser helpers
```

## Commands

| Command           | Action                                    |
| :---------------- | :---------------------------------------- |
| `npm install`     | Install dependencies                      |
| `npm run dev`     | Start dev server at `localhost:4321`      |
| `npm run build`   | Build production site to `./dist/`        |
| `npm run preview` | Preview the production build locally      |

## Notes

- No backend, no server routes. The only future network call will be an optional
  client-side LLM integration for card generation (add later).
- A placeholder `favicon.svg` is used as the PWA icon; replace it with real PNG icons
  in `public/` and update the manifest in `astro.config.mjs` before shipping.
