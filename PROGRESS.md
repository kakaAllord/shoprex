# Shoprex V1 — Live Progress

This file has two parts. **Part A** is the master table — read this first, always, on every session; it is the single source of truth for what phase the project is actually in. **Part B** is one append-only section per phase with the detail. Never delete a completed phase's section when a later phase starts; add to this file, don't rewrite it.

If Part A and Part B ever disagree (e.g. the table says "Complete" but a section describes a known-failing check), **the more cautious of the two is authoritative** and the mismatch itself must be logged as a blocker.

---

## Part A — Master phase table

| # | Phase | Status | Acceptance check verified? | Last updated |
|---|---|---|---|---|
| 0 | Decisions and design lock | Complete | Yes | 2026-08-20 |
| 1 | Repository and backend foundation | Complete | Yes — re-verified 2026-08-22, see §1 and §1c | 2026-08-22 |
| 2 | Owner, manager, worker, and device access | Complete | Yes — every criterion driven end to end over HTTP, see §2; device model revised 2026-08-23, see §2a | 2026-08-23 |
| 3 | Product, barcode, pricing, and stock engine | Complete | Yes — the named scenario runs as a test, in the engine and over HTTP, see §3 | 2026-08-23 |
| 4 | React Native mobile selling flow | Complete | Yes — every clause driven end to end, over HTTP as a worker and through the screens, see §4. Revised after owner review, see §4a | 2026-08-23 |
| 5 | React Native stock receiving and operational visibility | Complete | Yes — both halves of the clause driven by real tests: the backend over HTTP as a stock keeper, the phone through the screens, see §5 | 2026-08-23 |
| 6 | Next.js owner and admin web app | Complete | Yes — every clause driven end to end over HTTP by all four roles, plus a live console smoke test, see §6 | 2026-08-23 |
| 7 | Reports and PDF | Complete | Yes — every clause driven end to end over real HTTP, plus a live console and PDF-download check against a running backend and web server, see §7 | 2026-08-24 |
| 8 | Pilot hardening and launch | Not started | — | — |

**Status values:** `Not started` / `In progress` / `Blocked` / `Complete`. Only mark `Complete` when the acceptance-check column says `Yes`, backed by a real test run referenced in that phase's section below.

**Active phase:** Phase 8, not yet started. Phase 7 closed on 2026-08-24 with **1,007** automated tests passing across all three surfaces (up from 848 at the start of the session: backend unit 152→252, backend e2e 430→489, web 61 unchanged in count but exercising new code, mobile 205 untouched) — see §7. It added **three new routes** and **no new table**: the day boundary and every figure are computed from data Phases 1–6 already recorded. The sales list also gained the `?date=` filter that §6's handoff note deliberately deferred here, so it and the report resolve a day through the exact same code.

Two things carried from §6 are now current: the owner overview and the sales-list lede no longer promise reports "next phase" — they point at Ripoti, which now exists.

**After Phase 7 closed**, the owner asked for two more things in the same session — QR device enrollment, and a reachable way to add products on the phone. Both are done and recorded in **§7a**; neither was new V1 scope (doc 02 §3 always specified the QR, and Phase 8 already listed QR enrollment tests). The suite is now at **1,038**. On **2026-08-25** the owner also approved the long-open move of the shared mobile sheets out of `features/sale/` into `src/components/` — behaviour-neutral, and it closes §6's blocked question 3.

**Exact next action:** begin Phase 8's pilot hardening per `docs/v1/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md`, and mark the Phase 8 row `In progress` when that work starts. Nothing blocks it. Phase 8's cumulative isolation pass should **confirm** reports isolation (§7's suite already covers it) rather than discover it fresh. Its **QR enrollment expiry tests** now have a QR to test. **Before writing any of it, run the full suite** — 1,038 is the number it must start from, and a **new mobile build** is needed before the scanner can be tried by hand.

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

**Gap flagged for follow-up (not blocking Phase 2):** OpenAPI/Swagger documentation was **not** produced in this phase, though the revised phase spec now requires it. Add it as a small Phase-2-kickoff task, since Phase 6's web client and any future integrator will otherwise read controller source directly. → **Closed 2026-08-22 in §1c.** The contract is now browsable at `/docs`. Note that this gap meant Phase 1's acceptance check was only *partly* verified when this section was first written: "the API contract is browsable (e.g. at `/docs`)" is part of that check, not an extra. The table row is now honest.

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

**Update 2026-08-22 (found during the §1c audit, not reported before):** the owner has since run `eas init`. `mobile/app.json` now carries `extra.eas.projectId` and `owner: "kakaallord"` as an uncommitted working-tree change, and `mobile/.expo/devices.json` exists. **The project is linked to EAS; that much of the blocker is cleared.** Whether a cloud build has actually completed and been installed on a phone is *not* verifiable from this machine — no build artifact or log is in the repository — so the native build remains unconfirmed here, exactly as §1a left it. The `app.json` change should be committed, since a missing `projectId` makes `eas build` interactive again for the next person.

**Supersedes:** the JDK blocker in §1a. Installing a JDK is now optional — it is only needed for `npm run android`, the local build path that EAS replaces.

### §1c — Phase 1 audit before Phase 2 (2026-08-22)

**Status:** Complete. **Verified:** Yes — every claim below is backed by a command run in this session, not by reading §1.

**Why this section exists:** Phase 1 was re-verified from scratch rather than trusted, per `AGENT.md`'s continuity rule. Nothing had regressed. Two real gaps were found and closed before any Phase 2 code was written.

#### Re-verification: no regression

Every suite was re-run from a clean checkout state before anything was changed. All 98 previously claimed tests still pass, plus the builds and typechecks. **Phase 1's acceptance check holds against real tests.**

#### Gap 1 — OpenAPI/Swagger was missing. **Fixed.**

This was not merely a nice-to-have carried over from §1: *"the API contract is browsable (e.g. at `/docs`)"* is written into Phase 1's own acceptance check in `docs/v1/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md`. Phase 1 had therefore been marked `Complete` with one criterion unverified. It is now genuinely met.

- `@nestjs/swagger` added; `src/docs/swagger.ts` builds the document and mounts Swagger UI at **`/docs`**, the raw document at `/docs-json` and `/docs-yaml`.
- Mounted **outside** the API prefix on purpose, so the address does not move if `API_PREFIX` changes. A test pins this.
- Every controller, route, request DTO, and response shape is annotated: summaries, descriptions, response types, error responses, and the JWT bearer scheme.
- **Response schemas `implement` the service interfaces they document.** `LoginResultDto implements LoginResult`, `ErrorResponseDto implements ShoprexErrorResponse`, and so on. This is the anti-drift mechanism: adding a field to a service interface fails the typecheck until the published schema is updated too. Preserve this when adding Phase 2 resources.
- The tenancy and timestamp rules are stated in the document's own description, so an integrator reads them without opening `AGENT.md`.

#### Gap 2 — `BranchAssignment` had no isolation test. **Fixed.**

`BranchesService.listForPrincipal` and `findOne` both contain a manager/worker branch that **no test reached**, because every existing e2e test authenticated as an owner or a platform admin. A whole authorization path — the one that decides whether a worker can read a branch they are not assigned to — was unverified.

`test/branch-assignment.e2e-spec.ts` now covers it with 13 tests: assignment-scoped listing, an assigned read succeeding, an **unassigned branch inside the caller's own business answering `404`** (not 403, and not 200), cross-tenant reads answering `404`, an assignment in one tenant not widening access into another, and managers/workers being refused branch creation.

Managers and workers are seeded directly through Prisma, since the endpoints that create them are Phase 2's deliverable. **Phase 2 should replace the seeding with the real creation endpoints and keep the assertions.**

These tests were **mutation-checked**, not merely observed passing: disabling the assignment guard in `findOne` was confirmed to fail 2 tests, and the guard was then restored (`git diff` on the service is empty). A test that cannot fail proves nothing.

#### Gaps checked and found already clear

| Checked | Finding |
|---|---|
| `AGENT.md` / `README.md` / `PROGRESS.md` format | Already correct. `PROGRESS.md` is already master-table-plus-sections; no restructuring was needed and no history was touched |
| Throwaway owner-facing web screens ahead of Phase 6 | **None.** `web/` holds only Phase 1's signup/login/admin/owner shell. No worker, manager, or device screen exists. Phase 2 must stay API-only |
| Server-clock timestamps | **Correct by construction.** Every timestamp column is `@default(now())` / `@updatedAt` — the database clock. No DTO accepts a date, and `forbidNonWhitelisted` rejects any unexpected field, so a device cannot smuggle one in. A test now asserts no request body accepts a `businessId` or `branchId` either |
| Disk space (the recurring risk from §1) | **Has not recurred.** 26.09 GB free, against ~1.5 GB at the worst point and ~12 GB when §1b was written. Deleting `C:\Android\sdk` (11.9 GB) remains available if it tightens again |

#### Commands run and results

| Command | Where | Result |
|---|---|---|
| `npm test` | backend | Passed — 29/29 unit |
| `npm run test:e2e` | backend | Passed — **82/82** e2e (was 37; +32 OpenAPI, +13 assignment isolation) |
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` / `typecheck` / `build` | web | Passed — 20/20, build clean |
| `npm test` / `typecheck` | mobile | Passed — 12/12 |
| `node dist/main.js` + `curl /docs`, `/docs-json` | backend | `200 text/html`; document lists all 13 operations with correct public/bearer split |

**Total: 143 automated tests, all passing** (backend 29 + 82, web 20, mobile 12). Up from 98.

**Also corrected:** two stale "Flutter" comments in backend source (`main.ts`, `all-exceptions.filter.ts`). §1a's claim that no Flutter reference remained was true of markdown only; no Flutter reference remains in backend source either now.

**Known issues — status after this audit:** issues 2–7 in §1 all still stand unchanged (npm allow-scripts, no `web/` ESLint config, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens). Issue 1 (disk) has eased but is not structurally solved. Issue 8 (Docker daemon) is unchanged and does not matter while the local Postgres service runs.

**Blocked / awaiting user:** nothing new from this audit. The two blockers carried into Phase 2 are listed in §2.

**Handoff notes:**
- `/docs` is now part of the acceptance surface. A Phase 2 route added without `@ApiOperation` will **fail** `test/openapi.e2e-spec.ts`, by design — that test enumerates the documented paths and compares them against the expected set, so adding a route means updating that list deliberately.
- When Phase 2 adds `Device` and `DeviceEnrollmentToken`, both need their own isolation tests in the same phase, and their response schemas should `implement` their service interfaces like the Phase 1 ones do.
- A one-time enrollment token is a secret. Keep it out of the OpenAPI *examples*, and out of any response after the single issue moment.

### §2 — Owner, manager, worker, and device access

**Status:** Complete. **Verified:** Yes — every acceptance criterion is driven end to end over real HTTP against real PostgreSQL, and the isolation guards were mutation-checked. **Date:** 2026-08-22.

**Decisions confirmed by the owner on 2026-08-22 — do not re-ask:**

| Question | Decision |
|---|---|
| Who may create device enrollments? | **Owners only.** Not platform administrators. (This closes Phase 0 open decision 2, against the earlier proposed default) |
| Shared devices? | ~~**No. One device belongs to one worker.**~~ **Superseded 2026-08-23 — see §2a:** a device belongs to a *branch*, and anyone assigned to it signs in with their own password |
| Per-worker PIN for attribution on a shared device? | **Not needed** — originally because a device identified exactly one worker. Still not needed after §2a, but for a different reason: the person names themselves and proves it with their own password |
| Device naming | The worker's own name is used as the device name, so the owner can see at a glance whose phone it is. A naming convention, not a separate identity mechanism |
| Device identity | Shoprex **mints `device_id` server-side at enrollment**; the app stores it. Confirmed by the owner after the Android hardware-id correction |
| Re-enrolling a worker who already has a device | **Refuse the second enrollment until the owner revokes the first.** Confirmed by the owner 2026-08-22. Never replace the existing device silently |

**Enrollment flow to build:**
1. Owner creates a worker: supplies the worker's name and a password for them.
2. Shoprex mints the worker's internal id at creation (Prisma `User.id` UUID — database identity and audit attribution, never a sign-in secret).
3. Shoprex issues a **one-time token** for the owner to hand to that worker.
4. The worker enters the token in the React Native app; the app binds that installation to the business, branch, worker, and device record, and stores the server-minted `device_id`.
5. Afterwards the worker signs in on that device with their password — no token.

**Design consequences of "one device, one worker":** the device record carries a worker reference, not just a business and branch; a second enrollment for a worker who already holds an active device is **refused** (see below); and a revoked device must not create sales or stock movements.

> **Superseded 2026-08-23.** The first two consequences are gone: a device carries only a business and a branch, and a branch may hold as many phones as it needs. The third still holds. See §2a.

**Re-enrollment: refuse until revoked — confirmed by the owner 2026-08-22.**

Redeeming an enrollment token for a worker who already has an **active** device must fail. It must not silently move the worker to the new phone. The owner revokes the old device first, and only then can a new enrollment succeed.

What this means at build time:

- Redemption checks for an existing active device for that worker **before** binding anything, and refuses with a message naming the device already held — the owner needs to know *which* phone to revoke, and the worker standing in the shop needs to know why it failed.
- Refusal must **not** consume the one-time token. A token burnt by a refused attempt would strand the worker until the owner issued another one. Only a successful bind consumes it.
- Revocation is therefore on the critical path for a lost or stolen phone, not an administrative afterthought. It needs to be reachable and tested in this phase, not deferred to Phase 6's UI.
- The check is on **active** devices only: a revoked device must not block a new enrollment, or revocation would not actually free the worker.
- Cover it with a test that a second redemption is refused, that the token survives the refusal, and that the same token then succeeds once the first device is revoked.

**Why this way:** it is the reversible choice. It produces an audit trail, and whoever holds a token cannot quietly move a worker onto a different phone. It can be relaxed to auto-replace later without invalidating any stored device; the reverse is not true.

**Blocked / awaiting user.** **Nothing blocks Phase 2 any more.** The re-enrollment question — the only one that could have stalled it — was answered by the owner on 2026-08-22 and is recorded above. The items below are open but belong to later phases.

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | **First barcode formats** (EAN-13, UPC-A, Code 128, …) | Determines what the scanner accepts and what a "valid" barcode means at product creation | Phase 3, not Phase 2 |
| 2 | **Pilot shop workflow** | Decides who the first real onboarding is for | Phase 8 |
| 3 | Carried over from §1: confirm only regenerable build output may be cleared during disk cleanup | Nothing of the owner's was touched, but the confirmation was never given | Whenever disk tightens again |

**Kickoff note:** start on the backend — `Device` and `DeviceEnrollmentToken` models, worker creation under the owner, one-time token issue/redeem with expiry, and revocation — with tenant and role checks tested exactly as Phase 1 does. The `expo-camera` barcode work belongs to Phase 3/4, not here.

Three things carried in from the §1c audit:
1. **The OpenAPI gap is closed** — do not repeat it. Annotate every new route as you add it; `test/openapi.e2e-spec.ts` fails on an undocumented route by design.
2. **Isolation tests ship with the resource, not after it.** `Device` and `DeviceEnrollmentToken` each need their own tenant-isolation coverage inside Phase 2.
3. **`test/branch-assignment.e2e-spec.ts` seeds managers and workers through Prisma** because the endpoints to create them do not exist yet. Once Phase 2 ships those endpoints, switch that spec over to them and keep the assertions as they are.

Two rules that will matter immediately here: a revoked device must be refused at the **backend**, not merely hidden in the app; and an enrollment token is a secret — issue it once, never echo it back in a later response, and keep it out of the OpenAPI examples.

#### Acceptance check evidence

Phase 2's acceptance check reads: *via API-level tests, an owner can create a branch, create a manager, create a device, enroll a test device through a one-time token, revoke that device, and see the actor/device associated with a test action. A revoked device is refused immediately, and an enrollment token cannot be reused or used after expiry.*

| Acceptance criterion | Where it is proven |
|---|---|
| Owner creates a branch | `test/branch-assignment.e2e-spec.ts` — now via `POST /branches`, not seeded |
| Owner creates a manager | `test/users.e2e-spec.ts` — "creates one with credentials and branch scope", and the manager then signs in |
| Owner creates a device | `test/device-enrollment.e2e-spec.ts` — "binds the installation to one business, branch, and worker" |
| Enroll through a one-time token | same suite — "the owner issues a one-time code" and "a phone redeems the code" |
| Revoke that device | same suite — "and then the owner revokes it" |
| See the actor/device on a test action | same suite — "attributes the device sign-in to both the worker and their phone" |
| **Revoked device refused immediately** | same suite — "refuses the device on its very next request, with the token unchanged". The token is still valid and unexpired; that is the point |
| **Token cannot be reused** | same suite — "refuses the same code a second time" |
| **Token cannot be used after expiry** | same suite — "refuses one whose expiry has passed", moving the *stored* expiry rather than a client clock |

Verified through the API only. **No owner-facing screens were built** — `web/` is untouched by this phase, exactly as the phase spec requires, and Phase 6 still owns those screens.

#### What was built

**People.** `POST /users/managers` creates a delegated manager with email-and-password credentials and a set of branches. `POST /users/workers` creates a worker from a name, a password, one branch, and a permission set — and no email at all. `GET /users` and `GET /users/{id}` read staff, scoped by assignment for a manager. `PATCH /users/{id}/permissions` replaces a permission set outright rather than merging, so a permission left out is a permission taken away.

**Devices.** `POST /devices/enrollments` issues a one-time code (owners only). `POST /devices/enroll` is public — the phone has no credentials yet — and mints the `device_id` server-side. `GET /devices`, `GET /devices/{id}`, and `POST /devices/{id}/revoke` manage them. `POST /auth/device/login` signs a worker in on their bound phone.

**Audit.** `AuditEvent` records actor, actor role, device, target, and a server-clock timestamp for all eight Phase 2 actions. `GET /audit-events` is the owner's view, narrowable to one device.

#### Decisions made during the build

| Question | Decision | Why |
|---|---|---|
| How does a worker sign in with no email? | `users.email` became **nullable-unique**; a worker signs in with `POST /auth/device/login` using `deviceId` + their password | The owner's §2 decision says a worker is created from a name and a password. Synthesising a fake address would have put invented data in a real column, and it would have surfaced in every future staff list |
| Phase 1's OpenAPI test banned `branchId` in **any** request body | Narrowed: `businessId` stays banned absolutely; a branch id is allowed only for `CreateWorkerDto` and `CreateManagerDto`, pinned by an allowlist in that test, each backed by a test proving a foreign branch answers 404 | A business has several branches and only the owner knows which one a worker stands in, so something has to name it. Naming the field `branchIds` to slip past the regex would have left the test saying one thing and meaning another. **Approved by the owner before implementation** |
| Where does the device password live? | Nowhere separate — the device references the signing-in person's own `passwordHash` | Doc 02 §3 allows "a password/PIN hash **or equivalent credential reference**". A second copy of the same password would only be something to drift. (Wording adjusted 2026-08-23: the reference is to whoever signs in, not to one bound worker — §2a) |
| How is an enrollment code stored? | SHA-256 hash, not bcrypt | Redemption must *find* the row by the value presented, which needs a deterministic digest. The input is a 12-character random code (~59 bits from a 30-symbol alphabet), not a human-chosen password |
| Should the code be QR-only? | Typed code first; the alphabet excludes `0/O`, `1/I/L`, and `U` | It is read aloud and written on paper in a shop. `normalizeEnrollmentCode` also forgives lower case, missing dashes, and stray spaces. QR is a Phase 4 scanner concern, not a backend one |
| Is there a `PermissionsGuard`? | **No — deliberately not yet.** Permissions are stored, set, changed, audited, and returned on the profile, but nothing enforces them because no Phase 2 route is permission-gated | A guard with no consumer is scaffolding for a later phase. **Phase 4/5 must add it at the first permission-gated route** — see the handoff note below |
| Revoking an already-revoked device | `409`, not a silent success | The owner should know the phone was already dead rather than believing they just killed it |

#### Files changed

**New** — `src/domain/enrollment-token.ts` (+ spec), `src/common/tenancy.ts`, `src/common/guards/device-session.guard.ts`, `src/modules/users/` (service, controller, module, 4 DTOs), `src/modules/devices/` (service, controller, module, 3 DTOs), `src/modules/audit/` (service, controller, module, 2 DTOs), `prisma/migrations/20260822190000_people_and_devices/`, and four e2e suites (`users`, `devices`, `device-enrollment`, plus additions to `rate-limit`).

**Changed** — `prisma/schema.prisma` (`Device`, `DeviceEnrollmentToken`, `AuditEvent`, `UserPermission`, `DeviceStatus`, `AuditAction`; `users.email` nullable; `permissions` on `User`), `app.module.ts`, `auth.service.ts` / `auth.controller.ts` / `auth-response.dto.ts` / `auth.service.spec.ts`, `current-user.decorator.ts`, `jwt-auth.guard.ts`, `branches.service.ts` (deduped onto the shared `requireBusiness`), `config/configuration.ts`, `config/env.validation.ts`, `docs/swagger.ts`, `test/openapi.e2e-spec.ts`, `test/branch-assignment.e2e-spec.ts`, `.env.example` (both), `README.md`, `docs/v1/01` §4, `docs/v1/02` §§2/3/9.

#### Commands run and results

| Command | Where | Result |
|---|---|---|
| `npx prisma migrate deploy` | backend | Passed — 4 migrations |
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **48/48** unit (was 29; +19 enrollment-code domain tests) |
| `npm run test:e2e` | backend | Passed — **190/190** e2e (was 82) |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20, build clean |
| `npm run typecheck` / `test` | mobile | Passed — 12/12 |

**Total: 270 automated tests, all passing** (backend 48 + 190, web 20, mobile 12). Up from 143.

#### Mutation-checked, not merely observed passing

A test that cannot fail proves nothing. Each guard below was broken, the suites re-run, and the guard restored — the working tree is clean of all five.

| Guard broken | Result |
|---|---|
| `DeviceSessionGuard`'s ACTIVE check | 1 test failed — "refuses the device on its very next request" |
| The already-holds-a-device refusal | 54 tests failed |
| The `usedAt` single-use check | 1 test failed — "refuses the same code a second time" |
| The branch-belongs-to-tenant check in `UsersService` | 3 tests failed |
| The tenant filter in `DevicesService.requireDevice` | 3 tests failed |

#### Isolation shipped with the resource, as AGENT.md requires

`test/devices.e2e-spec.ts` covers `Device`, `DeviceEnrollmentToken`, and `AuditEvent` — cross-tenant reads answering 404 not 403, branch scoping inside one tenant, a manager refused revocation and enrollment, a platform administrator refused all three because it belongs to no business, and the audit log refusing a manager and a worker. Phase 8 should confirm this, not discover it.

#### Known issues / risks

1. **`test/e2e-env.js` does not actually raise the rate limits it says it does.** It sets `RATE_LIMIT_AUTH = process.env.RATE_LIMIT_AUTH ?? '10000'`, but `dotenv` has already loaded `backend/.env` two lines above, where the value is `10`. So the `??` never fires and the comment "generous limits so functional suites are not throttled" is false. Phase 1's suites stayed under 10 auth calls by luck. Phase 2's suites raise the limits themselves before importing `AppModule`, following `rate-limit.e2e-spec.ts`'s established pattern — **left as found rather than changing shared setup that four existing suites depend on.** Worth fixing deliberately.
2. `prisma migrate diff --from-migrations` needs a shadow database. `shoprex_shadow` was created on the dev machine for this migration and left in place; it is empty and regenerable.
3. Issues 2–8 from §1 all still stand unchanged (npm allow-scripts, no `web/` ESLint config, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens, Docker daemon). The worker password inherits the same 8-character minimum with no complexity check, which matters more now that a password is set *for* someone by their employer.
4. `DeviceSessionGuard` costs one database lookup per device-authenticated request. Correct, and required by "refused immediately", but it is on the hot path for every sale Phase 4 will add.
5. The root `.env.example` still lists `JWT_SECRET` under "Not yet used in the foundation phase", which is wrong — it has been required since Phase 1 and the API refuses to boot without it. **Not touched:** it is Phase 1's staleness, not this change's, and correcting it was not part of this task. Flagging it because someone copying that file will hit it.

#### Blocked / awaiting user

Nothing blocks Phase 2 — it is complete. Carried forward:

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | ~~**First barcode formats**~~ | — | **Answered 2026-08-22: EAN-13.** See §3 |
| 2 | **Pilot shop workflow** | Decides who the first real onboarding is for | Phase 8 |
| 3 | Confirm only regenerable build output may be cleared during disk cleanup | Nothing of the owner's was touched, but the confirmation was never given | Whenever disk tightens again |

#### Handoff notes

- **Phase 4/5 must add a `PermissionsGuard`.** The permission set exists, is settable, and is returned on `/auth/me`, but nothing enforces it yet because no Phase 2 route is permission-gated. The first route that should check `SELL` or `RECEIVE_STOCK` is where that guard belongs. Do not let a client treat `permissions` as a rendering hint.
- **`actorFrom(principal)` in `users.service.ts` is the one way to build audit attribution.** Phase 4's sale must call `AuditService.record()` with it, so the device id flows from the token into the sale's audit row automatically.
- **`AuditService.record()` takes an optional transaction client.** Use it: an audit line for a device that was never created is worse than no line.
- The JWT now carries an optional `deviceId`. Anything that must be attributable to a phone reads it from the token, never from a request body.
- `requireBusiness()` in `src/common/tenancy.ts` is the single place that turns a principal into a tenant. New resources should use it rather than reaching for `principal.businessId`.
- Response DTOs still `implement` their service interfaces (`StaffMemberViewDto implements StaffMemberView`, and so on). Keep that — it is what stops the published contract drifting from the code.
- `test/branch-assignment.e2e-spec.ts` no longer seeds through Prisma. Every principal in it is now built through the real endpoints, and its Phase 1 assertions are unchanged — which is the point: the real creation path produces the same isolation the seeded one did.
- An enrollment code appears in exactly one response, `IssuedEnrollmentViewDto`. `test/openapi.e2e-spec.ts` walks every response schema and fails if a second one starts carrying a `code`, `token`, or `password`.

### §2a — Architectural change: a device belongs to a branch, not a worker

**Status:** Complete. **Verified:** Yes — the shared-device rule is driven end to end over HTTP, including the branch boundary that replaced the old one. **Date:** 2026-08-23.

**This supersedes two decisions in §2.** Those rows are now marked superseded there; the reasoning lives here.

| §2 said | Now |
|---|---|
| Shared devices? **No. One device belongs to one worker.** | **Yes.** A device belongs to a branch, and anyone assigned to that branch signs in on it |
| Per-worker PIN? **Not needed — the device identifies exactly one worker** | **Still not needed, for a different reason** — the person identifies themselves and proves it with their own password |
| A worker who holds an active device cannot enrol a second until it is revoked | **Gone.** A branch may hold as many handsets as it needs |

#### Why

The owner's reason, and it is an operational one rather than a technical one: **a phone that is out of reach or has simply gone flat should not end somebody's shift.** Under the old rule the handset *was* the worker, so a dead battery meant that worker could not sell until the owner revoked the device and issued a fresh code — an administrative round trip in the middle of a trading day.

**Decisions confirmed by the owner on 2026-08-23, before implementation:**

| Question | Decision |
|---|---|
| How does a worker say **who** they are on a shared phone? | **Tap your name, then your password.** The phone lists the people assigned to its branch; the worker taps their name and types their own password |
| What happens to phones already enrolled to one worker? | **Re-enrol everything.** The migration revokes every existing device and deletes every outstanding code, so nothing carries a binding from the old model into the new one |

The second question mattered because a phone in someone's pocket would otherwise keep a session granted under different rules. Revoking them is the conservative direction and costs one walk round the handsets.

#### The question this change forced

Once a phone is shared it identifies nobody, so **sign-in has to**. The backend cannot check a password without knowing whose password to check it against, and testing it against every worker at the branch would be both slow and wrong — two workers with the same password would collide.

So the sign-in screen gained a first step, and the API gained one route:

- `GET /auth/device/:deviceId/people` — unauthenticated by necessity, because it runs *before* anybody has signed in. The phone proves itself with the `device_id` the backend minted for it and gets back **names and ids only**.
- `POST /auth/device/login` now takes `deviceId`, `userId`, and `password`.

**Choosing a name grants nothing.** The `userId` is not a secret and never was; the password is still the only credential. The backend independently re-checks that the person is assigned to that phone's branch — or is the owner, who reaches every branch of their own business — *before* the password is compared, so someone from the next branch over is refused with a correct password.

#### The disclosure, stated plainly

Whoever holds an enrolled handset can see the names of the people who work at that branch. That is a real disclosure and it was made deliberately, with the owner's approval: it is roughly what a rota on the wall tells the same person, the `device_id` confines it to one branch of one business, a revoked or unknown device learns nothing, and the route sits in the strict auth rate-limit bucket. `openapi.e2e-spec.ts` now pins that `DeviceSignInOptionDto` has exactly two properties, so the list cannot quietly grow something that helps past the password.

#### What was built

**Schema.** `Device` loses `userId` and gains `@@index([branchId, status])`; its `name` becomes an owner-chosen label ("Simu ya kaunta") rather than the worker's name. `DeviceEnrollmentToken` loses `userId` and gains `deviceName`; the `branchId` it already carried is now named by the owner rather than derived from a worker's assignment.

**Migration `20260823160000_devices_belong_to_branches`.** Revokes every existing device and deletes every enrollment token *before* the schema alters — which is also what lets the new `NOT NULL` column be added with no backfill.

**Auth.** `AuthService.loginDevice` takes the person; `deviceSignInOptions` is new. `DeviceSessionGuard` no longer compares `device.userId` to the session's user — it checks status and business, and branch access is re-read live per request by `requireBranchAccess`, so unassigning somebody ends their reach immediately rather than at token expiry.

**Devices.** `issueEnrollment` names a branch and checks it through `requireBranchAccess`. `redeemEnrollment` loses the "this worker already has a phone" refusal. `DeviceView` swaps `userId`/`workerName` for `branchName`.

**Mobile.** The sign-in screen is two steps — a list of names, then a password, with **Si mimi · Someone else** to go back. Enrolment copy now says the phone belongs to the branch.

#### Files changed

**New:** `prisma/migrations/20260823160000_devices_belong_to_branches/`.

**Changed — backend:** `prisma/schema.prisma`, `src/modules/auth/auth.service.ts`, `auth.controller.ts`, `dto/device-login.dto.ts`, `dto/auth-response.dto.ts`, `src/modules/devices/devices.service.ts`, `dto/issue-enrollment.dto.ts`, `dto/device-response.dto.ts`, `src/common/guards/device-session.guard.ts`, and six e2e suites (`device-enrollment`, `devices`, `openapi`, `sales`, `stock-engine`, `branch-assignment`, `rate-limit`).

**Changed — mobile:** `src/core/api/apiClient.ts`, `src/features/auth/DeviceLoginScreen.tsx`, `src/features/enroll/EnrollScreen.tsx`, `src/app/App.test.tsx`.

**Changed — docs:** `README.md`, `docs/v1/01` §4, `docs/v1/02` §§2–3, `PROGRESS.md` (§2 marked superseded, this section added).

#### Commands run and results

| Command | Where | Result |
|---|---|---|
| `npx prisma migrate deploy` | backend | Passed — 7 migrations |
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **147/147** unit |
| `npm run test:e2e` | backend | Passed — **336/336** e2e (was 333; the enrollment suite was rewritten around the new rule) |
| `npm run typecheck` / `test` | mobile | Passed — **100/100** (was 98) |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20 (untouched) |

**Total: 603 automated tests, all passing.**

#### Known issues / risks

1. **Every phone in the field must be re-enrolled.** The migration revoked them all. That is the owner's chosen answer, but it is a physical task, not a deploy step.
2. **A password is now the only thing standing between anyone holding a branch phone and that branch's sales.** Under the old rule an attacker needed the *right worker's* handset; now any branch handset will do. The password policy is still minimal (8 characters, no complexity or breach check — carried from §1, issue 5), and that weakness now matters more than it did. Worth revisiting before the pilot.
3. **There is still no way to change a worker's password.** Not caused by this change, but found during it: `POST /users/workers` creates one and nothing updates it. If a worker forgets their password the only route today is a new worker. Worker management is a Phase 6 deliverable; flagged below.
4. The name list reveals who works at a branch to whoever holds the phone. Deliberate and approved — see the disclosure note above — but it is a genuine change in what an unauthenticated caller can learn.

#### Blocked / awaiting user

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | **Should a worker's password be resettable before Phase 6?** | Known issue 3. It is a small endpoint, but worker management is Phase 6 scope and building it early is the kind of drift AGENT.md warns about | The first time a real worker forgets a password |
| 2 | **Is an 8-character password still enough** now that any branch phone will do? | Known issue 2. A policy decision, not a technical one | Before the pilot |

#### Handoff notes

- **`requireBranchAccess` is the boundary that replaced one-device-one-worker.** It is used by enrollment, stock, and sales alike. If a new route lets a device act on branch data, it goes through that function — not a hand-rolled check.
- **The name list must never grow a credential.** `openapi.e2e-spec.ts` pins `DeviceSignInOptionDto` to exactly `fullName` and `userId`; that test is the guard, and it is meant to fail loudly.
- **Sign-in checks branch membership before comparing the password**, so a wrong-branch attempt costs no bcrypt round and leaks nothing through timing.
- Attribution is unchanged in shape: sales and stock movements still record both `actorUserId` and `deviceId`. Nothing in Phase 4's reporting had to move.
- The device `name` is a label now. Do not use it as an identity, and do not derive one from it.

### §3 — Product, barcode, pricing, and stock engine

**Status:** Complete. **Verified:** Yes — the acceptance check's named scenario runs as a test twice, once against the pure engine and once end to end over HTTP, and the guarantees behind it were mutation-checked. **Date:** 2026-08-23.

**Decision confirmed by the owner on 2026-08-22 — do not re-ask:**

| Question | Decision |
|---|---|
| First barcode format | **EAN-13.** This is what the scanner accepts and what a "valid" barcode means at product creation |

This closes the last open question from Phase 0, carried through §1 and §2. Every other Phase 3 rule already had a written source: package relationships, fixed conversions, cycle rejection, and physical-versus-normalized stock are specified in `docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` §§4–5.

**Two further decisions confirmed by the owner on 2026-08-23, before implementation:**

| Question | Decision |
|---|---|
| EAN-13 strictness | **Verify the check digit**, and accept a 12-digit UPC-A by widening it to its EAN-13 form. A mis-scan is refused rather than stored as a phantom product |
| Price scope | **One price per unit, business-wide.** Adding per-branch overrides later is purely additive; no stored price would have to change |
| Does Phase 3 sell? | **Engine-level stock issue only.** No cart, no payment, no sale record, no HTTP sale route — Phase 4 builds those on top |

#### Acceptance check evidence

Phase 3's acceptance check reads: *the engine correctly handles `1 Carton = 6 Pieces`, receives `6 Cartons`, sells `1 Piece`, shows `5 Cartons + 5 Pieces`, preserves normalized quantity, and refuses invalid/cyclic package relationships.*

| Acceptance criterion | Where it is proven |
|---|---|
| `1 Carton = 6 Pieces` | `src/domain/stock.spec.ts` — "package factors belong to the product", including the same names normalising differently for a second product |
| Receive 6 Cartons | `test/stock-engine.e2e-spec.ts` — "records the delivery in the packaging it arrived in" (36 normalized) |
| Sell 1 Piece | same suite — "removes it through the engine, breaking a Carton open" |
| Shows `5 Cartons + 5 Pieces` | same suite — "reads back exactly that over the API", asserting the literal string list |
| Preserves normalized quantity | same suite — "36 in, 1 out, 35 left" |
| **Refuses invalid/cyclic relationships** | `src/domain/units.spec.ts` (self-reference, 2-cycle, 3-cycle, cycle beside a valid base, two parents, duplicate pair, disconnected units, bad factors) and the same over HTTP in `test/stock-engine.e2e-spec.ts` |

The same scenario is proven twice on purpose: once in `src/domain/stock.spec.ts` against pure functions, and once in `test/stock-engine.e2e-spec.ts` through real HTTP and real PostgreSQL. The first says the arithmetic is right; the second says the arithmetic is actually what the API runs.

#### What was built

**The engine, in `src/domain/`.** `units.ts` holds `UnitGraph` — validation, base-unit resolution, and the walks the stock code needs. `stock.ts` holds the physical state and `receive`/`issue`/`describeState`, every function pure. `barcode.ts` holds EAN-13 normalisation and check-digit verification. No database, no HTTP, no Nest — 102 tests over it that run in about seven seconds.

**Catalogue.** `POST /products` (create with however much the shop knows), `GET /products` (search), `GET /products/lookup` (barcode), `GET /products/{id}`, `POST /products/{id}/units` (progressive enrichment).

**Stock.** `POST /branches/{branchId}/stock-receipts`, `GET /branches/{branchId}/stock`, `GET /branches/{branchId}/stock/{productId}`.

**Permissions are now enforced.** `PermissionsGuard` and `@RequirePermissions` ship here, gating product writes on `SELL` **or** `RECEIVE_STOCK`, receiving on `RECEIVE_STOCK`, and stock reads on `VIEW_STOCK`.

#### Decisions made during the build

| Question | Decision | Why |
|---|---|---|
| Where does the branch go on a stock route? | **In the URL** — `/branches/{branchId}/stock-receipts` | Stock genuinely belongs to a branch (doc 02 §2), and it keeps the branch out of request bodies, so §2's `MAY_NAME_A_BRANCH` allowlist did not have to grow. A test now pins that `CreateStockReceiptDto` has only `lines` and `note` |
| Money representation | **Integer whole shillings** | TZS is not divided into subunits in practice. A representation that cannot be exact eventually disagrees with itself, and Phase 4 is about to do arithmetic on it |
| Are permissions in the token or the database? | **Database, read per guarded request** | Consistent with Phase 2's choice for device revocation: taking `SELL` away should stop the next sale, not the next sign-in. Only guarded routes pay the lookup |
| Do owners need permissions? | **No — the guard passes them through** | The owner is what grants these permissions; requiring them to grant themselves one is a loop with no purpose |
| One permission or several per route? | **Any-of** | Adding an unknown item mid-sale must work for a seller *and* for a stock keeper. Demanding both would break doc 01 §5's flow |
| Two units with the same child (Carton→Piece and Bale→Piece)? | **Refused**, in the domain and by a unique index on the child | Two routes to the base could disagree and there is no honest way to pick a winner. This is stricter than doc 02 §4 strictly requires — flagged below |
| Which package gets broken open? | **The nearest larger one that has stock** | A Sack should not be torn apart when breaking a kg would have served |
| A product the branch holds none of | `GET .../stock/{productId}` answers `0`, not `404` | "We have none" is a real answer on a selling screen; a 404 would read as "no such product" |

#### Files changed

**New** — `src/domain/units.ts`, `stock.ts`, `barcode.ts` (+ three specs), `src/common/decorators/permissions.decorator.ts`, `src/common/guards/permissions.guard.ts`, `src/modules/products/` (service, controller, module, 4 DTOs), `src/modules/stock/` (service, controller, module, 2 DTOs), `prisma/migrations/20260823090000_catalogue_and_stock/`, `test/stock-engine.e2e-spec.ts`, `test/catalogue-isolation.e2e-spec.ts`.

**Changed** — `prisma/schema.prisma` (`Product`, `ProductUnit`, `UnitRelationship`, `Barcode`, `StockReceipt`, `StockReceiptLine`, `StockMovement`, `PhysicalStock`, `StockDirection`, `StockMovementReason`, three new `AuditAction` values), `app.module.ts`, `docs/swagger.ts`, `test/openapi.e2e-spec.ts`, `README.md`, `docs/v1/02` §§1/4/5/9, `PROGRESS.md`.

#### Commands run and results

| Command | Where | Result |
|---|---|---|
| `npx prisma migrate deploy` | backend | Passed — 5 migrations |
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **116/116** unit (was 48; +68 engine tests) |
| `npm run test:e2e` | backend | Passed — **274/274** e2e (was 190) |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20, build clean |
| `npm run typecheck` / `test` | mobile | Passed — 12/12 |
| `node dist/main.js` + `curl /docs`, `/docs-json` | backend | `200`; 33 operations, tags now include `products` and `stock` |

**Total: 422 automated tests, all passing** (backend 116 + 274, web 20, mobile 12). Up from 270.

#### Mutation-checked

Seven guarantees were broken one at a time, the suites re-run, and each restored.

| Guarantee broken | Result |
|---|---|
| `PermissionsGuard`'s permission check | 4 e2e tests failed |
| The insufficient-stock check | 1 domain test failed |
| Breaking the nearest package (no upward repack) | 1 domain test failed |
| Cycle rejection | **initially failed nothing — see below** |
| The barcode check digit | 2 domain + 2 e2e tests failed |
| The branch-assignment filter on stock | 2 e2e tests failed |
| The tenant filter on products | 25 e2e tests failed |

**The cycle-rejection mutation found a weak test, which is the point of doing this.** Removing `assertAcyclic` broke nothing, because the base-unit and connectivity checks independently reject a cyclic graph — so the tests were passing on the error *type* while proving nothing about the cycle detection or the message a shop would actually see. Three cycle tests now assert the message (`/contain each other/`), including a cycle sitting beside a valid base unit, which the connectivity check alone would report as a confusing "units must connect" error. With that, the mutation fails 3 tests.

Also caught during the build: `assertFixedConversionRespected` threw a raw `UnitGraphError` that escaped as a **500** instead of a 400. Both call sites now route through the same error translation as the graph build. A test found it, not a review.

#### Known issues / risks

1. **A unit may have only one parent.** `Carton → Piece` and `Bale → Piece` on the same product is refused, in the domain and by a unique index. Doc 02 §4 does not explicitly forbid it, so this is stricter than the letter of the spec. It is the safe direction — two routes to the base could disagree — and relaxing it later is additive. **But if a real shop needs both a Carton and a Bale of the same product, this will block them**, and it needs the owner's decision, not a quiet change.
2. **No endpoint attaches a barcode to an existing product.** A barcode can be supplied at product creation or when adding a unit, which covers Phase 4's inline-creation flow, but a product typed in without a code cannot have one attached later. Deliberate scope discipline; Phase 4 or 5 should add it when the flow needs it.
3. **No endpoint edits a price, a product name, or deactivates a product.** Same reasoning — Phase 6 owns product management. Phase 4 will need at least a price edit, since a product created mid-sale is priced in the same breath.
4. `StockService.issueStock` has no HTTP route by design, so it is reachable only from inside the backend. Phase 4 must not add a bare "issue stock" endpoint; it should call this from the sale command.
5. Issues carried from §1 and §2 all still stand: the `e2e-env.js` rate-limit bug (§2 known issue 1), npm allow-scripts, no `web/` ESLint config, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens.
6. **A stray verification process was found and stopped.** A `node dist/main.js` on port 3099, started during Phase 2's contract check, had never actually exited — `kill` had killed the subshell rather than node. The first Phase 3 contract check silently read that stale server and appeared to show the new routes missing. It was identified by port, stopped, and the check redone against a clean boot. Nothing of the owner's was touched; the development server on 3001 was left running throughout.

#### Blocked / awaiting user

Nothing blocks Phase 4. Open, and belonging to later phases:

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | **May one product have two large packagings** (a Carton *and* a Bale of the same item)? | Known issue 1. It is a real shop question, not a technical one | Whenever a pilot shop hits it; not Phase 4 |
| 2 | **Pilot shop workflow** | Decides who the first real onboarding is for | Phase 8 |
| 3 | Confirm only regenerable build output may be cleared during disk cleanup | Nothing of the owner's was touched, but the confirmation was never given | Whenever disk tightens again |

#### Handoff notes

- **The engine is in `src/domain/` and must stay there.** `units.ts`, `stock.ts`, and `barcode.ts` have no database, no HTTP, and no Nest in them. That is why 102 tests over the hardest logic in the product run in seconds. Phase 4's line totals and change calculation belong there too, not in a service and certainly not in a screen.
- **Phase 4's sale calls `StockService.issueStock`**, once per line, inside the sale's own transaction. It already writes the `StockMovement` with the conversion snapshotted and attributes it to the actor and device from the token — do not duplicate that.
- **`issueStock` takes `reason` and `source`.** Pass `StockMovementReason.SALE` with `{ type: 'Sale', id }` so a movement can be traced back to the sale that caused it.
- **A sale line must snapshot its own price**, the way `StockReceiptLine` snapshots `normalizedQuantity`. Doc 02 §6 is explicit that a later price change must never rewrite a completed sale, and nothing in Phase 3 enforces that for sales yet.
- **The correction to §2's handoff note:** it said Phase 4/5 would add the `PermissionsGuard`. That was wrong by one phase — receiving stock is a Phase 3 deliverable, so the guard shipped here. Phase 4 only needs to annotate its sale routes with `@RequirePermissions(UserPermission.SELL)`.
- Prices are integers. Do not introduce a float or a Decimal for money without an ADR.
- `PRODUCT_WRITE_PERMISSIONS` is exported from `products.service.ts`; reuse it rather than re-listing the pair.
- `test/openapi.e2e-spec.ts` now also pins that stock keeps its branch in the URL rather than the body. Phase 4's sale should do the same.



### §4 — React Native mobile selling flow

**Status:** Complete. **Verified:** Yes — every clause of the acceptance check is driven by a real test: the backend half end to end over HTTP as a worker on an enrolled phone, the phone half through the actual screens. **Date:** 2026-08-23.

**Decision confirmed by the owner on 2026-08-23, before implementation:**

| Question | Decision |
|---|---|
| Mobile dependencies for this phase | **`expo-camera` and `expo-secure-store` only.** Navigation stays hand-rolled React state — the app is one path (enrol → sign in → home → Mauzo → receipt) and four native navigation packages would buy nothing a `Route` union does not |
| Receipt printing *(answered 2026-08-23, after the phase's tests passed)* | **Not in V1 — it is a next-version feature.** V1 receipts are viewed on the phone or shared through its normal share function. `expo-print` is therefore not added, and `docs/v1/01` §8 and `docs/v1/03`'s deferred list now say so |

`expo-camera` was already the written direction in `docs/v1/02` §1; `expo-secure-store` is what "stores a device credential securely" in §3 means on Android. **Both are native, so a new EAS development build is needed before the app runs on a phone** — see Known issues 1.

#### Acceptance check evidence

Phase 4's acceptance check reads: *a worker can scan an existing item, type and select an item, add an unknown item inline, adjust quantities, complete cash/mixed/debt payment against the seeded payment methods, view a receipt, and begin the next sale without dead ends.*

| Acceptance criterion | Where it is proven |
|---|---|
| Scan an existing item | `test/sales.e2e-spec.ts` §1 — barcode lookup, then a cash sale that breaks a Carton open; `SaleScreen.test.tsx` "adds what the barcode found" |
| Type and select an item | `test/sales.e2e-spec.ts` §2 — search matches mid-name, then sells by the Carton; `SaleScreen.test.tsx` "adds a product with one sellable unit immediately" |
| Add an unknown item inline | `test/sales.e2e-spec.ts` §3 — created by the **worker's** token mid-sale, refused until stock exists, then sold; `SaleScreen.test.tsx` "creates it and puts it straight in the cart" |
| Adjust quantities | `SaleScreen.test.tsx` "adjusting quantities" (3 tests), over `cart.test.ts`'s 30 |
| Complete cash payment | `test/sales.e2e-spec.ts` §1 — TSh 2,000 settled from TSh 5,000, change TSh 3,000 |
| Complete mixed payment | `test/sales.e2e-spec.ts` §5 — cash + mobile money across one bill; `SaleScreen.test.tsx` "splits a bill across two methods" |
| Complete debt payment | `test/sales.e2e-spec.ts` §5 — debt against a name, and part-cash-part-debt |
| Against the **seeded** methods | `test/sales.e2e-spec.ts` "was created with the seeded default payment methods" — asserts the literal three, in order |
| View a receipt | `test/sales.e2e-spec.ts` §6 — read back, and **still correct after the price changes**; `ReceiptScreen.test.tsx` (8 tests) |
| Begin the next sale, no dead ends | `test/sales.e2e-spec.ts` §6 "starts the next sale immediately"; `ReceiptScreen.test.tsx` "leads straight into the next sale" and "offers home as well" |

Proven twice on purpose, as in Phase 3: the pure arithmetic in `src/domain/sale.spec.ts` (31 tests) and `mobile/src/domain/{cart,payment}.test.ts` (44), and the same rules through real HTTP and real PostgreSQL in `test/sales.e2e-spec.ts` (38).

#### What was built

**The sale engine, in `backend/src/domain/sale.ts`.** `lineTotal`, `saleTotal`, and `settle` as pure functions beside `units.ts`, `stock.ts`, and `barcode.ts`. No database, no HTTP, no Nest.

**The sale command.** `POST /branches/{branchId}/sales` and `GET /branches/{branchId}/sales/{id}`. Everything commits together — sale, lines, payments, stock movements, audit entry — in one `$transaction`.

**Payment methods.** `GET /payment-methods`, read-only. `PaymentMethod` with a `PaymentMethodKind`; every business is created with **Taslimu**, **Pesa ya simu**, and **Deni**, and the migration backfills existing businesses.

**The Android app.** Enrol → sign in → permission-aware home → Mauzo → receipt, plus the Phase 1 connection check kept and now reachable from both sign-in screens. Scanner, search, unit choice, inline product creation, cart with quantity controls, payment sheet with change and debt, and a shareable receipt.

**Phase 3 code that changed.** `StockService.issueStock` was split into a wrapper and `issueWithin(tx, …)` so the sale's stock removal joins the sale's own transaction instead of opening a second one beside it. `requireBranch`, previously private to `StockService`, moved to `src/common/branch-access.ts` and is now shared with sales — "who may receive stock into this branch" and "who may sell from it" drifting apart would be a security bug that reads like a refactor.

#### Decisions made during the build

| Question | Decision | Why |
|---|---|---|
| Where does the idempotency key go? | **A required body field**, unique per business | A header would be idiomatic but invisible in the schema. Required rather than optional: a dropped response is the normal case on a Tanzanian phone, and an optional key would be absent exactly when it mattered |
| Same key, different branch? | **409**, not the first branch's receipt | Within one business the key means "this one sale". That is not a retry, and returning another branch's receipt silently would be worse than an error |
| Is a debt its own table? | **No — a `SalePayment` row carrying a name** | V1 records a name and an amount and refuses to grow a customer account. A `Debt` table would invite exactly the collection workflow doc 01 §8 excludes |
| Is a receipt stored? | **No — it is a view of the sale** | Everything a receipt shows is already snapshotted on the sale. Storing it twice creates two things that can disagree |
| Which payment methods are seeded? | **Three, generic, Swahili** | Doc 01 §7 says a shop *configures* what it accepts. Seeding "Airtel Money" puts words in the mouth of a shop that does not use it; the three shapes of settlement — in hand, on a phone, still owed — are always true |
| How does an owner "permit a debt sale" (doc 01 §5)? | **By keeping `Deni` active** | Only active methods can settle a sale, and the backend refuses an inactive one — so it is a real permission, not a hidden button |
| Where does the payment *kind* come from? | **The stored method, never the request** | Otherwise a client could label an M-Pesa payment as cash and make Shoprex calculate change for money nobody handed over |
| Same product and unit on two lines? | **Refused, 400** | The phone's cart increments the line it already has. Summing them quietly would hide that bug instead of surfacing it |
| What happens when a sale exceeds recorded stock? *(revised 2026-08-23, see below)* | **The sale completes; the balance goes negative and the shortfall is flagged** | The seller is holding the item. Refusing makes Shoprex argue with physical reality in front of a customer, and is absurd on a product created seconds earlier |
| How is a unit named when a product is added mid-sale? *(revised 2026-08-23)* | **Chosen from a searchable list; typed only when genuinely new, then added with a green +** | A shop spelling one unit three ways ends up with three units meaning the same thing and no way to add them together |
| Does Phase 4 ship a sales list? | **No — only the single-sale read** | Phase 6 owns the owner-facing sales list and detail. The selling flow needs the receipt for the sale just rung up, and nothing more |
| Does the phone do payment arithmetic? | **Yes, for display only** | The seller must see the change before handing it over, and a disabled button must say *why*. `mobile/src/domain/payment.ts` re-implements the two formulas; the backend recomputes and decides |
| Navigation library? | **None** | Owner-approved. A `Route` union plus `BackHandler` covers one linear path; four native packages would have to be carried through Phases 5–8 |

#### Files changed

**New — backend:** `src/domain/sale.ts` + `sale.spec.ts`, `src/common/branch-access.ts`, `src/modules/payments/` (defaults, service, controller, module, 1 DTO), `src/modules/sales/` (service, controller, module, 2 DTOs), `prisma/migrations/20260823120000_sales_and_payments/`, `test/sales.e2e-spec.ts`, `test/sales-isolation.e2e-spec.ts`.

**New — mobile:** `src/domain/cart.ts`, `src/domain/payment.ts` (+ both tests), `src/core/session/sessionStore.ts`, `src/app/ui.tsx`, `src/app/App.test.tsx`, `src/features/enroll/EnrollScreen.tsx`, `src/features/auth/DeviceLoginScreen.tsx`, `src/features/home/HomeScreen.tsx` (+ test), `src/features/sale/` — `SaleScreen`, `ScannerSheet`, `NewProductSheet`, `PaymentSheet`, `ReceiptScreen` (+ `SaleScreen.test.tsx`, `ReceiptScreen.test.tsx`).

**Changed — backend:** `prisma/schema.prisma` (`PaymentMethod`, `PaymentMethodKind`, `Sale`, `SaleLine`, `SalePayment`, `AuditAction.SALE_COMPLETED`), `prisma/seed.ts`, `src/app.module.ts`, `src/docs/swagger.ts`, `src/modules/stock/stock.service.ts`, `src/modules/auth/auth.service.ts`, `src/modules/businesses/businesses.service.ts`, `test/openapi.e2e-spec.ts`.

**Changed — mobile:** `package.json`, `app.json` (camera plugin + `CAMERA` permission), `src/app/App.tsx`, `src/core/api/apiClient.ts`, `src/test/setup.ts`, `src/features/health/HealthScreen.test.tsx`.

**Changed — docs:** `README.md`, `docs/v1/01` §§5 and 7, `docs/v1/02` §§6, 7 and 9, `PROGRESS.md`.

#### Commands run and results

| Command | Where | Result |
|---|---|---|
| `npx prisma migrate deploy` | backend | Passed — 6 migrations |
| `npx prisma db seed` | backend | Passed |
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **147/147** unit (was 116; +31 sale engine) |
| `npm run test:e2e` | backend | Passed — **333/333** e2e (was 274; +38 selling flow, +14 isolation, +7 contract) |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20, build clean (untouched this phase) |
| `npm run typecheck` / `test` | mobile | Passed — **98/98** (was 12) |
| `node dist/main.js` + `curl /docs`, `/docs-json` | backend | `200`; **36 operations**, tags now include `payments` and `sales` |

**Total: 598 automated tests, all passing** (backend 147 + 333, web 20, mobile 98). Up from 422.

The full suite was also run **at the start of the session**, before any Phase 4 code, and matched §3's recorded 422 exactly — so Phase 3's stated status was confirmed against reality rather than taken on trust.

#### Manual testing

Phase 4 added **eight things a person can now do** that they could not before, and the 2026-08-23 device change (§2a) added a ninth — sharing a phone. Each one is a walkthrough below: where to go, what to do, and what should appear.

**Two honest warnings before starting.** First, every feature here needs a **new development build** — `expo-camera` and `expo-secure-store` are native, and the app installed before this phase does not contain them. Second, **nothing below has run on real hardware.** The 98 mobile tests replace the camera and the keystore with fakes, which is right for a test and is not the same as a camera reading a real bottle. Features 1 and 3 in particular have no coverage that touches the real thing.

---

##### Setup — reaching the starting line

```bash
cd backend && npm run prisma:deploy && npm run prisma:seed && npm run start:dev
cd mobile  && npm run build:dev      # EAS cloud build; ends with a QR code
# install the APK on the phone, then:
cd mobile  && npm start
```

Set `EXPO_PUBLIC_SHOPREX_API_BASE_URL` in `mobile/.env` to `http://<your-PC-LAN-IP>:3001/api/v1` — not `localhost`, the phone is a different machine. Allow ports **3001** and **8081** through the Windows firewall.

**The owner's screens for creating workers and issuing enrolment codes are Phase 6's**, so for now do that part at **http://localhost:3001/docs**:

1. `POST /auth/login` with `{"email":"owner@shoprex.co.tz","password":"shoprex12345"}`. → Copy `accessToken` from the response.
2. Click **Authorize** at the top right, paste the token, **Authorize**, **Close**. → Every route below is now signed in as the owner of *Duka la Mfano*.
3. `GET /branches`. → One branch, *Tawi Kuu*. Copy its `id` — call it **BRANCH**.
4. `POST /users/workers` with `{"fullName":"Juma Hassan","password":"shoprex12345","branchId":"BRANCH","permissions":["SELL"]}`. → A worker who may sell at that branch. Do it a second time for `Neema Said`, so there are two names to choose between on the phone.
5. `POST /products` with a **real barcode from something on your desk** — a soda, a soap, anything with a 13-digit code:

   ```json
   { "name": "Coca-Cola 500ml",
     "units": [ { "name": "Carton", "priceTzs": 12000 }, { "name": "Piece", "priceTzs": 1000 } ],
     "relationships": [ { "parentUnit": "Carton", "childUnit": "Piece", "factor": 6 } ],
     "barcode": "<the 13 digits printed on the item>" }
   ```

   → A product with two units. If it answers **400**, the check digit is wrong — you mistyped a digit, which is the barcode validation doing its job.
6. `POST /branches/BRANCH/stock-receipts` with `{"lines":[{"productId":"<product id>","productUnitId":"<the Carton unit id>","quantity":10}]}`. → 10 Cartons on the shelf, 60 Pieces normalised.

---

##### Feature 1 — A phone can be enrolled to a branch, and stays enrolled *(must pass)*

New this phase: the enrolment and sign-in screens. The device model behind them was revised on 2026-08-23 — **a phone belongs to a branch, and everyone who works there shares it** (§2a).

1. At `/docs`, `POST /devices/enrollments` with `{"branchId":"BRANCH","deviceName":"Simu ya kaunta"}`. → A `code` like `ABCD-EFGH-JKLM`. **This is shown once.** Write it down.
2. Open Shoprex on a phone that has never been enrolled. → The enrolment screen, asking for a code. Not a blank screen, not a crash.
3. Type the code in lower case and without the dashes. → It is accepted anyway; the app forgives spelling.
4. → You land on a **list of names**, not a password box — the phone belongs to the branch, so it does not know who picked it up.
5. Tap **Juma Hassan**, then enter `shoprex12345`. → The home screen, greeting *Karibu, Juma Hassan*.
6. **Force-quit the app and reopen it.** → It goes straight to the home screen, not back to enrolment. *This is the keystore actually working — the tests fake it, so this step is the only real check there has ever been.*
7. Try the same code again, or on a second phone. → Refused. A code is single-use.
8. Issue a second code for the **same** branch and enrol another handset. → Accepted. A branch may hold as many phones as it needs — the old "one worker, one device" refusal is gone.

##### Feature 1b — Two people share one phone *(must pass — this is the point of §2a)*

1. On the home screen, tap **Toka · Sign out**. → Back to the list of names, **not** to enrolment. The phone is still the branch's.
2. → Both `Juma Hassan` and `Neema Said` are listed, and so is the owner.
3. Tap **Neema Said** and enter her password. → The home screen greets *Karibu, Neema Said*. **This is the flat-battery case working**: Juma's phone died, Neema carries on.
4. Tap a name, then tap **Si mimi · Someone else**. → Back to the list, password cleared.
5. Tap **Juma Hassan** and enter the **wrong** password. → Refused in plain language. Choosing a name grants nothing on its own.
6. At `/docs`, create a worker at a *different* branch, then look at this phone's list again. → They are **not** on it. A phone only offers the people who work at its own branch.

##### Feature 2 — The home screen shows only what this person may do *(must pass)*

1. Look at the home screen. → **Mauzo** is the largest, greenest thing on it. There is no *Pokea mzigo* button — receiving stock is Phase 5 and is deliberately absent rather than stubbed.
2. At `/docs`, `PATCH /users/WORKER/permissions` with `{"permissions":["VIEW_STOCK"]}`.
3. On the phone, sign out and sign back in. → No Mauzo button at all. Instead, a written explanation that selling has not been granted and to ask the owner. → **No dimmed button to poke at.**
4. Put `SELL` back: `PATCH /users/WORKER/permissions` with `{"permissions":["SELL"]}`, then sign in again. → Mauzo returns.

##### Feature 3 — Selling an item by scanning its barcode *(must pass — and least tested)*

1. Tap **Mauzo**. → An empty cart that says so, and tells you to scan or type.
2. Tap **Soma**. → Android asks for camera permission the first time. Allow it. → A live viewfinder.
3. Point it at the barcode on the item you registered in setup step 5. → A unit choice appears (this product has a Carton *and* a Piece). Pick **Piece**. → It lands in the cart at quantity 1, TSh 1,000.
4. Tap **Soma** and scan the same item three more times, picking Piece each time. → **One line, quantity 4.** Not four lines, and — importantly — **not forty**: the scanner must fire once per opening, not continuously while pointed at the code.
5. Scan something else in the room that Shoprex has never seen. → The new-product sheet opens **with that barcode already filled in**.
6. Close it. Now deny camera permission in Android settings and reopen **Soma**. → A readable explanation and a working **Ruhusu kamera** button — and you can still type a name instead. Not a black rectangle.

##### Feature 4 — Selling an item by typing its name *(must pass)*

1. In Mauzo, type `cola` in the search box. → After a short pause, *Coca-Cola 500ml* appears with both its units and prices. → Matching **mid-name**, not just from the start.
2. Type quickly. → It should not fire a request per keystroke.
3. Tap the result. → The unit choice appears again, **Carton first** (largest packaging first).
4. Pick **Carton**. → A second cart line: 1 Carton, TSh 12,000. → The Pieces line is still separate. *2 Cartons and 5 Pieces stay two lines — that is what went over the counter.*
5. Search for something that does not exist, e.g. `kitu kipya`. → Not a blank list: an empty state plus an **Ongeza bidhaa mpya** button.

##### Feature 5 — Adding an item that has never been sold, without leaving the sale *(must pass)*

1. From that empty search, tap **Ongeza bidhaa mpya**. → A sheet asking three things only: name, unit, price.
2. Type `Sabuni ya Mche` as the name, then look at **Kipimo**. → A search box with unit names already listed underneath — the shop's own first, then common Swahili ones. **Nothing has to be typed.**
3. Tap **Kipande**. → It is chosen, and shown as the unit.
4. Now type `Ndoo` into the same box. → The list empties and a **green +** appears at the end of the box. Tap it. → `Ndoo` becomes the unit. → *Only a genuinely new unit is ever typed; everything else is one tap.*
5. Type `Kip` — a partial match. → `Kipande` is listed **and** the + is offered, because "Kip" might be a real new unit. Tap `Kipande` to choose the existing one.
6. Set the price to `2500` and save. → It saves **and lands straight in the cart** at quantity 1. You never left the sale.
7. Tap **Lipa**, take payment, complete. → **The sale goes through.** → *It must not say "not enough stock": the product was created seconds ago, so of course none was received, and the seller is holding the bar of soap.*
8. Look at the receipt. → An amber note: the sale completed normally, the count was short, the owner has been notified. → *Not an error, and not a failure.*
9. At `/docs`, `GET /branches/BRANCH/stock/<product id>`. → **-1**, not 0. Then `GET /audit-events` → a `STOCK_INCONSISTENCY` line naming *Sabuni ya Mche* and how much it was short by.
10. Receive 20 Kipande at `/docs`, then check stock again. → **19**, not 20. → *The negative settled itself; nobody did arithmetic by hand.*

##### Feature 6 — Adjusting the cart *(must pass)*

1. Use **+** on a line. → Quantity and line total both go up; the bar at the bottom follows.
2. Use **−** until it reaches zero. → The line disappears. → *A line of nothing is not something a shop is selling.*
3. Tap **Ondoa** on a line. → Gone.
4. Empty the cart entirely. → **Lipa** is disabled. There is nothing to pay for.

##### Feature 7 — Taking the money: cash, split, and debt *(must pass)*

1. With a cart worth TSh 2,500, tap **Lipa**. → The total, three method buttons — *Taslimu, Pesa ya simu, Deni* — and a confirm button that is **disabled with the reason written next to it**.
2. Tap **Taslimu**. → The full TSh 2,500 fills in automatically; *Iliyobaki* reads TSh 0 and confirm enables. → *One tap for an ordinary sale.*
3. In **Pesa aliyotoa**, type `3000`. → A green **Chenji · Change: TSh 500** appears **before** you confirm anything.
4. Now reduce *Kiasi* on Taslimu to `1000` and tap **Pesa ya simu**. → The second method fills in the remaining `1500`. Confirm stays enabled only while the remainder is exactly zero.
5. Remove both, tap **Deni**, and try to confirm with no name. → Refused, with *"Write the debtor's name"* — readable, not a code.
6. Type `Mama Asha`. → Confirm enables.
7. Try entering more than the total. → Refused: *"the payments add up to more than the total"*. → *Overpaying is change on a cash sale, not a bigger sale.*

##### Feature 8 — The receipt, and going straight into the next sale *(must pass)*

1. Complete a sale. → A receipt: the total, the time, the seller's name, and the lines **in the units actually sold** — `2 × Carton`, not `12 × Piece`.
2. Check any change and any debt are shown, with the debtor named.
3. Tap **Tuma risiti**. → The phone's normal share sheet opens with a legible plain-text receipt. Send it to yourself on WhatsApp. → *Printing is deliberately absent; it is a next-version feature.*
4. Tap **Mauzo mapya**. → A clean empty cart, immediately. **No leftover lines from the sale just finished.**
5. Press Android's hardware **back** from Mauzo and from the receipt. → Both return home. Back from home leaves the app, as Android expects.

---

##### And then check the shop's books moved *(must pass)*

1. At `/docs`, `GET /branches/BRANCH/stock/<product id>`. → Stock is down by exactly what you sold, and if you sold Pieces from full Cartons, one Carton has been **broken open** — e.g. `9 Carton + 4 Piece`, never `9.67 Cartons`.
2. `GET /audit-events`. → A `SALE_COMPLETED` line for each sale, attributed to Juma Hassan and to his device.
3. Open a receipt, then change the product's price at the database level, then reopen the same receipt. → **It still shows the old price.** *A price change must never rewrite a completed sale.*

##### What should be refused *(must pass)*

| Try this | What should happen |
|---|---|
| Turn Wi-Fi off, then confirm a payment | A clear failure, **no receipt, no stock removed**. Turn Wi-Fi back on and retry → **one** sale, not two |
| `POST /devices/{id}/revoke` at `/docs` while the app is open, then sell | Refused on the very next request; back to sign-in with the backend's message. **Sajili simu upya** offers a way out rather than stranding the worker. The name list refuses too — a revoked phone will not even say who works there |
| Remove `SELL` mid-shift, then sell | Refused immediately, not whenever the token expires |
| Stop the backend, then open the app | An explicit *Seva haipatikani* state naming the address it tried — with **Angalia muunganisho** to check, and **Rudi** to get back |
| Create a product with no price, then sell it | Refused with a readable reason. Not a crash, and not a zero-shilling sale |

##### Worth a look, if there is time

- The whole flow **on the cheapest Android phone available, in daylight**: thumb-sized buttons, legible text, the green action obvious, nothing cut off. No test can make that judgement.
- Whether the Swahili reads naturally to someone who actually speaks it. Every string is Swahili-first with English after a middle dot.

##### What has no automated coverage at all

Four things. These are not double-checks — manual testing is the only check they have ever had:

1. **The camera** (Feature 3) — `expo-camera` is mocked in every test. It has never run.
2. **The keystore surviving a restart** (Feature 1, step 6) — `expo-secure-store` is mocked too.
3. **Real network failure mid-sale** — idempotency is tested, but never against a connection that actually dropped.
4. **How any of it feels on a low-end handset.**

#### Known issues / risks

1. **A new EAS development build is required before the app runs on a phone.** `expo-camera` and `expo-secure-store` are native. Run `npm run build:dev` in `mobile/`, install the APK, then Metro as usual. Nothing in this phase has been exercised on real hardware — the tests replace both native modules, which is the right level for them but is not the same as a camera reading a real bottle. **Recommend a hardware pass at the start of Phase 5**, which will use the same scanner.
2. ~~**Receipt printing is not built.**~~ **Resolved 2026-08-23:** the owner confirmed printing is a next-version feature, not a V1 gap. Sharing works through React Native's built-in `Share` and needs no dependency. `docs/v1/01` §§7–8 and `docs/v1/03`'s deferred list were updated to match, so the specification no longer promises a V1 feature that does not exist. Nothing in the receipt forecloses printing later: it is a view over data the backend already holds.
3. **The app sells from `profile.branchIds[0]`.** A worker has exactly one branch, so this is correct for the role the phone is built for. An owner or a multi-branch manager signing in on a phone would silently get their first branch. A branch picker is a Phase 6 concern, but this is a real sharp edge worth naming.
4. **No endpoint edits a price or attaches a barcode to an existing product** (carried from §3, issues 2 and 3). Phase 4 turned out not to need either: inline creation takes the price and the barcode in the same breath. A product created without a price still cannot be sold, and the app says so instead of guessing.
5. **`mobile`'s `npm run lint` script does not work.** It is `expo lint`, and running it makes Expo *install* `eslint` and write an `eslint.config.js`. That happened once during this phase and was reverted immediately — the dependency was uninstalled, the config deleted, and `mobile/package.json` now differs from its previous state only by the two approved packages. The broken script predates this phase and is left alone rather than fixed or removed, since adding an ESLint toolchain to `mobile/` is a decision, not a cleanup. `web/` has the same gap (§1, issue 3).
6. **`backend/prisma/schema.prisma` opens with a stale header comment** saying the schema "intentionally contains no business tables yet". It has fifteen models. This predates Phase 4 and was left alone per AGENT.md — reported, not silently fixed.
7. Issues carried from §1, §2, and §3 all still stand: the `e2e-env.js` rate-limit bug, npm allow-scripts, no `web/` ESLint config, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens, and one-parent-per-unit.

#### Blocked / awaiting user

Nothing blocks Phase 5. Open, and each belonging to a later phase:

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | **May one product have two large packagings** (a Carton *and* a Bale)? | Carried from §3. A real shop question, not a technical one | Whenever a pilot shop hits it |
| 2 | **Pilot shop workflow** | Decides who the first real onboarding is for | Phase 8 |
| 3 | Confirm only regenerable build output may be cleared during disk cleanup | Carried from §1 and §3; never answered | Whenever disk tightens again |

**Answered since this section was first written:** receipt printing (2026-08-23) — a next-version feature, not V1. Recorded in the decisions table above.

#### Handoff notes

- **The sale command is `SalesService.complete`, and it is one transaction.** If anything is ever added to a sale — a discount, a note, a second stock effect — it goes *inside* that `$transaction`, not after it. `StockService.issueWithin` exists precisely so a caller can bring its own `tx`; `issueStock` remains for a standalone removal.
- **`requireBranchAccess` in `src/common/branch-access.ts` is the one answer to "may this caller act on this branch?"** Phase 5's receiving screen is already on the Phase 3 route that uses it. Do not write a second version.
- **Phase 5 is almost entirely a mobile phase.** `POST /branches/{branchId}/stock-receipts` and both stock reads shipped in Phase 3 and need no backend work. What is missing is the screens.
- **The home screen already knows how to hide what a person may not do.** Adding *Pokea mzigo* means one more permission check against `RECEIVE_STOCK` beside the existing `SELL` one in `HomeScreen.tsx` — and a matching test, since `HomeScreen.test.tsx` currently asserts that receiving is *absent*. That assertion is meant to be deleted by Phase 5, not worked around.
- **The scanner, the search, and `NewProductSheet` are reusable as they stand.** Receiving needs the same three, plus a quantity and an optional cost. `ScannerSheet` latches after the first hit and re-arms on `onShow`; keep that, or one barcode becomes a dozen.
- **Cart rules live in `mobile/src/domain/cart.ts`, not in the screen.** A receiving basket is close enough that it may be worth generalising rather than copying — but decide that deliberately, since a receipt basket has a cost per line where a cart has a price.
- **The phone never decides anything.** `mobile/src/domain/payment.ts` re-implements settlement so the seller can see the change and a disabled button can say why; the backend recomputes all of it. Keep that asymmetry explicit in any new screen.
- **Idempotency keys are built by `newIdempotencyKey(deviceId, counter)`.** They only need to be unique, not unguessable — the backend scopes them per business and the device id separates two phones in one shop. Do not reach for a crypto dependency to "improve" this.
- Prices are integers. Do not introduce a float or a Decimal for money without an ADR.

### §4a — Revised after review: negative stock, and a searchable unit (2026-08-23)

Two changes the owner asked for after walking Phase 4. Both are product corrections, not bugs — the code did what it was specified to do, and the specification was wrong.

**1. A sale is never refused for want of a stock record.**

*What was wrong:* selling more than the branch had recorded answered `409` — "not enough stock". As the owner put it: the person scanning it is holding the item, so telling them the shop has none is Shoprex arguing with physical reality in front of a customer. It was worst on a product created mid-sale, where nothing could possibly have been received against it yet.

*What it does now:* the removal always completes. The balance is allowed to go **negative**, and the shortfall is recorded as an inconsistency for the owner to act on.

`docs/v1/02` §5 anticipated this precisely — *"unless a separate approved negative-stock policy is introduced"* — so this is that policy rather than a departure from the specification.

| Decision | Answer | Why |
|---|---|---|
| Negative, or floored at zero? | **Negative** | Received minus sold always equals the balance, so a shop that sells 5 with 2 counted sits at -3 and a later delivery of 10 lands on the true 7. Flooring throws away the very number that says how wrong the count is, and leaves someone reconciling by hand |
| Where is it flagged? | **On the sale line, plus an audit event** | `SaleLine.shortfallNormalized` keeps a receipt and a sales report truthful on their own; `AuditAction.STOCK_INCONSISTENCY` names the product, branch, and amount so the owner has something to recount. Nothing new for Phase 7 to build — it reads existing tables |
| What does the seller see? | **A note on the receipt, after the fact** | "The sale went through normally; the count was short; the owner has been notified." Never during the sale, and never phrased as a failure — the seller did nothing wrong |

The rules that did **not** loosen: the engine still never repackages upward — selling a Carton from twelve loose Pieces takes the Carton line to `-1` and leaves the Pieces where they are — and nothing hides a deficit "by changing units or prices", which is what doc 02 §5's remaining sentence forbids. A shortfall is recorded as a shortfall.

`describeState` and the branch stock list now show negative lines instead of filtering them out. Filtering was correct when negatives were impossible; keeping it would have hidden the one number the owner needs.

**2. A unit is chosen, not typed.**

*What was wrong:* adding a product mid-sale asked the seller to type the unit into a free-text box, pre-filled with "Kipande". At a counter with a customer waiting that is slow, and worse, lossy — a shop writing `Kipande`, `kipande`, and `Vipande` ends up with three units that mean the same thing and no way to add them together.

*What it does now:* `UnitNameField` is a search box over a list. The list is the shop's own unit names, most-used first, merged with fourteen common Swahili ones so a shop on its first day still has something to pick. Typing filters. Only when nothing matches exactly does a **green +** appear at the end of the box to add the name as typed.

`GET /products/unit-names` is the new route behind it — a `groupBy` over the business's own units ordered by frequency, so the suggestions are the shop's habits rather than Shoprex's guesses. It fails silently on the client: the common names alone are still a usable list.

Note the deliberate detail in `isNewUnitName`: typing `Kip` offers `Kipande` **and** the +, because a partial match is not an exact one and "Kip" might genuinely be a new unit. Only an exact, case-insensitive match hides the +.

#### Files changed in this revision

**Backend:** `src/domain/stock.ts` (`issue` returns `Issued`, `describeState` keeps negatives) + `stock.spec.ts`, `src/modules/stock/stock.service.ts` (`issueWithin` reports instead of refusing; branch list uses `not: 0`), `src/modules/sales/sales.service.ts` (stock moves before lines so the shortfall can be stored; the inconsistency audit entry), `src/modules/sales/dto/sale-response.dto.ts`, `src/modules/products/products.service.ts` + `products.controller.ts` (`unit-names`), `prisma/schema.prisma`, `prisma/migrations/20260823180000_negative_stock_policy/`, `test/stock-engine.e2e-spec.ts`, `test/sales.e2e-spec.ts`, `test/sales-isolation.e2e-spec.ts`, `test/openapi.e2e-spec.ts`.

**Mobile:** `src/features/sale/UnitNameField.tsx` + test (new), `NewProductSheet.tsx`, `ReceiptScreen.tsx` + test, `SaleScreen.test.tsx`, `src/core/api/apiClient.ts`.

**Docs:** `docs/v1/01` §§5 and 7, `docs/v1/02` §§5 and 10, `README.md`, `PROGRESS.md`.

#### Tests after the revision

| Command | Where | Result |
|---|---|---|
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **152/152** unit (was 147) |
| `npm run test:e2e` | backend | Passed — **340/340** e2e (was 333) |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20 (untouched) |
| `npm run typecheck` / `test` | mobile | Passed — **123/123** (was 98) |

**Total: 635 automated tests, all passing.** Up from 598.

Three existing tests asserted the rule that has now changed, and were rewritten rather than deleted: `stock.spec.ts`'s "failing safely when stock is short" block, `stock-engine.e2e-spec.ts`'s "refuses to issue more than the branch holds", and `sales.e2e-spec.ts`'s "refuses to sell it before any has been received". Each now proves the new behaviour, including that a later delivery settles the negative on its own.

#### Known issues from this revision

1. **Nothing surfaces the negative balance to the owner yet except the audit log and the stock list.** That is the correct amount of work for Phase 4 — an owner-facing "things to recount" screen belongs to Phase 6 or 7 — but it does mean an owner who never opens either will not notice. Worth revisiting when Phase 7's reports are designed.
2. **A negative balance is not distinguishable from a data-entry mistake.** If a worker fat-fingers a quantity of 500 instead of 5, the branch goes to -495 and the audit line says so, but nothing prevents or questions it at the point of sale. Deliberate for now — the alternative is a confirmation prompt on the hot path — but a "does that look right?" check above some threshold may be worth it after the pilot.
3. `expo-camera` and `expo-secure-store` remain untested on hardware, unchanged from §4.

### §5 — React Native stock receiving and operational visibility

**Status:** Complete. **Verified:** Yes — both halves of the acceptance clause are driven by real tests: the backend over HTTP as a stock keeper on an enrolled phone, the phone through the actual screens. **Date:** 2026-08-23.

**No backend route and no schema change.** Everything this phase needed shipped in Phase 3: `POST /branches/{branchId}/stock-receipts`, `GET /branches/{branchId}/stock`, `GET /branches/{branchId}/stock/{productId}`, and `PermissionsGuard`. Phase 5 is the two screens over that contract, plus one new e2e suite that proves the contract really supports the journey rather than merely containing the right routes. `test/openapi.e2e-spec.ts` needed no change, which is itself the evidence that no route was added.

#### Acceptance check evidence

Phase 5's acceptance check reads: *a permitted user can receive known and unknown products, while users without the relevant permission are rejected by both the mobile UI and the backend.*

| Acceptance criterion | Where it is proven |
|---|---|
| Receive a **known** product | `test/stock-receiving.e2e-spec.ts` §1 — found by barcode and by name fragment, 6 Cartons in, reads back `6 Carton` / 36 normalized; `ReceiveScreen.test.tsx` "sends the whole delivery as one request, in the packaging it arrived in" |
| Receive an **unknown** product | `test/stock-receiving.e2e-spec.ts` §2 — created by the *stock keeper's* token with no price at all, shelved immediately, and **still refused for sale** until priced; `ReceiveScreen.test.tsx` "creates an unknown item without demanding a price, and puts it in the delivery" |
| Rejected by the **backend** | `test/stock-receiving.e2e-spec.ts` §4 — a seller `403`, somebody with nothing `403`, `RECEIVE_STOCK` removed mid-shift `403` on the same unexpired token, another branch `404` not `403`, a revoked phone `401` on its very next request |
| Rejected by the **mobile UI** | `HomeScreen.test.tsx` "hides receiving from a seller who was never granted it" and "hides the stock view from someone who may only sell"; `App.test.tsx` "offers no way into either screen when neither is granted"; `StockScreen.test.tsx` "explains a refused permission instead of offering a pointless retry" |
| Optional unit choice, only when necessary | `receiving.test.ts` "asks nothing when the product has only one unit"; `ReceiveScreen.test.tsx` "adds a one-unit product immediately, without asking which packaging" and "asks which packaging arrived when the product has more than one" |
| Quantity and optional cost | `receiving.test.ts` "what the delivery cost, when the shop says" (7 tests); `ReceiveScreen.test.tsx` "omits a cost nobody recorded rather than sending zero" |
| Current stock view | `StockScreen.test.tsx` (14 tests) over `test/stock-receiving.e2e-spec.ts` §5 |

Proven twice on purpose, as in Phases 3 and 4: the pure rules in `mobile/src/domain/receiving.test.ts` (30 tests), and the same journey through real HTTP and real PostgreSQL in `test/stock-receiving.e2e-spec.ts` (24).

#### What was built

**The receiving basket, in `mobile/src/domain/receiving.ts`.** Pure functions beside `cart.ts` and `payment.ts` — resolve the packaging, add or increment a line, correct a quantity, record or clear a cost, and turn the basket into the request body. No screen holds a rule.

**Pokea mzigo** (`src/features/receive/ReceiveScreen.tsx`). The same three ways in as Mauzo — scan, type, add inline — then quantity (stepped **and** typed) and an optional cost per line. The whole delivery goes in one request; success clears the basket and says what went on the shelf in the words the person used.

**Stoo** (`src/features/stock/StockScreen.tsx`). What the branch holds, in packages, with a name filter, a refresh, and all four of the states nobody normally looks at — loading, empty, error-with-retry, and permission-refused-without-a-pointless-retry. Negative balances are shown, coloured amber, and headed with a count of what needs recounting.

**Home** now carries the two tiles, permission-gated. `HomeScreen.test.tsx`'s "does not offer screens a later phase owns" assertion was deleted, as §4's handoff note said it should be.

#### Decisions made during the build

| Question | Decision | Why |
|---|---|---|
| Generalise the cart, or a second module? | **A second module, `receiving.ts`** | §4's handoff asked for this to be decided deliberately. Three real divergences, not one flag: every packaging is receivable where only priced ones are sellable, a line carries an optional *cost* where a cart line carries a required *price*, and there is nothing to settle. A shared module would have carried a mode flag into every function |
| Does receiving demand a selling price on a new product? | **No** | `CreateProductDto.priceTzs` was already optional and doc 01 §6 says Shoprex asks only for what the operation needs. A box goes on a shelf before anybody decides what to charge — most obviously for an item added while unpacking. Selling still refuses it, and the sheet says so. `NewProductSheet` grew one prop, `requirePrice`, defaulting to `true` so Mauzo is unchanged |
| Show the normalized quantity anywhere on the phone? | **No, nowhere** | AGENT.md keeps normalized mathematics away from workers unless it explains an operational outcome. Somebody carrying boxes counts boxes. The basket does not even *hold* a base-unit figure — a test pins the exact key set of a line so a screen cannot leak one later |
| Is a negative balance filtered out of Stoo? | **No — shown, amber, and counted at the top** | Doc 02 §5's negative-stock policy exists to make a wrong count findable. Hiding it on the one screen somebody would open to find it would defeat the policy |
| One request or one per line? | **One** | The backend records a receipt as a single transaction. Sending lines separately would invent the partial state the transaction exists to prevent, and V1 has no queue to reconcile it with |
| What happens to the basket if the save fails? | **It stays exactly as it was** | Nothing reached the shelf, so the only thing at risk is the typing. The error says so in as many words, rather than leaving somebody wondering whether half of it went in |
| A note on the delivery? | **Not built** | The route accepts one; the phase deliverable does not list it. Left to whoever needs it |
| Does Stoo poll? | **No — it loads once and offers Onyesha upya** | A stock list that refreshes itself on a Tanzanian connection spends the shop's data to tell it what it already read |

#### Files changed

**New — backend:** `test/stock-receiving.e2e-spec.ts`.

**New — mobile:** `src/domain/receiving.ts` + `receiving.test.ts`, `src/features/receive/ReceiveScreen.tsx` + `ReceiveScreen.test.tsx`, `src/features/stock/StockScreen.tsx` + `StockScreen.test.tsx`.

**Changed — mobile:** `src/app/App.tsx` (two routes, both wired to hardware back), `src/app/App.test.tsx` (+2), `src/core/api/apiClient.ts` (`receiveStock`, `listBranchStock`, and the response types), `src/features/home/HomeScreen.tsx` + test (rewritten), `src/features/sale/NewProductSheet.tsx` (`requirePrice`).

**Changed — docs:** `README.md` (screen table, domain-module note, suite table, API-surface heading), `docs/v1/01` §6 ("As built in Phase 5"), `PROGRESS.md`.

**Unchanged, deliberately:** the Prisma schema, every backend module, and `test/openapi.e2e-spec.ts`.

#### Commands run and results

The full suite was run **at the start of the session**, before any Phase 5 code, and matched §4a's recorded 635 exactly — so Phase 4's stated status was confirmed against reality rather than taken on trust.

| Command | Where | Result |
|---|---|---|
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **152/152** unit (unchanged; this phase added no domain code to the backend) |
| `npm run test:e2e` | backend | Passed — **364/364** e2e (was 340; +24 receiving) |
| `npm run typecheck` / `test` / `build` | web | Passed — 20/20, build clean (untouched this phase) |
| `npm run typecheck` / `test` | mobile | Passed — **200/200** (was 123; +30 receiving domain, +25 Pokea mzigo, +14 Stoo, +6 home, +2 routing) |
| `node dist/main.js` + `curl /docs`, `/docs-json` | backend | `200`; **38 operations**, tags unchanged — no route was added |

**Total: 736 automated tests, all passing** (backend 152 + 364, web 20, mobile 200). Up from 635.

#### Manual testing

Phase 5 adds **four things a person can now do** that they could not before. Each is a walkthrough below: where to go, what to do, and what should appear.

**Two honest warnings before starting.** First, **no new development build is needed** — this phase added no native dependency, so the APK from Phase 4 runs it and `npm start` is enough. Second, **the camera is still mocked in every test.** Feature 2's scanning path has never run against a real barcode, exactly as in Phase 4.

---

##### Setup — reaching the starting line

```bash
cd backend && npm run prisma:deploy && npm run prisma:seed && npm run start:dev
cd mobile  && npm start
```

The owner's screens are still Phase 6's, so create people and codes at **http://localhost:3001/docs**:

1. `POST /auth/login` with `{"email":"owner@shoprex.co.tz","password":"shoprex12345"}` → copy `accessToken`, click **Authorize**, paste, **Authorize**, **Close**.
2. `GET /branches` → copy the id of *Tawi Kuu*. Call it **BRANCH**.
3. `POST /users/workers` with `{"fullName":"Mhifadhi Sara","password":"shoprex12345","branchId":"BRANCH","permissions":["RECEIVE_STOCK","VIEW_STOCK"]}` → the stock keeper this phase is written for.
4. `POST /users/workers` with `{"fullName":"Juma Hassan","password":"shoprex12345","branchId":"BRANCH","permissions":["SELL"]}` → a seller, for the refusals.
5. `POST /devices/enrollments` with `{"branchId":"BRANCH","deviceName":"Simu ya stoo"}` → a `code`, **shown once**. Enrol the phone with it if it is not already enrolled.

##### Feature 1 — The home screen now offers receiving and the shelf *(must pass)*

1. Sign in as **Mhifadhi Sara**. → **Pokea mzigo** and **Stoo** appear as two tiles. → There is **no Mauzo tile**, and a written line saying selling has not been granted. → *Not a dimmed button.*
2. Sign out, sign in as **Juma Hassan**. → **Mauzo** is the big green tile and **neither** small tile is there. → *A seller is not offered a door that will be shut.*
3. At `/docs`, `PATCH /users/<Juma's id>/permissions` with `{"permissions":["SELL","RECEIVE_STOCK","VIEW_STOCK"]}`, then sign out and back in. → All three, with **Mauzo still visibly the largest and greenest thing on the screen.**
4. `PATCH` Juma back to `{"permissions":[]}` and sign in again. → One banner saying nothing has been granted, and no tiles at all. → *One explanation, not three.*

##### Feature 2 — Receiving a delivery of something the shop already sells *(must pass)*

Sign in as **Mhifadhi Sara** and tap **Pokea mzigo**.

1. → An empty delivery that says so, and tells you to scan or type.
2. → **Hifadhi mzigo** is disabled. There is nothing to record.
3. Type `cola`. → After a short pause, *Coca-Cola 500ml* appears with its units. Type quickly → it should not fire a request per keystroke.
4. Tap the result. → *Umepokea kipimo kipi?* — **Carton first**, largest packaging first, because that is how a lorry arrives.
5. Tap **Carton**. → One line, quantity 1.
6. Tap **+** twice. → 3. Tap **−** once. → 2.
7. Now type `120` straight into the quantity box. → 120, and the counter on the bottom bar reads 120. → *Nobody taps + a hundred times.*
8. Set it back to `6`. Leave **Gharama ya kimoja** empty. → No cost appears on the bottom bar at all. → *A cost nobody recorded is not a cost of zero.*
9. Type `9000` into the cost. → The bar reads **Gharama · Cost TSh 54,000**.
10. Tap **Soma** and scan the Coca-Cola barcode, picking **Carton**. → It joins the **existing Carton line** — one line, not two.
11. Add a second packaging: tap the search result again and pick **Piece**. → A **second** line. → *2 Cartons and 5 Pieces stay two lines; that is what came off the lorry.* The bar now says **Sehemu ya gharama · Part of the cost**, because the Piece line has no cost of its own.
12. Tap **Hifadhi mzigo**. → A green banner listing what was recorded, by *Mhifadhi Sara*, and the delivery is **empty again**, ready for the next one.
13. → The banner says **6 × Carton**, never *36 Pieces*. → *Normalized arithmetic is the engine's business, not the person's.*

##### Feature 3 — Receiving something the shop has never carried *(must pass)*

1. In Pokea mzigo, search for `mchele wa kyela`. → An empty state and **Ongeza bidhaa mpya**.
2. Tap it. → The sheet says *"Andika kinachohitajika kuiweka stoo sasa. Bei inaweza kusubiri"* — **not** the selling wording.
3. Type the name, pick **Gunia** from the unit list (or type it and tap the green **+**), and **leave the price empty**. → **Hifadhi na uongeze is still enabled.** → *This is the difference from Mauzo, and the thing most worth checking.*
4. Save. → It lands straight in the delivery at quantity 1. Set 4, save the delivery.
5. Now sign in as somebody with `SELL`, open **Mauzo**, and search for it. → Adding it is **refused with a readable reason**: it has no price. → *Shelved is not the same as sellable, and the app says which.*
6. At `/docs`, `GET /branches/BRANCH/stock/<product id>`. → 4 Gunia.
7. Back in Pokea mzigo, tap **Soma** and scan something the shop has never seen. → The new-product sheet opens **with the barcode already filled in**.

##### Feature 4 — Looking at the shelf *(must pass)*

1. From home, tap **Stoo**. → A brief loading state, then the list.
2. → Coca-Cola reads something like **8 Carton + 5 Piece**. → *Never `9.67 Cartons`, and never a bare `53`.*
3. Type `cola` in the filter. → Only that item. Type `kitu kipya`. → *No item by that name*, not a blank screen.
4. Tap **Onyesha upya**. → The list re-reads.
5. Make a count go wrong on purpose: sign in as a seller and sell more of something than the shelf holds, then open Stoo. → An amber heading counting the items that **need recounting**, that item's line in amber showing a **negative** number, and a note under it saying to recount. → *Not an error, and not hidden.*
6. Receive enough of it to cover the deficit. → The negative settles itself and the amber heading goes.
7. Open Stoo on a branch where nothing has been received. → *Stoo ni tupu*, with **Pokea mzigo ili kuanza** as the hint.

---

##### What should be refused *(must pass)*

| Try this | What should happen |
|---|---|
| Sign in as Juma (`SELL` only) and look for **Pokea mzigo** | Absent. Then, at `/docs`, `POST /branches/BRANCH/stock-receipts` with his token → **403**. *The hidden tile is a courtesy; the 403 is the authorization.* |
| `PATCH` away `VIEW_STOCK` while Stoo is open, then **Onyesha upya** | A plain-language explanation naming the permission, and **no retry button** — retrying would keep answering the same way |
| Turn Wi-Fi off, then **Hifadhi mzigo** | A clear failure saying **nothing went onto the shelf** — and the delivery is **still on screen**, quantities and costs intact. Turn Wi-Fi back on, tap save again → recorded once |
| `POST /devices/{id}/revoke` at `/docs`, then save a delivery | Refused immediately and back to sign-in with the backend's own message |
| Stop the backend, then open Stoo | An error state naming what went wrong, with **Jaribu tena** |
| Receive into another branch's id by hand at `/docs` | **404**, not 403 — the answer must not confirm the other branch exists |

##### Worth a look, if there is time

- **Typing a three-digit quantity with one thumb** while holding a box. The quantity box is the one control in this phase that a real delivery will hammer.
- Whether *Pokea mzigo*, *Mzigo*, *Gharama ya kimoja*, and *Pungufu* read naturally to somebody who actually speaks Swahili.
- Stoo with **fifty products** in it, on a cheap handset. The list is unpaginated and unvirtualised; nothing has been tried at that size.

##### What has no automated coverage at all

1. **The camera**, unchanged from Phase 4 — `expo-camera` is mocked, and Pokea mzigo uses the same `ScannerSheet`.
2. **A real network failure mid-save.** The refusal path is tested against a stubbed 403 and 401, never against a connection that actually dropped.
3. **A stock list long enough to scroll**, or a phone slow enough to make it hurt.
4. **How a delivery of thirty different items feels** — every test builds a basket of one or two lines.

#### Known issues / risks

1. **Pokea mzigo imports `ScannerSheet` and `NewProductSheet` from `features/sale/`.** They are genuinely shared now, and the honest home for them is a shared folder — but AGENT.md requires asking before moving files, and nobody asked. Recorded rather than done. **This is a real drift risk**: a change made for Mauzo now silently changes receiving, and the folder name no longer says so. Worth resolving before Phase 6 touches either.

   The same question covers a smaller duplicate: the **debounced product search** is written twice, once in `SaleScreen` and once in `ReceiveScreen` — the same 300ms settle and the same call. Extracting it needs a home, and every honest home for it is the shared folder this question is about, so it is reported here rather than pre-empted.
2. **Stoo is unpaginated and unvirtualised.** `GET /branches/{id}/stock` returns every product the branch holds a non-zero quantity of, and the screen renders all of them inside a `ScrollView`. Fine for a pilot duka; a shop with several hundred lines will feel it. The route would need a page parameter, which is a backend change and therefore not this phase's.
3. **The phone still sells and receives from `profile.branchIds[0]`** (carried from §4, issue 3). A worker has one branch so this is right for the role, but an owner or multi-branch manager signing in on a phone silently gets their first branch — and now that is true of deliveries as well as sales. A branch picker is Phase 6's.
4. **`POST /branches/{id}/stock-receipts` accepts a `note` that no screen sends.** Deliberate — the deliverable does not list it — but it is an unused corner of the contract.
5. **Nothing on the phone can correct a delivery once it is saved.** There is no reversal, no edit, and no "I typed 500 instead of 5" path; the only remedy is another delivery, and a negative cannot be created by receiving. Corrections are explicitly deferred from V1 (doc 01 §8), so this is scope rather than a defect — but it is the sharpest edge in the phase, and it pairs with §4a's known issue 2 about unchecked quantities on the hot path.
6. Issues carried from §1, §2, §3, and §4 all still stand: the `e2e-env.js` rate-limit bug, npm allow-scripts, no `web/` or `mobile/` ESLint config, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens, one-parent-per-unit, the stale `schema.prisma` header comment, and no route to edit a price or attach a barcode to an existing product.

#### Blocked / awaiting user

Nothing blocks Phase 6. Open, and each belonging to a later phase:

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | **May one product have two large packagings** (a Carton *and* a Bale)? | Carried from §3 and §4. A real shop question, not a technical one | Whenever a pilot shop hits it |
| 2 | **May `ScannerSheet`, `NewProductSheet`, and `UnitNameField` move out of `features/sale/`** into a shared folder? | Known issue 1. Moving files needs approval; the alternative is two features quietly coupled through a misleading path | Whenever Phase 6 changes either flow |
| 3 | **Pilot shop workflow** | Decides who the first real onboarding is for | Phase 8 |
| 4 | Confirm only regenerable build output may be cleared during disk cleanup | Carried from §1, §3, and §4; never answered | Whenever disk tightens again |

#### Handoff notes

- **`mobile/src/domain/receiving.ts` is deliberately not the cart.** If a fourth flow appears that looks like a basket, resist merging the three: the divergences are real, and each module is under 200 lines with its rules stated in its own header.
- **A basket line holds no base-unit figure at all**, and `receiving.test.ts` pins the exact key set to keep it that way. If a screen ever needs to explain an operational outcome in base units, add it at the screen, not to the line.
- **`NewProductSheet` now takes `requirePrice`, defaulting to `true`.** Mauzo passes nothing and is unchanged; Pokea mzigo passes `false`. Do not invert the default — a sale that invents a price is a worse failure than a shelf entry that waits for one.
- **The receiving basket is sent in one request and the backend commits it in one transaction.** Anything added to a delivery — a note, a supplier, a second effect — goes inside `StockService.receiveStock`, not after it.
- **`requireBranchAccess` in `backend/src/common/branch-access.ts` is still the one answer to "may this caller act on this branch?"** Phase 5 added no second version and Phase 6 must not either.
- **Phase 6 has real backend work in it**, unlike Phases 4 and 5. Payment-method settings need write routes that do not exist; product management needs the price edit and barcode-attach deferred in §3. Both mean new `@ApiOperation` annotations and an update to `test/openapi.e2e-spec.ts`'s expected list, which fails by design otherwise.
- **`test/stock-receiving.e2e-spec.ts` is the template for "does the contract support the journey?"** It calls only routes the phone calls, in the order the phone calls them. When Phase 6 builds a screen over an existing route, that is the shape of test to write.
- Prices and costs are integers. Do not introduce a float or a Decimal for money without an ADR.

### §6 — Next.js owner and admin web app

**Status:** Complete. **Verified:** Yes — every clause of the acceptance check is driven end to end over real HTTP by all four roles, and the two flows with no automated proof (console routing, shop suspension through the running console) were driven by hand against a live backend. **Date:** 2026-08-23.

**The first phase since Phase 3 with real backend work in it**, exactly as §5's handoff note predicted. Seven new routes, one additive migration, and no new table.

#### Acceptance check evidence

Phase 6's acceptance check reads: *Platform administrators can manage shop accounts; owners can manage only their businesses; delegated managers see only authorized branches; web actions use the NestJS API rather than direct database access; the worker/manager/device flows built API-only in Phase 2 now have a working screen.*

| Acceptance criterion | Where it is proven |
|---|---|
| Platform admins **manage shop accounts** | `test/web-console.e2e-spec.ts` §1 — onboard a shop and its owner, list every shop, suspend it, restore it, and be told when it is already in the state asked for. Screen at `/admin` |
| Owners manage **only** their businesses | §2 — `GET /businesses/me` scoped to the token with no id to tamper with; another shop's product, method, branch, and sales list all answer **404, not 403**; the other shop is verifiably untouched afterwards |
| Managers see **only authorized branches** | §7 — one branch of two listed, stock and sales readable there, `404` for the branch they were not given (inside their own tenant), staff list scoped to their branches, and every owner-only write refused **403** |
| Web actions use the **API, not the database** | Structural, and stated as such in the suite's header: `web/` has no `DATABASE_URL`, no Prisma dependency, and one module — `web/src/lib/api/` — through which every read and write goes. An e2e test cannot prove this, because a test talking to the database directly would look identical to the app doing so |
| Phase 2's **worker/manager/device flows have a screen** | §3 drives the contract each screen sits on — staff list, permission change biting immediately on an unexpired token, enrollment code issued once and never echoed, revocation killing the phone on its next request. Screens at `/owner/staff` and `/owner/devices` |
| **Payment-method settings** (named deliverable) | §5 — add, rename without rewriting settled receipts, switch `Deni` off and watch the backend refuse a debt sale a phone still offers, switch it back on, and the owner-only `includeInactive` list. Screen at `/owner/payment-methods` |
| **Sales list and detail** (named deliverable) | §6 — newest first, summaries not whole sales, keyset paging that never repeats a row, a cursor from the wrong branch refused, and `VIEW_REPORTS` required for the list but not the receipt. Screens at `/owner/sales` and `/owner/sales/[branchId]/[saleId]` |
| **Product management** (named deliverable) | §4 — price edit, barcode attach, discontinue, each proved not to rewrite history. Screen at `/owner/products` |
| **Stock overview**, **branch overview**, **owner dashboard**, **responsive layouts** | Screens at `/owner/stock`, `/owner/branches`, `/owner`; `web/src/styles/globals.css` collapses every table and grid at 560px |

Proven twice, as in Phases 3–5: the contract over real HTTP and real PostgreSQL in `test/web-console.e2e-spec.ts` (51 tests), and the pieces that hold rules in `web/src/**/*.test.ts(x)` (41 new).

#### What was built

**Backend — seven routes, none of which existed before.** Five of them are debts earlier phases deliberately took out and recorded:

| Route | Debt it settles |
|---|---|
| `PATCH /products/{id}` | §3 known issue 3 — no endpoint renamed or deactivated a product |
| `PATCH /products/{id}/units/{unitId}` | §3 known issue 3 — no endpoint edited a price |
| `POST /products/{id}/barcodes` | §3 known issue 2 — a product typed in without a barcode could never acquire one |
| `POST /payment-methods`, `PATCH /payment-methods/{id}` | Phase 4 shipped the read only and named this phase as the owner of the write |
| `GET /branches/{branchId}/sales` | Phase 4 shipped the receipt only and said so in the route's own description |
| `PATCH /businesses/{id}` | New this phase, at the owner's request during the session — see the decision table |

**`BusinessActiveGuard`.** `Business.isActive` existed since Phase 1 and was checked at every sign-in path, but nothing refused a token minted *before* a suspension. The guard closes that, following device revocation's precedent: refused on the very next request, `403` rather than `401`, and platform administrators skip it because they carry no tenant.

**`Product.isActive` enforced.** It was honoured in product search and nowhere else, so "discontinue" would have been a button that half-worked. It is now checked in `StockService.resolveUnit` — the one place every *write* path to stock goes through and no *read* path does — so a discontinued item cannot be sold or received while its shelf count and its history stay fully readable.

**Web — ten routes.** `/admin` rebuilt; `/owner` rewritten as an overview; and `/owner/{sales,sales/[branchId]/[saleId],stock,products,branches,staff,devices,payment-methods}` new. A `ConsoleShell` frames all of them, `requireConsole()` answers "may this person be here?" once instead of ten times, and one typed module per resource under `web/src/lib/api/` is the only way the app reaches data.

**Mobile — one small change, forced by the backend one.** A discontinued product would otherwise scan cleanly into the cart and fail at the payment sheet. `cart.ts` now refuses it at the scan, by name, exactly as it already refuses an unpriced unit.

#### Decisions made during the build

| Question | Decision | Why |
|---|---|---|
| May a **manager** edit prices or payment methods? | **No — owner only** | What the shop carries and what it charges are business-wide, and doc 01 §3 keeps the owner the primary business decision-maker. Consistent with `POST /branches` and `PATCH /users/{id}/permissions`, already owner-only. Relaxing it later is additive; the reverse is not |
| Can a payment method be **deleted**? | **No, and there will be no route** | `SalePayment.paymentMethod` is `onDelete: Restrict`. Deleting one that settled a sale either fails or takes a receipt's meaning with it. Deactivating is also the truthful verb |
| Can a method's **kind** be changed? | **No — fixed at creation** | The kind decides the arithmetic, not the label: only `CASH` gives change, only `DEBT` takes a name. A shop wanting a different kind adds a different method rather than reinterpreting receipts that already settled |
| How does the settings screen see switched-off methods? | `GET /payment-methods?includeInactive=true`, **owners only, 403 for anyone else** | A screen that cannot see a switched-off method cannot switch it back on. Quietly handing a non-owner the active list instead would leave a client believing it saw everything when it did not — worse than an error. A phone must never be handed a method the owner switched off; it would render a button the backend then refuses, which reads as Shoprex being broken rather than as the shop's own rule |
| Can a **single packaging** be switched off, or a price unset? | **No** | The base unit cannot go without taking the arithmetic with it, and the branch holds physical stock per unit. Discontinuing the whole product is the supported verb; the narrower one needs rules nobody has written, and a half-thought-through control is worse than none |
| Who may read the **sales list**? | `VIEW_REPORTS`; the receipt stays open to any staff | `VIEW_REPORTS` has existed unused since Phase 2 and this is its natural first consumer. A seller must read back the sale they just rang up; browsing the day's takings is management |
| Paging on the sales list | **Keyset, not offset**, `limit` 1–100 | A shop keeps selling while somebody reads page two, and an offset would show them a row twice or skip one. A limit outside the range is refused rather than clamped silently |
| A **date filter** on the sales list? | **No** | Selecting a day and totalling it is Phase 7's dashboard. Local-day arithmetic in two places is how the two come to disagree |
| Is suspending a shop **audited**? | **No — a server log line instead** | `AuditEvent` is the *owner's* attribution log for their own business, and nothing in V1 reads it on a platform administrator's behalf; the owner of a suspended shop cannot even sign in to look. An audit row with no reader is scaffolding. It also kept the migration to an enum addition |
| Are product and payment edits audited? | **Yes — five new `AuditAction` values** | Unlike suspension, these have a reader: the owner, on `GET /audit-events`. Each answers a real question — why did this price change, who attached this barcode, who switched `Deni` off. The price line records the **old** price beside the new one, because the sale lines hold what was charged, not when somebody changed the number |
| Does discontinuing hide a product from a **scan**? | **No — a scan still finds it** | Answering "unknown code" would invite somebody to create a duplicate carrying a barcode that is already taken. Returning it lets the phone say *this was discontinued*, which is the useful sentence |
| Does the admin console **edit** shops? | **No — onboard, suspend, restore, and nothing else** | Renaming a shop or changing its timezone is the owner's business. A platform screen that could do it is a screen that could do it by accident |
| Manager in the owner console: dim the controls or remove them? | **Remove them, and say who can** | A dimmed control teaches somebody that Shoprex is broken; an absent one paired with a written note teaches them who to ask. The backend refuses either way — navigation is courtesy, not authorization |
| `branch-form.tsx` was superseded by a generic `ActionForm` | **Kept, rewritten to use it internally** | It was deleted, then restored: AGENT.md requires asking before deleting anything, and the ask had not happened. It now wraps `ActionForm` rather than duplicating it |

#### Two corrections to existing behaviour, made deliberately

1. **`currentProfile()` treated every failure as a sign-out.** Found while smoke-testing: a rate-limited owner was bounced to `/login` as though their session had expired, and signing in again did not help because nothing was wrong with their session. Only `401` and `403` now mean signed out; anything else routes to `/login?problem=backend`, which says what actually happened rather than inviting somebody to retype a password that was never the problem. Covered by `web/src/lib/api/session.test.ts`.
2. **Three stale OpenAPI descriptions on `DevicesController`**, flagged at the start of the session and corrected here on the owner's instruction. `issueEnrollment` still said *"the branch comes from the worker's own assignment"*, which stopped being true at §2a; `redeemEnrollment` still documented a `409` for "this worker already has an active device", a refusal that no longer exists in the service at all; and `revoke` still described freeing a worker to enroll a replacement. All three now describe branch-owned devices.

#### Files changed

**New — backend:** `src/common/guards/business-active.guard.ts`, `src/modules/businesses/dto/update-business-status.dto.ts`, `src/modules/payments/dto/{create,update,list}-payment-method*.dto.ts`, `src/modules/products/dto/{update-product,update-product-unit,attach-barcode}.dto.ts`, `src/modules/sales/dto/list-sales.dto.ts`, `prisma/migrations/20260823210000_phase6_audit_actions/`, `test/web-console.e2e-spec.ts`.

**Changed — backend:** `app.module.ts` (guard registration), `prisma/schema.prisma` (five `AuditAction` values; `PaymentMethod` doc comment), `businesses.{service,controller}.ts`, `products.{service,controller}.ts`, `payment-methods.{service,controller}.ts`, `sales.{service,controller}.ts` + `dto/sale-response.dto.ts`, `stock.service.ts` (`resolveUnit` discontinued check), `devices.controller.ts` (stale descriptions), `test/openapi.e2e-spec.ts` (expected list, bearer list, tenancy pins, one new assertion).

**New — web:** `src/lib/action-state.ts`, `src/lib/format.ts` (+ test), `src/lib/api/{guard,request,staff,devices,products,sales,stock,payment-methods}.ts`, `src/app/admin/actions.ts`, seven `src/app/owner/*/page.tsx` routes, `src/components/{console-shell,console-nav,states,action-form,enrollment-form,permission-checks,branch-picker}.tsx`, and six new test files.

**Changed — web:** `src/app/{page,login/page,admin/page,owner/page,owner/actions}.tsx|ts`, `src/components/{console-header,branch-form}.tsx`, `src/lib/api/{session,organization}.ts`, `src/styles/globals.css`.

**Changed — mobile:** `src/domain/cart.ts` (+ test), `src/core/api/apiClient.ts` (`Product.isActive`).

**Changed — docs:** `README.md`, `docs/v1/01` §§3, 6, 7, `docs/v1/02` §§2, 6, 7, 9, 10, `PROGRESS.md`.

#### Commands run and results

The full suite was run **at the start of the session**, before any Phase 6 code, and matched §5's recorded 736 exactly — so Phase 5's stated status was confirmed against reality rather than taken on trust.

| Command | Where | Result |
|---|---|---|
| `npm run lint` / `typecheck` / `build` | backend | Passed, clean |
| `npm test` | backend | Passed — **152/152** unit (unchanged; this phase added no backend domain code) |
| `npm run test:e2e` | backend | Passed — **430/430** e2e (was 364; +51 web-console, +15 openapi) |
| `npm run typecheck` / `test` / `build` | web | Passed — **61/61** (was 20), build clean, 16 routes |
| `npm run typecheck` / `test` | mobile | Passed — **205/205** (was 200; +5 discontinued-product cart tests) |
| `npx prisma migrate deploy` | backend | Passed — 9 migrations |
| Live console smoke test | web + backend | Every one of the ten routes `200`, no unhandled error; console routing verified both ways; suspension driven end to end |

**Total: 848 automated tests, all passing** (backend 152 + 430, web 61, mobile 205). Up from 736.

#### Manual testing

Phase 6 adds **eight things a person can now do** that they could not before. **No new mobile build is needed** — the mobile change is JavaScript only, so `npm start` is enough.

---

##### Setup — reaching the starting line

```bash
cd backend && npm run prisma:deploy && npm run prisma:seed && npm run start:dev
cd web     && npm run dev
cd mobile  && npm start        # only for features 6 and 8
```

Two seeded accounts, both `shoprex12345`: `admin@shoprex.co.tz` (platform admin) and `owner@shoprex.co.tz` (owner of *Duka la Mfano*). **This is the first phase where `/docs` is not needed for setup** — everything below is reachable from the console itself.

##### Feature 1 — A platform administrator runs the shop accounts *(must pass)*

1. Sign in at http://localhost:3000 as **admin@shoprex.co.tz**. → You land on `/admin`, not `/owner`. → Three counts at the top: shops, active, suspended.
2. → *Duka la Mfano* is listed with its branch and user counts. → *Not a placeholder — those numbers come from the database.*
3. Fill in **Fungua duka jipya** with a new shop and owner, and submit. → A green line naming the shop and saying its owner can sign in now.
4. Open a private window and sign in as that new owner. → They land on their own empty `/owner`, with three payment methods already there. → *A shop is never created unable to take money.*
5. Back in the admin window, click **Simamisha · Suspend** on that shop. → A confirm dialog spelling out what happens. Accept. → The row turns amber and reads *Imesimamishwa*.
6. In the private window, click anything. → **Locked out immediately, on the session they already had open.** → *This is the point: not at token expiry, now.*
7. Try to sign in again there. → Refused.
8. **Rudisha · Restore** it, then sign in again in the private window. → Back in, with the shop's payment methods, branches, and everything else intact. → *Suspension deleted nothing.*
9. Press **Simamisha** twice in a row on the same shop (restore first). → The second attempt says it is already in that state rather than silently succeeding.
10. In the owner window, type `/admin` into the address bar. → Bounced to `/owner`. Then as admin, type `/owner`. → Bounced to `/admin`.

##### Feature 2 — An owner sets a price without rewriting history *(must pass)*

Sign in as **owner@shoprex.co.tz** and go to **Bidhaa**.

1. Add a product: name it, give it a unit, **leave the price empty**, and save. → It appears in the list reading *Haijawekwa bei · Not priced*. → *Not "TSh 0" — a price nobody set is not a price of zero.*
2. Expand it and type a price into **Bei mpya**, then **Weka**. → A green line confirming it, **and saying that old receipts do not change**.
3. Sell something on the phone at its current price (feature 6 covers getting there), then come back and change that product's price.
4. Go to **Mauzo**, open that sale's **Risiti**. → The receipt still shows **the old price and the old total**. → *This is the single most important assertion in the phase.*
5. Go to `/docs`, `GET /audit-events` as the owner. → An entry with both prices in it: `1000 → 1500`. → *"Why is a piece 1,500 now?" is answerable.*

##### Feature 3 — Attaching a barcode to something typed in by hand *(must pass)*

1. In **Bidhaa**, expand a product that has no barcode. → The Namba column reads `—`.
2. Type an EAN-13 into **Unganisha namba ya bidhaa**, leave the packaging as *Bidhaa yenyewe*, and submit. → It appears in the Namba column.
3. Try the same barcode on a **different** product. → Refused, naming the clash.
4. Try `5901234123458` (a real code with the check digit wrong). → Refused as an invalid barcode, not stored. → *A mis-scan must never become a phantom the real item can never match.*
5. On the phone, scan that barcode. → The product comes up.

##### Feature 4 — Discontinuing something the shop stopped carrying *(must pass)*

1. In **Bidhaa**, expand a product that has stock, and press **Sitisha**. → A confirm spelling out that history is untouched. Accept.
2. → It disappears from the products list. Search for it by name. → Not found.
3. Go to **Stoo**. → **It is still there, with its count.** → *Discontinued is not deleted; what is on the shelf is still on the shelf.*
4. On the phone, search for it in **Mauzo**. → Not offered.
5. On the phone, **scan** its barcode. → It is found, and adding it is **refused by name** — *imesitishwa*. → *Being told "unknown code" here would invite somebody to create a duplicate carrying a barcode that is already taken.*
6. On the phone, try to receive it in **Pokea mzigo**. → Also refused.
7. Back in the console, press **Rudisha**. → It sells and receives again.

##### Feature 5 — Payment-method settings *(must pass)*

Go to **Malipo**.

1. → All three seeded methods, each with its kind and a note that the kind cannot change.
2. Add **M-Pesa** as mobile money. → It lands **at the end** of the list, not in front of Taslimu.
3. Try to add a second method also called *m-pesa*. → Refused.
4. Press **Zima** on **Deni**. → A confirm saying the phone stops offering it *and the backend refuses it*. Accept. → The row turns amber and reads *Imezimwa*.
5. On the phone, start a sale and open the payment sheet. → **Deni is gone.**
6. → Deni is still visible **in the console**, greyed, with a *Washa* button. → *A screen that cannot see a switched-off method cannot switch it back on.*
7. Rename **Taslimu** to something else, then open an old receipt in **Mauzo**. → The receipt still says **Taslimu**. → *Names are snapshotted when a payment settles.*
8. Press **Washa** on Deni, and sell on credit on the phone. → Works again.
9. → **There is no delete button anywhere on this screen.** That is deliberate.

##### Feature 6 — Staff and phones finally have a screen *(must pass)*

1. Go to **Wafanyakazi**. → The staff list, with each person's branch and permissions in words, not enum names.
2. Add a worker with **Kuuza** only. → *No email field* — a worker never uses this console.
3. Go to **Simu**, choose their branch, name the phone, and **Tengeneza msimbo**. → A large code in a green box, with **write it down, it is never shown again** in as many words.
4. Reload the page. → **The code is gone.** → *Shoprex stores only its hash; this is not a bug.*
5. Enrol the phone with it and sign in as that worker. → **Mauzo** only.
6. Back in **Wafanyakazi**, expand that worker and tick **Kuona stoo**, then save. → On the phone, sign out and in again. → **Stoo** has appeared.
7. Untick everything and save. → The phone offers no tiles and says why in one line.
8. In **Simu**, press **Futa** on that phone. → Confirm. → **The phone is refused on its very next tap**, back to sign-in.

##### Feature 7 — Reading the day back *(must pass)*

1. Go to **Mauzo**. → Sales newest first, with who sold, how many lines, the total, and how it was paid.
2. Click **Risiti** on one. → The commercial units sold, the prices of that day, the change, and any debt.
3. Make more than fifty sales in one branch (or set `limit` low via the URL: `/owner/sales?limit=…` is not exposed, so make the sales). → **Mauzo ya zamani zaidi** appears; click it. → The next page, with **no row repeated**.
4. Sell more than the shelf holds, then open **Mauzo**. → That row is amber and says *Stoo ilikuwa pungufu*; the receipt names the shortfall per line.
5. Go to **Stoo**. → An amber heading counting what needs recounting, and that product's line negative and amber. → *Shown and named, never hidden.*
6. If the shop has two branches, use the branch chips at the top of **Mauzo** and **Stoo**. → The branch is in the URL, so it can be bookmarked and the back button works.

##### Feature 8 — A delegated manager sees less *(must pass)*

In **Wafanyakazi**, add a manager with **one** branch and only *Kuona stoo* and *Kuona mauzo*, then sign in as them in a private window.

1. → The header says **Meneja**, not Mmiliki.
2. → The navigation has **no Matawi and no Malipo**. → *Absent, not greyed out.*
3. → **Mauzo** and **Stoo** show only their branch — no branch chips at all, because there is nothing to choose between.
4. Type `/owner/payment-methods` into the address bar. → The page loads and says, in a sentence, that only the owner does this. → *Not a crash and not a dead form.*
5. Go to **Bidhaa**. → Products are readable; there is **no price box, no barcode field, and no Sitisha button**, and a written note saying why.
6. Go to **Wafanyakazi**. → They see only their branch's staff, and no forms.
7. Now take **Kuona mauzo** away from them (as the owner) and reload their **Mauzo**. → An **amber** panel naming the missing permission, **with no retry button**. → *A refused permission is the shop's own rule, not a red error, and retrying would keep answering the same way.*

---

##### What should be refused *(must pass)*

| Try this | What should happen |
|---|---|
| Sign in as an owner and open `/admin` | Bounced to `/owner`. Then at `/docs`, `GET /businesses` with their token → **403** |
| A manager pressing anything owner-only | Absent from the screen; and at `/docs` with their token, `PATCH /products/{id}` → **403**, `POST /branches` → **403**, `GET /audit-events` → **403** |
| A manager opening another branch's stock by URL | **404**, not 403 — inside their own shop. *The answer must not confirm the branch exists* |
| `GET /payment-methods?includeInactive=true` as a manager or a worker | **403**. Not "quietly the active list" |
| Stop the backend, then load any console page | An error panel naming what went wrong with a **Jaribu tena**, and **you are not signed out**. Reload after restarting → straight back in |
| Click around the console fast enough to hit the rate limit | `/login?problem=backend` saying *this is not your password* — **not** a silent sign-out. See known issue 1 |
| Suspend a shop, then use its owner's still-open session | **403** with the suspension message, immediately |

##### Worth a look, if there is time

- **The whole console on a phone browser.** Every table scrolls inside its own container and the nav scrolls horizontally, but no real thumb has been near it.
- Whether *Simamisha*, *Sitisha*, *Zima*, and *Futa* read as four clearly different things to somebody who actually speaks Swahili. They are four different destructive-sounding verbs on four different screens.
- The **products screen with fifty products** — the list caps there (known issue 2) and says so, but the `<details>` accordion has never been tried at that size.
- Whether the enrollment code is **legible enough to read aloud across a shop**.

##### What has no automated coverage at all

1. **The console in a real browser.** Every web test is Vitest against components and modules; the pages themselves were smoke-tested by hand this session but nothing re-checks them.
2. **Every server action.** They are thin — read the cookie, call the API, revalidate — but no test drives one.
3. **The confirm dialogs.** `window.confirm` is never exercised.
4. **Anything responsive.** No test renders at a phone width.
5. **The camera**, unchanged from Phase 4 and 5.

#### Known issues / risks

1. **A busy owner can hit the rate limit from one browser.** Every console page load costs an `/auth/me` call plus its data calls, so clicking around briskly reaches `RATE_LIMIT_DEFAULT` (120/min per address). It now fails *honestly* rather than as a fake sign-out, but it is still a refusal the owner did not earn — and a shop office behind one NAT address shares that budget. Phase 8 should either raise the default, exempt authenticated reads, or key the bucket on the user rather than the address. **This was found by smoke-testing, not by a test.**
2. **The products screen shows at most 50.** `GET /products` caps `limit` at 50, which is right for the phone's suggestion list and tight for a catalogue. The screen says so and points at its search box rather than truncating in silence. A properly paged catalogue route is the real fix and is a backend change this phase did not need.
3. **`BusinessActiveGuard` costs one lookup per authenticated request that carries a tenant.** Correct, and required by "refused immediately", but it is on the same hot path as `DeviceSessionGuard` and `PermissionsGuard` — a worker's request can now make three small lookups before the handler runs. Worth measuring in Phase 8 before it is worth optimising.
4. **Nothing reads the audit log except the owner.** Five new actions were added because the owner *can* read them; suspending a shop was deliberately left unaudited because nobody can. If a platform-admin audit view is ever wanted, that decision needs revisiting rather than assuming the rows are there.
5. **The console has no "sold by whom" filter, no date filter, and no totals.** All three are Phase 7's, deliberately. An owner wanting today's takings still cannot get them from this console.
6. **`/owner` counts are four separate API calls.** Fine for a pilot; a shop with a large catalogue pays for `fetchProducts` on every visit to the front page just to render a number.
7. Issues carried from §1–§5 all still stand: the `e2e-env.js` rate-limit bug, npm allow-scripts, no ESLint config in `web/` or `mobile/`, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens, one-parent-per-unit, the stale `schema.prisma` header comment, Stoo unpaginated on the phone, the phone still using `branchIds[0]`, and no way to correct a saved delivery.

#### Blocked / awaiting user

Nothing blocks Phase 7. Open, and each needing the owner:

| # | Question | Why it needs the owner | When it starts blocking |
|---|---|---|---|
| 1 | **A shared barcode→product catalogue across shops.** Raised by the owner on 2026-08-23 while Phase 6 was being built: every shop that scans an EAN-13 and names the item is producing one observation of a global fact, and those could compound into a catalogue that makes a new shop's first week almost typing-free. **Not built, and not in V1's scope.** It needs three decisions before any of it: whether shops consent to their product names being pooled at all; what threshold makes a suggested name trustworthy (one shop's typo must not become everyone's product name); and whether the *collection* half — recording the observations now so the dataset exists when the feature does — should start in Phase 8 even though the suggestion half is V2 | It is a product and data-ownership decision, not a technical one. The collection half is cheap and additive; the suggestion half is a new feature and a new schema | Never blocks a V1 phase. Decide before Phase 8's pilot, because that is the first real data |
| 2 | **May one product have two large packagings** (a Carton *and* a Bale)? | Carried from §3, §4, §5. A real shop question | Whenever a pilot shop hits it |
| 3 | **May `ScannerSheet`, `NewProductSheet`, and `UnitNameField` move out of `mobile/src/features/sale/`** into a shared folder? | Carried from §5 known issue 1. Moving files needs approval; the alternative is two mobile features quietly coupled through a misleading path. **Phase 6 did not touch either flow, so it is still only a risk** | Whenever Phase 7 or 8 changes either flow |
| 4 | **Should the admin console be able to edit a shop** — rename it, change its timezone? | Deliberately not built: that is the owner's business, and a platform screen that can do it can do it by accident. But an admin fixing a typo for a shop that cannot work out how is a real support scenario | Whenever support needs it |
| 5 | **Pilot shop workflow** | Decides who the first real onboarding is for | Phase 8 |
| 6 | Confirm only regenerable build output may be cleared during disk cleanup | Carried from §1, §3, §4, §5; never answered | Whenever disk tightens again |

#### Handoff notes

- **`requireConsole()` in `web/src/lib/api/guard.ts` is the one answer to "may this person be here?"** It is not the authorization — the backend is — and every new page should use it rather than re-implementing the redirect dance.
- **`currentProfile()` returns null only for 401 and 403.** Do not widen that back to "any error": that is the bug this phase fixed, and it turned every backend hiccup into a false sign-out.
- **`StockService.resolveUnit` is where a product-level rule belongs.** Every write path to stock goes through it and no read path does, which is what let "discontinued" be enforced once and stay invisible to Stoo and to receipts.
- **`test/web-console.e2e-spec.ts` calls only routes the console calls, in the order it calls them** — §5's template. When Phase 7 builds a screen over the report routes, that is the shape of test to write.
- **`test/openapi.e2e-spec.ts` now pins Phase 6's six write DTOs** in the "never accepts a tenant id" guard. Adding a write route means adding its DTO there, or the walk starts passing vacuously.
- **Phase 7 has to decide day boundaries once.** The sales list deliberately has no date filter for exactly this reason; put local-day arithmetic in the backend, in one place, and let both the dashboard and the PDF read it.
- **Payment method names and product prices are snapshotted at the moment they are used.** Any new report must read the snapshot on the sale, never join back to the live `PaymentMethod` or `ProductUnit` row, or it will report last month using this month's names.
- Prices and costs are integers. Do not introduce a float or a Decimal for money without an ADR.

### §7 — Reports and PDF

**Status:** Complete. **Verified:** Yes — every clause of the acceptance check is driven end to end over real HTTP, plus a live check against a running backend and web server (see Manual testing below). **Date:** 2026-08-24.

**No new table.** A report is a read across data every earlier phase already recorded — sales, sale lines, payments, stock receipts. The only schema-adjacent addition is the `date` query parameter on the existing sales list. Three new routes:

| Route | Auth | Purpose |
|---|---|---|
| `GET /branches/{branchId}/reports/daily` | `VIEW_REPORTS` | The day, read back: totals, payment breakdown, debts, sellers, best sellers, stock received, and the transactions themselves |
| `GET /branches/{branchId}/reports/daily.pdf` | `VIEW_REPORTS` | The identical report as a downloadable PDF, rendered from the very response object above |
| `GET /reports/branches` | `VIEW_REPORTS` | One day across every branch the caller may see, for comparison |

#### Acceptance check evidence

Phase 7's acceptance check reads: *A user can select a date and branch, view the same totals in the dashboard and PDF, and verify that the report uses Tanzania local-day boundaries derived from server-stamped timestamps. External report sending is not part of V1.*

| Acceptance criterion | Where it is proven |
|---|---|
| **Select a date and branch** | `/owner/reports` — a branch bar (when there is more than one) and a date form, both server-rendered links/form so the URL stays bookmarkable. Backend: `?date=` on both report routes and on the sales list, all resolved by one function |
| **The same totals in the dashboard and the PDF** | `test/reports.e2e-spec.ts` §4 — the PDF's text stream is deliberately uncompressed; the suite downloads it and greps the actual bytes for every headline total, payment row, debt row, and seller row the JSON response carried, rather than trusting the two paths agree. Verified again live — see Manual testing, Feature 3 |
| **Tanzania local-day boundaries from server-stamped timestamps** | `src/domain/day-window.spec.ts` (31 tests, including zones with daylight saving, to prove the arithmetic is genuine and not a hard-coded +03:00) and `test/reports.e2e-spec.ts` §1 — a sale one millisecond either side of local midnight is proven to land in the correct day, never UTC midnight |
| **External report sending is not part of V1** | Not built. The PDF is a download only |

#### Files changed

**Backend — new:**
- `src/domain/day-window.ts` + `.spec.ts` — the one place a shop-local calendar day becomes a UTC instant range, via `Intl`, not a hard-coded offset
- `src/domain/report.ts` + `.spec.ts` — pure aggregation (totals, payment breakdown, debts, sellers, received, top products) over snapshotted sale/receipt values
- `src/domain/pdf.ts` + `.spec.ts` — the hand-written, dependency-free PDF writer (base-14 fonts only, uncompressed text stream)
- `src/modules/reports/` — `reports.module.ts`, `reports.service.ts`, `reports.controller.ts`, `daily-report.pdf.ts`, `dto/daily-report.query.dto.ts`, `dto/report-response.dto.ts`
- `test/reports.e2e-spec.ts` (36 tests), `test/reports-isolation.e2e-spec.ts` (17 tests)

**Backend — edited:**
- `src/app.module.ts` — registers `ReportsModule`
- `src/modules/sales/dto/list-sales.dto.ts`, `src/modules/sales/sales.service.ts` — the `?date=` filter §6 deferred, calling `dayWindow()` and nothing else
- `test/openapi.e2e-spec.ts` — the three new routes added to every walk (documented, bearer-required)

**Web — new:**
- `src/lib/api/reports.ts` — typed client for both report routes
- `src/app/owner/reports/page.tsx` — the dashboard: branch bar, date form, summary tiles, payment/debt/seller/best-seller/stock-received tables, branch comparison (branches > 1 only), transactions, PDF download link
- `src/app/api/reports/pdf/route.ts` — the download proxy. The access token lives in an httpOnly cookie, so a plain `<a href>` straight to the backend cannot carry it; this route reads the cookie server-side, forwards the bearer token, and streams the PDF bytes back with the backend's `Content-Disposition`

**Web — edited:**
- `src/components/console-nav.tsx` (+ its test) — added **Ripoti**, right after Muhtasari
- `src/app/owner/page.tsx`, `src/app/owner/sales/page.tsx` — the ledes that promised reports "next phase" now point at Ripoti

**Docs:**
- `README.md` — API surface table, the three new routes, a "Daily reports" narrative section, the two new test-suite rows, `/owner/reports` in the web route table
- `docs/v1/01_SHOPREX_V1_PRODUCT_CONCEPT.md` §7 — "As built in Phase 7" paragraph
- `docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` §8 — the day-window/report/PDF mechanism, with file links

#### Tests and results

Full suite, all three surfaces, run from a clean start of the session and again after every change:

```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build
cd web     && npm run typecheck && npm test && npm run build
cd mobile  && npm run typecheck && npm test
```

| Surface | Before this phase | After this phase |
|---|---|---|
| Backend unit | 152 / 8 suites | **252 / 11 suites** |
| Backend e2e | 430 / 15 suites | **489 / 17 suites** |
| Web | 61 / 13 files | 61 / 13 files (unchanged count; `console-nav.test.tsx` now also asserts Ripoti) |
| Mobile | 205 / 12 suites | 205 / 12 suites (untouched — Phase 7 has no phone screen) |
| **Total** | **848** | **1,007** |

Lint, typecheck, and build all pass on backend and web. Mobile typecheck and test pass; mobile was not touched.

#### Manual testing

A green suite proves the arithmetic and the authorization; it does not prove a person can find the button, read the numbers, or actually receive a file. Both dev servers were started fresh this session (an existing backend process on :3001 predated the current code and was restarted so the new routes were actually being tested), and the flows below were driven end to end — sign-in through the real `/api/session` route so the access token sat in the same httpOnly cookie a browser would use, then the dashboard and the PDF download were fetched exactly as the browser fetches them.

**Feature 1 — Reading the day back, as an owner** *(must pass)*

**Setup:** backend on `:3001`, web on `:3000`, signed in as the seeded owner (`owner@shoprex.co.tz` / `shoprex12345`).

1. Go to **Ripoti** in the navigation. → The page opens on today, in the shop's own day (`Ripoti ya 24 Aug 2026 kwa Tawi Kuu` on a shop whose only branch was Tawi Kuu at the time) — nobody had to pick a date for "today" to be right.
2. With no sales yet recorded for the day: → Every table shows its empty state in words — *Hakuna malipo siku hii*, *Hakuna deni siku hii*, *Hakuna mzigo siku hii*, *Hakuna mauzo siku hii* — never a blank table that reads as broken.
3. A product was added, stock received (50 Kipande at TSh 1,800 each), and two sales rung up through the real `POST /branches/{id}/sales` route — one cash (TSh 7,500, TSh 2,500 change), one on Deni to "Mteja wa QA" (TSh 5,000. → Reloading Ripoti now shows **Zilizoingia TSh 7,500**, **Deni TSh 5,000**, **Jumla ya mauzo TSh 12,500**; the payment table lists Taslimu and Deni separately; the debts table names "Mteja wa QA" for TSh 5,000; Sabuni ya Royco QA appears in both the best-sellers and the stock-received tables, the latter showing **Jumla ya gharama TSh 90,000** (50 × 1,800).
4. This shop has four branches. → A branch comparison table appeared automatically (it is hidden for a one-branch shop), listing all four, with only Tawi Kuu carrying the day's numbers and the other three at zero — not merely present but each branch clickable straight to its own report.

**Feature 2 — Choosing a date and a branch** *(must pass)*

1. The window note under the date form reads `2026-08-23T21:00:00.000Z → 2026-08-24T21:00:00.000Z (Africa/Dar_es_Salaam)` for "today". → 21:00 UTC the evening before is midnight in Dar es Salaam — the boundary is not UTC midnight, and it says so rather than asking to be trusted.
2. Typing a different date into the field and pressing **Tazama** reloads the page at that date via a normal GET form — the URL carries `?branch=…&date=…`, so it is bookmarkable and the back button works.

**Feature 3 — Downloading the PDF, and it matching the dashboard exactly** *(must pass)*

1. Press **Pakua PDF**. → A file named `shoprex-tawi-kuu-2026-08-24.pdf` downloads, `Content-Type: application/pdf`.
2. The file is a real PDF (`%PDF-1.4` … `%%EOF`) of 5.8 KB — no embedded font, because none is needed.
3. Reading the file's own bytes (its text stream is deliberately uncompressed) shows **every number and name the dashboard had just shown**: "Duka la Mfano", "Tawi Kuu", "TSh 12,500", "TSh 5,000", "TSh 7,500", "Sabuni ya Royco QA", "Mteja wa QA", "Taslimu", "Deni" — all present, because the PDF is composed from the same response object the dashboard renders and computes nothing of its own.
4. Requesting the PDF **without** the session cookie → `401`. Requesting it with the cookie but no `branchId` → `400`. Visiting `/owner/reports` signed out → a `307` redirect to `/login`. Hiding the button is not authorization; the backend and the proxy both refuse on their own.

**What has no automated coverage at all**

1. **The console in a real browser window.** Every check above went through real HTTP with a real cookie, exactly as a browser would, but no test has clicked the button with a mouse or watched the file land in a Downloads folder.
2. **A manager's or a plain seller's view of Ripoti**, and the amber permission-denied panel it should show. `test/reports-isolation.e2e-spec.ts` proves the backend refuses correctly (403 for a worker without `VIEW_REPORTS`, 404 for a branch a manager was not given); the web `ErrorState` component that renders that refusal is shared and unit-tested (`states.test.tsx`), but nobody has watched it render for this specific page.
3. **A PDF reader actually opening the file.** The bytes were proven structurally sound (matched offsets, a valid xref table, real object boundaries) and were read back as text; no test or manual check opened it in Acrobat, Preview, or a phone's PDF viewer.
4. **The page at a phone width**, same as every other console screen since Phase 6.

#### Decisions made

- **The PDF is hand-written, with no dependency**, per the owner's explicit choice when asked (see the session's `AskUserQuestion`): a ~600-line pure module using only the fourteen base fonts every PDF reader already has, with a deliberately uncompressed text stream. That property is what let `test/reports.e2e-spec.ts` prove "the same totals in the dashboard and the PDF" by reading generated bytes rather than by trusting two implementations to agree.
- **The sales list's `?date=` filter was built here**, as §6's handoff note asked, calling the exact same `dayWindow()` the report calls — so a sale the report counts for a day is provably a sale the list shows for that date (`test/reports.e2e-spec.ts` §2 asserts the two agree).
- **The branch comparison is scoped, not owner-only** — the same rule `GET /branches` already uses. A manager over two branches has the same reason to compare them an owner does; a manager over one sees a table of one.
- **A day's transaction list is capped at 500** (`REPORT_TRANSACTION_LIMIT`) with `transactionsTruncated` saying so. The **totals above it always cover the whole day** regardless of the cut — only the row-by-row list is bounded, and the note points at the sales list's own `?date=` filter for the complete paged view.
- **Reports are read-only.** No route here writes anything, so no new audit action was needed — doc 02 §9's audit table is unchanged by this phase.

#### Known issues / risks

1. **`GET /reports/branches` runs one query per branch, sequentially awaited via `Promise.all`.** Fine for the branch counts a pilot shop will have; would want batching before a shop with dozens of branches existed, which V1 does not anticipate.
2. **The received-stock cost total silently treats a partial recording as informative rather than refusing it.** `costIsPartial` is surfaced (both in the API and with a `*` and a note in the PDF and the dashboard), but a shop that records cost for some deliveries and not others gets an honest partial total rather than a refusal to show one at all. This mirrors the existing `unitCostTzs` optionality from Phase 3 and is not a new decision, just newly visible.
3. **The date form's browser-native `<input type="date">` renders differently across browsers and has no keyboard-only affordance tested.** Worth a look on a low-end Android browser per the "worth a look" standard the rest of the console carries.
4. Issues carried from §1–§6 all still stand — see §6's own list for the fullest copy: the `e2e-env.js` rate-limit bug, npm allow-scripts, no ESLint config in `web/` or `mobile/`, non-interactive `prisma migrate dev`, minimal password policy, in-memory rate limiting, no refresh tokens, one-parent-per-unit, the stale `schema.prisma` header comment, Stoo unpaginated on the phone, the phone still using `branchIds[0]`, no way to correct a saved delivery, the console's shared rate-limit bucket, the 50-product cap on the products screen, `BusinessActiveGuard`'s per-request cost, and the console having no audit view for a platform administrator.

#### Blocked / awaiting user

Nothing blocks Phase 8. The open questions carried from §6 (a shared barcode catalogue, a second large packaging per product, moving shared mobile components, an admin-editable shop record, the pilot shop's identity, and the disk-cleanup confirmation) are all still open and still none of them block a phase — see §6 for the full table.

#### Handoff notes

- **`dayWindow(date, timezone)` in `src/domain/day-window.ts` is the one place a shop-local day becomes a UTC instant range.** Anything that ever needs "today," "yesterday," or a date filter should call it rather than re-deriving an offset — the module is proven against zones with daylight saving specifically so nobody is tempted to hard-code `+03:00`.
- **`src/domain/report.ts` reads only snapshotted values** — `SaleLine.productName`, `SalePayment.methodName`, and so on — never a live `Product`, `ProductUnit`, or `PaymentMethod` row. Any future report route should follow the same rule, or it will report last month using this month's names and prices.
- **`daily-report.pdf.ts` computes nothing.** It takes the exact `DailyReportView` the controller already built for the dashboard and lays it out. If a future change needs the PDF to show something new, add it to `DailyReportView` and `report.ts` first, and let the PDF read it from there — never compute a number inside the PDF module itself.
- **`src/domain/pdf.ts` is a general small PDF writer**, not report-specific: it knows about pages, fonts, and right-aligned money columns, and nothing about sales. A future PDF (a stock take, a staff list) can reuse it directly.
- **The web PDF download must go through a server route (`/api/reports/pdf`), never a direct link to the backend.** The access token lives in an httpOnly cookie for exactly the reason stated in `README.md` — page scripts, and so a plain anchor tag, cannot see it.
- **A backend dev server was found already running on `:3001` at the start of this session's manual check, predating the Phase 7 code.** It was stopped and restarted so the live check exercised the actual new routes rather than a stale build. If a future session finds a long-uptime backend process, treat that as a signal to restart it before trusting a live check against it.

### §7a — QR enrollment, and a front door for adding products (2026-08-24)

**Status:** Complete. **Verified:** Yes — the QR proven to be a faithful, scannable rendering by decoding it back to a module matrix and comparing every module against the encoder, then redeeming the decoded code against a live backend; the catalogue screen driven by its own tests. **Date:** 2026-08-24.

**Requested by the owner** during the Phase 7 session, immediately after Phase 7 closed:

> "Also at onboarding devices, one should be able to switch between qr code or token, so for those that are close can just do qr code scanning and boom they are in, also make sure there is a way to add products in the mobile app."

Recorded here rather than inside §7 because §7 is closed and its acceptance check stands as verified on its own terms. Neither of these is new V1 scope: **doc 02 §3 always specified** that "the QR code and link must contain a short-lived, single-use enrollment token", and Phase 8's deliverables already list "QR enrollment expiry tests" — so the QR was planned work pulled forward. Adding products on the phone was **already built** (doc 01 §5 requires it mid-sale); what was missing was a way to reach it.

#### What was actually found first

**Adding a product on the phone already worked**, in both Mauzo and Pokea mzigo, through the shared `NewProductSheet`. But it was reachable only two ways: scan a barcode the shop does not know, or search a name and get **zero** results. Both are rescues from a different task. Somebody unpacking six new lines had to pretend to sell or receive each one, and a search returning the *wrong* products — rather than none — offered no way in at all. That is almost certainly why it read as missing.

So the work was not "build product creation" but "give it a front door", which is what the owner chose from the options offered.

#### Decisions the owner made

Both were put to the owner rather than assumed, because one was a dependency and the other a navigation change:

| Question | Answer | Consequence |
|---|---|---|
| How to generate the QR | **Add the `qrcode` npm package** | A new backend dependency, against the hand-written precedent `pdf.ts` set in §7. Less code owned, one more supply-chain surface |
| Where the add-product affordance goes | **A separate Bidhaa tile on Home** | Home went from three destinations to four, and the `Route` union with it — a larger change than a button inside the two existing flows |

#### How it works

**One code, two ways in.** `POST /devices/enrollments` now returns `qrSvg` alongside `code`: the same code drawn as a scannable SVG at error-correction level M, in Shoprex's dark neutral, with the quiet zone the spec requires. The QR carries the **bare code and nothing else** — no URL, no JSON, no server address — so scanning and typing submit an identical string to `POST /devices/enroll`. One redemption path, one set of rules, and the backend cannot tell which was used. Typing stays the default on the phone because it always works: no camera, no permission, no screen to point at.

**`qrSvg` is the credential, not a picture about it**, and is held to every rule `code` is: returned once at issue, never persisted, never logged, absent from the audit summary. `test/openapi.e2e-spec.ts` now names it in the response-leak walk beside `code` and `password`, so it cannot later be added to a device view on the grounds that an image is harmless. **That gap was real before this change** — the old regex would not have caught `qrSvg` — and closing it was part of the work rather than an afterthought.

**`ScannerSheet` gained a `mode`.** `product` listens for `ean13`/`upc_a`; `enrollment` listens for `qr`. Which symbologies are live is decided by the mode, never by what happens to be in frame — so a bottle's barcode cannot be submitted as an enrollment code, and a QR poster cannot be submitted as a product. Pointing the camera at the wrong thing does nothing, which is the correct behaviour. `expo-camera` already supported QR; only the type list excluded it, so there is **no new mobile dependency**.

**Bidhaa** is a fourth destination off Home. Reading the catalogue needs no permission beyond being staff, so the tile is never absent — somebody granted nothing at all can still look up what a thing costs. The **add** button inside needs `SELL` or `RECEIVE_STOCK`, the same pair the backend's create route takes, and its absence is paired with a written explanation rather than a dimmed button. It reuses `NewProductSheet` rather than copying it, so the sale, the delivery, and the catalogue cannot drift into three different ideas of what a product is. **`requirePrice` is false there**: cataloguing is doc 01 §6's progressive enrichment, and only selling cannot invent a price.

#### Files changed

**Backend — new:** `src/domain/enrollment-qr.ts` + `.spec.ts` (8 tests).

**Backend — edited:** `package.json` (+`qrcode`, +`@types/qrcode`), `src/modules/devices/devices.service.ts` (`IssuedEnrollmentView.qrSvg`), `src/modules/devices/dto/device-response.dto.ts`, `test/device-enrollment.e2e-spec.ts` (+4 QR tests), `test/openapi.e2e-spec.ts` (leak walk now covers `qrSvg`).

**Web — new:** `src/components/enrollment-form.test.tsx` (5 tests).

**Web — edited:** `src/lib/api/devices.ts`, `src/lib/action-state.ts`, `src/app/owner/actions.ts` (thread `qrSvg` through), `src/components/enrollment-form.tsx` (render it), `src/styles/globals.css` (`.shoprex-secret__qr`).

**Mobile — new:** `src/features/products/ProductsScreen.tsx` + `.test.tsx` (11 tests).

**Mobile — moved** (2026-08-25, on the owner's approval — see below): `src/features/sale/{ScannerSheet,NewProductSheet,UnitNameField}.tsx` and `UnitNameField.test.tsx` -> `src/components/`. Recorded by git as renames, so `--follow` still traces them.

**Mobile — edited:** `src/components/ScannerSheet.tsx` (the `mode` prop), `src/features/enroll/EnrollScreen.tsx` (scan-or-type through one submit path), `src/features/home/HomeScreen.tsx` + `.test.tsx` (the Bidhaa tile, +3 tests), `src/app/App.tsx` (the `products` route and its back-button entry), plus the import lines in `SaleScreen.tsx`, `ReceiveScreen.tsx`, and `ProductsScreen.tsx`.

**Docs:** `README.md` (enrollment route row, "Two ways in, one code", the mobile screens table, the Bidhaa note), `docs/v1/01_SHOPREX_V1_PRODUCT_CONCEPT.md` §4 and §5, `docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` §3.

#### Tests and results

| Surface | Before (§7 close) | After |
|---|---|---|
| Backend unit | 252 / 11 suites | **260 / 12 suites** |
| Backend e2e | 489 / 17 suites | **493 / 17 suites** |
| Web | 61 / 13 files | **66 / 14 files** |
| Mobile | 205 / 12 suites | **219 / 13 suites** |
| **Total** | **1,007** | **1,038** |

Lint, typecheck, and build pass on backend and web; mobile typecheck and test pass.

#### Manual testing

##### Feature 1 — Enrolling a phone by scanning *(must pass)*

**Setup:** backend on `:3001`, web on `:3000`, signed in as the seeded owner. A **new mobile build is required** before any of this can be tried — `barcodeTypes` is native scanner configuration, so a JavaScript reload will not pick it up: `cd mobile && npm run build:dev`.

1. Go to **Simu**, choose a branch, name the phone, press **Tengeneza msimbo**. → The code appears as large text **and** as a QR on a white plate beneath it, with *write it down now, it is never shown again* in as many words.
2. On the phone's enrolment screen, tap **Soma msimbo**. → Android asks for camera permission the first time. Allow it. → The viewfinder says *Soma msimbo wa usajili*, not the product-scanning copy.
3. Point it at the QR on the laptop. → The code fills the box **and submits itself**; the phone lands on the sign-in screen for that branch.
4. Issue another code and **type** it instead. → Identical outcome. → *Both paths submit the same string.*
5. Point the enrolment scanner at an ordinary **product barcode**. → **Nothing happens.** → *A bottle is not an enrolment code; the mode decides what is listened for.*
6. Point the **Mauzo** scanner at an enrollment QR. → **Nothing happens**, for the mirror reason.
7. Reload the console page after issuing. → **The QR and the code are both gone.** → *Shoprex stores only the hash; this is not a bug.*
8. Refuse the camera permission. → A warning banner explaining the code can still be typed, and a working way to do it — not a blank viewfinder.

##### Feature 2 — Adding a product without an errand attached *(must pass)*

1. On the phone's home screen, tap **Bidhaa**. → The catalogue, with a price for each packaging. A product nobody has priced says *Haijawekwa bei*, never `TSh 0`.
2. Tap **Ongeza bidhaa mpya**. → The same sheet Mauzo uses, but **the price box is optional** — the note under the button says so.
3. Add a product with no price. → It appears in the list as unpriced. Now try to sell it in **Mauzo**. → The backend refuses with *weka bei kwanza*. → *The honest outcome, not a hidden one.*
4. Tap **Soma namba** and scan a barcode the shop already knows. → The list narrows to that product. Scan one it does not know. → The creation sheet opens with the barcode carried in.
5. Sign in as a worker with **only `VIEW_STOCK`**. → **Bidhaa is still there** and readable. → Inside, there is **no add button**, and a banner naming the two permissions that would grant it.
6. Sign in as somebody granted **nothing at all**. → Home shows the "nothing granted" banner *and* Bidhaa. → *Reading what a thing costs is not a permission the shop withholds.*
7. Press Android's back button from Bidhaa. → Home, the same as every other screen.

##### What has no automated coverage at all

1. **A camera actually reading the QR off a screen.** The rendering is proven faithful by decoding it back to a 21×21 module matrix and comparing all 441 modules against the encoder's own output, and the decoded string was then redeemed against a live backend — but no physical phone has been pointed at a physical laptop. **This is the single most important thing to test by hand**, and it is where glare, angle, and screen brightness live.
2. **`expo-camera` reading `qr` at all.** The mode switch is a prop change proven by typecheck and review; the native scanner is mocked in every test and has never run.
3. **The QR at a real size on a real screen** — whether 220px is large enough for a cheap phone camera across a counter.
4. **Bidhaa with a large catalogue.** It inherits the backend's 50-product cap without yet saying so — see known issues.

#### Known issues / risks

1. **Bidhaa inherits the 50-product cap silently.** `GET /products` caps `limit` at 50; the web products screen says so and this one does not, so a shop with a larger catalogue sees a list that stops without explanation. The fix is the properly-paged catalogue route §6 already identified.
2. **`qrcode` brings 15 transitive packages.** They were reviewed as a count, not read. The 3 high-severity advisories `npm audit` reports are **pre-existing and unrelated** — `prisma` → `@prisma/config` → `deepmerge-ts` — and were deliberately left alone rather than fixed as an unrequested dependency change.
3. **The QR is rendered with `dangerouslySetInnerHTML`.** Safe for one specific reason, written down at the call site: the markup is generated by our own backend from a code our own backend minted moments earlier, is never user input, and is never round-tripped. If any of that stops being true, this stops being safe.
4. ~~**`ScannerSheet` still lives in `src/features/sale/`**~~ — **resolved 2026-08-25.** The owner approved the move, and `ScannerSheet`, `NewProductSheet`, and `UnitNameField` now live in `src/components/`, mirroring `web/src/components/`. This closes §5 known issue 1 and §6 blocked-question 3. See "The move" below.
5. **Bidhaa searches on every keystroke**, with no debounce, so a fast typist spends a request per character against the 120/min default bucket. Fine for a pilot; the same rate-limit concern §6 raised for the console.

#### The move (2026-08-25)

**The owner approved it**, so §6's blocked question 3 — open since §5 — is closed. `ScannerSheet`, `NewProductSheet`, `UnitNameField`, and `UnitNameField.test.tsx` moved from `mobile/src/features/sale/` to **`mobile/src/components/`**.

Why there: it mirrors `web/src/components/`, which already means exactly this in the sibling app, and it was the literal shape of the approved question ("into a shared folder") rather than a cleverer split. The alternative considered and rejected was scattering them — `NewProductSheet` and `UnitNameField` into `features/products/`, `ScannerSheet` somewhere else — which would have left `SaleScreen` and `ReceiveScreen` importing product-creation UI from another feature's folder, trading one misleading path for two.

The mobile tree now reads: `src/features/<name>/` for what belongs to one feature, `src/components/` for composite pieces several features share, `src/app/ui.tsx` for the small building blocks those compose from, `src/domain/` for pure rules, `src/core/` for the API client and session store.

**It changed no behaviour and no test.** 219/219 mobile tests passed before and after, unmodified; typecheck clean. Git recorded all four as renames (`R`), so `git log --follow` still traces their history. What did change is prose: `ScannerSheet` now carries a note saying why it sits where it does, and `NewProductSheet`'s doc comment no longer claims two callers when it has three.

#### Blocked / awaiting user

Nothing blocks Phase 8, and nothing is outstanding from this section. The questions carried from §6 (a shared barcode catalogue, a second large packaging per product, an admin-editable shop record, the pilot shop's identity, and the disk-cleanup confirmation) are all still open and still none of them block a phase — see §6 for the full table.

#### Handoff notes

- **`ScannerSheet`'s `mode` decides symbologies, not the frame.** If a third scanning use appears, add a mode rather than widening an existing one — the isolation between them is the feature, not an implementation detail.
- **`src/components/` is now the home for anything several mobile features share.** Put a new cross-feature sheet there rather than in whichever feature happened to need it first — that is precisely the mistake this section had to undo.
- **`qrSvg` is a credential.** It is in `openapi.e2e-spec.ts`'s leak walk by name. Do not add it to any response other than the single issue moment.
- **Bidhaa passes `requirePrice={false}`.** That is deliberate, and it is the one thing separating cataloguing from selling in that shared sheet. Do not "fix" it to match Mauzo.
- **The QR was verified by decoding, not by eyeballing.** A throwaway script parsed the SVG paths back into a module matrix and compared all 441 modules against `QRCode.create()`. If the rendering options ever change, redo that check rather than trusting that the output still looks like a QR code.

### §8 — Pilot hardening and launch
*(empty until started)*
