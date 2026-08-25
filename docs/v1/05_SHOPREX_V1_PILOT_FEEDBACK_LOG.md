# Shoprex V1 — Pilot Feedback Log

**Started 2026-08-25, in Phase 8.** This is where what the pilot shops actually
say goes. It is a Phase 8 deliverable in its own right, and it is deliberately
a separate document rather than a section of `PROGRESS.md`: `PROGRESS.md`
records what the project did, and this records what happened when somebody
used it. Those two diverge, and the gap between them is the most valuable
thing a pilot produces.

**It is currently empty of real entries, and that is honest.** No shop has been
selected yet — see `PROGRESS.md` §8, *Blocked / awaiting user*. The template and
the rules below exist so that the first entry can be written in five minutes on
the day it happens, rather than being reconstructed a week later from memory.

---

## How to use this

**Write it down the same day, in their words.** A shopkeeper saying *"it keeps
asking me the thing"* is worth more than an accurate paraphrase, because the
paraphrase has already decided what the problem was. Record the sentence, then
record your interpretation separately and mark it as yours.

**One entry per thing, not one entry per visit.** A visit that surfaces four
problems is four entries, so each can be resolved, argued with, or closed on
its own.

**Do not fix anything in this file.** An entry is a record, not a task. When it
leads to work, the work is a phase item in `PROGRESS.md` and the entry links to
it. Editing an entry to say the problem was less bad than first reported is how
a feedback log stops being trusted; add a follow-up line instead.

**Feature requests are recorded and not acted on.** V1 scope is closed
(`docs/v1/03` — *Explicitly deferred after V1*). Writing a request down costs
nothing and tells the owner what the next version is for; building it during a
pilot means the thing being piloted is no longer the thing that was tested.

### Severity

| Level | Means | Response |
|---|---|---|
| **Blocks trading** | The shop could not sell, receive, or be paid | Same day, whatever else is happening |
| **Wrong data** | A number, a total, or a stock count was wrong | Same day — this is the one that destroys trust in the whole product |
| **Wastes time** | It works, but slowly or through the wrong door | Batch into the next release |
| **Confusing** | They got there, but had to be told how | Usually copy or layout; often the most valuable and the least urgent |
| **Request** | A thing V1 deliberately does not do | Recorded only. Feeds the next version |

### Surface

`mobile` · `web` · `backend` · `hardware` (the phone itself, the camera, the
network) · `process` (training, handover, the way it was set up).

---

## Entry template

Copy this block, do not rewrite it.

```markdown
### PF-000 — <short title, in the shop's own words where possible>

- **Date:** YYYY-MM-DD
- **Shop / branch:**
- **Who said it:** name and role — owner, manager, seller, stock keeper
- **Surface:** mobile | web | backend | hardware | process
- **Severity:** blocks trading | wrong data | wastes time | confusing | request

**What they said**

> Their words, quoted.

**What was actually happening**

What we found, marked as our interpretation and not theirs. "Unknown" is a
legitimate answer and a more useful one than a guess.

**Reproduced?** yes / no / not tried — and on what.

**What was done**

The change, the commit, or the decision not to change anything and why.

**Status:** open | fixed in <commit/phase> | deferred to V2 | won't fix
```

---

## Entries

*None yet — no pilot shop has been selected. The first entry goes here.*

---

## Standing questions for the first pilot visit

Written before contact deliberately, so they are not shaped by whatever the
first shop happens to complain about loudest. Each one is a place the automated
tests are structurally blind — see `PROGRESS.md` §8's *What has no automated
coverage at all*.

1. **Did the camera read the QR off the laptop across the counter?** At what
   angle, in what light, on their phone rather than a good one. Nothing in the
   suite has ever pointed a real camera at a real screen.
2. **What happened the first time the network dropped mid-sale?** Specifically:
   did the seller press **Lipa** again, and did the customer end up charged
   once? The idempotency key is proven in tests; the human behaviour it depends
   on is not.
3. **Did anybody sell something the count said was not there,** and did the
   negative balance read to them as a thing to recount rather than as a bug?
4. **How long did the console take to load on their connection,** and did the
   loading state appear or did it feel like nothing happened?
5. **Did they understand *Deni*** — that it records a name and an amount and
   nothing else, with no collection workflow behind it?
6. **What did they try to do that Shoprex does not do?** Verbatim. This is the
   V2 backlog and the only cheap way to get it.
7. **Who ended up doing the stock receiving,** and was it the person the
   permissions were set up for?
8. **What did they write down on paper anyway?** A shop that keeps a parallel
   paper record is telling you exactly which part of the product it does not
   trust yet.
