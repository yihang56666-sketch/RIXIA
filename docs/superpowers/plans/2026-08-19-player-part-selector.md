# Player Part Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or equivalent TDD workflow) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the FocuBili expanded multi-part selector into the merged Rixia player for long videos.

**Architecture:** Keep the compact in-page part chips as the fast path. Add an isolated dialog that owns only local ordering and visibility state, returning the selected `VideoPart` to `BilibiliPlayerView`, which continues to own playback and progress persistence.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, lucide-react.

---

### Task 1: Expanded selector component

**Files:**
- Create: `src/features/bilibili/PlayerPartSelector.tsx`
- Create: `src/features/bilibili/PlayerPartSelector.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
render(<PlayerPartSelector parts={parts} currentCid={20} onClose={onClose} onSelect={onSelect} />);
fireEvent.click(screen.getByRole("button", { name: "倒序排列分 P" }));
expect(screen.getAllByRole("button", { name: /打开 P/ })[0]).toHaveAccessibleName("打开 P3 结尾");
fireEvent.click(screen.getByRole("button", { name: "打开 P1 开场" }));
expect(onSelect).toHaveBeenCalledWith(parts[0]);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/features/bilibili/PlayerPartSelector.test.tsx`

Expected: FAIL because the selector component does not exist.

- [x] **Step 3: Write minimal implementation**

```tsx
export function PlayerPartSelector({ parts, currentCid, onSelect, onClose }: Props) {
  const [descending, setDescending] = useState(false);
  const visibleParts = descending ? [...parts].reverse() : parts;
  return <section role="dialog">{/* order, locate, and selectable parts */}</section>;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/features/bilibili/PlayerPartSelector.test.tsx`

Expected: PASS.

### Task 2: Player entry point

**Files:**
- Modify: `src/features/bilibili/BilibiliPlayerView.tsx`
- Modify: `src/features/bilibili/BilibiliPlayerView.test.tsx`
- Modify: `src/styles/global.css`

- [x] **Step 1: Write the failing test**

```tsx
expect(screen.getByRole("button", { name: "展开选集" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "展开选集" }));
expect(screen.getByRole("dialog", { name: "选择分 P" })).toBeInTheDocument();
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/features/bilibili/BilibiliPlayerView.test.tsx`

Expected: FAIL because the player has no expanded selector entry point.

- [x] **Step 3: Write minimal implementation**

```tsx
{video.parts.length > 1 && <button onClick={() => setShowPartSelector(true)}>展开选集</button>}
{showPartSelector && <PlayerPartSelector parts={video.parts} currentCid={part.cid} onClose={() => setShowPartSelector(false)} onSelect={changePart} />}
```

- [x] **Step 4: Run focused verification**

Run: `npm test -- --run src/features/bilibili/PlayerPartSelector.test.tsx src/features/bilibili/BilibiliPlayerView.test.tsx && npm run typecheck`

Expected: PASS.

### Task 3: Full verification

**Files:**
- Verify: `src/features/bilibili/PlayerPartSelector.tsx`
- Verify: `src/features/bilibili/BilibiliPlayerView.tsx`

- [x] **Step 1: Run full verification**

Run: `npm test -- --run && npm run build && npm run mobile:apk`

Expected: all commands exit 0.
