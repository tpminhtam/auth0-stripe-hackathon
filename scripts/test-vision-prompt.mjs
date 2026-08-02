/**
 * Exercises the REAL SYSTEM_PROMPT out of lib/vision.ts against the pinned
 * model, using the demo's exact spoken lines. Run with:
 *   node --env-file=.env.local scratchpad/test-prompt.mjs
 * No image needed — this checks quantity honoring, price bands and JSON shape.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve relative to THIS file, never an absolute path — the repo was copied
// to a second checkout on gameday and a hardcoded path silently tested the old
// one for hours.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'vision.ts'), 'utf8');
const match = source.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!match) {
  console.error('Could not extract SYSTEM_PROMPT from lib/vision.ts');
  process.exit(1);
}
const SYSTEM_PROMPT = match[1];

const key = process.env.OPENROUTER_API_API_KEY || process.env.OPENROUTER_PLAN_API_KEY || '';
const model = process.env.SAYSO_VISION_MODEL;
if (!key) {
  console.error('No OpenRouter key in env.');
  process.exit(1);
}
console.log(`model: ${model}\nprompt: ${SYSTEM_PROMPT.length} chars\n`);

const CASES = [
  {
    name: 'cheap beat — stated budget must win, lands under the $100 cap',
    transcript: 'get me one of these water bottles, under thirty dollars',
    lens: ['insulated water bottle (the purchase target)', 'table (context, ok)', 'person (context, ok)'],
    expect: 'total <= 30',
  },
  {
    name: 'wall beat — a single desirable item clears $100 on its own',
    transcript: 'get me this backpack',
    lens: ['black canvas laptop backpack (the purchase target)', 'laptop (product, ok)', 'person (context, ok)'],
    expect: 'total between 100 and 1000',
  },
  {
    name: 'wall beat, quantity as the lever — the deterministic path over the cap',
    transcript: 'get me two of these bags',
    lens: ['tan leather crossbody bag (the purchase target)', 'person (context, ok)'],
    expect: 'qty 2, total between 100 and 1000',
  },
  {
    name: 'no quantity stated — model picks, must not bust the $1,000 Team cap',
    transcript: 'I want these headphones',
    lens: ['over-ear headphones (the purchase target)', 'laptop (product, ok)'],
    expect: 'qty 1, sane retail price under 1000',
  },
];

for (const testCase of CASES) {
  const contextLine = `\nThe live camera lens currently sees: ${testCase.lens.join(', ')}. If the request says "this" or "these", it refers to what the lens sees or what is in the attached frame.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Loupe prompt test' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: `Request: "${testCase.transcript}"${contextLine}` }] },
      ],
    }),
  });

  if (!response.ok) {
    console.log(`✗ ${testCase.name}\n   HTTP ${response.status} ${(await response.text()).slice(0, 160)}\n`);
    continue;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
  } catch {
    console.log(`✗ ${testCase.name}\n   unparseable: ${content.slice(0, 200)}\n`);
    continue;
  }

  const unit = Number(parsed.unit_price_dollars);
  const total = Number(parsed.total_dollars);
  const mathOk = Math.abs(total - unit * Number(parsed.quantity)) < 0.02;

  console.log(`• ${testCase.name}`);
  console.log(`   said:     "${testCase.transcript}"`);
  console.log(`   expect:   ${testCase.expect}`);
  console.log(`   got:      ${parsed.quantity} × "${parsed.item}" @ $${unit} = $${total}  [${parsed.category}]`);
  console.log(`   math:     ${mathOk ? 'ok' : `MISMATCH (${parsed.quantity} × ${unit} != ${total})`}`);
  console.log(`   rationale: ${parsed.rationale}\n`);
}
