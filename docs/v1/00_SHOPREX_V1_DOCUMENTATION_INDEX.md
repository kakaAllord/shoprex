# Shoprex V1 Documentation Index

Shoprex is an Android-first shop-selling and stock application for Tanzania. It has one NestJS backend, one Next.js web app, and one React Native (Expo) mobile app. This directory contains the current product and implementation handoff package.

## Canonical root structure

```text
shoprex/
├── backend/      # NestJS + TypeScript API
├── web/          # Next.js + TypeScript web app
├── mobile/       # React Native (Expo) Android app
├── docs/         # Product, engine, roadmap, and agent prompts
├── AGENT.md
├── README.md
├── PROGRESS.md
├── .env.example
├── .gitignore
└── docker-compose.yml (optional)
```

There must be exactly three application folders at the root: `backend/`, `web/`, and `mobile/`. Do not add `api/`, `server/`, `frontend/`, `client/`, or a second app folder. `docs/` contains documentation only.

## Read in this order

| Order | File | Use it for |
|---:|---|---|
| 1 | `AGENT.md` | Mandatory instructions for any coding agent taking over work |
| 2 | `PROGRESS.md` | Current phase, decisions, blockers, changed files, tests, and next action |
| 3 | `docs/01_SHOPREX_V1_PRODUCT_CONCEPT.md` | Human-readable explanation of the product and user experience |
| 4 | `docs/02_SHOPREX_V1_ENGINE_AND_MATH.md` | Internal technical rules for products, units, stock, sales, payments, and devices |
| 5 | `docs/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md` | Build order, deliverables, acceptance checks, and deferred scope |
| 6 | `docs/04_AGENT_PROMPT_KIT.md` | Copy-paste prompts for first setup, phase execution, debugging, and handover |
| 7 | `docs/05_SHOPREX_V1_PILOT_FEEDBACK_LOG.md` | What real shops said when they used it, and what was done about it. Added in Phase 8 |

## Current product rule

The mobile app must make the first sale possible with minimal setup: scan or search, create an unknown product inline when needed, adjust quantity, complete payment, and continue. The web app gives the owner and platform administrator visibility and control. Both apps use the same authorized backend.

## Current technical rule

V1 is online-only. Multiple devices may operate at once, but authoritative sales and stock updates go through the backend. Offline queues, synchronization, conflict handling, and cloud restore are postponed until a later approved subscription/product tier.

## Documentation maintenance

When a product decision changes, update the concept document, engine document if the data/math changes, implementation phases if delivery order changes, and `PROGRESS.md`. When implementation changes, update `PROGRESS.md` with files, tests, known issues, and next action. Never leave the progress file stale.

## Original sources

The original long specification is at `/home/ubuntu/upload/SHOPREX_V1_Approved_Implementation_Spec.md`. The original visual design artifact is [Shoprex — Ubunifu wa Skrini V1](https://claude.ai/code/artifact/7ecc4806-15af-4018-950f-4bb7a1c1a6dc). These are background references; the modular documents in this directory are the execution baseline.
