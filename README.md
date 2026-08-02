# Loupe

**See it. Ask. Bought.** — a shopping agent that sees what you see.

You're looking at something you want. Point your camera at it: Loupe identifies it, **searches the live web** for what it actually sells for and whether a sale is worth waiting for, **shows you the real shops selling it right now**, and routes the purchase to a human to check out.

Two systems decide whether the money moves. **Stripe** decides what the wallet can afford. **Auth0** decides who you have to be to buy it.

Built for the Auth0 × Stripe *Built Different* hackathon, 30 July 2026.

## How it works

| Step | What happens |
|---|---|
| `lens.scan` | On-device COCO-SSD draws boxes at ~8fps while a vision model names each thing, reads a brand off the tag when it's legible, and flags what would blow your limit |
| `agent.research` | Ask *"is it worth it?"* and it runs a **live web search** — the real price range, whether this brand ever discounts, and if a sale is close enough to wait for |
| `agent.offers` | Real listings with merchant, price and link. **An offer only renders if its URL is one the model actually retrieved** — see `verifyOffers()` in `lib/vision.ts` |
| `you.confirm` | The agent asks out loud and waits. Nothing reaches the cart until you say yes |
| `plan.check` | Checkout enforces the wallet's per-purchase cap. Over it → `402` |
| `stripe.charge` | Real PaymentIntent plus a metered event. Over the cap? Upgrade inline and the blocked purchase retries itself |

## Wallets, not tenants

Each **Auth0 Organization** is a shared wallet. The same login is a cardholder on one and requester-only on another — so who may check out changes with the workspace.

The active organization also changes **what the agent tells you**. Ask about the same item on your own card and on a shared one and the advice differs: something personal and over ~$75 on someone else's card earns a gentle *"worth mentioning to them first"*, while a household item doesn't. Whose money it is, is an input to the model — not just a permission check.

## Stack

Everything below is what actually runs. No aspirational entries.

### Agent

| Layer | What | Notes |
|---|---|---|
| Object detection | **TensorFlow.js 4.22** + **COCO-SSD 2.2.3** (`ssdlite_mobilenet_v2`) | 18MB of weights **self-hosted in `public/models/ssdlite/`**, so boxes keep drawing on hostile venue wifi. 80 fixed classes, ~8fps, fully on-device |
| Vision — naming & pricing | **`google/gemini-2.5-flash-lite`** via **OpenRouter** | ~1.4s per scan, ~31¢ per hour of continuous lens |
| Live pricing & shops | **OpenRouter `:online`** web search | ~2.5s, ~$0.005 a call. Offers are verified against the model's own citations before they render |
| Voice out | **ElevenLabs** `eleven_turbo_v2_5` | mp3 44.1kHz/64kbps. Amounts are spelled into words before TTS — engines mangle `$24.98` |
| Voice in | **Web Speech API** (browser-native) | Free, zero dependencies; Safari is the reference browser |

### Platform

| Layer | What | Notes |
|---|---|---|
| Identity | **Auth0** — `@auth0/nextjs-auth0` v4 | Universal Login, **Organizations** as wallets, roles (approver / requester), Management API for role checks |
| Payments | **Stripe** SDK v19, **test mode** | PaymentIntents, **Billing meters** (50¢ per completed purchase), subscriptions, `subscriptions.update` for the prorated upgrade, `402` over the cap |
| Provisioning | **Stripe Projects CLI** | Neon, OpenRouter, ElevenLabs and Vercel provisioned and billed through Stripe — one CLI, one card |
| Data | **Neon** serverless Postgres | |
| App | **Next.js 16.2** (App Router, RSC), **React 19**, **TypeScript 5.9**, **Tailwind 4** | |
| Hosting | **Vercel** | Serverless — which is why the voice is turn-based rather than full-duplex |

## Honest limits

- **Discovery is live; the purchase is not.** Loupe finds real listings, but the charge is a Stripe test-mode PaymentIntent against our own account — it does not reach the merchant whose listing you clicked. Closing that gap needs the merchant to accept an agent-presented credential (Stripe's agentic commerce rails, UCP/ACP), which is a network to join rather than an API to call.
- **COCO-SSD knows 80 object classes.** No AirPods, no clothing, no shoes. The *boxes* are limited; the naming and pricing come from a vision model that is not.
- **The cheapest vision tier, deliberately.** It reads big text and misses fine print. An open-vocabulary detector and a frontier vision model are each one config change.
- **Web search, not a catalogue.** No stock levels, no size or colour variants, no guaranteed lowest price. Retail APIs plus price history would turn a good guess into a forecast.

## Running it

```bash
nvm use                      # Node 22 — see .nvmrc
npm install
cp .env.example .env.local   # then fill in your own keys
npm run dev                  # http://localhost:3001
```

Needs a camera and a microphone. **Use Safari on macOS** if you want an iPhone as the camera — Chrome cannot enumerate Continuity cameras at all.

## Checks

```bash
npx tsc --noEmit
npm run build
python3 scripts/check-loupe-timing.py                        # hero animation stays in sync
node --env-file=.env.local scripts/test-vision-prompt.mjs     # pricing, quantity honouring, dollars-not-cents
```

## Status

Hackathon build. Stripe runs in **test mode** — no real money moves.
