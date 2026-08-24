export interface MediaSessionActions {
  play: () => void;
  pause: () => void;
  seekBy: (seconds: number) => void;
}

export interface MediaSessionSnapshot {
  title: string;
  artist: string;
  artworkUrl: string;
  isPlaying: boolean;
  actions: MediaSessionActions;
}

interface BrowserMediaSession {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
}

export interface MediaSessionService {
  sync(snapshot: MediaSessionSnapshot): void;
  clear(): void;
}

function getSession(): BrowserMediaSession | null {
  if (typeof navigator === "undefined") return null;
  return "mediaSession" in navigator && navigator.mediaSession
    ? navigator.mediaSession as BrowserMediaSession
    : null;
}

/** Exposes the active Bilibili player to lock-screen and headset controls when supported. */
export function createMediaSessionService(): MediaSessionService {
  function setHandler(session: BrowserMediaSession, action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
    try { session.setActionHandler(action, handler); } catch { /* Unsupported actions vary by browser. */ }
  }
  return {
    sync(snapshot) {
      const session = getSession();
      if (!session) return;
      try {
        session.metadata = typeof MediaMetadata === "undefined"
          ? { title: snapshot.title, artist: snapshot.artist, artwork: snapshot.artworkUrl ? [{ src: snapshot.artworkUrl }] : [] } as unknown as MediaMetadata
          : new MediaMetadata({ title: snapshot.title, artist: snapshot.artist, artwork: snapshot.artworkUrl ? [{ src: snapshot.artworkUrl }] : [] });
        session.playbackState = snapshot.isPlaying ? "playing" : "paused";
      } catch { /* Metadata is optional and must never interrupt playback. */ }
      setHandler(session, "play", snapshot.actions.play);
      setHandler(session, "pause", snapshot.actions.pause);
      setHandler(session, "seekbackward", (details) => snapshot.actions.seekBy(-(details.seekOffset ?? 10)));
      setHandler(session, "seekforward", (details) => snapshot.actions.seekBy(details.seekOffset ?? 10));
    },
    clear() {
      const session = getSession();
      if (!session) return;
      try { session.metadata = null; session.playbackState = "none"; } catch { /* no-op */ }
      for (const action of ["play", "pause", "seekbackward", "seekforward"] as MediaSessionAction[]) setHandler(session, action, null);
    },
  };
}
