# Kaoyan Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, iOS-inspired Kaoyan study area with subjects, study units, date-based daily check-ins, and automatic progress.

**Architecture:** Keep Kaoyan domain calculations pure in `src/lib/kaoyan.ts`, use typed subject/unit records in the existing Zustand persisted store, and render three detail levels through one `KaoyanView` controlled by local navigation state. The global app only adds the new fixed bottom-navigation view and title.

**Tech Stack:** React 19, TypeScript, Zustand persist, Vitest, Lucide React, Vite, Capacitor Android.

---

### Task 1: Add and test the Kaoyan date/progress domain helpers

**Files:**
- Create: `src/lib/kaoyan.ts`
- Create: `src/lib/kaoyan.test.ts`

- [ ] **Step 1: Write failing tests for inclusive dates and progress**

```ts
expect(dateKeysInRange("2026-08-01", "2026-08-03")).toEqual([
  "2026-08-01", "2026-08-02", "2026-08-03",
]);
expect(unitProgress({ startDate: "2026-08-01", endDate: "2026-08-03", completedDates: ["2026-08-01", "2026-08-04"] })).toEqual({ completed: 1, total: 3, percent: 33 });
expect(subjectProgress([{ startDate: "2026-08-01", endDate: "2026-08-02", completedDates: ["2026-08-01"] }])).toEqual({ completed: 1, total: 2, percent: 50 });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/lib/kaoyan.test.ts`
Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure, timezone-safe helper functions**

```ts
export function dateKeysInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let cursor = new Date(`${startDate}T00:00:00Z`), end = new Date(`${endDate}T00:00:00Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
  return dates;
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- src/lib/kaoyan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add src/lib/kaoyan.ts src/lib/kaoyan.test.ts
git commit -m "feat: add kaoyan progress helpers"
```

### Task 2: Extend types, catalog, and persisted store

**Files:**
- Modify: `src/types.ts`
- Modify: `src/catalog.ts`
- Modify: `src/store/useAppStore.ts`

- [ ] **Step 1: Add Kaoyan record types and view key**

```ts
export interface StudySubject { id: string; title: string; color: string; createdAt: string; }
export interface StudyUnit { id: string; subjectId: string; title: string; startDate: string; endDate: string; completedDates: string[]; createdAt: string; }
export type ViewKey = "today" | "inbox" | "tools" | "tasks" | "habits" | "notes" | "countdowns" | "focus" | "settings" | "kaoyan";
```

- [ ] **Step 2: Add state and actions without altering existing records**

```ts
subjects: StudySubject[];
studyUnits: StudyUnit[];
addSubject(title: string, color: string): void;
updateSubject(id: string, title: string, color: string): void;
removeSubject(id: string): void;
moveSubject(id: string, direction: -1 | 1): void;
addStudyUnit(subjectId: string, title: string, startDate: string, endDate: string): void;
updateStudyUnit(id: string, title: string, startDate: string, endDate: string): void;
removeStudyUnit(id: string): void;
moveStudyUnit(id: string, direction: -1 | 1): void;
toggleStudyDate(id: string, date: string): void;
```

- [ ] **Step 3: Type-check the store integration**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit persisted Kaoyan state**

```bash
git add src/types.ts src/catalog.ts src/store/useAppStore.ts
git commit -m "feat: persist kaoyan study plans"
```

### Task 3: Build the Kaoyan view and navigation integration

**Files:**
- Create: `src/features/kaoyan/KaoyanView.tsx`
- Modify: `src/components/Shell.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the fixed BookOpen bottom navigation entry**

```tsx
{ view: "kaoyan", label: "考研", icon: BookOpen }
```

- [ ] **Step 2: Render subject list, subject details, and unit timeline in one focused feature component**

```tsx
type Page = { kind: "subjects" } | { kind: "subject"; subjectId: string } | { kind: "unit"; unitId: string };
```

The subject list must show progress, completed unit count, nearest end date and a progress bar. Subject detail must provide add/edit/delete/reorder actions and today check-in. Unit detail must group inclusive date keys by week and toggle any listed date.

- [ ] **Step 3: Validate new user-facing flow with TypeScript**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit view/navigation integration**

```bash
git add src/features/kaoyan/KaoyanView.tsx src/components/Shell.tsx src/App.tsx
git commit -m "feat: add kaoyan study area"
```

### Task 4: Add iOS-inspired Kaoyan styling

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add scoped Kaoyan layout styles**

```css
.kaoyan-card { backdrop-filter: blur(18px); border-radius: 18px; }
.progress-track { overflow: hidden; height: 7px; border-radius: 999px; }
.timeline-day { display: grid; grid-template-columns: 42px 1fr auto; }
```

Use restrained borders, translucent surfaces, high-contrast labels on custom backgrounds, and responsive five-item bottom navigation. Do not restyle unrelated features.

- [ ] **Step 2: Build the web app**

Run: `npm run build`
Expected: PASS and writes `dist/`.

- [ ] **Step 3: Commit visual polish**

```bash
git add src/styles/global.css
git commit -m "style: polish kaoyan mobile experience"
```

### Task 5: Full verification and Android delivery

**Files:**
- Modify: `release/RIXIA-0.1.0-debug.apk`

- [ ] **Step 1: Run test suite and static checks**

Run: `npm test; npm run typecheck; npm run build`
Expected: all commands pass.

- [ ] **Step 2: Sync and build Android debug APK with installed JDK/SDK**

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:ANDROID_HOME = "C:\Users\35182\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
npx cap sync android
Push-Location android
.\gradlew.bat --no-daemon --offline assembleDebug
Pop-Location
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk release\RIXIA-0.1.0-debug.apk -Force
```

- [ ] **Step 3: Verify APK signature**

Run: `& "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --verbose release\RIXIA-0.1.0-debug.apk`
Expected: signature verification succeeds.

- [ ] **Step 4: Commit delivery artifacts and final code**

```bash
git add src release/RIXIA-0.1.0-debug.apk
git commit -m "build: package kaoyan-enabled Android app"
```
