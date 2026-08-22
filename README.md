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
├── docs-other/         # Background PDFs (reference only)
├── AGENT.md            # Mandatory rules for any coding agent
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

`npm run prisma:migrate` (`prisma migrate dev`) is interactive and cannot run in
a non-interactive shell. To add a migration there, either run it in a real
terminal, or generate the SQL and apply it:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
```

### API surface (Phase 1)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/v1/health` | public | Liveness |
| `GET /api/v1/health/ready` | public | Liveness plus a PostgreSQL round trip; `503` when the database is down |
| `POST /api/v1/auth/signup` | public | Owner self-registration: creates the shop and the owner, returns a session |
| `POST /api/v1/auth/login` | public | Email and password sign-in |
| `GET /api/v1/auth/me` | bearer | The signed-in profile |
| `GET /api/v1/auth/dev-credentials` | public | Seeded logins for the prefilled form; empty unless development autofill is on |
| `POST /api/v1/businesses` | platform admin | Onboard a shop and its owner |
| `GET /api/v1/businesses` | platform admin | Every shop on the platform |
| `GET /api/v1/businesses/me` | owner/manager/worker | The caller's own business, scoped by token |
| `POST /api/v1/branches` | owner | Add a branch to the caller's own business |
| `GET /api/v1/branches` | owner/manager/worker | Owners see all branches; others see only assigned ones |
| `GET /api/v1/branches/:id` | owner/manager/worker | Another tenant's branch answers `404`, never `403` |

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
`RATE_LIMIT_AUTH` (10/min) for `POST /auth/login` and `POST /auth/signup`.
Exceeding a bucket returns `429`. Every other controller opts out of the strict
bucket with `@SkipThrottle({ auth: true })`.

**Phone numbers.** Owners register with a Tanzanian mobile number in any
spelling — `0712345678`, `+255712345678`, `255 712 345 678` — and it is stored
in one canonical form, `+255712345678`. The rule lives in
[backend/src/domain/phone.ts](backend/src/domain/phone.ts) with its own tests.

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
| `/admin` | Platform administrator: every shop on the platform |
| `/owner` | Owner: their business, branches, and adding a branch |

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

| Command | Purpose |
|---|---|
| `npm test` | Jest unit and component tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:dev` | EAS build of the development client |
| `npm run android` | Local native build — needs a JDK and the Android SDK |

The app is still the foundation shell — it confirms it can reach one Shoprex
backend, with explicit loading, error, and success states. Device enrolment is
Phase 2 and the selling flow is Phase 4.

## Environment variables

All variable names are documented in [.env.example](.env.example). Real values
belong in `backend/.env`, `web/.env.local`, and `mobile/.env`, all git-ignored.
No address, port, or connection string is hardcoded in application code: each
app reads its configuration from its own `.env` and fails at startup if a
required value is missing.

## Design language

Green-led and light-surfaced: Emerald for the main action, Kijani for completed
states, Amber for warnings, red only for destructive or error states. No dark
chrome. Tokens live in `web/src/styles/globals.css` and `mobile/src/app/theme.ts`.
