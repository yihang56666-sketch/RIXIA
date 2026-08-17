# RIXIA

RIXIA is a local-first personal rhythm and productivity workbench. One quiet workspace for capturing thoughts, planning the day, maintaining habits, tracking important dates, completing focused work, and continuing to learn — without depending on a cloud account.

Built as a responsive React 19 + TypeScript 5 + Vite 7 web interface, packaged for Android with Capacitor 8, and embedded as the fourth top-level page of [FocuBili](https://github.com/L1Xu4n/FocuBili) on Flutter via a WebView bridge. All user data is persisted locally in the browser/WebView through Zustand persistence (v3 format), so the app works fully offline and does not require a backend.

## Design language

- **Three-tier material system**: app background → nav surface → content surface. Blur is reserved for navigation, bottom bar, popovers, and modals only — content cards use solid surfaces with 1px borders and 8px radius, so every region no longer looks like a floating glass card.
- **11 independent skins** + System auto mode: Porcelain, Graphite, Sage, Aurora, Rosewood, Mono, Ocean, Ember, Lavender, Ink, System. Each skin changes not just accent color but background, surface material, shadow, and blur.
- **Three density levels**: comfortable / standard / compact, adjusting control height and section gap globally.
- **Motion discipline**: 220ms ease-out for view transitions, 320ms spring for emphasis, `prefers-reduced-motion` caps all animations to 0.01ms. Tabular numerals for timers and percentages.
- **Touch and pointer aware**: hover feedback only on `@media (hover: hover) and (pointer: fine)`. Touch targets ≥ 44px. Safe-area insets respected.

## Top-level navigation

Five destinations replace the previous 8-card wall:

1. **Today** — single next-step action + horizontally scrollable status strip + two-column contextual grid (today's tasks + kaoyan units, continue-learning resources, today's habits, collapsed 7-day review, daily journal)
2. **Plan** — segmented Tasks / Habits / Kaoyan / Countdowns
3. **Focus** — Pomodoro countdown + countup stopwatch + ambient noise + wake-lock + configurable work/short-break/long-break cycle
4. **Library** — segmented Continue / Saved / Notes / Inbox, with embedded iframe player
5. **Settings** — 11 skins, density, modules, v3 backup, GPL notice

Inbox no longer takes a permanent nav slot — it's reached via floating capture button (mobile) or sidebar entry + Ctrl/Cmd+K (desktop).

## Daily workflow

- **Today action dashboard**: fixed-priority next-step picker (active focus > overdue/today task > recent unfinished resource > inbox > create-task)
- **Status strip**: compact pills for tasks done/total, habits, focus minutes, inbox count, next countdown
- **Inbox**: frictionless capture → convert to today's task with one tap
- **Tasks**: due dates, completion toggle, inline edit, delete
- **Daily journal**: one entry per day, markdown rendered with `react-markdown` (lazy-loaded), `#tag` extraction, `[[wiki-link]]` parsing, header shows today's task/habit/focus summary

## Personal rhythm tools

- **Habits** with three frequency types (daily / weekly-count N / interval-days N) and per-habit color, 15-week heatmap, 30-day strength ring, current and best streaks
- **Notes**: short local memos, inline editable
- **Countdowns**: track dates that matter
- **Focus**: configurable round cycle (work / short break / long break / long-break-every), auto-transition between phases, ambient noise (white / rain / waves), completion chime (Web Audio), screen wake-lock while running, 7-day minutes chart, daily goal tracker
- **Library**: collect B站 videos by BV or URL, continue-learning list with progress bar, embedded iframe player with "open in B站" fallback

## LearningProvider interface

Stable abstraction for search/resolve/openPlayer/getProgress/saveTimestampNote:

- **Web provider** (default): uses official B站 embed player + external open + RIXIA-local progress + offline detection
- **Native provider** (when `window.rixiaNativeLearning` exists, i.e. embedded in FocuBili): forwards requests via the JS channel to FocuBili's `BilibiliService` + SharedPreferences note storage, with 8s timeout and structured error unwrapping. Never forwards login cookies or Authorization headers.
- UI depends only on the interface; the right provider is picked at runtime based on whether the native bridge is present.

## Power features

- **Command palette** (`Ctrl/Cmd + K`): search across tasks, habits, notes, countdowns, inbox, subjects; jump to any view; switch theme; create task from search
- **Weekly review** on Today compares completed tasks, habit check-ins, and focus minutes against the previous 7 days
- **Data round-trip**: export/import v3 JSON backup with `validateBackup` validation
- **Installable PWA**: bundles service worker for offline install on Windows, Android, and desktop browsers
- **Density toggle**: comfortable / standard / compact affects the whole app

## Kaoyan planner

- Create subjects with custom color
- Create study units with start/end dates
- Reorder subjects and units to match preferred sequence
- Mark individual study dates as complete
- Removing a subject cascades to its units

## Technology

- React 19, React DOM 19
- TypeScript 5
- Vite 7
- Zustand 5 (persisted, v3 with migration from v1/v2)
- Lucide React icons
- Capacitor 8 Android runtime
- Vitest unit tests (119 passing)
- `react-markdown` for journal rendering (lazy-loaded)
- webview_flutter 4.x bridge (FocuBili side, GPL-3.0-only derived layer)

The interface intentionally has no application server, database, authentication flow, or analytics dependency. The main state model lives in `src/store/useAppStore.ts`; feature screens are organized under `src/features`; shared types are in `src/types.ts`; the LearningProvider contract is in `src/lib/learning/`.

## Repository layout

```text
src/
  components/        Shell, CommandPalette, CaptureButton, QuickAdd, Heatmap,
                    Modal, ProgressRing, Switch, HabitFrequencyEditor
  features/         today, plan, library, inbox, focus, habits, tasks, notes,
                    countdowns, kaoyan, settings, tools, videos, journal
  lib/              time, stats, kaoyan, bilibili, migrations, today, journal,
                    backgroundImage, chime, noise, wakeLock, id, skinTokens
                    learning/  types, webProvider, nativeProvider, provider
  store/            useAppStore + tests
  styles/           global.css (single token-based theme system)
  test/             setup + skinTokens fixture
android/            Capacitor Android project
public/             App icon, manifest, PWA service worker
scripts/            Android SDK helper, Flutter asset sync, cross-viewport
                    verifier, FocuBili bridge static check
docs/               Design notes, inspirations, specs, plans
release/            Checked-in debug APK for quick install
```

## Run locally

Requirements: Node.js 20+, npm.

```bash
npm install
npm run dev
```

Before submitting changes:

```bash
npm test            # 119 tests
npm run typecheck
npm run build
```

Cross-viewport build-integrity check:

```bash
node scripts/verify-cross-viewport.mjs   # 15 assertions
```

## Build the Android debug APK

The Android project targets SDK 36. Install JDK 17+ (21 recommended) and Android SDK Platform 36, Build Tools 36.x, Platform Tools.

```bash
npm run mobile:sync
cd android
./gradlew assembleDebug      # use gradlew.bat on Windows
```

The APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`. Helper scripts:

```bash
npm run mobile:doctor        # diagnose Android toolchain
npm run mobile:apk            # build debug APK automatically
npm run mobile:sdk:install   # install SDK into .mobile-toolchain
```

## FocuBili merged build (Flutter + WebView bridge)

RIXIA ships inside [FocuBili](https://github.com/L1Xu4n/FocuBili) as the fourth top-level page on the `rixia-merge` branch of the FocuBili checkout (e.g. `../focubili-src`).

The merged build embeds the RIXIA web bundle as Flutter assets and loads it via `webview_flutter`. FocuBili registers a `rixiaNativeLearning` JS channel that RIXIA calls to access B站 search, video lookup, and timestamp-note storage without exposing login cookies or Authorization headers.

### Setup

```bash
npm run flutter:sync            # build RIXIA and sync to ../focubili-src/assets/rixia
cd ../focubili-src
flutter pub get
flutter build apk --debug       # merged debug APK
```

### Native bridge

The bridge is implemented in three files in `../focubili-src/lib/features/workbench/`:

- `workbench_page.dart` — WebView host, registers the channel and injects the bootstrap
- `rixia_bridge.dart` — Dart-side `RixiaBridge` class, dispatches 6 methods (`capabilities` / `search` / `resolve` / `openPlayer` / `getProgress` / `saveTimestampNote`) to `BilibiliService` + `SharedPreferences`
- `rixia_bridge_bootstrap.dart` — JS string injected into the WebView defining `window.rixiaNativeLearning.request()` and `__deliver()`

Responses follow a strict `{ok: true, data}` / `{ok: false, error: {code, message, retryable, externalUrl?}}` envelope. The bridge never reads or forwards login cookies or Authorization headers.

### License boundary

RIXIA's web bundle (HTML/CSS/JS) remains independent when used outside FocuBili (PWA, browser, other hosts). The three bridge files above form the FocuBili GPL-3.0-only derived coupling layer. See `THIRD_PARTY_NOTICES.md` in the FocuBili repository for details.

### Verifying the bridge without Flutter SDK

A lightweight static check confirms file structure, method dispatch coverage, JS contract, test coverage, and license boundary without needing Flutter installed:

```bash
node scripts/verify-focubili-bridge.mjs   # 30+ assertions
```

For full validation including `dart analyze` and `flutter test`, run in an environment with the Flutter SDK installed:

```bash
cd ../focubili-src
dart analyze lib/features/workbench/ test/features/workbench/
flutter test test/features/workbench/rixia_bridge_test.dart
```

## Data and privacy

RIXIA stores application state locally under the `rixia-v1` persisted store key (format version 3). No account or network connection is needed for normal use. Clearing the WebView/browser site data removes locally stored content, so export a backup before clearing.

## Open-source design references

The following projects provided data-model and UX inspiration during the v3 redesign. AGPL projects (Joplin / Logseq / SiYuan) were excluded; the rest were used as design references only, not code sources:

- **Loop Habit Tracker** (GPL-3.0) — habit frequency types
- **Super Productivity** (MIT) — focus round cycle and weekly review
- **usememos/memos** (MIT) + **AFFiNE** (MIT, frontend) — daily journal, `#tag`, `[[wiki-link]]`
- **Things 3** (commercial, design philosophy only) — progressive disclosure and zero-friction editing

See `docs/inspirations.md` for the full mapping.

## Project status

RIXIA is at `0.3.0` with the maturity redesign (spec v2) complete: 11 skins, 5-destination nav, Today action dashboard, Plan/Library combined views, LearningProvider + Web fallback, daily journal, habit frequency types, focus rounds, v3 persistence migration, GPL-ounded FocuBili bridge, cross-viewport build integrity. 119 unit tests + 10 bridge contract tests + 12 Dart-side bridge tests.

## License

No open-source license has been declared yet for the RIXIA repository. Until a license is added, all rights remain with the repository owner. The FocuBili merged build (on the `rixia-merge` branch of the FocuBili checkout) is GPL-3.0-only as a derivative of FocuBili.
