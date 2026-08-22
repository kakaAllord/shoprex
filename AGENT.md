# Shoprex V1 — Agent Handoff Instructions

> ## ⚠ Before you commit anything: ask who you are committing as
>
> This repository has two developers, **Allord** and **Yosia**, and each one commits to their own branch. **You cannot tell them apart from the machine** — same computer, same git config, same working directory.
>
> **So ask, out loud, before every commit: "Am I committing as Allord or as Yosia?"**
>
> | Answer | Commit to |
> |---|---|
> | Allord | `allord-dev` |
> | Yosia | `yosia-dev` |
>
> Ask once per session, then reuse that answer for the rest of the session. Ask again in a new session — never carry it over.
>
> **Never guess, and never infer it** from `git config user.name`, from the author of the last commit, or from who it was last time. If you cannot get an answer, stop and ask rather than picking a branch to keep moving. A commit on the wrong dev branch is painful to unpick once the other person has merged into `staging`.
>
> Full rules: [Branching and commits](#branching-and-commits).

> ## ⚠ Ask before you act. Do not decide things on your own.
>
> **Propose, wait for approval, then do it.** This is the default for anything beyond the task you were actually asked to do. When in doubt, ask — the cost of one question is far lower than the cost of undoing unrequested work.
>
> Always ask first before:
>
> - **Renaming, moving, or deleting anything** — files, folders, branches, database columns.
> - **Restoring something that is missing.** It was very likely removed on purpose. Ask before putting it back.
> - **Adding a dependency**, changing a build tool, or changing project configuration.
> - **Rewriting git history**, force-pushing, or changing what is tracked or ignored.
> - **Creating files nobody asked for** — extra READMEs, notes, helper scripts, summary documents.
> - **Making a product decision.** Those belong to the owner. Record the question in `PROGRESS.md` under "Blocked / awaiting user" and stop.
> - **Working outside the active phase**, or building a surface a later phase owns.
>
> Doing the work you were asked to do — writing the code, fixing the bug, adding the test — needs no permission. Expanding the job does.
>
> If you notice something that looks wrong but was not part of the request, **say so and leave it alone.** Reporting it is helpful; silently "fixing" it is not.

## Mission

You are contributing to Shoprex V1, a fast Android-first shop-selling and stock application for Tanzania. Shoprex consists of one NestJS backend, one Next.js web app, and one React Native (Expo) Android app. The backend is authoritative for users, devices, products, stock, sales, payments, reports, and permissions.

## Canonical repository structure

The repository must contain exactly three application folders at the root:

```text
shoprex/
├── backend/      # NestJS + TypeScript API
├── web/          # Next.js + TypeScript web app
├── mobile/       # React Native (Expo) Android app
├── docs/         # Product and engineering documentation
├── AGENT.md
├── CLAUDE.md     # Agent-specific rules; defers to this file
├── README.md
├── PROGRESS.md
├── .env.example
├── .gitignore
└── docker-compose.yml (optional)
```

Do not create duplicate root application folders such as `api/`, `server/`, `frontend/`, `client/`, `dashboard/`, or a second mobile/web project. `docs/` is documentation, not a fourth application. The full copy-paste prompt kit is in `docs/04_AGENT_PROMPT_KIT.md`.

## Mandatory reading order

Before changing code, read in this order:

1. `AGENT.md` — this file.
2. `README.md` — project map and current working rules.
3. `PROGRESS.md` **Part A (the master phase table)** — this is the single source of truth for which phase is active. Trust the table over any half-remembered narrative, and treat a mismatch between the table and a phase's own detail section as a blocker to log, not something to silently reconcile.
4. `docs/01_SHOPREX_V1_PRODUCT_CONCEPT.md` — user-facing product behavior.
5. `docs/02_SHOPREX_V1_ENGINE_AND_MATH.md` — domain rules and invariants.
6. `docs/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md` — phase deliverables and acceptance checks.
7. The detail section in `PROGRESS.md` (Part B) for the active phase, and any prior phase whose handoff notes you need.

Do not treat the original long specification as the current execution plan. Use it only for background, or when a rule is explicitly referenced by the modular documents above.

## Operating rules

The master table in `PROGRESS.md` is authoritative for phase status. Work only inside the active phase unless the user explicitly approves a scope change. If a task appears to require a new product decision, stop and write the question into that phase's `PROGRESS.md` section under "Blocked / awaiting user"; do not invent the behavior.

Keep one backend. The web app must use the backend API and must not connect directly to PostgreSQL. The React Native app must use the same backend API. Put business rules in testable backend/domain modules, not UI components.

**Do not build ahead of the phase that owns a surface.** If an earlier phase's acceptance check seems to call for a screen that a later phase is explicitly responsible for (for example, an owner-facing web screen before Phase 6), verify that phase through the API directly — tests, seed scripts, or a thin internal tool — rather than building a throwaway UI. A one-off screen built early duplicates the real one and drifts from it.

Run the **full** existing automated test suite at the start of a session and before marking a phase complete — not just tests touching the code you changed. A regression introduced two phases ago is still a regression, and it is cheaper to catch it now than in Phase 8.

Any new data-bearing resource (a new Prisma model, a new module with its own records) needs a tenant-isolation check before its phase is marked complete. Do not defer all isolation testing to Phase 8 — Phase 8's pass should confirm, not discover.

Anywhere a day boundary or "today" matters, the backend server clock is authoritative. Never trust a timestamp supplied by a mobile device for anything a report depends on.

V1 is online-only. Do not implement offline queues, local outboxes, background sync, conflict resolution, or "sync now" controls. Multiple devices are allowed, but authoritative transactions go through the backend while the device is online.

Do not add customer accounts, returns, refunds, profit/expenses, supplier workflows, e-commerce, visual product recognition, branch stock transfers, mobile-money provider integration, external report delivery, or other features listed as deferred, unless the owner explicitly approves a scope change.

Do not expose normalized stock mathematics to workers unless required to explain an operational outcome. Preserve physical package state and commercial units in receipts and sales history. Never silently change a unit, price, package factor, or historical sale.

All protected endpoints must enforce tenant, branch, role, and permission checks on the server. Hiding a button in the UI is not authorization.

## Branching and commits

The repository has **exactly four branches**. Do not create a fifth — no feature branches, no personal experiment branches, no `phase-2` branch.

| Branch | Who writes to it | Purpose |
|---|---|---|
| `main` | nobody directly | Release trunk. Only ever reached by a merge from `staging` |
| `staging` | nobody directly | Integration. Every test runs here before anything reaches `main` |
| `allord-dev` | Allord | Allord's working branch |
| `yosia-dev` | Yosia | Yosia's working branch |

The flow is one direction only:

```text
allord-dev ─┐
            ├─► staging ─► main
yosia-dev ──┘
```

Work is committed to the author's own dev branch. A merge into `staging` is where the full test suite is run; only after it passes does `staging` merge into `main`. Never commit straight to `staging` or `main`, and never merge one dev branch into the other — they meet in `staging`, not in each other.

### Ask who is committing, every time

**Before any commit, ask whether you are working as Allord or as Yosia, and commit to that person's branch.** Do not infer it from git config, from the last commit's author, or from who it was last time — both developers use this repository and the answer changes between sessions.

Ask once per session and reuse the answer for the rest of that session; ask again in a new session. If the answer is unavailable, stop and ask rather than guessing a branch — a commit on the wrong dev branch is annoying to unpick once the other person has merged.

The only exception is an explicit instruction naming the branch ("commit this to staging"). Follow that, and say which branch you used.

### Before committing

Confirm the branch is the author's own dev branch, run the full test suite, and never commit build output (`dist/`, `.next/`, `node_modules/`, `mobile/android/`, `mobile/ios/`) or any `.env` file. `mobile/app.json` **is** tracked and must be committed — it carries the EAS `projectId`.

### Commit messages

Write a clear subject line and, where it helps, a body explaining **why** the change was made rather than restating what the diff shows.

**No trailers, no attribution noise.** Do not add `Co-Authored-By`, `Generated with`, `Signed-off-by`, tool advertisements, emoji banners, or any similar footer. The commit message ends with its last sentence. The work is the developer's; the tooling does not sign it.

## Keep the documentation current

**A change is not finished until the documentation that describes it is updated in the same commit.** Documentation that lags behind the code is worse than no documentation, because it is trusted and wrong.

| When you change | Update |
|---|---|
| An API route, its payload, or its auth | `README.md`'s API surface table, and the route's OpenAPI annotations |
| The Prisma schema, or a domain rule | `docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` |
| Phase status, decisions, blockers, known issues | `PROGRESS.md` — both the master table and the phase's own section |
| Product behaviour a user would notice | `docs/v1/01_SHOPREX_V1_PRODUCT_CONCEPT.md` |
| Setup, commands, environment variables, ports | `README.md`, and `.env.example` if a variable changed |
| Repository rules, workflow, or agent behaviour | `AGENT.md` and `CLAUDE.md` |

If a change makes an existing document wrong and you are not sure how it should read, **say so and ask** — do not leave the stale text standing, and do not rewrite the owner's document on a guess.

## Phase completion protocol

When the acceptance checks for the active phase pass:

1. Run the full test suite and record the exact commands and results.
2. Review changed files for dead buttons, placeholder data, broken navigation, and unauthorized API access.
3. Update `PROGRESS.md`: flip the row in the master table (Part A), and append the detail section (Part B) — status, completed work, files changed, tests, decisions, known issues, next action. Never delete a prior phase's section.
4. Do not mark a phase complete if a core acceptance check is unverified, and do not mark it complete in the table while its detail section describes an open failure.
5. Leave a short handoff note describing any non-obvious implementation choice.

## When blocked

If a dependency, credential, browser login, platform decision, or user approval is required, do not guess. Record the blocker in that phase's `PROGRESS.md` section under **Blocked / awaiting user**, state the smallest question that resolves it, and stop that phase there.

## Design rules

Use the approved green-led visual language consistently across web and mobile: light backgrounds, dark neutral text/surfaces only where they improve hierarchy, Emerald as the main action color, Kijani/success green for completed or synced states, Amber for warnings, red only for destructive/error states. The main selling action must remain visually dominant.

The interface is Swahili-first and English-ready. Keep copy short and action-oriented. Use shop vocabulary: Mauzo, Pokea mzigo, Stoo, Wafanyakazi, Ripoti, and Malipo where appropriate.

## Definition of done for a code change

A change is done only when the intended user flow works end to end, backend authorization is enforced, error/loading/empty states are handled, tests cover the important rule, no critical console/build errors remain, and `PROGRESS.md` (both parts) reflects the new state.
