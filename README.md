# RIXIA

RIXIA is a local-first personal rhythm and productivity app for Android. It is designed for people who want one quiet workspace for capturing thoughts, planning the day, maintaining habits, tracking important dates, and completing focused work without depending on a cloud account.

The app is built as a responsive React + TypeScript web interface and packaged for Android with Capacitor. All user data is persisted locally in the browser/WebView through Zustand persistence, so the app can be used offline and does not require a backend service.

## What the app includes

### Daily workflow

- **Today** provides a compact overview of the current day.
- **Inbox** is a frictionless capture area for ideas and unprocessed tasks.
- Inbox entries can be converted into tasks scheduled for today.
- **Tasks** support due dates, completion toggles, and deletion.

### Personal rhythm tools

- **Habits** record daily repetitions, keep a history of completed dates, show week dots, a 15-week GitHub-style heatmap, streaks, and a 30-day habit-strength score.
- **Notes** store short local memos and can be edited in place.
- **Countdowns** track dates that matter, such as exams, deadlines, or trips.
- **Focus** provides a Pomodoro countdown with automatic break rounds, a free-run stopwatch mode, a daily focus goal, session history, a weekly minutes chart, a completion chime, synthesized ambient noise (white / rain / waves), and screen wake-lock while running.
- **Videos ("看课")** lets you collect Bilibili videos by pasting a link or BV id and watch them inside the app through the official embedded player — handy for online courses right next to your study plan.

### Power features

- **Command palette** (`Ctrl/Cmd + K`): search across tasks, habits, notes, countdowns, inbox, and subjects; jump to any view; switch themes; create a task straight from the search box.
- **Weekly review** on Today compares completed tasks, habit check-ins, and focus minutes against the previous 7 days.
- **Task and note editing**: tap a task to change its title and due date; edit notes any time.
- **Data round-trip**: export all data as a JSON backup and import it back on any device.
- **Installable PWA**: with the bundled service worker the app installs and runs offline on Windows, Android, and desktop browsers.

### Graduate entrance examination planner

The Kaoyan area is a structured study planner for exam preparation:

- Create subjects and assign a color to each subject.
- Create study units with a title and start/end date.
- Reorder subjects and units to match the preferred study sequence.
- Mark individual study dates as complete.
- Removing a subject also removes its associated study units.

### Personalization

- Eight built-in skins: four light (Paper, Mist, Matcha, Sunset) and four dark (Ink, Graphite, Dusk, Deep), each with its own accent palette.
- Optional full-screen background image stored on the device, with an automatic readability scrim.
- Configurable tool visibility from the settings view.
- Local data export as a JSON backup file.
- Android adaptive launcher icon and native splash resources.

## Technology

- React 19 and React DOM
- TypeScript 5
- Vite 7
- Zustand 5 with persisted local state
- Lucide React icons
- Capacitor 8 Android runtime
- Vitest unit tests

The interface follows an Apple-inspired design language: frosted-glass surfaces, spring-curve motion, and a responsive shell that adapts to phones (floating tab bar), tablets, and desktops (sidebar navigation). No UI framework is used; all styling lives in `src/styles/global.css` as a token-based theme system. Feature ideas were researched from well-regarded open-source apps — see `docs/inspirations.md` for the mapping from Loop Habit Tracker, Super Productivity, Pomotroid, and others.

The project intentionally has no application server, database, authentication flow, or analytics dependency. The main state model lives in `src/store/useAppStore.ts`; feature screens are organized under `src/features`; shared types are defined in `src/types.ts`.

## Repository layout

```text
src/
  components/       Shared shell and quick-add controls
  features/         Today, inbox, tasks, habits, notes, focus, settings, and Kaoyan views
  lib/              Date, ID, background-image, and Kaoyan domain helpers
  store/            Persisted Zustand application state and tests
  styles/           Global responsive styles and theme tokens
android/            Capacitor Android project
public/             App icon, manifest, and bundled image assets
scripts/             Android SDK diagnosis and debug APK build helpers
docs/               Design notes and implementation plans
release/            Checked-in debug APK for quick installation
```

## Run locally

Requirements:

- Node.js 20 or newer
- npm

Install dependencies, run the development server, and open the printed local URL:

```bash
npm install
npm run dev
```

Before submitting changes, run the type check, production build, and unit tests:

```bash
npm run typecheck
npm run build
npm test
```

## Build the Android debug APK

The Android project targets SDK 36. For a local build, install JDK 17 or newer (JDK 21 is recommended) and Android SDK Platform 36, Build Tools 36.x, and Platform Tools.

```bash
npm run mobile:sync
cd android
./gradlew assembleDebug
```

On Windows, use `gradlew.bat` instead of `./gradlew`.

The APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The repository also includes the latest checked-in debug build at [release/RIXIA-0.1.0-debug.apk](release/RIXIA-0.1.0-debug.apk). On Android, open the file and allow installation from the browser or file manager when prompted.

The helper scripts can diagnose the Android toolchain or build the APK automatically:

```bash
npm run mobile:doctor
npm run mobile:apk
```

If the required SDK components are missing, `npm run mobile:sdk:install` can install them into the project-local `.mobile-toolchain` directory after the Android SDK licenses are approved.

## Data and privacy

RIXIA stores application state locally under the `rixia-v1` persisted store. No account or network connection is needed for normal use. Clearing the WebView/browser site data removes locally stored content, so export and cloud synchronization are intentionally outside the current scope.

## Project status

RIXIA is an early personal productivity release (`0.1.0`). The current focus is a dependable offline workflow, a small set of composable daily tools, and a practical study-planning view for the graduate entrance examination workflow.

## License

No open-source license has been declared yet. Until a license is added, all rights remain with the repository owner.
