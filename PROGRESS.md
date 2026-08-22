# Shoprex V1 — Live Progress

This file has two parts. **Part A** is the master table — read this first, always, on every session; it is the single source of truth for what phase the project is actually in. **Part B** is one append-only section per phase with the detail. Never delete a completed phase's section when a later phase starts; add to this file, don't rewrite it.

If Part A and Part B ever disagree (e.g. the table says "Complete" but a section describes a known-failing check), **the more cautious of the two is authoritative** and the mismatch itself must be logged as a blocker.

---

## Part A — Master phase table

| # | Phase | Status | Acceptance check verified? | Last updated |
|---|---|---|---|---|
| 0 | Decisions and design lock | Complete | Yes | 2026-08-20 |
| 1 | Repository and backend foundation | Complete | Yes — see §1 | 2026-08-22 |
| 2 | Owner, manager, worker, and device access | Not started | — | — |
| 3 | Product, barcode, pricing, and stock engine | Not started | — | — |
| 4 | React Native mobile selling flow | Not started | — | — |
| 5 | React Native stock receiving and operational visibility | Not started | — | — |
| 6 | Next.js owner and admin web app | Not started | — | — |
| 7 | Reports and PDF | Not started | — | — |
| 8 | Pilot hardening and launch | Not started | — | — |

**Status values:** `Not started` / `In progress` / `Blocked` / `Complete`. Only mark `Complete` when the acceptance-check column says `Yes`, backed by a real test run referenced in that phase's section below.

**Active phase:** Phase 2. Mobile stack changed to React Native after Phase 1 closed — see §1a. **Exact next action:** see §2 → "Next action" once Phase 2 work begins; until then, see the Phase 2 kickoff note in §2.

---

## Part B — Phase detail sections

### §0 — Decisions and design lock
*(fill in when Phase 0 artifacts are finalized — roles/permissions table, copy direction, visual tokens, screen list, and confirmation that `AGENT.md`/`README.md`/`PROGRESS.md` exist)*

### §1 — Repository and backend foundation

**Status:** Complete. **Verified:** Yes, via e2e tests against real PostgreSQL.

**Acceptance check evidence:**

| Acceptance criterion | Where it is proven |
|---|---|
| Platform admin creates a business and owner | `test/auth.e2e-spec.ts` — "creates a business together with its owner" |
| Owner reaches only their own business | `test/auth.e2e-spec.ts` — "scopes GET /businesses/me to the token, never to a parameter" |
| Unauthorized branch access rejected | `test/auth.e2e-spec.ts` — "hides another business branch behind a 404, not a 403" |
| Unauthorized business access rejected | `test/auth.e2e-spec.ts` — "refuses an owner listing every business on the platform" (403) |
| Owner self-registration | `test/signup.e2e-spec.ts` — 14 tests |
| Sign-in brute force throttled | `test/rate-limit.e2e-spec.ts` — 429 after configured limit |

**Gap flagged for follow-up (not blocking Phase 2):** OpenAPI/Swagger documentation was **not** produced in this phase, though the revised phase spec now requires it. Add it as a small Phase-2-kickoff task, since Phase 6's web client and any future integrator will otherwise read controller source directly.

**What was built:** NestJS 11 + Prisma 6 + PostgreSQL 17. Typed config that refuses to boot on a bad environment; global validation with `forbidNonWhitelisted`; shared error envelope; `LOG_LEVEL`-driven logging; liveness/readiness health checks. JWT auth; `JwtAuthGuard` and `RolesGuard` global; rate limiting global with a strict bucket on auth routes. `Business` is the tenant; `Branch` belongs to a business; `User` carries a role and optional `businessId` (null only for platform admins); `BranchAssignment` records manager/worker branch access. `businessId` always comes from the verified token, is absent from every DTO, and cross-tenant reads return 404 not 403.

Web: Next.js 15.5 shell with `/signup`, `/login`, `/admin`, `/owner`; httpOnly session cookie; backend-decided console routing via `user.console`.

Mobile: Android shell confirming reachability to the backend, with loading/error/success states. Originally built in Flutter; **replaced by React Native (Expo) after Phase 1 closed** — see §1a.

**Decisions confirmed:**

| Question | Decision |
|---|---|
| Owner registration/invitation | Owners self-register (name, email, phone, password); no admin invitation step |
| Owner/manager credential method | Email + password |
| Local PostgreSQL | Existing `postgresql-x64-17` service, `postgres:postgres`, db `shoprex` |
| Console routing | Backend decides via `user.console`; client never asks |
| Rate limiting | Implemented now, not deferred to Phase 8 |

`POST /businesses` (platform admin onboards a shop + owner) kept alongside self-registration; it is tested.

**Worker/device design confirmed for Phase 2 (not yet built):**
1. Owner creates a worker with a name and password.
2. Shoprex mints a unique internal id at creation (Prisma `User.id` UUID — not a sign-in secret).
3. Shoprex issues a one-time token handed to the worker.
4. Worker enters the token in the Android app, binding the install to business/branch/device.
5. Worker then signs in on-device without the token.

**Android device-id correction, already reflected in the design:** there is no reliable permanent hardware id available to a normal Android app (`ANDROID_ID` resets on factory reset and is per-signing-key; IMEI needs a privileged permission since Android 10). Shoprex mints its own `device_id` server-side at enrollment and the app stores it.

**Still open for Phase 2:** whether platform admins may also create device enrollments (proposed default: yes, tenant/branch-scoped); whether a per-worker PIN is needed on a shared device; first barcode formats; pilot shop workflow. → **Superseded 2026-08-22: the first two were answered (owners only; no shared devices, so no PIN needed). See §2 for the authoritative list.**

**Files changed:** see repository history for the full list (backend Prisma schema/migrations/modules for auth, businesses, branches, health; web signup/login/admin/owner pages and API client; mobile shell verification only). Full paths are in git, not duplicated here to keep this file from rotting.

**Commands run and results:**

| Command | Where | Result |
|---|---|---|
| `npx prisma migrate deploy` | backend | Passed — 3 migrations |
| `npx prisma db seed` | backend | Passed |
| `npm run lint` / `typecheck` / `test` / `test:e2e` / `build` | backend | Passed — 29/29 unit, 37/37 e2e, build clean |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20, build clean |
| `flutter analyze` / `test` / `build apk --debug` | mobile | Passed — 8/8 (Flutter, since replaced — see §1a) |

**Total: 94 automated tests, all passing.**

**Known issues / risks:**
1. Disk space is critical on the dev machine (~1.5GB free of 187.6GB at one point). Regenerable build output was cleared. This will recur — Gradle cache and the Docker/WSL virtual disk are the biggest reclaimables.
2. `npm` blocks install scripts for `prisma`/`@prisma/client`/`esbuild`/`sharp` under its allow-scripts policy; run `npm approve-scripts <package>` if an engine/image error appears.
3. `web/` has no ESLint config (`next lint` deprecated in 15.5); typecheck + Vitest cover it for now.
4. `prisma migrate dev` can't run non-interactively; use `migrate diff` + `migrate deploy`.
5. Password policy is minimal (8 chars, no complexity/breach check).
6. Rate limiting is in-memory — per-process only; a multi-instance deploy needs a shared store.
7. No refresh tokens; access token lasts 8h; expiry silently returns to sign-in.
8. Docker Desktop installed but daemon not running; local Postgres service used instead.

**Blocked / awaiting user:**
1. Disk space — confirm only regenerable build output may be cleared (nothing of the owner's was touched).
2. Phase 2 open decisions listed above (do not block starting Phase 2 backend work — worker creation and enrollment tokens can be built while these are settled).

**Handoff notes:**
- Guards are global; new routes are protected by default — mark `@Public()` deliberately.
- `businessId` is deliberately absent from every DTO; keep it that way.
- Cross-tenant reads answer 404, not 403; preserve this on new resources.
- e2e suites run against a real `shoprex_e2e` schema; `health.e2e-spec.ts` stubs Prisma to stay fast.
- `rate-limit.e2e-spec.ts` sets limits in `beforeAll` then dynamically imports `AppModule` — import order matters.
- `PrismaService` logs but doesn't throw on unreachable DB at boot; `/health/ready` reports the real cause.
- `AuthService.consoleFor()` is the single place mapping role → console; both clients follow the backend.
- Phone numbers are normalized in `src/domain/phone.ts` before uniqueness checks — reuse it for any new phone field.
- V1 is online-only by design; write an ADR before touching the transaction model if offline is ever requested.

### §1a — Mobile stack change: Flutter → React Native (Expo)

**Status:** Complete. **Verified:** Partially — see the JDK blocker below. **Date:** 2026-08-22.

**Why:** Owner decision. The Flutter project was deleted from the working tree and rebuilt in React Native with Expo, targeting an **Expo development build, not Expo Go**.

**What was ported.** The Flutter shell was reproduced feature-for-feature, not re-imagined:

| Flutter (removed) | React Native (now) |
|---|---|
| `lib/core/api/api_config.dart` | `src/core/api/apiConfig.ts` |
| `lib/core/api/api_client.dart` | `src/core/api/apiClient.ts` |
| `lib/app/theme.dart` | `src/app/theme.ts` |
| `lib/app/app.dart`, `lib/main.dart` | `src/app/App.tsx`, `index.ts` |
| `lib/features/health/health_screen.dart` | `src/features/health/HealthScreen.tsx` |
| `test/api_client_test.dart` (6) | `src/core/api/apiClient.test.ts` (9) |
| `test/widget_test.dart` (2) | `src/features/health/HealthScreen.test.tsx` (3) |

Behaviour preserved exactly: a 503 from `/health/ready` is still treated as *reachable but unhealthy* (it carries a valid payload), any other 4xx/5xx raises `ShoprexApiError`, and the screen still renders explicit loading, error, and success states with the attempted address shown on failure. Colour tokens match `web/src/styles/globals.css` so both clients look like one product.

**Stack:** Expo SDK 57, React Native 0.86, React 19.2.3, TypeScript, Jest via `jest-expo`, `@testing-library/react-native`. `expo-dev-client` is a dependency and `app.json` declares the `expo-dev-client` plugin. Android package `tz.shoprex.shoprexmobile`; `INTERNET` permission declared (V1 is online-only).

**Configuration moved out of code (owner request).** No address, port, or connection string is hardcoded in any application source any more:

| App | Reads from | Behaviour when missing |
|---|---|---|
| `mobile/` | `mobile/.env` → `EXPO_PUBLIC_SHOPREX_API_BASE_URL` | `MissingApiBaseUrlError` thrown when the `ApiClient` is constructed — fails at startup, not at first request |
| `web/` | `web/.env.local` → `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` | throws with a message naming the file to copy |
| `backend/` | `backend/.env` → `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` | refuses to boot; `CORS_ORIGINS` is now required rather than defaulted in code |
| backend e2e | `backend/.env` via `dotenv` | throws naming `.env.example` |

`EXPO_PUBLIC_*` values are embedded at build time, so Metro must restart and the dev client be rebuilt after a change. This is documented in `mobile/README.md` and the root `README.md`.

**Two deliberate simplifications, worth knowing:**
1. `react-native-safe-area-context` was installed, then removed. Its Jest mock ships as untranspiled `.tsx` and broke rendering under `jest-expo`. The shell uses a plain `View` with `StatusBar.currentHeight` padding on Android instead — zero dependencies, no mock. Phase 4 should add it back properly when real screens need notch handling.
2. `react-test-renderer` is pinned to `19.2.3` to match the React version Expo pins. Without the pin, npm cannot resolve the tree (`@testing-library/react-native` pulls `19.2.8`, which peer-requires React `^19.2.8`).

**Commands run and results:**

| Command | Where | Result |
|---|---|---|
| `npm test` | mobile | **Passed — 12/12** |
| `npm run typecheck` | mobile | Passed |
| `npx expo prebuild --platform android` | mobile | Passed — native project generated |
| `./gradlew assembleDebug` | mobile/android | **Failed — no JDK on the machine** (see blocker) |
| `npm run lint` / `typecheck` / `test` / `test:e2e` / `build` | backend | Passed — 29/29 unit, 37/37 e2e, build clean |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20, build clean |

**Total after the port: 98 automated tests, all passing** (backend 29 + 37, web 20, mobile 12).

**Blocked / awaiting user:**
1. **No JDK is installed on this machine**, so the Android development build cannot be compiled or verified here. `gradlew` reports `JAVA_HOME is not set and no 'java' command could be found`. Nothing under `C:\Program Files\Java`, `C:\Program Files\Android`, or `~/.gradle/jdks`; the earlier Flutter APK likely used a Gradle-provisioned JDK that was removed during the disk cleanup. **Fix:** install JDK 17 or newer (Microsoft OpenJDK or Android Studio), set `JAVA_HOME`, then `cd mobile && npm run android`. Until then the JavaScript layer is verified by tests but the native build is not.

**Documentation updated for the stack change:** `AGENT.md`, `README.md`, `mobile/README.md`, root `.env.example`, `.gitignore`, and `docs/v1/{00,02,03,04}`. Phase 4 and Phase 5 are renamed from "Flutter" to "React Native"; the engine doc now records Expo camera barcode scanning (`expo-camera`) rather than a native Flutter scanner. No Flutter reference remains in any markdown file.

**Handoff notes:**
- `mobile/android/` and `mobile/ios/` are generated by `expo prebuild` and are **gitignored** — treat them as build output, and put native config in `app.json` so it survives a regenerate.
- The `ApiClient` takes an injectable `fetchFn`, which is how every test avoids the network. Keep that seam.
- `jest.testTimeout` is 20s: RN module loading is slow on this machine and the 5s default was flaking under parallel workers.

### §1b — Mobile builds move to EAS (Expo cloud)

**Status:** Configured, not yet run. **Date:** 2026-08-22.

**Decision:** Android builds run on **EAS Build**, not on the developer machine.

**Why:** The owner uninstalled Android Studio, and this machine has a chronic disk problem — it reached literally zero free bytes earlier in the project, and a single local Gradle build consumed 2.2 GB. The Android SDK alone occupies 11.9 GB against ~12 GB free. EAS removes the JDK, SDK, and Gradle cache from the local machine entirely, and delivers an installable APK by link or QR — **no USB cable at any point**.

**Reclaimable:** `C:\Android\sdk` (11.9 GB) can be deleted once EAS is working. Keeping `platform-tools` (~15 MB) is worthwhile if `adb` logs are ever wanted; Metro shows JavaScript logs without it.

**What was set up:** `mobile/eas.json` with three profiles, and `build:dev` / `build:preview` npm scripts that invoke `eas-cli` through `npx`.

**`eas-cli` must not be a project dependency.** Installing it locally broke the first cloud build: its transitive dependencies require TypeScript `^5.x` while this project pins `~6.0.3`, so npm could not record a consistent tree and the build server failed at `npm ci` with `Missing: typescript@5.9.3 from lock file`. It also added 337 packages that the build server would reinstall on every run for no benefit. Verified the fix by running the build server's exact command locally — `npm ci --include=dev` — which now exits 0.

| Profile | Output | Purpose |
|---|---|---|
| `development` | APK, `developmentClient: true`, internal distribution | The dev client the phone runs; JS comes from local Metro |
| `preview` | Standalone APK, internal distribution | Testing a real bundle; Phase 8 pilot distribution |
| `production` | AAB | Play Store, much later |

`buildType: "apk"` matters: the default AAB cannot be installed directly on a phone. Update channels are deliberately omitted because `expo-updates` is not installed — adding a `channel` without it fails the build. EAS Update is worth revisiting for Phase 8, when pushing JavaScript fixes to pilot shops without reinstalling becomes valuable.

**Environment variables.** For a **development** build the JavaScript is served by local Metro, so `EXPO_PUBLIC_SHOPREX_API_BASE_URL` comes from `mobile/.env` at bundle time — changing it needs only `npm start --clear`, never a rebuild. For **preview/production** the bundle is built in the cloud and `.env` is not uploaded, so the value must be supplied with `eas env:create`. This keeps addresses out of the repository, per the owner's rule.

**Correction to an earlier note:** the README previously said to rebuild the dev client after changing `.env`. That is stricter than necessary — `EXPO_PUBLIC_*` values are inlined at Metro bundle time, so a Metro restart suffices. A new native build is needed only for a new native dependency or an `app.json` change. Both READMEs now say this.

**Blocked / awaiting user:** `npx eas login` is interactive and tied to the owner's Expo account, so the first build must be started by the owner. Steps are in `mobile/README.md`.

**Supersedes:** the JDK blocker in §1a. Installing a JDK is now optional — it is only needed for `npm run android`, the local build path that EAS replaces.

### §2 — Owner, manager, worker, and device access

**Status:** Not started. *(Populate the build record only after real work begins — the decisions below are confirmed inputs, not projected content.)*

**Decisions confirmed by the owner on 2026-08-22 — do not re-ask:**

| Question | Decision |
|---|---|
| Who may create device enrollments? | **Owners only.** Not platform administrators. (This closes Phase 0 open decision 2, against the earlier proposed default) |
| Shared devices? | **No. One device belongs to one worker.** |
| Per-worker PIN for attribution on a shared device? | **Not needed** — a device already identifies exactly one worker, so device identity *is* the attribution (closes Phase 0 open decision 4) |
| Device naming | The worker's own name is used as the device name, so the owner can see at a glance whose phone it is. A naming convention, not a separate identity mechanism |
| Device identity | Shoprex **mints `device_id` server-side at enrollment**; the app stores it. Confirmed by the owner after the Android hardware-id correction |

**Enrollment flow to build:**
1. Owner creates a worker: supplies the worker's name and a password for them.
2. Shoprex mints the worker's internal id at creation (Prisma `User.id` UUID — database identity and audit attribution, never a sign-in secret).
3. Shoprex issues a **one-time token** for the owner to hand to that worker.
4. The worker enters the token in the React Native app; the app binds that installation to the business, branch, worker, and device record, and stores the server-minted `device_id`.
5. Afterwards the worker signs in on that device with their password — no token.

**Design consequences of "one device, one worker":** the device record carries a worker reference, not just a business and branch; a second enrollment for the same worker should either move them to the new device or be refused (owner decision needed at build time); and a revoked device must not create sales or stock movements.

**Still open (does not block starting):** first barcode formats, and the pilot shop workflow.

**Kickoff note:** start on the backend — `Device` and `DeviceEnrollmentToken` models, worker creation under the owner, one-time token issue/redeem with expiry, and revocation — with tenant and role checks tested exactly as Phase 1 does. The `expo-camera` barcode work belongs to Phase 3/4, not here. Also carry over the Phase 1 gap: OpenAPI/Swagger documentation was never produced and should be added as a small kickoff task.

### §3 — Product, barcode, pricing, and stock engine
*(empty until started)*

### §4 — React Native mobile selling flow
*(empty until started)*

### §5 — React Native stock receiving and operational visibility
*(empty until started)*

### §6 — Next.js owner and admin web app
*(empty until started)*

### §7 — Reports and PDF
*(empty until started)*

### §8 — Pilot hardening and launch
*(empty until started)*
