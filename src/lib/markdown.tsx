import type { ReactNode } from "react";

/**
 * Minimal, safe markdown renderer for flashcard faces.
 * Supported syntax:
 *   **bold**          -> <strong>
 *   *italic*          -> <em>
 *   `code`            -> <code>
 *   ![alt](https://…) -> <img>
 * All other text is rendered as-is (React escapes it — no HTML injection).
 */

const TOKEN_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(!\[[^\]\n]*\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("!")) {
      const m = token.match(/!\[([^\]]*)\]\(([^)\s]+)\)/);
      if (m) {
        nodes.push(
          <img
            key={key}
            src={m[2]}
            alt={m[1] || ""}
            loading="lazy"
            className="mx-auto my-2 max-h-64 max-w-full rounded-lg"
          />
        );
      }
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/** Render a markdown string to React nodes (paragraphs separated by blank lines). */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.trim().split(/\n\s*\n/);
  return (
    <div className={className}>
      {paragraphs.map((para, pIdx) => (
        <p key={pIdx} className="whitespace-pre-wrap">
          {para.split("\n").map((line, lIdx) => (
            <span key={lIdx}>
              {renderInline(line, `${pIdx}-${lIdx}`)}
              {lIdx < para.split("\n").length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
