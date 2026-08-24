export interface MediaCacheStats {
  count: number;
  bytes: number;
}

const PLAYBACK_CACHE_PREFIX = "focubili.playback-progress.v1:";

export function createMediaCacheService(storage: Storage = localStorage) {
  function cacheKeys(): string[] {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(PLAYBACK_CACHE_PREFIX)) keys.push(key);
    }
    return keys;
  }

  return {
    stats(): MediaCacheStats {
      return cacheKeys().reduce<MediaCacheStats>((result, key) => {
        result.count += 1;
        result.bytes += (storage.getItem(key)?.length ?? 0) * 2;
        return result;
      }, { count: 0, bytes: 0 });
    },
    clear(): void {
      for (const key of cacheKeys()) storage.removeItem(key);
    },
  };
}
