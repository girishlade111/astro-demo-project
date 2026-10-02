# FlashStack

A **local-first flashcard app** with spaced repetition, built with **Astro**, **TypeScript**, **Tailwind CSS v4**, and **React islands**. All data stays on the user's device — no backend, no accounts, no tracking.

## ✨ Features

- **Local-first** — all data (decks, cards, review logs) stored in IndexedDB via [Dexie](https://dexie.org)
- **Spaced repetition** — SM-2 algorithm in `src/lib/srs.ts` (with smoke tests in `sm2.smoke-test.ts`)
- **PWA / offline** — installable app with auto-updating service worker via `@vite-pwa/astro`
- **Dark/light theme** — toggle persisted to localStorage, respects `prefers-color-scheme`
- **Bulk import** — paste cards as `front :: back`, TSV, or `front - back` lines
- **Anki import/export** — import Anki decks, export to `.apkg`/CSV
- **PDF import** — extract text from PDFs via `pdfjs-dist` to build cards
- **AI card generation** — optional client-side hook (`src/lib/aiGenerate.ts`) for LLM-powered card generation
- **Export** — CSV/TSV/TXT export via JSZip + PapaParse

## 🛠️ Tech Stack

- [Astro](https://astro.build/) 5.x (static output) + `@astrojs/react` islands
- [Tailwind CSS](https://tailwindcss.com/) v4 via `@tailwindcss/vite`
- React 19 components (`DeckEditor`, `DeckManager`, `ReviewSession`, `CardEditor`, `Settings`, `Exporter`, `AnkiImporter`, `AIGenerator`)
- [Dexie](https://dexie.org) + `dexie-react-hooks` for IndexedDB
- `@vite-pwa/astro` (Workbox) for offline/PWA
- TypeScript 5.7

## 🚀 Quick Start

```bash
git clone https://github.com/girishlade111/astro-demo-project.git
cd astro-demo-project
npm install
npm run dev        # dev server at localhost:4321
```

### Build for production

```bash
npm run build      # static output -> ./dist/
npm run preview    # preview the production build locally
```

## 📁 Project Structure

```text
src/
├── pages/            / (landing page) and /app (app shell)
├── components/       React islands: DeckManager, DeckEditor, ReviewSession,
│                     CardEditor, Settings, ThemeToggle, Exporter,
│                     AnkiImporter, AIGenerator, DonateButton
├── layouts/          BaseLayout with theme bootstrap
├── lib/              db.ts (Dexie models), srs.ts (SM-2), sm2.ts,
│                     parser helpers, aiGenerate.ts, ankiImport/Export
└── styles/           Tailwind v4 styles
```

## 🌐 Deploy

Fully static — deploys anywhere static hosting works. The `base` path in `astro.config.mjs` is set for the GitHub Pages project URL (`/astro-demo-project/`); adjust it when hosting elsewhere.

**Notes before shipping widely:**
- Replace the placeholder `public/favicon.svg` with real PNG icons and update the PWA manifest in `astro.config.mjs`
- The optional LLM hook (`src/lib/aiGenerate.ts`) needs an API key configured at runtime — nothing is invented by default

## 🤝 Contributing

Issues and pull requests are welcome:

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit, push, and open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built by [Girish Lade](https://ladestack.in) — part of the [LadeStack](https://ladestack.in) open-source family.
