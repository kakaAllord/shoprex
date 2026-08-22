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

**Standalone builds** (`preview`, `production`) bundle the JavaScript in the
cloud, so they need the API address supplied to EAS rather than read from your
local `.env` — which is deliberately not uploaded:

```bash
npx eas-cli env:create --name EXPO_PUBLIC_SHOPREX_API_BASE_URL --value https://api.example.com/api/v1
```

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Metro for the development build |
| `npm test` | Jest unit and component tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:dev` | EAS cloud build of the development client (APK) |
| `npm run build:preview` | EAS cloud build of a standalone test APK |
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
