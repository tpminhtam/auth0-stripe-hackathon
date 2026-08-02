const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// A stalled model must fall through to the next one, never hang the request.
const MODEL_TIMEOUT_MS = 20_000;
// Ceiling on "price everything" — each item is its own web search, so this
// bounds both the wall-clock and the spend of a single tap.
const MAX_PRICED_ITEMS = 6;

const VISION_MODELS = [
  process.env.SAYSO_VISION_MODEL,
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
].filter((model): model is string => Boolean(model));

export type OrderProposal = {
  category: string;
  item: string;
  quantity: number;
  rationale: string;
  total_cents: number;
  unit_price_cents: number;
};

const SYSTEM_PROMPT = `You are Loupe, a shopping agent. Your owner is out in the world looking at something they want, and they tell you (by voice) what to get, usually with a live camera frame of the thing itself.

Work out what to buy, then price it the way a shopper actually pays.

⚠️ ONLY EVER PROPOSE SOMETHING THE LENS ACTUALLY SAW, or that they named out loud.
The lens list below is the complete set of things you may choose from. If it is empty and they
have not named an item themselves, do NOT invent one — return the item as "unclear what you mean"
with quantity 1 and price 0, and say so in the rationale. **The examples in this prompt are
formatting guides, never products to propose.** Proposing something nobody showed you is the worst
mistake you can make: it is how a shopper ends up looking at a handbag they never asked for.

QUANTITY — if they state a quantity ("get me two of these", "a pack of them", "four"), use EXACTLY that quantity. Only choose a quantity yourself when they did not say one.

NAMING — name it by category, material and quality tier, e.g. describe a bag by its leather and shape, a backpack by its fabric and use, a bottle by its material and insulation. Include a brand ONLY when you can actually read it in the frame or they said it out loud. Never infer a brand from styling — guessing is worse than not knowing.

PRICING — estimate the normal retail price a person pays, not wholesale and not the cheapest knockoff. Reference bands: leather handbag $80-400 · backpack $40-200 · sneakers $60-250 · jacket $60-400 · sunglasses $20-300 · watch $50-800 · earbuds or headphones $50-400 · laptop $800-2500 · phone $400-1400 · keyboard $30-200 · water bottle or tumbler $15-50 · coffee cup $15-45 · book $10-30 · houseplant $15-80 · desk chair $80-600. Pick one number inside the right band.
A budget stated out loud always wins over your own estimate: "around $400" means close to 400, "under 30 dollars" means at most 30.

Respond with ONLY a JSON object, no markdown fences, matching exactly:
{"item": string, "quantity": number, "unit_price_dollars": number, "total_dollars": number, "category": string, "rationale": string}

Prices are in US DOLLARS (e.g. a $399.99 pair of headphones is 399.99, not 39999). "total_dollars" MUST equal unit_price_dollars × quantity. "rationale" is one short sentence covering what you identified and why that price. "category" is one of: bags, apparel, footwear, accessories, tech, home, drinkware, books, other.`;

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_API_KEY || process.env.OPENROUTER_PLAN_API_KEY || '';
}

function extractJsonObject(text: string): OrderProposal {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    // When the agent has nothing to go on it now declines in plain prose rather
    // than inventing a product. That refusal is a better message than any
    // wording of ours, so pass it through instead of a parser complaint.
    const prose = text.trim().replace(/\s+/g, ' ');
    if (prose.length > 12 && prose.length < 400) {
      throw new Error(prose);
    }
    throw new Error('Model response contained no JSON object.');
  }

  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const quantity = Math.max(1, Math.round(Number(parsed.quantity) || 1));

  const unitDollars = Number(parsed.unit_price_dollars);
  const totalDollars = Number(parsed.total_dollars);
  const unitPriceCents =
    Number.isFinite(unitDollars) && unitDollars > 0
      ? Math.round(unitDollars * 100)
      : Math.max(1, Math.round(Number(parsed.unit_price_cents) || 0));
  let totalCents =
    Number.isFinite(totalDollars) && totalDollars > 0
      ? Math.round(totalDollars * 100)
      : Math.round(Number(parsed.total_cents) || 0);
  if (totalCents < 1) {
    totalCents = unitPriceCents * quantity;
  }

  if (!parsed.item || typeof parsed.item !== 'string') {
    throw new Error('Model response was missing an item name.');
  }

  return {
    category: typeof parsed.category === 'string' ? parsed.category : 'other',
    item: parsed.item,
    quantity,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    total_cents: totalCents,
    unit_price_cents: unitPriceCents,
  };
}

function applyStatedPriceGuard(proposal: OrderProposal, transcript: string): OrderProposal {
  const match = transcript.match(/\$\s*(\d{2,6})|(\d{2,6})\s*(?:dollars|bucks)/i);
  const statedDollars = match ? Number(match[1] ?? match[2]) : null;
  if (!statedDollars || statedDollars < 20) {
    return proposal;
  }

  const statedCents = statedDollars * 100;
  const scaledTotal = proposal.total_cents * 100;
  const looksLikeCentsConfusion =
    proposal.total_cents <= statedCents / 10 && scaledTotal >= statedCents * 0.5 && scaledTotal <= statedCents * 2;

  if (!looksLikeCentsConfusion) {
    return proposal;
  }

  return {
    ...proposal,
    total_cents: proposal.total_cents * 100,
    unit_price_cents: proposal.unit_price_cents * 100,
  };
}

export async function proposeOrder(input: {
  imageDataUrl: string | null;
  scanContext?: string[];
  transcript: string;
}): Promise<OrderProposal> {
  const key = getOpenRouterKey();
  if (!key) {
    throw new Error('Missing OPENROUTER_API_API_KEY. Provision OpenRouter with Stripe Projects and pull env vars.');
  }

  const contextLine =
    input.scanContext && input.scanContext.length > 0
      ? `\nThe live camera lens currently sees: ${input.scanContext.join(', ')}. If the request says "this" or "these", it refers to what the lens sees or what is in the attached frame.`
      : '';

  const userContent: Array<Record<string, unknown>> = [
    { type: 'text', text: `Request: "${input.transcript.trim()}"${contextLine}` },
  ];

  if (input.imageDataUrl) {
    userContent.push({ type: 'image_url', image_url: { url: input.imageDataUrl } });
  }

  let lastError: Error | null = null;

  for (const model of VISION_MODELS) {
    let response: Response;

    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_BASE_URL ?? 'http://localhost:3000',
          'X-Title': 'Loupe',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
    } catch {
      lastError = new Error(`OpenRouter ${model} did not respond within ${MODEL_TIMEOUT_MS / 1000}s.`);
      continue;
    }

    if (!response.ok) {
      lastError = new Error(`OpenRouter ${model} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      continue;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      lastError = new Error(`OpenRouter ${model} returned no content: ${payload.error?.message ?? 'unknown'}`);
      continue;
    }

    try {
      return applyStatedPriceGuard(extractJsonObject(content), input.transcript);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('All vision models failed.');
}

export type ScanItem = {
  est_price_dollars: number;
  kind: 'product' | 'context';
  label: string;
  state: 'ok' | 'low' | 'out' | 'broken';
  target: boolean;
};

export type ScanResult = {
  comment: string;
  items: ScanItem[];
};

const SCAN_PROMPT = `You are Loupe's live shopping lens, seeing exactly what your owner sees. Look at this single frame.

List up to 5 prominent things you can see. One entry per whole object — never split a person or object into parts (no separate "head" or "arm" entries).

Set "kind" for each:
- "product" — anything somebody could own or buy: bags and backpacks, apparel and footwear, accessories (sunglasses, watches, jewellery), tech (laptops, phones, headphones, keyboards), drinkware (bottles, tumblers, cups), books, plants, furniture, homeware. If a person is wearing or carrying it, the ITEM is still a product — the person is not.
- "context" — people, faces, hands, walls, floors, ceilings, windows, doorways, and the room itself. Never price a person.

Mark EXACTLY ONE item "target": true when there is a clear thing they are interested in — held up to the camera, pointed at, or centred in the frame. If nothing is clearly centred, mark nothing as target.

Respond with ONLY a JSON object, no markdown fences:
{"items": [{"label": string, "kind": "product"|"context", "state": "ok"|"low"|"out"|"broken", "target": boolean, "est_price_dollars": number}], "comment": string}

"label": category, material and tier — "tan leather crossbody bag" beats "bag". Name a brand only if you can actually read it.
"state": almost always "ok" for shopping. Use "broken" only for visibly damaged goods and "low"/"out" only when a shelf or holder is genuinely empty.
"est_price_dollars": normal retail in DOLLARS. Bands: handbag 80-400 · backpack 40-200 · sneakers 60-250 · jacket 60-400 · sunglasses 20-300 · watch 50-800 · headphones 50-400 · laptop 800-2500 · phone 400-1400 · keyboard 30-200 · water bottle 15-50 · coffee cup 15-45 · book 10-30 · plant 15-80 · chair 80-600. A paper coffee cup is about 4, not 400. Use 0 for context items.
"comment": ONE short natural sentence (max 14 words) describing what you see — never empty — and name the target if there is one. The comment is READ ALOUD, so never put a price, a currency symbol or a digit in it; the prices are already on the chips.`;

const SCAN_STATES = new Set(['ok', 'low', 'out', 'broken']);

/* ------------------------------------------------------------------ *
 * The advisor — the one call that is allowed to touch the live web.
 *
 * Everything else in this file runs on the pinned model with no network
 * grounding. `adviseOnItem` appends OpenRouter's `:online` suffix, which
 * runs a real web search and injects the results before the model answers,
 * then hands back the citations so the UI can show its sources. Measured
 * Jul 30: ~3s and ~$0.005 a call against ~0.5s ungrounded — which is why
 * this fires only when the shopper asks, never on the 3s scan loop.
 * ------------------------------------------------------------------ */

export type AdviceSource = { title: string; url: string };

/** A real listing the agent found — a place this can actually be bought. */
export type Offer = {
  merchant: string;
  price_dollars: number;
  title: string;
  url: string;
};

export type ItemAdvice = {
  advice: string;
  brand: string | null;
  grounded: boolean;
  headline: string;
  item: string;
  market_high_dollars: number;
  market_low_dollars: number;
  offers: Offer[];
  sources: AdviceSource[];
  timing: 'buy_now' | 'wait';
  verdict: 'good_deal' | 'fair' | 'overpriced' | 'unknown';
  wait_reason: string | null;
};

/*
 * Two stages, deliberately. A single grounded call that also has to look at the
 * photo measured 8.1s on Jul 30 — far too long to stand in front of a room for.
 * Splitting it is both faster and better: the image pass is ungrounded and
 * quick (~1.4s), the research pass is text-only and grounded (~1.9s), and each
 * model gets one job instead of two.
 */
const IDENTIFY_PROMPT = `You are Loupe, looking through your owner's camera at something they are interested in. Name what it is, precisely enough that someone could shop for it.

Describe category, material, colour and quality tier — "tan pebbled-leather crossbody bag, mid-tier" beats "bag".

BRAND — only name a brand you can actually READ in the frame (a logo, a tag, a label) or that the shopper says out loud. If you cannot read one, set "brand" to null and lean on the tier description instead. NEVER infer a brand from styling; guessing is worse than not knowing, and you will be caught.

Respond with ONLY a JSON object, no markdown fences:
{"item": string, "brand": string|null, "stated_price_dollars": number|null}

"stated_price_dollars" is the price the shopper said out loud, or that you can clearly read on a price tag in the frame. null if neither.`;

const ADVISOR_PROMPT = `You are Loupe, a shopping companion advising your owner on something they want. You have live web search. Use it.

**They almost never know the price.** Do not ask for it and do not refuse to answer without it. Your job is to tell them what this thing goes for and whether now is the moment to buy — both of which you can answer from research alone.

RESEARCH — search for what this item actually sells for right now and report the real range you find.

PRICES ARE IN US DOLLARS. A bag that sells for $175 is 175 — NOT 17500. A pair of earbuds at $249.99 is 249.99, NOT 24999. Never report cents.

TIMING — this is the most valuable thing you say, and it is the whole reason they asked. Decide "buy_now" or "wait", and be SPECIFIC about this brand:
- "wait" only when a real, named sale window is genuinely close, or this particular brand is known to discount on a schedule. Name the event and roughly what they would save.
- "buy_now" when the brand rarely discounts, the item is close to its floor, stock is thin, or nothing is coming. Some brands almost never discount — Apple hardware barely moves, Lululemon only marks down through its own outlet section, luxury leather houses never do. Saying "this one almost never goes on sale, buy it if you love it" is genuinely useful advice and is often the RIGHT call.

⚠️ Defaulting every item to "wait for holiday sales" is a useless answer and you must not do it. If you cannot name a specific reason this particular thing will get cheaper, the answer is "buy_now". Commit.

VERDICT — only compares a KNOWN price to the range: "good_deal" below it, "fair" inside it, "overpriced" above it. When no price is known use "unknown" — that is normal and fine, because "timing" is still doing the work.

WHERE TO BUY IT — also list up to 4 real listings from the pages you actually retrieved: the merchant, the product name on that page, the price, and the URL.
⚠️ Every offer MUST come from a page you really opened. Never invent a merchant, a price or a URL, and never quote a price you did not see.
⚠️ A merchant is a SHOP THAT SELLS THE THING — Apple, Best Buy, Nordstrom, REI, the brand's own store. A deal blog, a review site, a price-comparison page or a news article is NOT a merchant, even when it quotes a price. Skip those. Returning two real shops beats returning four pages, and an empty list is a correct answer when you only found articles.

Respond with ONLY a JSON object, no markdown fences:
{"market_low_dollars": number, "market_high_dollars": number, "verdict": "good_deal"|"fair"|"overpriced"|"unknown", "timing": "buy_now"|"wait", "headline": string, "advice": string, "wait_reason": string|null, "offers": [{"merchant": string, "title": string, "price_dollars": number, "url": string}]}

"merchant" is the shop as a person would say it ("Best Buy", "Quince"), not a domain.
"title" is the product as listed, max 8 words.

"headline" is ONE short line for the screen, max 10 words. Figures are fine here: "Runs $225-375. Wait for Labor Day, save ~20%".
"advice" is READ ALOUD by a voice engine: 2-3 sentences, warm and direct, like a friend who knows the category. Write every MONEY AMOUNT as WORDS — "about two hundred and fifty dollars", never "$250". A digit inside a product name ("AirPods Pro 3") is fine; a digit in a price is not. The voice mangles figures.
"wait_reason" is a short phrase naming the specific sale window, or null when timing is "buy_now".`;

async function callModel(input: {
  imageDataUrl?: string | null;
  model: string;
  system: string;
  text: string;
  title: string;
}) {
  const key = getOpenRouterKey();
  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: input.text }];
  if (input.imageDataUrl) {
    userContent.push({ type: 'image_url', image_url: { url: input.imageDataUrl } });
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_BASE_URL ?? 'http://localhost:3001',
      'X-Title': input.title,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${input.model} failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        annotations?: Array<{ url_citation?: { title?: string; url?: string } }>;
        content?: string;
      };
    }>;
  };

  const message = payload.choices?.[0]?.message;
  const content = message?.content ?? '';
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`${input.model} returned no JSON.`);
  }

  // Every citation, not a display slice — verifyOffers checks offer URLs
  // against this, so truncating here would reject perfectly real offers.
  const sources: AdviceSource[] = (message?.annotations ?? [])
    .map((a) => a.url_citation)
    .filter((c): c is { title?: string; url?: string } => Boolean(c?.url))
    .map((c) => ({
      title: (c.title ?? c.url ?? '').trim().split('\n')[0].trim().slice(0, 70),
      url: c.url as string,
    }));

  return { parsed: JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>, sources };
}

/**
 * Landmine 11, again. Small models slide between dollars and cents: on Jul 30
 * this one returned 9900-17500 for a handbag while its own headline read
 * "$99 to $175". The headline is written in the same breath as the numbers and
 * is reliably in dollars, so it is the tiebreaker — if dividing by 100 lands on
 * a figure the model itself printed, the fields were cents.
 */
/**
 * An offer is only allowed on screen if its URL is one the model actually
 * retrieved. Prompting against invention is not a guarantee — this is. Tested
 * Jul 30 across three items: 11 of 11 offers passed, but the guard is what
 * makes it safe to claim on stage that these are real shops.
 */
function verifyOffers(raw: unknown, sources: AdviceSource[]): Offer[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const retrieved = new Set(sources.map((s) => s.url));

  return raw
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
    .map((o) => ({
      merchant: typeof o.merchant === 'string' ? o.merchant.trim() : '',
      price_dollars: Number(o.price_dollars) || 0,
      title: typeof o.title === 'string' ? o.title.trim() : '',
      url: typeof o.url === 'string' ? o.url.trim() : '',
    }))
    .filter((o) => o.merchant && o.url && o.price_dollars > 0 && retrieved.has(o.url))
    .slice(0, 4)
    .sort((a, b) => a.price_dollars - b.price_dollars);
}

function normalizeRange(low: number, high: number, headline: string) {
  if (low < 1000) {
    return { high, low };
  }

  const printed = (headline.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
  const matches = (value: number) => printed.some((p) => p > 0 && Math.abs(p - value) / value < 0.05);

  if (matches(low / 100) || matches(high / 100)) {
    return { high: Math.round(high) / 100, low: Math.round(low) / 100 };
  }

  return { high, low };
}

export async function adviseOnItem(input: {
  imageDataUrl: string | null;
  scanContext?: string[];
  transcript: string;
  /** Whose money this is. Changes the advice, not the hard Stripe cap. */
  walletStance?: string | null;
}): Promise<ItemAdvice> {
  if (!getOpenRouterKey()) {
    throw new Error('Missing OPENROUTER_API_API_KEY.');
  }

  const base = process.env.SAYSO_VISION_MODEL || VISION_MODELS[0];
  const lensLine =
    input.scanContext && input.scanContext.length > 0
      ? `\nThe camera currently sees: ${input.scanContext.join(', ')}. "This" refers to what is in the frame.`
      : '';

  // Stage 1 — look at it. Fast, ungrounded. Falls back to the lens labels.
  let item = input.scanContext?.[0] ?? 'this item';
  let brand: string | null = null;
  let statedPrice: number | null = null;

  try {
    const { parsed } = await callModel({
      imageDataUrl: input.imageDataUrl,
      model: base,
      system: IDENTIFY_PROMPT,
      text: `They said: "${input.transcript.trim()}"${lensLine}`,
      title: 'Loupe Identify',
    });
    if (typeof parsed.item === 'string' && parsed.item.trim() !== '') {
      item = parsed.item.trim();
    }
    if (typeof parsed.brand === 'string' && parsed.brand.trim() !== '') {
      brand = parsed.brand.trim();
    }
    const p = Number(parsed.stated_price_dollars);
    if (Number.isFinite(p) && p > 0) {
      statedPrice = p;
    }
  } catch {
    // Identification is best-effort; the lens label is a good enough subject.
  }

  const subject = brand ? `${brand} ${item}` : item;
  const priceLine =
    statedPrice !== null
      ? `\nThey know the price: about $${statedPrice}. Compare it to what you find.`
      : '\nThey do NOT know the price. Do not ask for it.';

  // The model has no idea what day it is, so "is a sale coming?" is unanswerable
  // without this. Naming the date also makes the advice concrete on stage —
  // "Labor Day is five weeks out" instead of "around the holidays".
  // Without this the model has no idea what day it is. It is not enough to
  // state the date either — on Jul 30 it read a search result about Prime Day
  // and told the shopper to wait for an event five weeks in the PAST.
  const today = new Date();
  const dateLine = `\nTODAY IS ${today.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  })}.
⚠️ Search results describe sales that have ALREADY HAPPENED as if they were current. Before you recommend waiting for any event, check its date against today. NEVER tell them to wait for a sale that has already passed — that is the single worst mistake you can make. If the only sale you can find is in the past, the honest answer is that nothing is coming, so "buy_now". When you do name a future sale, say how many weeks away it is.`;

  // Stage 2 — research it. Grounded, text-only, so the search is the slow part
  // rather than the image. Falls back to ungrounded so an offline venue still
  // gets an opinion, just without citations.
  for (const attempt of [{ grounded: true, model: `${base}:online` }, { grounded: false, model: base }]) {
    try {
      const walletLine = input.walletStance
        ? `\n\n--- WHOSE MONEY THIS IS ---\n${input.walletStance}\nLet this shape the advice and the buy-or-wait call. It is the difference between two otherwise identical answers.`
        : '';

      const { parsed, sources } = await callModel({
        model: attempt.model,
        system: ADVISOR_PROMPT,
        text: `The shopper is looking at: ${subject}.\nThey said: "${input.transcript.trim()}"${priceLine}${dateLine}${walletLine}`,
        title: 'Loupe Advisor',
      });

      const verdicts = new Set(['good_deal', 'fair', 'overpriced', 'unknown']);
      const verdict = String(parsed.verdict);
      const wait = typeof parsed.wait_reason === 'string' && parsed.wait_reason.trim() !== '' ? parsed.wait_reason.trim() : null;
      const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
      const range = normalizeRange(
        Math.max(0, Number(parsed.market_low_dollars) || 0),
        Math.max(0, Number(parsed.market_high_dollars) || 0),
        headline,
      );

      return {
        advice: typeof parsed.advice === 'string' ? parsed.advice.trim() : '',
        brand,
        grounded: attempt.grounded && sources.length > 0,
        headline,
        item: subject,
        market_high_dollars: range.high,
        market_low_dollars: range.low,
        offers: verifyOffers(parsed.offers, sources),
        sources: sources.slice(0, 4),
        timing: parsed.timing === 'wait' ? 'wait' : 'buy_now',
        verdict: (verdicts.has(verdict) ? verdict : 'unknown') as ItemAdvice['verdict'],
        wait_reason: wait,
      };
    } catch {
      // try the ungrounded fallback
    }
  }

  throw new Error('The advisor could not reach a model.');
}

const OFFERS_PROMPT = `You are Loupe's buying desk. You have live web search. Find what the item described actually costs and where your owner can BUY it, right now.

Search, then report the real price range you found and up to 4 real listings: the merchant, the product name on that page, the price, and the URL.

⚠️ Every offer MUST come from a page you really opened. Never invent a merchant, a price or a URL, and never quote a price you did not see.
⚠️ A merchant is a SHOP THAT SELLS THE THING — Apple, Best Buy, Target, Nordstrom, REI, the brand's own store. A deal blog, a review site, a price-comparison page or a news article is NOT a merchant, even when it quotes a price. Skip those. Two real shops beat four articles, and an empty list is a correct answer.

PRICES ARE IN US DOLLARS. $249.99 is 249.99, never 24999.

Respond with ONLY a JSON object, no markdown fences:
{"market_low_dollars": number, "market_high_dollars": number, "offers": [{"merchant": string, "title": string, "price_dollars": number, "url": string}]}

"merchant" is the shop as a person would say it, not a domain. "title" is the product as listed, max 8 words.`;

/** One line of the "price everything you showed me" answer. */
export type PricedItem = {
  label: string;
  market_high_dollars: number;
  market_low_dollars: number;
  offers: Offer[];
};

/**
 * Price a whole list of things at once — what the shopper means by "how much is
 * all this?" after sweeping the lens over a table.
 *
 * One grounded search per item, run in PARALLEL: four items cost the same
 * wall-clock as one (~3s) rather than four times as long. Each is independent,
 * so a single failed lookup degrades to an empty row instead of losing the lot.
 */
export async function priceItems(subjects: string[]): Promise<PricedItem[]> {
  if (!getOpenRouterKey()) {
    return [];
  }

  const base = process.env.SAYSO_VISION_MODEL || VISION_MODELS[0];
  const wanted = subjects.map((s) => s.trim()).filter(Boolean).slice(0, MAX_PRICED_ITEMS);

  return Promise.all(
    wanted.map(async (label): Promise<PricedItem> => {
      const empty = { label, market_high_dollars: 0, market_low_dollars: 0, offers: [] };
      try {
        const { parsed, sources } = await callModel({
          model: `${base}:online`,
          system: OFFERS_PROMPT,
          text: `What does this cost and where can I buy it: ${label}`,
          title: 'Loupe Price List',
        });
        const offers = verifyOffers(parsed.offers, sources);
        const headline = offers.length > 0 ? `$${offers[0].price_dollars}` : '';
        const range = normalizeRange(
          Math.max(0, Number(parsed.market_low_dollars) || 0),
          Math.max(0, Number(parsed.market_high_dollars) || 0),
          headline,
        );
        return { label, market_high_dollars: range.high, market_low_dollars: range.low, offers };
      } catch {
        // One bad lookup must not take the other rows down with it.
        return empty;
      }
    }),
  );
}

/**
 * Just the listings, for the confirm card. Deliberately separate from
 * `adviseOnItem` so the proposal path stays fast: the client fires this AFTER
 * the proposal is already on screen, so a slow search never delays the money.
 */
export async function findOffers(subject: string): Promise<Offer[]> {
  if (!getOpenRouterKey() || !subject.trim()) {
    return [];
  }

  const base = process.env.SAYSO_VISION_MODEL || VISION_MODELS[0];

  try {
    const { parsed, sources } = await callModel({
      model: `${base}:online`,
      system: OFFERS_PROMPT,
      text: `Where can I buy: ${subject.trim()}`,
      title: 'Loupe Offers',
    });
    return verifyOffers(parsed.offers, sources);
  } catch {
    // Never let this break the confirm card — no offers is a fine outcome.
    return [];
  }
}

/** Spoken form of the advice. The model already writes amounts as words. */
export function describeAdviceForSpeech(advice: ItemAdvice) {
  return advice.advice || advice.headline;
}

export async function scanFrame(imageDataUrl: string): Promise<ScanResult> {
  const key = getOpenRouterKey();
  if (!key) {
    throw new Error('Missing OPENROUTER_API_API_KEY.');
  }

  const model = process.env.SAYSO_SCAN_MODEL || VISION_MODELS[0];

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'Loupe Lens',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SCAN_PROMPT },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: imageDataUrl } }] },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Scan model failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? '';
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { comment: '', items: [] };
  }

  const parsed = JSON.parse(content.slice(start, end + 1)) as Partial<ScanResult>;
  let targetSeen = false;
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .filter((item) => item && typeof item.label === 'string' && item.label.trim() !== '')
    .slice(0, 5)
    .map((item) => {
      const kind: ScanItem['kind'] = item.kind === 'context' ? 'context' : 'product';
      const target = Boolean(item.target) && kind === 'product' && !targetSeen;
      if (target) {
        targetSeen = true;
      }
      return {
        est_price_dollars: kind === 'product' ? Math.max(0, Number(item.est_price_dollars) || 0) : 0,
        kind,
        label: item.label.trim(),
        state: SCAN_STATES.has(String(item.state)) ? (item.state as ScanItem['state']) : 'ok',
        target,
      };
    });

  return {
    comment: typeof parsed.comment === 'string' ? parsed.comment : '',
    items,
  };
}

/**
 * The agent ASKS — it no longer announces a send. Confirming is a separate step
 * (`/api/agent/confirm`), so nothing reaches the approver without a yes.
 */
/**
 * Spell money out for the voice. Handing a TTS engine the literal string
 * "$24.98" lets it normalise however it likes — ElevenLabs read it as
 * "twenty-four hundred" on stage. Words are unambiguous. Screen text keeps
 * using formatDollars(); this is only what Charlie says.
 */
function speakDollars(cents: number) {
  const whole = Math.floor(Math.abs(cents) / 100);
  const remainder = Math.abs(cents) % 100;
  const dollars = `${whole} ${whole === 1 ? 'dollar' : 'dollars'}`;

  if (remainder === 0) {
    return dollars;
  }

  return `${dollars} and ${remainder} ${remainder === 1 ? 'cent' : 'cents'}`;
}

export function describeProposalForSpeech(
  proposal: OrderProposal,
  limit?: { limitCents: number; tierLabel: string } | null,
) {
  const unit = proposal.quantity === 1 ? 'unit' : 'units';
  const opening = `${proposal.quantity} ${unit} of ${proposal.item}, about ${speakDollars(proposal.total_cents)} total.`;

  if (limit && proposal.total_cents > limit.limitCents) {
    return `${opening} Heads up — that is over your ${limit.tierLabel} limit of ${speakDollars(limit.limitCents)}, so approving it will need a plan upgrade. Want me to send it anyway?`;
  }

  return `${opening} Want me to send it to checkout?`;
}

export function describeConfirmationForSpeech(proposal: OrderProposal) {
  return `Sent. ${proposal.item} is in the cart, ready to check out.`;
}
