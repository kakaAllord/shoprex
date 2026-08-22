# Shoprex V1 — Live Progress

This file has two parts. **Part A** is the master table — read this first, always, on every session; it is the single source of truth for what phase the project is actually in. **Part B** is one append-only section per phase with the detail. Never delete a completed phase's section when a later phase starts; add to this file, don't rewrite it.

If Part A and Part B ever disagree (e.g. the table says "Complete" but a section describes a known-failing check), **the more cautious of the two is authoritative** and the mismatch itself must be logged as a blocker.

---

## Part A — Master phase table

| # | Phase | Status | Acceptance check verified? | Last updated |
|---|---|---|---|---|
| 0 | Decisions and design lock | Complete | Yes | 2026-08-20 |
| 1 | Repository and backend foundation | Complete | Yes — re-verified 2026-08-22, see §1 and §1c | 2026-08-22 |
| 2 | Owner, manager, worker, and device access | Complete | Yes — every criterion driven end to end over HTTP, see §2 | 2026-08-22 |
| 3 | Product, barcode, pricing, and stock engine | Not started | — | — |
| 4 | React Native mobile selling flow | Not started | — | — |
| 5 | React Native stock receiving and operational visibility | Not started | — | — |
| 6 | Next.js owner and admin web app | Not started | — | — |
| 7 | Reports and PDF | Not started | — | — |
| 8 | Pilot hardening and launch | Not started | — | — |

**Status values:** `Not started` / `In progress` / `Blocked` / `Complete`. Only mark `Complete` when the acceptance-check column says `Yes`, backed by a real test run referenced in that phase's section below.

**Active phase:** Phase 3, not yet started. Phase 2 closed on 2026-08-22 with 270 automated tests passing across all three surfaces — see §2. Mobile stack changed to React Native after Phase 1 closed (§1a); Phase 1 was independently re-verified before any Phase 2 code (§1c).

**Exact next action:** begin Phase 3's product, unit, and package-relationship models per `docs/v1/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md`, and mark the Phase 3 row `In progress` when that work starts. Nothing blocks it: the barcode format was settled on 2026-08-22 as **EAN-13** — see §3.

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
| Shared devices? | **No. One device belongs to one worker.** |
| Per-worker PIN for attribution on a shared device? | **Not needed** — a device already identifies exactly one worker, so device identity *is* the attribution (closes Phase 0 open decision 4) |
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
| Where does the device password live? | Nowhere separate — the device references the worker's own `passwordHash` | Doc 02 §3 allows "a password/PIN hash **or equivalent credential reference**". One device belongs to one worker, so a second copy of the same password would only be something to drift |
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

### §3 — Product, barcode, pricing, and stock engine

**Status:** Not started. *(Populate the build record only after real work begins — the decision below is a confirmed input, not projected content.)*

**Decision confirmed by the owner on 2026-08-22 — do not re-ask:**

| Question | Decision |
|---|---|
| First barcode format | **EAN-13.** This is what the scanner accepts and what a "valid" barcode means at product creation |

This closes the last open question from Phase 0, carried through §1 and §2. Every other Phase 3 rule already has a written source: package relationships, fixed conversions, cycle rejection, and physical-versus-normalized stock are all specified in `docs/v1/02_SHOPREX_V1_ENGINE_AND_MATH.md` §§4–5, and the acceptance check is in `docs/v1/03_SHOPREX_V1_IMPLEMENTATION_PHASES.md`.

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
