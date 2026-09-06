import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, createDeck } from "@/lib/db";
import {
  clearAISettings,
  DEFAULT_MODELS,
  extractTextFromPdf,
  generateCards,
  loadAISettings,
  saveAISettings,
  type AIProvider,
  type AISettings,
  type GeneratedCard,
} from "@/lib/aiGenerate";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700";
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

/** Rough token estimate for the cost warning: ~4 chars per token. */
function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * AI flashcard generator — paste text or upload a PDF, generate cards with
 * a bring-your-own-key LLM call, review/edit, then save to a deck.
 */
export default function AIGenerator({ onDone }: { onDone?: () => void }) {
  /* ------------------------------ Input state ----------------------------- */
  const [sourceText, setSourceText] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState("");

  /* ----------------------------- Settings state --------------------------- */
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* ---------------------------- Generation state -------------------------- */
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cards, setCards] = useState<GeneratedCard[] | null>(null);

  /* ------------------------------ Save state ------------------------------ */
  const decks = useLiveQuery(() => db.decks.orderBy("createdAt").toArray(), []);
  const [saveTarget, setSaveTarget] = useState<"existing" | "new">("new");
  const [existingDeckId, setExistingDeckId] = useState("");
  const [newDeckName, setNewDeckName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Persist settings (incl. API key) to localStorage on change
  useEffect(() => {
    saveAISettings(settings);
  }, [settings]);

  const handlePdf = useCallback(async (file: File) => {
    setError(null);
    setSavedMessage(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    setExtracting(true);
    setPdfName(file.name);
    setExtractProgress("");
    try {
      const text = await extractTextFromPdf(file, (done, total) =>
        setExtractProgress(`Extracting page ${done} of ${total}…`)
      );
      setSourceText(text);
    } catch (err) {
      setPdfName(null);
      setError(err instanceof Error ? err.message : "Failed to read the PDF.");
    } finally {
      setExtracting(false);
      setExtractProgress("");
    }
  }, []);

  /* ------------------------------- Actions -------------------------------- */

  async function handleGenerate() {
    setError(null);
    setWarnings([]);
    setSavedMessage(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await generateCards(sourceText, settings, {
        signal: controller.signal,
      });
      setCards(result.cards);
      setWarnings(result.warnings);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // user cancelled — no error UI
      } else {
        setError(err instanceof Error ? err.message : "Generation failed.");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function updateCard(
    index: number,
    patch: Partial<Pick<GeneratedCard, "front" | "back" | "keep">>
  ) {
    setCards((prev) =>
      prev ? prev.map((c, i) => (i === index ? { ...c, ...patch } : c)) : prev
    );
  }

  async function handleSave() {
    if (!cards) return;
    const kept = cards.filter((c) => c.keep && c.front && c.back);
    if (kept.length === 0) {
      setError("No cards selected — tick at least one card to keep.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let deckId: number;
      let deckName: string;
      if (saveTarget === "existing") {
        const id = Number(existingDeckId);
        const deck = await db.decks.get(id);
        if (!deck) throw new Error("Selected deck no longer exists.");
        deckId = id;
        deckName = deck.name;
      } else {
        deckName = newDeckName.trim() || "AI-generated deck";
        deckId = await createDeck(deckName, "Generated with AI");
      }
      const now = new Date();
      await db.cards.bulkAdd(
        kept.map((c) => ({
          deckId,
          front: c.front,
          back: c.back,
          createdAt: now,
          interval: 0,
          repetitions: 0,
          easeFactor: 2.5,
          dueDate: now,
        }))
      );
      const deck = await db.decks.get(deckId);
      await db.decks.update(deckId, {
        cardCount: (deck?.cardCount ?? 0) + kept.length,
        updatedAt: now,
      });
      setSavedMessage(`Saved ${kept.length} card${kept.length === 1 ? "" : "s"} to “${deckName}”.`);
      setCards(null);
      setSourceText("");
      setPdfName(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cards.");
    } finally {
      setSaving(false);
    }
  }


  /* --------------------------------- Render -------------------------------- */

  const keptCount = cards?.filter((c) => c.keep).length ?? 0;
  const tokenEstimate = estimateTokens(sourceText.length + 800);

  return (
    <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto">
      {/* Cost / privacy notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <strong>Heads-up:</strong> generation calls the AI provider directly from your
        browser using your own API key — you pay the provider for each generation
        (roughly {tokenEstimate.toLocaleString()} tokens for this text). Your key is
        stored in this browser's localStorage only and is never sent to FlashStack.
      </div>

      {/* Source input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">Source text or PDF</label>
          <label className="cursor-pointer text-sm text-indigo-600 hover:underline dark:text-indigo-400">
            {pdfName ? `📄 ${pdfName} (loaded)` : "📄 Upload PDF"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePdf(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="Paste your notes here…"
          rows={6}
          disabled={extracting}
          className={inputCls + " resize-y font-mono text-xs"}
        />
        {extracting && (
          <p className="mt-1 text-xs text-slate-500">{extractProgress || "Opening PDF…"}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {sourceText.length.toLocaleString()} characters
        </p>
      </div>

      {/* API key / provider settings */}
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={settings.provider}
            onChange={(e) => {
              const provider = e.target.value as AIProvider;
              setSettings((s) => ({ ...s, provider, model: DEFAULT_MODELS[provider] }));
            }}
            className={inputCls + " sm:w-36"}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
              placeholder={settings.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
              autoComplete="off"
              className={inputCls + " pr-14"}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:underline"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              clearAISettings();
              setSettings({ provider: "anthropic", apiKey: "", model: DEFAULT_MODELS.anthropic });
            }}
            className={btnGhost}
          >
            Clear key
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-2 text-xs text-slate-500 hover:underline"
        >
          {showAdvanced ? "− Hide" : "+ Show"} model settings
        </button>
        {showAdvanced && (
          <input
            value={settings.model}
            onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
            placeholder="Model id"
            className={inputCls + " mt-2 font-mono text-xs"}
          />
        )}
      </div>

      {/* Generate button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleGenerate()}
          disabled={
            generating || extracting || sourceText.trim().length < 20 || !settings.apiKey.trim()
          }
          className={btnPrimary}
        >
          {generating ? "Generating…" : "✨ Generate Cards"}
        </button>
        {generating && (
          <button onClick={() => abortRef.current?.abort()} className={btnGhost}>
            Cancel
          </button>
        )}
        <span className="text-xs text-slate-400">Max 20 cards per generation</span>
      </div>

      {/* Errors & warnings */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Preview / review generated cards */}
      {cards && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Review generated cards ({keptCount} of {cards.length} selected)
            </h3>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setCards(cards.map((c) => ({ ...c, keep: true })))}
                className="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Select all
              </button>
              <button
                onClick={() => setCards(cards.map((c) => ({ ...c, keep: false })))}
                className="text-slate-500 hover:underline"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {cards.map((card, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 transition ${
                  card.keep
                    ? "border-indigo-300 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20"
                    : "border-slate-200 opacity-60 dark:border-slate-800"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={card.keep}
                    onChange={(e) => updateCard(i, { keep: e.target.checked })}
                    aria-label={`Keep card ${i + 1}`}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="text-xs font-medium text-slate-500">Card {i + 1}</span>
                </div>
                <textarea
                  value={card.front}
                  onChange={(e) => updateCard(i, { front: e.target.value })}
                  rows={2}
                  aria-label={`Front of card ${i + 1}`}
                  className={inputCls + " mb-2 resize-y font-medium"}
                />
                <textarea
                  value={card.back}
                  onChange={(e) => updateCard(i, { back: e.target.value })}
                  rows={2}
                  aria-label={`Back of card ${i + 1}`}
                  className={inputCls + " resize-y text-sm text-slate-600 dark:text-slate-300"}
                />
              </div>
            ))}
          </div>

          {/* Save section */}
          <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={saveTarget === "new"}
                  onChange={() => setSaveTarget("new")}
                  className="accent-indigo-600"
                />
                New deck
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={saveTarget === "existing"}
                  onChange={() => setSaveTarget("existing")}
                  className="accent-indigo-600"
                />
                Existing deck
              </label>
            </div>
            {saveTarget === "new" ? (
              <input
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="Deck name…"
                className={inputCls}
              />
            ) : (
              <select
                value={existingDeckId}
                onChange={(e) => setExistingDeckId(e.target.value)}
                className={inputCls}
              >
                <option value="">Choose a deck…</option>
                {(decks ?? []).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} ({d.cardCount} cards)
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => void handleSave()}
              disabled={saving || keptCount === 0}
              className={btnPrimary + " mt-3 w-full"}
            >
              {saving ? "Saving…" : `Save ${keptCount} card${keptCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {savedMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {savedMessage}
        </div>
      )}
    </div>
  );
}


