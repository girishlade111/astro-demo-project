/**
 * AI flashcard generation for FlashStack — bring-your-own-API-key.
 *
 * The user's API key is stored in localStorage ONLY and is sent directly from
 * the browser to the chosen provider (Anthropic / OpenAI). Nothing passes
 * through any FlashStack server. Client-side only by design.
 *
 * PDF text extraction uses pdf.js (pdfjs-dist) fully client-side.
 */
import * as pdfjs from "pdfjs-dist";
// Vite serves the worker as a URL asset
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/* --------------------------------- Types ---------------------------------- */

export type AIProvider = "anthropic" | "openai";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

/** A generated card awaiting user review before saving. */
export interface GeneratedCard {
  front: string;
  back: string;
  /** User selection — whether to keep this card when saving */
  keep: boolean;
}

export interface GenerateResult {
  cards: GeneratedCard[];
  /** Non-fatal notes, e.g. "trailing text after JSON was ignored" */
  warnings: string[];
}

/* ------------------------- Settings (localStorage) ------------------------ */

const SETTINGS_KEY = "flashstack.ai.settings";

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
};

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AISettings>;
      return {
        provider: parsed.provider === "openai" ? "openai" : "anthropic",
        apiKey: parsed.apiKey ?? "",
        model: parsed.model || DEFAULT_MODELS[parsed.provider === "openai" ? "openai" : "anthropic"],
      };
    }
  } catch {
    // corrupted settings — fall through to defaults
  }
  return { provider: "anthropic", apiKey: "", model: DEFAULT_MODELS.anthropic };
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAISettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}

/* -------------------------------- Prompt ---------------------------------- */

export const PROMPT_TEMPLATE = `You are a flashcard generator. Extract key concepts from the text below and generate flashcard Q&A pairs.

Rules:
- Return ONLY a JSON array — no markdown fences, no commentary.
- Each element: {"front": "question or prompt", "back": "concise answer"}.
- Focus on testable facts, definitions, and relationships.
- Max 20 cards per generation.
- Fronts must be answerable without seeing the source text.

Text:
"""
{TEXT}
"""`;

export function buildPrompt(text: string): string {
  return PROMPT_TEMPLATE.replace("{TEXT}", text.trim());
}

/* ----------------------------- PDF extraction ----------------------------- */

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extract text from a PDF file entirely client-side.
 * Throws with a friendly message on encrypted/corrupt files.
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (pagesDone: number, pagesTotal: number) => void | Promise<void>
): Promise<string> {
  let pdf;
  let loadingTask;
  try {
    loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    pdf = await loadingTask.promise;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException" || name === "InvalidPDFException") {
      throw new Error(
        "This PDF could not be read — it may be password-protected or corrupt."
      );
    }
    throw new Error("Failed to open the PDF. Please try a different file.");
  }

  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // pdf.js text items carry transform positions; rebuild line breaks when
    // the baseline jumps, otherwise join with spaces.
    let pageText = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = "transform" in item ? (item.transform?.[5] ?? null) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        pageText += "\n";
      } else if (pageText && !pageText.endsWith("\n")) {
        pageText += " ";
      }
      pageText += item.str;
      if (y !== null) lastY = y;
    }
    chunks.push(pageText.trim());
    page.cleanup();
    await onProgress?.(i, pdf.numPages);
  }
  await loadingTask?.destroy();

  const text = chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error(
      "No text could be extracted from this PDF (it may be a scanned image)."
    );
  }
  return text;
}


/* ------------------------------ LLM providers ------------------------------ */

const MAX_SOURCE_CHARS = 60_000; // keep prompt (and cost) bounded

/**
 * Generate flashcards from source text using the user's chosen provider/key.
 * Throws Error with a user-friendly message; malformed model output is
 * salvaged where possible (see extractCardsFromResponse).
 */
export async function generateCards(
  sourceText: string,
  settings: AISettings,
  options?: { signal?: AbortSignal; maxCards?: number }
): Promise<GenerateResult> {
  const { provider, apiKey, model } = settings;
  if (!apiKey.trim()) {
    throw new Error("Please enter your API key first.");
  }
  const text = sourceText.trim();
  if (text.length < 20) {
    throw new Error("Please provide at least a few sentences of source text.");
  }

  const truncated = text.length > MAX_SOURCE_CHARS;
  const prompt = buildPrompt(
    truncated ? text.slice(0, MAX_SOURCE_CHARS) + "\n…[truncated]" : text
  );

  const raw = await (provider === "anthropic"
    ? callAnthropic(prompt, apiKey, model, options?.signal)
    : callOpenAI(prompt, apiKey, model, options?.signal));

  const { cards, warnings } = extractCardsFromResponse(raw, options?.maxCards ?? 20);
  if (truncated) {
    warnings.push(
      `Source text was long — only the first ${MAX_SOURCE_CHARS.toLocaleString()} characters were used.`
    );
  }
  if (cards.length === 0) {
    throw new Error(
      "The model did not return any usable cards. Try rephrasing your text or regenerating."
    );
  }
  return { cards, warnings };
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Network error reaching Anthropic. Check your connection.");
  }
  return handleProviderResponse(res, "Anthropic");
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Network error reaching OpenAI. Check your connection.");
  }
  return handleProviderResponse(res, "OpenAI");
}

async function handleProviderResponse(res: Response, provider: string): Promise<string> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      // ignore body parse errors
    }
    if (res.status === 401) throw new Error(`Invalid ${provider} API key.`);
    if (res.status === 429) {
      throw new Error(`${provider} rate limit reached — wait a moment and try again.`);
    }
    throw new Error(`${provider} API error (${res.status})${detail ? `: ${detail}` : "."}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  // Anthropic shape
  const anthropicText = data.content?.map((c) => c.text ?? "").join("");
  // OpenAI shape
  const openaiText = data.choices?.[0]?.message?.content;
  const text = anthropicText || openaiText || "";
  if (!text) throw new Error(`${provider} returned an empty response.`);
  return text;
}

/* --------------------------- Response JSON parsing ------------------------ */

/**
 * Robustly extract {front, back} pairs from an LLM response.
 * Handles: clean JSON arrays, ```json fences, objects like {"cards":[…]},
 * trailing commentary, and single objects. Deduplicates by front text.
 */
export function extractCardsFromResponse(
  raw: string,
  maxCards: number
): { cards: GeneratedCard[]; warnings: string[] } {
  const warnings: string[] = [];
  let data: unknown = null;
  let salvaged = false;

  // 1. Strip markdown code fences if present
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
    salvaged = true;
  }

  // 2. Slice to the outermost JSON construct (handles trailing commentary)
  const starts = [cleaned.indexOf("["), cleaned.indexOf("{")].filter((i) => i >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (start >= 0 && end > start) {
    const sliced = cleaned.slice(start, end + 1);
    try {
      data = JSON.parse(sliced);
    } catch {
      // 3. Last resort: common LLM JSON mistakes — trailing commas
      try {
        data = JSON.parse(sliced.replace(/,\s*([\]}])/g, "$1"));
        salvaged = true;
      } catch {
        data = null;
      }
    }
  }

  // Unwrap {"cards": [...]} style wrappers, or treat as a single card object
  let list: unknown = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const wrapper = obj.cards ?? obj.flashcards ?? obj.items ?? obj.data;
    if (Array.isArray(wrapper)) {
      list = wrapper;
      salvaged = true;
    } else {
      list = [data];
      salvaged = true;
    }
  }

  if (!Array.isArray(list)) {
    throw new Error("Could not find a card list in the model's response.");
  }
  if (salvaged) {
    warnings.push("The model's response needed cleanup — please review the cards carefully.");
  }

  const cards: GeneratedCard[] = [];
  const seenFronts = new Set<string>();
  let skipped = 0;

  for (const entry of list) {
    if (cards.length >= maxCards) {
      skipped++;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      skipped++;
      continue;
    }
    const obj = entry as Record<string, unknown>;
    const front = normalizeField(obj.front ?? obj.question ?? obj.q);
    const back = normalizeField(obj.back ?? obj.answer ?? obj.a);
    if (!front || !back) {
      skipped++;
      continue;
    }
    const key = front.toLowerCase();
    if (seenFronts.has(key)) {
      skipped++;
      continue;
    }
    seenFronts.add(key);
    cards.push({ front, back, keep: true });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} malformed/duplicate item(s) from the response were skipped.`);
  }
  return { cards, warnings };
}

function normalizeField(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  // Reject placeholder-ish values
  if (!text || /^(n\/?a|none|-+)$/i.test(text)) return "";
  return text;
}

