# Shoprex V1

Shoprex turns an Android phone into a fast shop-selling and stock tool for shops in
Tanzania. Swahili-first, English-ready, currency TSh.

One repository, one backend, three application folders.

```text
shoprex/
├── backend/            # NestJS + TypeScript API — the only authoritative service
├── web/                # Next.js + TypeScript owner / platform-admin console
├── mobile/             # React Native (Expo) Android app (selling and stock)
├── docs/v1/            # Product, engine, phases, and agent prompt kit
├── AGENT.md            # Mandatory rules for any coding agent
├── CLAUDE.md           # Agent-specific rules; defers to AGENT.md
├── PROGRESS.md         # Current phase, blockers, and exact next action
├── .env.example        # Every environment variable, documented
└── docker-compose.yml  # Optional local PostgreSQL
```

Do not add `api/`, `server/`, `frontend/`, `client/`, or `dashboard/`. If another
root application folder seems necessary, stop and ask first.

## Read before changing code

1. [AGENT.md](AGENT.md)
2. [README.md](README.md) — this file
3. [PROGRESS.md](PROGRESS.md)
4. [docs/v1/01_SHOPREX_V1_PRODUCT_CONCEPT.md](docs/v1/01_SHOPREX_V1_PRODUCT_CONCEPT.md)
5. [docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md](docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md)
6. [docs/v1/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md](docs/v1/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md)
7. [docs/v1/04_AGENT_PROMPT_KIT.md](docs/v1/04_AGENT_PROMPT_KIT.md)

## Architecture rules

- The backend owns authentication, tenants, branches, roles, permissions,
  devices, products, stock, sales, payments, reports, and audit history.
- `web/` and `mobile/` call the backend API. **Neither may open a database
  connection.** Only `backend/` holds `DATABASE_URL`.
- V1 is **online-only**. No offline queue, outbox, background sync, conflict
  resolution, or "Sync Now" control. Multiple devices are allowed; they must be
  online and every authoritative write goes through the backend.
- Tenant, branch, role, and permission checks are enforced on the server.
  Hiding a button is not authorization.
- Deferred until explicitly approved: customers/CRM, returns, refunds,
  profit/expenses, suppliers, e-commerce, visual recognition, branch stock
  transfers, mobile-money provider integrations, external report sending.

## Prerequisites

| Tool | Version used here |
|---|---|
| Node.js | 24.x (npm 11) |
| PostgreSQL | 16 or 17 |
| Expo + EAS CLI | via `npx` (Expo SDK 57, React Native 0.86); no Android Studio needed |
| Android SDK | optional — only for local native builds; EAS makes it unnecessary |
| Docker | optional, for the bundled PostgreSQL |

## 1. Database

Either use an existing local PostgreSQL server, or start the bundled one:

```bash
docker compose up -d          # starts postgres:16-alpine on :5432
```

Local development uses the `postgres` superuser and a database named `shoprex`,
which Prisma creates on the first migration. A dedicated least-privilege role is
worth creating for production, but is unnecessary locally.

## 2. Backend (`backend/`) — http://localhost:3001

```bash
cd backend
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npm install
npm run prisma:generate
npm run prisma:deploy         # applies prisma/migrations to PostgreSQL
npm run prisma:seed           # development accounts (see below)
npm run start:dev
```

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch-mode API on `PORT` (default 3001) |
| `npm run build` / `npm run start:prod` | Compile to `dist/` and run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src` and `test` |
| `npm test` | Jest unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | Jest HTTP tests against a real database (`test/**/*.e2e-spec.ts`) |
| `npm run prisma:deploy` | Apply existing migrations |
| `npm run prisma:seed` | Create/refresh the development accounts |
| `npm run backup` | `pg_dump` the configured database into `backend/backups/` |
| `npm run backup:verify` | Back up, restore into a scratch database, and compare every table's row count. The recovery test |
| `npm run backup:restore -- --file <dump> --url <target>` | Restore a dump. Refuses to overwrite the live database without `--force` |

`npm run prisma:migrate` (`prisma migrate dev`) is interactive and cannot run in
a non-interactive shell. To add a migration there, either run it in a real
terminal, or generate the SQL and apply it:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
```

### API contract — http://localhost:3001/docs

The API documents itself. `GET /docs` serves a browsable Swagger UI, `GET
/docs-json` and `GET /docs-yaml` serve the raw OpenAPI 3 document. Read that
instead of controller source: it is generated from the same decorators the
running API uses, so it cannot drift into describing endpoints that do not
exist.

`/docs` sits **outside** the API prefix deliberately, so the address does not
move when `API_PREFIX` changes. Click **Authorize** and paste the `accessToken`
from `POST /auth/login` to exercise the protected routes; the token survives a
page reload.

The document is covered by `test/openapi.e2e-spec.ts`, which fails if a route is
added without a summary, if a protected route forgets its bearer requirement, if
any request body starts accepting a `businessId`, or if a response starts
carrying a secret.

A **branch** id is a narrower rule than a tenant id, and deliberately so. The
tenant is never negotiable — it comes from the token and no body may carry it.
But a business has several branches and only the owner knows which one a new
worker stands in, so worker and manager creation must be able to name one. Those
two DTOs are pinned in an allowlist in that test, and each is backed by a test
proving a branch from another tenant answers `404` rather than becoming an
assignment. Adding a DTO to that list without such a test is exactly what the
pinning exists to make visible.

### API surface (Phases 1–8)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /docs` | public | Browsable API contract (Swagger UI); raw document at `/docs-json` |
| `GET /api/v1/health` | public | Liveness |
| `GET /api/v1/health/ready` | public | Liveness plus a PostgreSQL round trip; `503` when the database is down |
| `POST /api/v1/auth/signup` | public | Owner self-registration: creates the shop and the owner, returns a session |
| `POST /api/v1/auth/login` | public | Email and password sign-in |
| `POST /api/v1/auth/device/login` | public | Sign-in on a shop phone: `device_id`, who is signing in, and their own password |
| `GET /api/v1/auth/device/:deviceId/people` | public | Who may sign in on this phone — names and ids only, for the sign-in screen |
| `GET /api/v1/auth/me` | bearer | The signed-in profile, including permissions and the bound device |
| `GET /api/v1/auth/dev-credentials` | public | Seeded logins for the prefilled form; empty unless development autofill is on |
| `POST /api/v1/businesses` | platform admin | Onboard a shop and its owner |
| `GET /api/v1/businesses` | platform admin | Every shop on the platform |
| `PATCH /api/v1/businesses/:id` | platform admin | Suspend or restore a shop account; takes effect on the next request, deletes nothing |
| `GET /api/v1/businesses/me` | owner/manager/worker | The caller's own business, scoped by token |
| `POST /api/v1/branches` | owner | Add a branch to the caller's own business |
| `GET /api/v1/branches` | owner/manager/worker | Owners see all branches; others see only assigned ones |
| `GET /api/v1/branches/:id` | owner/manager/worker | Another tenant's branch answers `404`, never `403` |
| `POST /api/v1/users/managers` | owner | Create a delegated manager with credentials and branch scope |
| `POST /api/v1/users/workers` | owner | Create a worker from a name, a password, one branch — no email |
| `GET /api/v1/users` | owner/manager | Owners see all staff; managers see only their branches' staff |
| `GET /api/v1/users/:id` | owner/manager | Another tenant's staff member answers `404`, never `403` |
| `PATCH /api/v1/users/:id/permissions` | owner | Replace a person's permission set outright |
| `POST /api/v1/devices/enrollments` | owner | Issue a one-time enrollment code binding a phone to a **branch**; returned **once**, with a scannable QR of the same code |
| `POST /api/v1/devices/enroll` | public | A phone redeems its code; the backend mints `device_id` and binds it to the branch |
| `GET /api/v1/devices` | owner/manager | Owners see all devices; managers see only their branches' |
| `GET /api/v1/devices/:id` | owner/manager | Another tenant's device answers `404`, never `403` |
| `POST /api/v1/devices/:id/revoke` | owner | Refuses that phone at the backend on its very next request |
| `GET /api/v1/audit-events` | owner | Who did what, from which device, and when |
| `POST /api/v1/products` | SELL or RECEIVE_STOCK | Add a product; a worker may, so unknown items are addable mid-sale |
| `GET /api/v1/products` | any staff | Manual search suggestions; matches anywhere in the name |
| `GET /api/v1/products/lookup` | any staff | Barcode lookup (EAN-13); a mis-scan answers `400`, an unknown code `404` |
| `GET /api/v1/products/unit-names` | any staff | Unit names this shop already uses, most-used first — feeds the unit picker |
| `GET /api/v1/products/:id` | any staff | Another tenant's product answers `404`, never `403` |
| `POST /api/v1/products/:id/units` | SELL or RECEIVE_STOCK | Add a packaging later — progressive enrichment |
| `PATCH /api/v1/products/:id` | owner | Rename or discontinue. Discontinued is not deleted: it cannot be sold or received, and its history and stock stay |
| `PATCH /api/v1/products/:id/units/:unitId` | owner | Set a price. Never rewrites a completed sale — every line snapshotted its own |
| `POST /api/v1/products/:id/barcodes` | owner | Attach a barcode to a product that was typed in without one |
| `POST /api/v1/branches/:branchId/stock-receipts` | RECEIVE_STOCK | Record a delivery into that branch, all-or-nothing. Takes an optional `idempotencyKey`, so a retried delivery returns the first receipt instead of receiving the crate twice |
| `GET /api/v1/branches/:branchId/stock` | VIEW_STOCK | What the branch holds, physical packages plus normalized |
| `GET /api/v1/branches/:branchId/stock/:productId` | VIEW_STOCK | One product, answering `0` rather than `404` when there is none |
| `GET /api/v1/payment-methods` | any staff | The checkout buttons: this shop's **active** payment methods. `?includeInactive=true` is owners only |
| `POST /api/v1/payment-methods` | owner | Add a way of being paid. `kind` is fixed at creation |
| `PATCH /api/v1/payment-methods/:id` | owner | Rename, reorder, or switch off. There is deliberately no delete |
| `POST /api/v1/branches/:branchId/sales` | SELL | Complete a sale — one atomic, idempotent command |
| `GET /api/v1/branches/:branchId/sales` | VIEW_REPORTS | The owner's sales list, newest first, keyset-paged. Optional `?date=` narrows it to one shop-local day, resolved the same way the report below is |
| `GET /api/v1/branches/:branchId/sales/:id` | any staff | One sale, as a receipt |
| `GET /api/v1/branches/:branchId/reports/daily` | VIEW_REPORTS | The day, read back: totals, payment breakdown, debts, sellers, best sellers, stock received, and the transactions themselves. `?date=` selects a shop-local day; omit it for today |
| `GET /api/v1/branches/:branchId/reports/daily.pdf` | VIEW_REPORTS | The very same report, as a downloadable PDF — rendered from that response, never recomputed |
| `GET /api/v1/reports/branches` | VIEW_REPORTS | One day across every branch the caller may see, for comparison |

Every error uses one envelope, shared by both clients:

```json
{
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Cannot GET /api/v1/nope",
  "path": "/api/v1/nope",
  "timestamp": "2026-08-21T18:52:23.241Z"
}
```

**Rate limiting.** Two buckets, both per client address and configurable in
`.env`: `RATE_LIMIT_DEFAULT` (120/min) for the API at large, and
`RATE_LIMIT_AUTH` (10/min) for the four routes that accept a secret from an
unauthenticated caller — `POST /auth/login`, `POST /auth/signup`,
`POST /auth/device/login`, and `POST /devices/enroll`. Exceeding a bucket
returns `429`. Every other controller opts out of the strict bucket with
`@SkipThrottle({ auth: true })`.

An e2e suite that drives many sign-ins or enrollments must raise
`RATE_LIMIT_AUTH` **before** importing `AppModule`, since the limits are read
when the module is built — see `rate-limit.e2e-spec.ts` for the pattern.

**Workers and devices.** A worker is created with a name, a password, and one
branch — deliberately no email, because workers never use the web console. The
owner issues a **one-time enrollment code** for a **branch**, naming the phone
so they can tell their handsets apart. Someone gets it into the Android app
once — by scanning or by typing — and the backend mints the `device_id` and
binds that install to one business and one branch.

**Two ways in, one code.** Issuing an enrollment returns the code *and* a
`qrSvg`: the same code drawn as a scannable QR. Somebody standing at the
owner's laptop taps **Soma msimbo** and points the phone at the screen;
somebody reading it down the line types it. The QR carries the **bare code and
nothing else** — no URL, no JSON, no server address — so both paths hand
`POST /devices/enroll` an identical string and the backend cannot tell which
was used. One redemption path, one set of rules, one thing to test. Typing
stays the default on the phone because it always works: no camera, no
permission, no screen to point at.

`qrSvg` **is the credential**, not a picture about it, so it lives under
exactly the same rules as `code`: returned once at issue, never stored, never
logged, never in an audit summary. `test/openapi.e2e-spec.ts` holds it to that
rule by name, so it cannot later be added to a device view on the grounds that
it "is only an image".

**A phone belongs to a branch, not to a person** (changed 2026-08-23). Anyone
assigned to that branch signs in on it: the app shows the people who work there
— plus the owner, who reaches every branch — and they tap their name and type
their own password. A flat battery or a phone left at home no longer ends a
shift, and a branch may hold as many handsets as it needs.

Because the handset no longer identifies anybody, **sign-in does**.
`GET /auth/device/:deviceId/people` returns names and ids only, never a
credential, and `POST /auth/device/login` takes the device, the person, and
that person's password. **Choosing a name grants nothing** — the password is
the only credential, and the backend re-checks that the person really is
assigned to that phone's branch before comparing it. Somebody from the next
branch over is refused with a correct password.

Attribution comes from the session, not the handset: every sale and stock
movement records both the person and the phone. Revocation takes effect at the
backend on the phone's very next request — an existing, still-unexpired token
stops working immediately, and a revoked phone will not even say who works at
that branch.

The code is a secret: it is returned once at issue, stored only as a SHA-256
hash, never echoed back, and kept out of the audit log. Both public device
routes sit in the strict auth rate-limit bucket.

**Suspending a shop account.** `Business.isActive` is enforced everywhere at
once. A platform administrator flips it with `PATCH /businesses/{id}`; sign-in
already refused a suspended shop, and `BusinessActiveGuard` refuses the tokens
issued *before* the suspension, on their very next request — an account that is
suspended everywhere except in the sessions already open is not suspended. The
answer is `403`, not `401`: the credentials are fine, and sending somebody back
to sign in would loop them into the same place. **Nothing is deleted**, so a
restored shop comes back whole. It costs one primary-key lookup per
authenticated request that carries a tenant; platform administrators carry none
and skip it.

**Discontinuing a product.** `Product.isActive` is enforced in one place —
`StockService.resolveUnit`, which every write path to stock goes through and no
read path does. A discontinued item cannot be sold or received (`409`), leaves
the search suggestions, and yet stays fully readable: Stoo still counts what is
on the shelf, and every past sale still reads the way it did. A **scan still
finds it**, deliberately, so the phone can say *this was discontinued* rather
than *unknown code* — which would invite somebody to create a duplicate
carrying a barcode that is already taken. `mobile/src/domain/cart.ts` refuses it
at the scan rather than at the payment sheet.

**Permissions.** `SELL`, `RECEIVE_STOCK`, `VIEW_STOCK`, and `VIEW_REPORTS` are
granted per person by the owner and enforced by `PermissionsGuard` on the
server. `VIEW_REPORTS` got its first consumer in Phase 6: the **sales list**
needs it, while the single-sale receipt does not — a seller must be able to read
back the sale they have just rung up, and browsing what the shop has taken all
day is a management act rather than part of selling. A guarded route reads them from the database on each request rather
than from the token, so taking a permission away takes effect immediately
instead of whenever an eight-hour token expires. Owners are never checked
against these — within their own business they are the authority that grants
them. Where a route accepts more than one, it means *any of*, because adding an
unknown item mid-sale must work for a seller as well as a stock keeper.

**The stock engine.** Package relationships belong to the product: `1 Carton =
6 Pieces` for one product and `1 Carton = 48 Pieces` for another. A product's
units form a tree whose leaf is the base unit, and the engine refuses anything
that is not one — a cycle, a self-reference, a unit given two parents, or units
that do not connect. Fixed measurement conversions (`1 kg = 1000 g`, `1 L =
1000 ml`, `1 m = 100 cm`, `1 dozen = 12`) cannot be redefined by a business.

Stock is kept two ways. The **physical package state** is what a shopkeeper
would recite — `5 Cartons + 5 Pieces` — and the **normalized quantity** is the
same holding as one number in base units, for arithmetic. Selling a Piece with
none loose breaks a Carton open; the engine **never repackages upward**, so six
loose Pieces stay six loose Pieces and cannot be sold as a Carton. A movement
that would overdraw the branch **still completes**, taking the balance negative
and recording the difference — see below.

The arithmetic lives in [backend/src/domain/](backend/src/domain/) — `units.ts`,
`stock.ts`, `barcode.ts` — as pure functions with no database or HTTP in sight,
and it is the most heavily tested part of the codebase. Keep it there.

**Prices** are whole Tanzanian shillings, stored as integers: TZS is not divided
into subunits in practice, and money that cannot be represented exactly
eventually disagrees with itself. One price per unit across the business.

**Barcodes** are EAN-13. A 12-digit UPC-A is accepted and widened to its EAN-13
form — that is what it already means — and the check digit is verified, so a
mis-scan is refused rather than stored as a product nothing will ever match.
Barcodes are unique per tenant, not globally: two shops may stock the same item.

**Selling more than the records show.** A sale is never refused for want of a
stock record. The seller is holding the item, so the shop has it whatever the
count says — and on a product created seconds earlier during the sale, a refusal
would be plainly absurd. The balance goes **negative**, the shortfall is stored
on the sale line, and an audit entry names the product and the amount so the
owner can recount. The seller is told the sale went through and the count was
short, never that the sale failed.

Negative is deliberate and self-correcting: received minus sold always equals
the balance, so selling 5 with 2 counted sits at -3, and receiving 10 later
lands on the true 7 with nobody doing arithmetic by hand. The engine still never
repackages upward — selling a Carton from twelve loose Pieces takes the Carton
line to -1 and leaves the Pieces alone.

**Sales.** Completing a sale is **one command and one transaction**: the sale,
its lines, the payment settlement, the payment records, and the stock movements
either all happen or none do. A sale that overdraws the branch on its third
line leaves no sale, no payment, and no movement behind.

Every sale requires an `idempotencyKey`, unique per business. A retried request
carrying a key that has already been used returns the sale the first attempt
created rather than ringing it up twice — including when two identical requests
race each other, which a unique index catches. That is deliberate: a network
that drops the response is the normal case on a Tanzanian phone, not the
exception.

**A delivery carries one too**, as of Phase 8: `POST /branches/:id/stock-receipts`
takes an optional `idempotencyKey` under exactly the same rule. It is nullable
where a sale's is required, because the column arrived after the route did and
PostgreSQL treats NULLs as distinct in a unique index — a client that sends no
key behaves as it always did and never collides with another. The phone always
sends one.

**And the phone actually uses both**, which until Phase 8 it did not. `Mauzo`
minted a fresh key inside the submit handler on every attempt, so the backend's
guarantee was real and unreachable: a lost response meant the seller pressed
**Lipa** again and a second sale was rung up, stock and all. The key is now
minted once per cart, reused by every retry, and discarded only on success — or
when the cart is **edited**, because a changed cart is a different sale and
answering it with the first receipt would silently drop the line the seller just
added. `Pokea mzigo` does the same with the basket. Both say so on the failure:
*bonyeza tena — hakitauzwa mara mbili*.

Each line **snapshots** the product name, unit name, price, conversion factor,
and normalized quantity. Repricing Coke tomorrow does not change what a
customer paid today, and a receipt read back next month says what it said. The
same product sold as `2 Cartons` and `5 Pieces` stays two lines, because that
is what went over the counter.

The sale arithmetic lives in [backend/src/domain/sale.ts](backend/src/domain/sale.ts)
as pure functions, beside `units.ts` and `stock.ts`.

**Payments and debt.** Payment methods are configured per business. Every shop
is created with three — **Taslimu** (cash), **Pesa ya simu** (mobile money),
and **Deni** (debt) — and the settings screen that edits them is Phase 6's.
Only **active** methods can settle a sale, so deactivating `Deni` is how an
owner stops their shop selling on credit; a phone holding a stale list is
refused by the backend.

Payments must settle the total **exactly**. Change is calculated by the backend
from the cash actually tendered, never accepted from the client, and only a
method whose *kind* is `CASH` may carry one — a phone cannot call an M-Pesa
payment cash to conjure change out of it. A debt records a free-text debtor
name and the amount owed, and nothing else: no customer account, no history,
no collection workflow. One debt per sale, because a bill is owed by one person.

**Phone numbers.** Owners register with a Tanzanian mobile number in any
spelling — `0712345678`, `+255712345678`, `255 712 345 678` — and it is stored
in one canonical form, `+255712345678`. The rule lives in
[backend/src/domain/phone.ts](backend/src/domain/phone.ts) with its own tests.

**Daily reports.** A day is the shop's own, never the server's and never a
client's. `Business.timezone` (`Africa/Dar_es_Salaam` by default) and the
backend clock are turned into a UTC instant range by one pure function,
[backend/src/domain/day-window.ts](backend/src/domain/day-window.ts) — everything
that needs a day boundary calls it, so the sales list's `?date=` filter and the
report cannot come to disagree about where one day ends and the next begins. A
sale is never asked when it happened; only `createdAt`, the server clock's own
stamp, decides which day it falls in.

The figures themselves — totals, the payment-method breakdown, debts by name,
who sold what, what arrived, and the best sellers — are pure arithmetic over
snapshotted values in
[backend/src/domain/report.ts](backend/src/domain/report.ts): a report reads
`SaleLine.productName`, `SalePayment.methodName`, and the like, the values a
sale or a receipt stored at the moment it happened, and never joins back to the
live product, unit, or payment-method row. A renamed payment method does not
split a past day's takings into two rows, and a report of last month reads with
last month's prices.

The downloadable PDF is generated by a small hand-written writer,
[backend/src/domain/pdf.ts](backend/src/domain/pdf.ts) — no dependency, no
embedded font, just the fourteen base fonts every PDF reader already has — and
it is composed in
[backend/src/modules/reports/daily-report.pdf.ts](backend/src/modules/reports/daily-report.pdf.ts)
from **the very same response object** the dashboard is given. Nothing in that
file computes a total; it only lays one out. That is what makes "the dashboard
and the PDF agree" true by construction rather than by two implementations
staying in sync by luck — and it is also how `test/reports.e2e-spec.ts` proves
it: the PDF's text stream is deliberately uncompressed, so the test reads the
numbers back out of the generated bytes and compares them to the JSON.

### Backups and recovery

```bash
cd backend
npm run backup           # → backend/backups/shoprex-<db>-<timestamp>.dump
npm run backup:verify    # the recovery test — see below
```

`scripts/backup.js` wraps `pg_dump`/`pg_restore` in PostgreSQL's custom format
(`-Fc`, `--no-owner --no-privileges`), so a dump taken as `postgres` locally
restores as whatever role a pilot host uses. The password is passed as
`PGPASSWORD` rather than on the command line, where it would sit in shell
history and in `ps` output.

**`backup:verify` is the Phase 8 deliverable, and it is the only one that
matters.** A backup nobody has restored is a file. It counts the rows in every
tenant-bearing table, takes a real backup, creates a scratch database beside the
live one, restores into it, counts again, prints both columns side by side, and
fails if any pair disagrees. It never writes to the database it read from, and
it drops the scratch database afterwards unless given `--keep`.

`backup:restore` refuses to overwrite the database `DATABASE_URL` points at
unless given `--force`; the ordinary path is `--url` to somewhere else.

Dumps are git-ignored (`backend/backups/`, `*.dump`). A dump is a complete copy
of a shop's trading — every price, every debtor's name, every password hash —
and is the single worst file in this repository to commit by accident.

**Scheduling, offsite copies, encryption, and retention are deliberately not
here.** Those are decisions about where a pilot is hosted, which the owner has
not made — see `PROGRESS.md` §8. This is the mechanism and the proof it works.

### Development accounts

`npm run prisma:seed` creates two accounts, both with password `shoprex12345`:

| Account | Role | Lands on |
|---|---|---|
| `admin@shoprex.co.tz` | Platform administrator | `/admin` |
| `owner@shoprex.co.tz` | Owner of "Duka la Mfano" | `/owner` |

When `DEV_LOGIN_AUTOFILL=true` and `NODE_ENV` is not production, the web login
form **arrives already filled in** with one of these accounts, with a chip to
switch between them — sign-in during development needs no typing. The backend
returns an empty list in any other configuration, so a deployed Shoprex can never
hand out credentials. The seed itself refuses to run when `NODE_ENV=production`.

### Tests

Unit tests use mocks and need no database. The e2e suites boot the real HTTP
surface against PostgreSQL, isolated in their own `shoprex_e2e` schema, which
`test/global-setup.js` migrates before the run — development data is never
touched. Point them elsewhere with `TEST_DATABASE_URL` if you prefer.

| Suite | What it holds in place |
|---|---|
| `test/auth.e2e-spec.ts` | Sign-in, platform-admin onboarding, owner tenant isolation |
| `test/signup.e2e-spec.ts` | Owner self-registration, including phone normalisation |
| `test/branch-assignment.e2e-spec.ts` | Branch-level isolation for managers and workers — an unassigned branch answers `404` even inside the caller's own business |
| `test/openapi.e2e-spec.ts` | The published contract: every route documented, every protected route marked, no tenant id in any request body |
| `test/rate-limit.e2e-spec.ts` | `429` after the configured sign-in limit |
| `test/health.e2e-spec.ts` | Liveness/readiness and the shared error envelope (Prisma stubbed) |
| `test/stock-engine.e2e-spec.ts` | Phase 3's named scenario over real HTTP: `1 Carton = 6 Pieces`, receive 6, sell 1, read back `5 Cartons + 5 Pieces` |
| `test/catalogue-isolation.e2e-spec.ts` | Tenant and branch isolation for products, barcodes, and stock |
| `test/sales.e2e-spec.ts` | Phase 4's acceptance check driven as a worker on an enrolled phone: scan, search, add inline, adjust, cash/mixed/debt, receipt, next sale, idempotent retry |
| `test/sales-isolation.e2e-spec.ts` | Tenant and branch isolation for sales, sale lines, payments, and payment methods |
| `test/stock-receiving.e2e-spec.ts` | Phase 5's acceptance check as a stock keeper on an enrolled phone: receive a known product, add and receive an unknown one, all-or-nothing deliveries, and every refusal — no permission, wrong branch, revoked phone |
| `test/web-console.e2e-spec.ts` | Phase 6's acceptance check as all four roles: a platform administrator onboarding, suspending, and restoring a shop; an owner reaching only their own; a manager scoped to assigned branches and refused every owner-only write; product management, payment settings, and the paged sales list |
| `test/reports.e2e-spec.ts` | Phase 7's acceptance check: a sale one millisecond either side of the shop-local day boundary lands in the correct day; the dashboard and the generated PDF are read back and compared number for number; branch selection and the branch comparison |
| `test/reports-isolation.e2e-spec.ts` | Tenant and branch isolation for reports — no new table, but a read across every table a shop owns, so this checks that nothing from another business or an unassigned branch reaches a total, a row, or the PDF |
| `test/pilot-journey.e2e-spec.ts` | Phase 8's acceptance check as one shop's first day, from an empty database: sign up, open a branch, take on staff, enrol a phone, receive, sell, read the day back — then a wrong device clock and a dropped network, proving nothing is recorded twice |
| `test/isolation-pass.e2e-spec.ts` | Phase 8's **cumulative** pass. Sweeps every tenant-scoped route from another shop's token and from an unassigned branch in one table, and reads the Prisma datamodel to fail when a model carrying a `businessId` is not named in its coverage map — so a table added in a later phase cannot arrive without isolation |

## 3. Web (`web/`) — http://localhost:3000

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (component tests opt into jsdom per file) |

| Route | Who it is for |
|---|---|
| `/` | Signpost: redirects to the right console, or to sign-in |
| `/signup` | Owner self-registration — shop name, email, phone, password |
| `/login` | Email and password sign-in, prefilled in development |
| `/admin` | Platform administrator: every shop, onboarding, suspend and restore |
| `/owner` | Overview: counts and doors. Deliberately no money — see `/owner/reports` |
| `/owner/reports` | The day, read back: totals, payment breakdown, debts, sellers, best sellers, stock received, branch comparison, and a PDF download. Needs `VIEW_REPORTS` |
| `/owner/sales` | Sales list for a branch, newest first, keyset-paged. Needs `VIEW_REPORTS` |
| `/owner/sales/[branchId]/[saleId]` | One sale, as the customer was shown it |
| `/owner/stock` | What a branch holds, in packages. Negatives shown and counted |
| `/owner/products` | Prices, barcodes, discontinuing, and adding a product |
| `/owner/branches` | Branch overview, and adding one |
| `/owner/staff` | Workers and managers: create, and change what they may do |
| `/owner/devices` | Enrol a phone (the code is shown **once**) and revoke one |
| `/owner/payment-methods` | How the shop is paid: add, rename, switch off |

**Managers share the owner console.** They see fewer doors rather than the same
doors greyed out — a dimmed control teaches somebody that Shoprex is broken,
while an absent one paired with a written note teaches them who to ask. The
backend refuses the action either way; the navigation is courtesy, not
authorization. Every screen has explicit loading, empty, error, and
permission-denied states, and a `403` is rendered as the shop's own rule in
amber rather than as a red fault with a pointless retry.

**A backend that cannot answer is not a sign-out.** `currentProfile()` treats
only `401` and `403` as "signed out"; a rate limit, a timeout, or an unreachable
API sends the reader to `/login?problem=backend`, which says so plainly rather
than inviting them to retype a password that was never the problem.

Sign-in posts to a Next route handler, which calls the backend and stores the
access token in an **httpOnly cookie** — page scripts never see the token, and
every authenticated call is made server-side. **The backend decides which
console an account belongs to** (`user.console`); the web app only follows it,
so nobody is asked "are you an admin or an owner?". A signed-in user who visits
the wrong console is redirected to their own.

## 4. Mobile (`mobile/`) — React Native + Expo (Android)

Shoprex ships an **Expo development build**, not Expo Go. Builds run on **EAS**
(Expo's cloud), so no Android Studio, JDK, or local Android SDK is required, and
no USB cable is involved.

```bash
cd mobile
cp .env.example .env          # then set EXPO_PUBLIC_SHOPREX_API_BASE_URL
npm install
npx eas-cli login             # free Expo account
npx eas-cli init              # links the project
npm run build:dev             # cloud build; ends with a QR code and a link
```

Open the link on the phone and install the APK. After that, day-to-day work is
just Metro:

```bash
npm start
```

A **new cloud build is only needed when native code changes** — a new native
dependency, or an `app.json` edit. JavaScript changes reload over Wi-Fi.

The API address is configuration, never code. Set it in `mobile/.env`:

| Running on | `EXPO_PUBLIC_SHOPREX_API_BASE_URL` |
|---|---|
| Physical phone | `http://<your-PC-LAN-IP>:3001/api/v1` |
| Android emulator | `http://10.0.2.2:3001/api/v1` |

`EXPO_PUBLIC_*` values are inlined when Metro bundles, so changing `.env` needs
only `npm start --clear`. If the value is missing the app fails loudly at
startup. The phone needs to reach the PC, so allow ports **3001** and **8081**
through the firewall; the backend already listens on `0.0.0.0`.

Standalone builds bundle in the cloud and do not see `mobile/.env`. They read the
same variable from an **EAS environment** instead — `preview` for the staging
address, `production` for the live one — set in the EAS dashboard or with
`npx eas-cli env:create`. It must be `https://`: a release APK on Android 9+
refuses cleartext HTTP.

### Distributing and updating the app

Phones are given an APK built on EAS and are then kept current **over the air**,
so a fix never requires a reinstall. Builds carry a *channel*, and only receive
updates published to it.

| Git branch | Channel | Profile | Who holds it |
|---|---|---|---|
| `staging` | `staging` | `preview` | Developers and QA |
| `production` | `production` | `pilot` | The pilot shop |

Merge into `staging`, run the suite, check the branch out and `npm run
update:staging`; once QA is happy, merge to `production` and `npm run
update:production`. Merging publishes nothing on its own — `eas update` uploads
the **working tree**, so the checkout is what makes a publish match the branch you
verified. Over-the-air updates carry JavaScript and assets only; a native change
still needs a new APK, and `runtimeVersion`'s fingerprint policy makes that fail
safe by not offering the update to binaries that cannot run it.

Full detail, including the after-a-merge decision table: `mobile/README.md`.

| Command | Purpose |
|---|---|
| `npm test` | Jest unit and component tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:dev` | EAS build of the development client |
| `npm run build:preview` | EAS build of the QA APK (`staging` channel) |
| `npm run build:pilot` | EAS build of the pilot shop's APK (`production` channel) |
| `npm run update:staging` | Publish a JavaScript update to QA |
| `npm run update:production` | Publish a JavaScript update to the pilot shop |
| `npm run android` | Local native build — needs a JDK and the Android SDK |

### What the app does

Enrol → sign in → home, and from home to **Mauzo**, **Pokea mzigo**, **Stoo**,
or **Bidhaa** — each returning home and nowhere else.

| Screen | What it is for |
|---|---|
| Enrol | The one-time code the owner handed over — **scanned from their screen or typed**, both submitting the identical string. The backend mints the `device_id`; the phone never chooses one |
| Sign in | The worker's own password on the phone enrolled to their branch. No email, and no code after the first time |
| Home | Built from the permissions the backend returned. Anything not granted is explained in words, never shown as a dimmed button |
| Mauzo | Scan or type, adjust, pay. One sellable unit adds itself at quantity 1; a rescan increments that line; several units ask which |
| Receipt | The commercial units actually sold, the change, and any debt. Shareable through the phone's own share sheet — **printing is not a V1 feature**, see `docs/v1/01` §8 |
| Pokea mzigo | Needs `RECEIVE_STOCK`. The same scan/type/add-inline three ways in, then how many arrived and optionally what one cost. The whole delivery is one request, because the backend records it as one transaction |
| Stoo | Needs `VIEW_STOCK`. What the branch holds, in packages — `5 Carton + 5 Piece`. A negative balance is shown and named as something to recount, never hidden |
| Bidhaa | The catalogue, and the one place adding to it is the point rather than a rescue. Reading needs no permission beyond being staff; the **add** button needs `SELL` or `RECEIVE_STOCK`. A price is **not** required here — cataloguing is not selling |

Navigation is a small `Route` union in `src/app/App.tsx` rather than a router:
the app is one path with four destinations off home, and four native
navigation dependencies would buy nothing. Android's hardware back button is
wired to the same state.

**Adding a product no longer needs an errand.** It was always possible on the
phone — doc 01 §5 requires it mid-sale — but only ever as a rescue from a
different task: scan something unknown, or search a name and find nothing.
**Bidhaa** makes the same `NewProductSheet` reachable directly, which is what
somebody unpacking six new lines actually needs. The sheet is shared rather
than copied, so the sale, the delivery, and the catalogue cannot drift into
three different ideas of what a product is.

**Where mobile code lives.** `src/features/<name>/` holds what belongs to one
feature and nothing else. `src/components/` holds the composite pieces several
features share — `ScannerSheet`, `NewProductSheet`, `UnitNameField` — and
mirrors `web/src/components/`. `src/app/ui.tsx` holds the small building
blocks those are composed from (buttons, cards, fields), `src/domain/` the pure
rules, and `src/core/` the API client and session store.

The three shared sheets sat in `src/features/sale/` until 2026-08-25, because
selling was once the only thing that scanned or created a product. Four
features now use `ScannerSheet` and three use `NewProductSheet`, so the path
was telling most of its callers something untrue; moving them changed no
behaviour and no test.

The rules that decide what a scan *means* live in
[mobile/src/domain/cart.ts](mobile/src/domain/cart.ts),
[mobile/src/domain/payment.ts](mobile/src/domain/payment.ts), and
[mobile/src/domain/receiving.ts](mobile/src/domain/receiving.ts) as pure
functions, not in the screens. Receiving is its own module rather than a mode
on the cart: every packaging can be received whether or not it has been priced,
a line carries an optional **cost** rather than a required price, and there is
no money to settle at the end. The phone's arithmetic exists so the seller can see the
total and the change while deciding; **the backend recomputes every number and
is the authority.** There is no offline queue: a sale that cannot reach the
backend did not happen, and the seller is told so.

Two native modules are used, both matching the direction in
`docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` §§1 and 3:

| Package | Why |
|---|---|
| `expo-camera` | EAN-13/UPC-A barcode scanning. A refused camera permission is a real screen with a way forward — the seller can still type the name |
| `expo-secure-store` | The `device_id` and access token, in Android's keystore-backed store |

**Both are native, so adding them needs one new EAS development build**
(`npm run build:dev`) before the app runs on a phone. JavaScript changes after
that still reload over Wi-Fi, and the automated tests replace both modules and
need no rebuild.

## Environment variables

All variable names are documented in [.env.example](.env.example). Real values
belong in `backend/.env`, `web/.env.local`, and `mobile/.env`, all git-ignored.

Phase 2 added one: `DEVICE_ENROLLMENT_TTL_MINUTES` (default 60, range 5–1440)
sets how long a one-time device enrollment code stays valid. Short on purpose —
the code is a secret handed to a worker on paper.
No address, port, or connection string is hardcoded in application code: each
app reads its configuration from its own `.env` and fails at startup if a
required value is missing.

## Design language

Green-led and light-surfaced: Emerald for the main action, Kijani for completed
states, Amber for warnings, red only for destructive or error states. No dark
chrome. Tokens live in `web/src/styles/globals.css` and `mobile/src/app/theme.ts`.
