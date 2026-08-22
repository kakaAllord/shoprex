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

## Currently untracked on purpose

`docs/` and `docs-other/` are git-ignored at the owner's request (2026-08-22), and have been **removed from the repository's history entirely** — they were never meant to be committed. The files remain on disk and are still the authoritative specifications that `AGENT.md`'s reading order points at, so read them normally.

Be aware that **a fresh clone will not contain them** — they must come from the owner directly. Do not "fix" this by re-adding them; the omission is deliberate.

## Testing notes specific to this repo

- Backend e2e tests need PostgreSQL running (`postgresql-x64-17` service locally). They use an isolated `shoprex_e2e` schema and never touch development data.
- `test/openapi.e2e-spec.ts` enumerates every documented route and compares it against an expected list. **Adding a route means updating that list and annotating the route with `@ApiOperation`** — an undocumented route fails the suite by design.
- Response DTOs `implement` the service interfaces they document, so the published OpenAPI contract cannot silently drift from the code. Keep that pattern for new resources.
- Any new data-bearing resource needs its own tenant-isolation test **in the phase that adds it**, not deferred to Phase 8.
