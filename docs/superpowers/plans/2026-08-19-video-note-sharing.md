# Video Note Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add FocuBili-style share previews for locally saved timestamp notes inside the merged Rixia application.

**Architecture:** Reuse the existing browser-native sharing helper and its clipboard fallback. Add a note-specific summary formatter and a reusable share preview card that renders the saved note snapshot, then expose it from each item in the existing notes list.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, lucide-react, Web Share API.

---

### Task 1: Note share summary

**Files:**
- Modify: `src/lib/bilibili/focusShareService.ts`
- Modify: `src/lib/bilibili/focusShareService.test.ts`

- [x] **Step 1: Write the failing test**

```ts
expect(buildVideoNoteShareText({ title: "矩阵秩", videoTitle: "线性代数第一讲", positionSeconds: 90 }))
  .toBe("来自焦点哔哩的时间点笔记：矩阵秩（线性代数第一讲 · 1:30）");
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/bilibili/focusShareService.test.ts`
Expected: FAIL because `buildVideoNoteShareText` is not exported.

- [x] **Step 3: Write minimal implementation**

```ts
export function buildVideoNoteShareText(input: { title: string; videoTitle: string; positionSeconds: number }): string {
  return `来自焦点哔哩的时间点笔记：${input.title || "未命名笔记"}（${input.videoTitle} · ${formatPosition(input.positionSeconds)}）`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/bilibili/focusShareService.test.ts`
Expected: PASS.

### Task 2: Note preview entry

**Files:**
- Create: `src/features/bilibili/VideoNoteSharePreview.tsx`
- Modify: `src/features/bilibili/VideoNotesView.tsx`
- Modify: `src/features/bilibili/VideoNotesView.test.tsx`
- Modify: `src/styles/global.css`

- [x] **Step 1: Write the failing test**

```tsx
fireEvent.click(screen.getByRole("button", { name: "分享时间点笔记" }));
expect(screen.getByRole("dialog", { name: "笔记分享预览" })).toBeInTheDocument();
expect(screen.getByText("来自焦点哔哩的时间点笔记：矩阵秩（线性代数第一讲 · 1:30）")).toBeInTheDocument();
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/features/bilibili/VideoNotesView.test.tsx`
Expected: FAIL because no share action exists.

- [x] **Step 3: Write minimal implementation**

```tsx
<button aria-label="分享时间点笔记" onClick={() => setSharingNote(note)}><Share2 size={15} /></button>
{sharingNote && <VideoNoteSharePreview note={sharingNote} onClose={() => setSharingNote(null)} />}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/features/bilibili/VideoNotesView.test.tsx`
Expected: PASS.

### Task 3: Verification

**Files:**
- Verify: `src/features/bilibili/VideoNoteSharePreview.tsx`
- Verify: `src/features/bilibili/VideoNotesView.tsx`

- [x] **Step 1: Run focused verification**

Run: `npm test -- --run src/lib/bilibili/focusShareService.test.ts src/features/bilibili/VideoNotesView.test.tsx && npm run typecheck`
Expected: PASS.

- [x] **Step 2: Run full verification**

Run: `npm test -- --run && npm run build && npm run mobile:apk`
Expected: all commands exit 0.
