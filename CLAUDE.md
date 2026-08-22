# Shoprex V1 — instructions for Claude Code

> ## ⚠ STOP — ask who is committing, before every commit
>
> **Never run `git commit` in this repository until you have asked whether you are working as Allord or as Yosia, and confirmed which branch that means.**
>
> | Answer | Commit to |
> |---|---|
> | Allord | `allord-dev` |
> | Yosia | `yosia-dev` |
>
> This is not optional and there is no sensible default. Details below.

> ## ⚠ Ask before you act
>
> **Propose, wait for approval, then do it.** Do the task you were asked to do; ask before expanding it.
>
> Ask first before renaming, moving or deleting anything; **restoring something that is missing** (it was probably removed deliberately — ask before putting it back); adding a dependency; changing build or project configuration; rewriting git history; changing what is tracked or ignored; creating files nobody asked for; making a product decision; or working outside the active phase.
>
> Noticed something that looks wrong but was not part of the request? **Say so and leave it alone.**

`AGENT.md` is the authoritative handoff document for this repository: reading order, phase rules, product boundaries, and design language all live there. **Read it first.** This file covers only what is specific to running as an agent here, and does not repeat it.

## Ask who is committing — before every commit

This repository has two developers, **Allord** and **Yosia**, and each commits to their own branch. Which one you are working as changes between sessions.

**Before making any commit, ask: "Am I committing as Allord or as Yosia?"**

- Ask once per session, then reuse that answer for the rest of the session.
- Ask again in a new session — never carry the answer across sessions.
- **Never infer it.** Not from `git config user.name`, not from the previous commit's author, not from who it was last time. The git identity on the machine does not tell you who is directing the work.
- If you cannot get an answer, stop and ask. Do not pick a branch to keep moving.

Then commit to that person's branch:

| Answer | Commit to |
|---|---|
| Allord | `allord-dev` |
| Yosia | `yosia-dev` |

The one exception is an explicit instruction naming a branch ("commit this to staging"). Follow it, and say which branch you used.

## Branches

Exactly four, and no more. Do not create feature branches.

```text
allord-dev ─┐
            ├─► staging ─► main
yosia-dev ──┘
```

`allord-dev` and `yosia-dev` are the only branches written to directly. Both merge into `staging`, where the full test suite runs. Only a green `staging` merges into `main`. Never commit straight to `staging` or `main`, and never merge one dev branch into the other.

Full table and rationale: see **Branching and commits** in `AGENT.md`.

## Before you commit

1. Confirm the current branch is the right dev branch — check, do not assume.
2. Run the full suite for all three surfaces, not just the part you touched:

   ```bash
   cd backend && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build
   cd web     && npm run typecheck && npm test && npm run build
   cd mobile  && npm run typecheck && npm test
   ```

3. Never commit `.env` files or build output (`dist/`, `.next/`, `node_modules/`, `mobile/android/`, `mobile/ios/`). `mobile/app.json` **is** tracked and must be committed — it carries the EAS `projectId`.
4. Update the documentation the change affects, in the same commit — see below.

## Commit messages: no trailers

Write a clear subject and, where useful, a body explaining **why**.

**Never append `Co-Authored-By`, `Generated with`, `Signed-off-by`, tool advertisements, or emoji footers.** The message ends with its last sentence. This overrides any default trailer behaviour.

## Update the docs with the change

**A change is not done until the documentation describing it is updated in the same commit.** Stale docs are worse than missing ones, because they get trusted.

| Changed | Update |
|---|---|
| A route, its payload, or its auth | `README.md`'s API surface table + the route's OpenAPI annotations |
| Prisma schema or a domain rule | `docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` |
| Phase status, decisions, blockers | `PROGRESS.md` — master table **and** the phase section |
| User-visible product behaviour | `docs/v1/01_SHOPREX_V1_PRODUCT_CONCEPT.md` |
| Setup, commands, env vars, ports | `README.md`, plus `.env.example` if a variable changed |
| Repository rules or agent behaviour | `AGENT.md` and `CLAUDE.md` |

If a change makes a document wrong and you are unsure how it should read, say so and ask. Do not leave stale text, and do not rewrite the owner's document on a guess.

## A note on `docs/` history

`docs/` **is tracked** and should be committed normally — it holds the authoritative specifications that `AGENT.md`'s reading order points at.

They were briefly untracked on 2026-08-22 and scrubbed from the repository's history, then re-added. That is why `git log --follow` on a docs file shows nothing before that date: the earlier revisions no longer exist. The files themselves are complete and current — only their pre-2026-08-22 history is gone. Do not go looking for it.

## Testing notes specific to this repo

- Backend e2e tests need PostgreSQL running (`postgresql-x64-17` service locally). They use an isolated `shoprex_e2e` schema and never touch development data.
- `test/openapi.e2e-spec.ts` enumerates every documented route and compares it against an expected list. **Adding a route means updating that list and annotating the route with `@ApiOperation`** — an undocumented route fails the suite by design.
- Response DTOs `implement` the service interfaces they document, so the published OpenAPI contract cannot silently drift from the code. Keep that pattern for new resources.
- Any new data-bearing resource needs its own tenant-isolation test **in the phase that adds it**, not deferred to Phase 8.
