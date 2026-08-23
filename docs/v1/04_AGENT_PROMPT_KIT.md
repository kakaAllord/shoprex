## 1. Phase execution prompt

Use this for ordinary in-phase work once the audit above has run at least once.

```text
You are continuing Shoprex V1. Follow AGENT.md's reading order and operating rules
before touching code. Confirm the active phase from PROGRESS.md's master table
and that its stated status matches reality (rerun tests if in doubt).

Implement only the deliverables and acceptance checks for the active phase from
docs/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md. Do not add deferred V1 features. Do not
create a second backend or direct database access from web/mobile. Do not build a
UI for a surface a later phase owns — verify via the API instead.

Before implementation: summarize the phase goal in your own words, list the exact
files/modules you expect to touch, flag anything needing user approval, and state
how you'll test the acceptance checks.

During implementation: keep domain rules outside UI components; enforce tenant,
branch, role, and permission checks on the backend; preserve historical sale and
stock facts; use the green-led, Swahili-first/English-ready design direction;
make loading/empty/error/permission-denied states explicit; timestamp
authoritative events on the backend, never trust the device clock.

After implementation: run the full test suite (not just new tests), verify the
acceptance checks end to end, review for dead buttons/placeholder data/duplicate
API logic/direct DB access/scope drift, then update PROGRESS.md — flip the master
table row and append this phase's detail section (status, files changed, tests
and results, decisions made, known issues, exact next action). Do not mark a
phase complete unless its acceptance checks were actually verified.

If blocked by a product decision, credential, environment issue, or failing
acceptance check, stop and record it under "Blocked / awaiting user" in that
phase's PROGRESS.md section. Do not work around it silently.
```

## 2. Handover prompt — a different agent starts a fresh session

```text
You are taking over an existing Shoprex V1 session. Follow AGENT.md's reading order.

Before doing anything else, give a short takeover report: current phase per
PROGRESS.md's master table, whether that status is trustworthy (rerun tests if
unsure), completed vs. incomplete work, blockers, and the exact next task you
believe is authorized.

Confirm the repository still contains only backend/, web/, and mobile/ at the
root, that web/mobile use the backend API, and that no deferred V1 feature has
been added. Wait for confirmation if PROGRESS.md is contradictory, stale, or
missing information that matters for the next task. Otherwise continue only with
the exact next action recorded there, then update PROGRESS.md before ending.
```

## 3. Emergency debugging prompt

```text
Debug the current Shoprex V1 issue without changing product scope. Read AGENT.md,
README.md, PROGRESS.md, and the relevant engine/phase document first. Reproduce
the issue with the smallest possible test or command, and identify whether the
root cause is backend, web client, mobile client, migration, authorization, or
environment.

Do not hide the issue with mock data, bypass authorization, duplicate business
logic in the UI, or create a second API. Fix the smallest root cause, add or
update a regression test, run the full relevant test suite, and document the fix
and remaining risk in the current phase's PROGRESS.md section.
```