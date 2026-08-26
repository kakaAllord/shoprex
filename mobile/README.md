# Shoprex mobile (React Native + Expo, Android)

The operational Shoprex app: selling, stock receiving, and receipts. It calls the
NestJS backend in `../backend` and holds no database access of its own.

Shoprex ships an **Expo development build**, not Expo Go — the pilot phones run the
same kind of build developers do. Builds run on **EAS** (Expo's cloud), so no
Android Studio, JDK, or local Android SDK is needed.

Shoprex V1 is online-only: no local queue, outbox, or background synchronisation.

## First run on a phone

```bash
npm install
npx eas-cli login             # free Expo account
npx eas-cli init              # links the project, writes projectId into app.json
npm run build:dev             # cloud build; ends with a QR code and a link
```

`eas-cli` is deliberately **not** a project dependency: its own dependencies
require TypeScript 5.x while this project is on 6.x, which leaves the lock file
unresolvable and fails `npm ci` on the build server. Run it through `npx`
(as the scripts do), or install it globally.

Open the link on the phone, install the APK (Android will ask permission to
install from this source), and the Shoprex development client is on the device.
**No USB cable is involved at any point.**

## Daily development

```bash
npm start                     # Metro, in --dev-client mode
```

Open the Shoprex app on the phone and it connects to Metro over Wi-Fi. Edit
JavaScript and it reloads on the device.

You only need a **new cloud build** when native code changes — a new native
dependency (`expo-camera` in Phase 3/4), or an edit to `app.json`. Ordinary
JavaScript and styling changes never need one.

## Configuration

The backend address lives in `.env`, never in code:

| Running on | `EXPO_PUBLIC_SHOPREX_API_BASE_URL` |
|---|---|
| Physical phone | `http://<your-PC-LAN-IP>:3001/api/v1` (find it with `ipconfig`) |
| Android emulator | `http://10.0.2.2:3001/api/v1` (10.0.2.2 = the host machine) |

`EXPO_PUBLIC_*` values are inlined when **Metro bundles**, so for a development
build a change to `.env` needs only `npm start --clear` — not a new cloud build.

If the variable is missing the app fails loudly at startup rather than silently
pointing somewhere unexpected.

The phone must reach your PC, so both need to be on the same network, with ports
**3001** (backend) and **8081** (Metro) allowed through the firewall. The
backend already listens on `0.0.0.0`, so it accepts LAN connections as-is. The
health screen prints the address it tried, which is the fastest way to diagnose
a connection problem.

**Standalone builds** (`preview`, `pilot`, `production`) bundle the JavaScript in
the cloud, so they need the API address supplied to EAS rather than read from
your local `.env` — which is deliberately not uploaded. The same variable name
is set once per **EAS environment**, either in the EAS dashboard under
*Environment variables* or from the CLI:

```bash
npx eas-cli env:create --environment preview    --name EXPO_PUBLIC_SHOPREX_API_BASE_URL --value https://staging-api.example/api/v1 --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SHOPREX_API_BASE_URL --value https://api.example/api/v1 --visibility plaintext
```

Each build profile names the environment it reads (`environment` in `eas.json`),
so `preview` builds get the staging address and `pilot`/`production` builds get
the live one. Confirm with `npx eas-cli env:list --environment production`.

The address **must be `https://`**. A release APK on Android 9+ refuses cleartext
HTTP, so an `http://` address works in development and then fails on a phone
holding a standalone build.

Keep the visibility **plaintext**, not secret. `EXPO_PUBLIC_*` values are inlined
into the bundle and readable by anyone holding the APK, so marking one secret
hides it from you without hiding it from anybody else. It is only an address —
the app holds no keys.

## Distribution and updates

Shoprex ships JavaScript fixes over the air with **EAS Update**, so a shop never
has to reinstall for a bug fix. An update is published to a **channel**, and a
build only ever receives updates from the channel it was built on.

| Git branch | EAS channel | Build profile | Who holds it |
|---|---|---|---|
| `allord-dev` / `yosia-dev` | — | `development` | Metro over Wi-Fi; no OTA needed |
| `staging` | `staging` | `preview` | Developers and QA |
| `production` | `production` | `pilot` | The pilot shop |

`pilot` builds an installable APK on the `production` channel; the `production`
profile stays an app bundle for an eventual Play Store submission.

**Two things to understand before publishing.**

First, `eas update` publishes your **working tree**, not a git branch — EAS's own
"branches" are unrelated to git's despite the shared word. So merge into git
`staging`, run the suite, **check that branch out**, and only then publish. The
git branch is what you verified; the checkout is what makes the publish match it.

Second, `EXPO_PUBLIC_*` is inlined at bundle time, so **an update carries the API
address with it**. The `update:*` scripts pin `--environment` for exactly this
reason. Never run a bare `eas update`, or a laptop's LAN address can be published
to the pilot shop.

```bash
git checkout staging && git merge allord-dev    # then run the full suite
cd mobile && npm run update:staging             # QA and developer phones

git checkout production && git merge staging    # once QA is happy
cd mobile && npm run update:production          # the pilot shop
```

Neither gate is automatic. Merging alone moves no phone; publishing is a command
somebody chooses to run.

Phones check on launch, download in the background, and apply on the **next**
launch — so a fix lands one restart later rather than instantly, and a bundle
never swaps under a half-finished sale.

### Which command, after a merge

One question, asked twice: **did native change?** Testing locally and shipping
outward are separate steps, not alternatives — always do the first before the
second.

| What changed | Test it yourself | Ship to QA (`staging`) | Ship to the pilot (`production`) |
|---|---|---|---|
| JavaScript, styling, copy | `npm start` | `npm run update:staging` | `npm run update:production` |
| Native — a native dependency, an `app.json` native field, an SDK bump | `npm run build:dev`, install | `npm run build:preview`, QA reinstalls | `npm run build:pilot`, shop reinstalls |

An update carries JavaScript and assets only, so nothing in the bottom row can be
delivered over the air. `runtimeVersion` uses the **fingerprint** policy, which
hashes the native project, so this fails safe: a phone whose binary cannot run an
update is simply not offered it, rather than downloading one that crashes on a
native module that is not there. If a publish seems to reach nobody, a changed
fingerprint is the first thing to check — `npx eas-cli fingerprint:compare`.

**Channels do not cross.** A development build is on the `development` channel and
will never receive a `staging` update, so it cannot rehearse what QA is about to
get. Carry a `preview` APK alongside the development client, so somebody sees the
real update before the pilot's turn comes.

Bump `android.versionCode` in `app.json` before each APK you hand out. Android
will not install a build over one it considers newer, and identical version codes
make "which build is on this phone?" unanswerable. Updates do not need it.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Metro for the development build |
| `npm test` | Jest unit and component tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:dev` | EAS cloud build of the development client (APK) |
| `npm run build:preview` | EAS cloud build of a standalone test APK (`staging` channel) |
| `npm run build:pilot` | EAS cloud build of the pilot shop's APK (`production` channel) |
| `npm run update:staging` | Publish a JavaScript update to QA and developer phones |
| `npm run update:production` | Publish a JavaScript update to the pilot shop |
| `npm run android` | Local native build — needs a JDK and the Android SDK |
| `npm run prebuild` | Regenerate the native `android/` project locally |

`android/` and `ios/` are generated build output and are gitignored. Native
configuration belongs in `app.json` so it survives a regenerate.

```text
src/
├── app/          # shell and theme
├── core/api/     # the only gateway to the backend
├── features/     # health today; onboarding, Mauzo, receiving next
└── test/         # shared test setup
```

See the repository root `README.md` for full setup and `PROGRESS.md` for the
current phase.
