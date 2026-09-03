export interface LocalWatchHistoryEntry {
  bvid: string;
  cid: number;
  title: string;
  ownerName: string;
  thumbnailUrl: string;
  durationSeconds: number;
  watchedAt: string;
  positionSeconds: number;
  completed: boolean;
}

export interface WatchHistoryService {
  list(): Promise<LocalWatchHistoryEntry[]>;
  record(entry: LocalWatchHistoryEntry): Promise<LocalWatchHistoryEntry[]>;
  backfillThumbnails(thumbnailUrls: Record<string, string>): Promise<LocalWatchHistoryEntry[]>;
  remove(bvid: string): Promise<LocalWatchHistoryEntry[]>;
  clear(): Promise<LocalWatchHistoryEntry[]>;
}

export const STORAGE_KEY = "focubili.local-watch-history.v1";
const MAX_ENTRIES = 50;

export function createWatchHistoryService(storage: Storage = localStorage): WatchHistoryService {
  function read(): LocalWatchHistoryEntry[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isEntry).sort((a, b) => b.watchedAt.localeCompare(a.watchedAt)).slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  }

  function write(entries: LocalWatchHistoryEntry[]): void {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
      // Watching a video must remain available when browser storage is unavailable.
    }
  }

  return {
    async list() {
      return read();
    },
    async record(entry) {
      if (!isEntry(entry)) return read();
      const normalized = { ...entry, bvid: entry.bvid.trim(), watchedAt: new Date(entry.watchedAt).toISOString() };
      const updated = [normalized, ...read().filter((item) => item.bvid !== normalized.bvid)].slice(0, MAX_ENTRIES);
      write(updated);
      return updated;
    },
    async backfillThumbnails(thumbnailUrls) {
      const normalizedUrls = new Map<string, string>();
      for (const [bvid, url] of Object.entries(thumbnailUrls)) {
        const normalizedBvid = bvid.trim();
        const normalizedUrl = url.trim();
        if (normalizedBvid && normalizedUrl) normalizedUrls.set(normalizedBvid, normalizedUrl);
      }
      if (normalizedUrls.size === 0) return read();
      const existing = read();
      let changed = false;
      const updated = existing.map((entry) => {
        const thumbnailUrl = normalizedUrls.get(entry.bvid);
        if (entry.thumbnailUrl || thumbnailUrl == null) return entry;
        changed = true;
        return { ...entry, thumbnailUrl };
      });
      if (changed) write(updated);
      return updated;
    },
    async remove(bvid) {
      const normalized = bvid.trim();
      if (!normalized) return read();
      const updated = read().filter((item) => item.bvid !== normalized);
      write(updated);
      return updated;
    },
    async clear() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // Keep clearing idempotent when storage is unavailable.
      }
      return [];
    },
  };
}

function isEntry(value: unknown): value is LocalWatchHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<LocalWatchHistoryEntry>;
  return typeof entry.bvid === "string" && entry.bvid.trim().length > 0
    && Number.isInteger(entry.cid) && (entry.cid ?? 0) > 0
    && typeof entry.title === "string" && entry.title.trim().length > 0
    && typeof entry.ownerName === "string" && entry.ownerName.trim().length > 0
    && typeof entry.thumbnailUrl === "string"
    && Number.isFinite(entry.durationSeconds) && (entry.durationSeconds ?? -1) >= 0
    && typeof entry.watchedAt === "string" && Number.isFinite(new Date(entry.watchedAt).getTime())
    && Number.isFinite(entry.positionSeconds) && (entry.positionSeconds ?? -1) >= 0
    && typeof entry.completed === "boolean";
}