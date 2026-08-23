# Shoprex V1 — Implementation Phases

**Delivery rule:** Complete one phase, verify its acceptance checks against real tests (not inspection), update `PROGRESS.md`'s master table and phase section, and only then begin the next phase. Do not quietly add features because they are common in POS software, and do not mark a phase complete because most of it works.

**Continuity rule:** At the start of every phase — including the current one if work is already underway — run the full existing automated test suite (backend, web, mobile), not just tests touching new code. A regression introduced two phases ago is still a regression.

**Isolation rule:** Any phase that adds a new data-bearing resource (a new Prisma model, a new backend module with its own records) must include a tenant-isolation check for that resource before the phase is marked complete — not deferred wholesale to Phase 8. Phase 8's isolation pass should find nothing new, only confirm.

**Timestamp rule:** Anywhere "today," "this sale," or a day boundary matters, the authoritative timestamp is the backend server clock, never a value trusted from a mobile device. Devices can lag, have wrong local time, or be deliberately altered; the backend stamps the record.

## Phase 0 — Decisions and design lock

**Purpose:** Confirm the product behavior before coding.

**Deliverables:** Final roles and permissions, Swahili-first copy direction, green-led visual tokens, Android-first scope, device-enrollment flow, online-only V1 rule, report/PDF scope, first-market currency/timezone, the final screen list, and the root documentation skeleton — `AGENT.md`, `README.md`, and `PROGRESS.md` (using the master-table format defined in `PROGRESS.md`'s own spec), created empty/templated so later phases have something real to read and update rather than improvising the format.

**Acceptance check:** The owner can explain the first sale, first product, first device enrollment, and first daily report without referring to the original long specification. `AGENT.md`, `README.md`, and `PROGRESS.md` exist and are readable before any phase-1 code is written.

## Phase 1 — Repository and backend foundation

**Purpose:** Establish the three product surfaces around one authoritative backend.

**Deliverables:** Project structure, NestJS API, PostgreSQL connection, migrations, environment configuration, logging, validation, error format, platform-admin authentication, owner registration/invitation, business and branch model, authorization guards, a minimal health check, and **OpenAPI/Swagger documentation generated from the API** so that Phase 2 onward (including the web app in Phase 6) has a contract to read instead of guessing from controller source.

**Acceptance check:** A platform administrator can create a business and owner; an authenticated owner can only access their own business data; unauthorized branch and business access is rejected by the backend; the API contract is browsable (e.g. at `/docs`).

## Phase 2 — Owner, manager, worker, and device access

**Purpose:** Make a shop usable by real people and real phones.

**Deliverables:** Owner web login, owner branch management, delegated-manager creation and credentials, worker creation and permissions, device creation, unique server-minted device ID, one-time QR/code/link enrollment, device password/PIN access, device revocation, and audit attribution.

**Note on verification surface:** The Next.js web app does not exist until Phase 6. This phase's acceptance check is verified through the backend API directly (automated e2e tests, seed scripts, or a thin internal tool), **not** by building throwaway owner-facing screens. Do not construct a one-off admin UI here to "prove" the flow — that duplicates Phase 6 and invites drift between the two.

**Acceptance check:** Via API-level tests: an owner can create a branch, create a manager, create a device, enroll a test device through a one-time token, revoke that device, and see the actor/device associated with a test action. A revoked device is refused immediately, and an enrollment token cannot be reused or used after expiry.

## Phase 3 — Product, barcode, pricing, and stock engine

**Purpose:** Build and test the part that makes Shoprex different from a basic POS.

**Deliverables:** Product creation, barcode lookup, manual search suggestions, product-specific units, prices, package relationships, fixed measurement conversions, current physical stock, normalized stock, receiving transactions, and engine tests. All stock and sale transaction timestamps are set by the backend, not accepted from the client.

**Acceptance check:** The engine correctly handles `1 Carton = 6 Pieces`, receives `6 Cartons`, sells `1 Piece`, shows `5 Cartons + 5 Pieces`, preserves normalized quantity, and refuses invalid/cyclic package relationships.

## Phase 4 — React Native mobile selling flow

**Purpose:** Deliver the "fast fast" daily workflow.

**Deliverables:** Android React Native shell, device login, role/permission-aware home, Mauzo screen, barcode scanner, search, single-unit auto-add, multi-unit selection, quantity controls, inline new-product creation, cart, cash change, mixed payments, simple debt name, sale completion, receipt, and new-sale reset. Payment methods ship as a small **seeded default set** created via the backend (e.g. Cash, Mobile Money, Debt) — the full payment-method settings *screen* is Phase 6's job, not this phase's.

**Acceptance check:** A worker can scan an existing item, type and select an item, add an unknown item inline, adjust quantities, complete cash/mixed/debt payment against the seeded payment methods, view a receipt, and begin the next sale without dead ends.

## Phase 5 — React Native stock receiving and operational visibility

**Purpose:** Let the shop maintain stock without a separate complicated workflow.

**Deliverables:** Receive-stock screen, barcode/search resolution, inline product creation during receiving, optional unit choice only when necessary, quantity and optional cost, current stock view, and permission enforcement.

**Acceptance check:** A permitted user can receive known and unknown products, while users without the relevant permission are rejected by both the mobile UI and the backend.

## Phase 6 — Next.js owner and admin web app

**Purpose:** Give owners a clear management surface without duplicating the cashier UI, and to give Phases 2 and 5's API-only flows a real interface.

**Deliverables:** Platform-admin area, owner dashboard, branch overview, sales list/detail, stock overview, product management, worker/manager management, device management, **payment-method settings**, and responsive layouts.

**Acceptance check:** Platform administrators can manage shop accounts; owners can manage only their businesses; delegated managers see only authorized branches; web actions use the NestJS API rather than direct database access; the worker/manager/device flows built API-only in Phase 2 now have a working screen.

## Phase 7 — Reports and PDF

**Purpose:** Make daily performance understandable.

**Deliverables:** Today dashboard, date selection, payment breakdown, debt summary, worker totals, stock received, branch comparison for owners, transaction detail, and downloadable daily-sales PDF.

**Acceptance check:** A user can select a date and branch, view the same totals in the dashboard and PDF, and verify that the report uses Tanzania local-day boundaries derived from server-stamped timestamps (see the Timestamp rule above). External report sending is not part of V1.

## Phase 8 — Pilot hardening and launch

**Purpose:** Make the product trustworthy enough for the first real shops.

**Deliverables:** A **cumulative** tenant-isolation and permission test pass (confirming, not first-discovering, isolation on every resource added since Phase 1), sale idempotency, stock transaction tests, QR enrollment expiry tests, device revocation tests, **device clock-skew handling** (a phone with wrong local time must not corrupt which day a sale is reported under), low-end Android testing, barcode failure handling, loading/error/empty states, audit review, database backup/recovery test, and pilot feedback log.

**Acceptance check:** A selected pilot shop can onboard, enroll devices, sell, receive stock, manage workers, view reports, and recover from ordinary network/API errors without data duplication.

## Explicitly deferred after V1

Offline-first operation, offline sales, background synchronization, multi-device conflict resolution, automatic external report sending, mobile-money provider APIs, returns/refunds/corrections, customers/CRM, expenses/profit, suppliers, purchase orders, branch stock transfers, visual recognition, e-commerce, delivery, loyalty, payroll, **receipt printing**, and regulatory fiscal-device integrations.

Receipt printing was added to this list on 2026-08-23, confirmed by the owner during Phase 4. V1 receipts are viewed on the phone or shared through its normal share function; printing is a next-version feature.

## Phase handoff rule

At the end of every phase, the active agent must:
1. Run the **full** existing automated test suite (not just new tests) and record the result.
2. Verify the phase's acceptance check with real tests, not inspection.
3. Update `PROGRESS.md`'s master phase table (status, date, verified yes/no) **and** append/update that phase's detail section — never delete a prior phase's detail section, only add to it.
4. Record decisions made, known issues, and the exact recommended next action.

The next agent must read `AGENT.md`, then `README.md`, then `PROGRESS.md`'s master table (to confirm which phase is actually active), then the relevant documents named in `PROGRESS.md`, before changing code.
