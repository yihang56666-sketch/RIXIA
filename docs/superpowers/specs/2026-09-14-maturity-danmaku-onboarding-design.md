# Maturity, Danmaku, And Onboarding Design

## Goal

Close the remaining gap between "the app has many features" and "the app feels obvious and pleasant to return to." This wave has three outcomes:

1. Danmaku becomes a useful study signal instead of a decorative overlay.
2. The overall layout and motion system feel mature and consistent.
3. Every major workflow has a discoverable, dynamic, task-based guide.

## Current Evidence

- The existing feature map and task-based tour already cover watch, focus, review, organize, and backup.
- The player has danmaku loading, rendering, preferences, retry, and a first-use toggle coach.
- The home screen already groups secondary entries by intent.
- The remaining weaknesses are that danmaku is still mostly an on/off overlay, the global visual system still mixes local patterns, and some workflows are discoverable only through exploration.

## Danmaku Study Mode

### UX

The player control layer gains a compact study-mode entry next to the existing danmaku toggle. The entry opens a focused side panel instead of expanding the player settings into another generic menu.

The panel has three sections:

1. **Now playing:** the current time window, active danmaku count, and a one-line summary of the most useful signals.
2. **High-signal list:** up to five relevant entries for the current playback window, with timestamps and short excerpts.
3. **Controls:** signal strength, visibility, density, and a link to full danmaku preferences.

### Signal Model

Create a pure `danmakuStudyModel` module so the logic is testable outside React. It receives the parsed danmaku list, current playback time, preferences, and a small study-mode config. It returns:

```ts
interface DanmakuStudySummary {
  windowLabel: string;
  totalCount: number;
  visibleCount: number;
  highSignalEntries: DanmakuStudyEntry[];
}
```

The model ranks entries using stable, local rules:

- Questions score higher when they contain `?`, `？`, `为什么`, `怎么`, `如何`, `吗`, or similar study cues.
- Timestamps, chapter references, and explicit mentions of key terms score higher.
- Repeated entries are merged, but repetition increases signal slightly instead of being treated only as spam.
- Very short low-information strings such as `哈哈哈`, `来了`, `前方高能`, and `打卡` score lower.
- Entries outside the nearby playback window do not appear in the current list.
- The list remains deterministic for the same input, time, and configuration.

### Failure And Empty States

- If danmaku is loading, the panel shows a calm loading row and disables controls that depend on data.
- If danmaku is empty, the panel explains that this video or part has no danmaku and suggests using notes instead.
- If danmaku loading fails, the panel keeps the retry action visible and explains that study summaries depend on danmaku data.
- If the signal score is low, the panel says that no strong signal was found in this window instead of inventing relevance.

## Layout And Visual Maturity

### Home

The home screen remains a "start learning" surface, not a dashboard. The main hierarchy is:

1. Continue learning, when a task exists.
2. Focus, when a session is active or ready.
3. Today's compact status.
4. Intent-based supporting entries.

On desktop, the left column is reserved for the primary action: continue learning or focus. The right column contains supporting state and compact navigation. On mobile, the same hierarchy becomes one vertical flow.

### Visual System

Use existing theme tokens as the source of truth. Introduce only shared component-level patterns, not a new palette:

- One surface hierarchy: page, primary card, compact item.
- One border and shadow scale for cards, popovers, and dialogs.
- One icon treatment for feature entries and tool buttons.
- One spacing rhythm for grouped sections.

### Motion

Define a small shared motion language:

- Page entrance: 220ms, soft rise.
- Card entrance: 300ms, staggered by 40ms.
- Dialog and panel entrance: 240ms.
- Button and control feedback: 140ms.
- Focus completion: one clear pulse, not repeated decoration.

All motion respects the existing reduced-motion behavior. The launch animation should become a short sequence: brand mark scales in, primary surface rises in, then the first actionable control receives visual emphasis. It must not delay interaction for longer than the current launch window.

## Teaching Center

### Entry Points

The feature map becomes a teaching center with the same stable architecture but richer guidance. It remains reachable from:

- Home support area.
- Command palette.
- Profile hub.
- Tour completion.

### Catalog

Extend the existing feature catalog with:

- A short "why use this" sentence.
- A concrete "how to use it" step.
- A primary route.
- An optional tour task.
- A maturity or workflow category.

The teaching center shows grouped workflows, not an exhaustive settings tree. Every visible entry must either navigate to the feature or start a real tour.

### Dynamic Tours

Extend the tour task sets to include:

1. Watch and search.
2. Focus.
3. Review.
4. Organize.
5. Backup.
6. Danmaku study mode.

Each step must target a real control. When the control is actionable, the guide waits for that action and treats it as progress. `Next` remains available as an escape hatch, but the primary path is to use the highlighted control.

The danmaku tour should cover:

1. Find the danmaku toggle.
2. Turn danmaku on or off.
3. Open study mode.
4. Read the high-signal list.
5. Adjust signal strength or visibility.

## Architecture

- Add `src/lib/bilibili/danmakuStudyModel.ts` for pure ranking and filtering.
- Add a small player-side component for the study panel.
- Keep the player coordinator responsible only for playback time and visibility; do not move playback logic into the study panel.
- Reuse the existing feature map catalog and tour service; do not create a second onboarding source of truth.
- Reuse global CSS tokens and add shared component classes instead of copying one-off styles.

## Error Handling

- Study mode never blocks playback.
- If the model receives malformed danmaku data, it returns an empty high-signal list instead of throwing.
- Player resize, fullscreen, and mobile rotation must reposition the panel without breaking controls.
- Tour targets must fail safe: if a target is missing, the guide shows the escape hatch and does not trap the user.
- Storage failures should degrade to session-only tour progress and danmaku preferences.

## Testing

Unit tests:

- Signal ranking for questions, timestamps, repetition, and low-information phrases.
- Empty, failed, malformed, and loading states.
- Study panel rendering and control interaction.
- Teaching center entries and route/tour selection.
- Danmaku tour task selection and real target completion.
- Existing feature map and tour persistence.

Visual checks:

- Desktop, tablet, and narrow mobile layouts.
- Study panel in normal and fullscreen playback.
- Home hierarchy without overflow or overlapping text.
- Dialog, panel, page, and launch motion under reduced motion.

## Out Of Scope

- No new external UI dependency.
- No server-side onboarding state.
- No redesign of the media pipeline.
- No replacement of the existing renderer.
- No migration of user data.
