export interface PlaybackProgress {
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

export interface PlaybackProgressStore {
  load(bvid: string, cid: number): PlaybackProgress | null;
  save(bvid: string, cid: number, positionSeconds: number, durationSeconds: number): void;
}

const PREFIX = "focubili.playback-progress.v1";
const COMPLETED_REMAINING_SECONDS = 3;

function keyFor(bvid: string, cid: number): string {
  return `${PREFIX}:${bvid}:${cid}`;
}

function normalize(positionSeconds: number, durationSeconds: number): PlaybackProgress | null {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const duration = Math.max(0, Math.round(durationSeconds));
  const clamped = Math.max(0, Math.min(Math.round(positionSeconds), duration));
  return {
    positionSeconds: duration - clamped <= COMPLETED_REMAINING_SECONDS ? 0 : clamped,
    durationSeconds: duration,
    updatedAt: new Date().toISOString(),
  };
}

export function createPlaybackProgressStore(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): PlaybackProgressStore {
  return {
    load(bvid, cid) {
      try {
        const raw = storage.getItem(keyFor(bvid, cid));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PlaybackProgress>;
        const normalized = normalize(Number(parsed.positionSeconds), Number(parsed.durationSeconds));
        return normalized ? { ...normalized, updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : normalized.updatedAt } : null;
      } catch {
        return null;
      }
    },
    save(bvid, cid, positionSeconds, durationSeconds) {
      const normalized = normalize(positionSeconds, durationSeconds);
      if (!bvid.trim() || !Number.isInteger(cid) || cid <= 0 || !normalized) return;
      try {
        storage.setItem(keyFor(bvid, cid), JSON.stringify(normalized));
      } catch {
        // Playback must continue when private mode or quota rejects persistence.
      }
    },
  };
}
