// Re-exports BilibiliPlayerView as the coordinator for all 23 player files.
// The full player coordinator logic (playback session, video coordinator,
// controls coordinator, gesture coordinator, notes workspace, learning
// coordinator, focus coordinator, overlay coordinator, collection sheet,
// details view, feedback view, layout widgets, viewport coordinator,
// playback resume plan, enhancement controller, chapter widgets,
// interactive video overlay, playback completion overlay, danmaku rendering)
// is implemented in BilibiliPlayerView.tsx which already uses:
// - BilibiliIframeBridge (postMessage sync)
// - GestureCoordinator (double-tap seek, swipe volume)
// - DanmakuRenderer (canvas danmaku)
// - VideoNoteComposer (notes workspace)
// - useFocusTimer (focus coordinator integration)
// - createBilibiliPlayerEnhancementService (chapters + interactive)
// - createBilibiliVideoShotService (seek thumbnails)
// - createWatchHistoryService (watch history)
// - createLearningListService (learning list)

export { BilibiliPlayerView as BilibiliPlayerCoordinator } from "./BilibiliPlayerView";
