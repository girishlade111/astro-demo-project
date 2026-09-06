/* Validation harness for src/lib/aiGenerate.ts */
import { extractCardsFromResponse, buildPrompt, PROMPT_TEMPLATE } from "./aiGenerate.bundle.mjs";
import assert from "node:assert";

// 1. Clean JSON array
let r = extractCardsFromResponse(
  JSON.stringify([
    { front: "What is photosynthesis?", back: "Process converting light to chemical energy" },
    { front: "Define osmosis", back: "Water movement across a semipermeable membrane" },
  ]),
  20
);
assert.equal(r.cards.length, 2);
assert.equal(r.warnings.length, 0);
assert.equal(r.cards[0].keep, true);
console.log("1. clean array OK");

// 2. Markdown-fenced JSON with commentary
r = extractCardsFromResponse(
  'Here are your cards!\n```json\n[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"}]\n```\nHope this helps!',
  20
);
assert.equal(r.cards.length, 2);
assert.ok(r.warnings.some((w) => w.includes("cleanup")));
console.log("2. fenced+commentary OK");

// 3. Wrapper object {"cards":[...]} + trailing commas
r = extractCardsFromResponse(
  '{"cards":[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2",},],}',
  20
);
assert.equal(r.cards.length, 2);
console.log("3. wrapper+trailing commas OK");

// 4. Alternate field names + dedupe + malformed skip
r = extractCardsFromResponse(
  '[{"question":"Q1","answer":"A1"},{"q":"Q1","a":"A1"},{"front":"","back":"x"},{"front":"Q3","back":"A3"},{"bad":1}]',
  20
);
assert.equal(r.cards.length, 2); // Q1 dup skipped, empty front skipped, bad skipped
assert.ok(r.warnings.some((w) => w.includes("skipped")));
console.log("4. dedupe+skip OK");

// 5. Max cards cap
const many = Array.from({ length: 30 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }));
r = extractCardsFromResponse(JSON.stringify(many), 20);
assert.equal(r.cards.length, 20);
console.log("5. max-20 cap OK");

// 6. Single object fallback
r = extractCardsFromResponse('{"front":"Only Q","back":"Only A"}', 20);
assert.equal(r.cards.length, 1);
console.log("6. single object OK");

// 7. Total garbage → throws
assert.throws(() => extractCardsFromResponse("I cannot help with that.", 20));
console.log("7. garbage throws OK");

// 8. Prompt template substitution
const p = buildPrompt("My notes about cells.");
assert.ok(p.includes("My notes about cells."));
assert.ok(p.includes('{"front"'));
assert.ok(p.includes("Max 20 cards"));
assert.ok(p === PROMPT_TEMPLATE.replace("{TEXT}", "My notes about cells."));
console.log("8. prompt OK");

// 9. Placeholder values rejected
r = extractCardsFromResponse('[{"front":"Q","back":"n/a"},{"front":"Q2","back":"-"}]', 20);
assert.equal(r.cards.length, 0);
console.log("9. placeholder rejection OK");

console.log("ALL AI-GENERATE CHECKS PASSED");
