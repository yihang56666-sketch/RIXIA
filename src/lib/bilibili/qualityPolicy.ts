const QUALITY_LABELS: Record<number, string> = {
  6: "240P",
  16: "360P",
  32: "480P",
  64: "720P",
  74: "720P60",
  80: "1080P",
  112: "1080P+",
  116: "1080P60",
  120: "4K",
  125: "HDR",
  126: "杜比视界",
  127: "8K",
};

export function chooseDefaultPlaybackQuality(
  preferences: { wifiDefaultQuality: number; mobileDefaultQuality: number },
  connectionType: string | undefined,
): number {
  return connectionType === "cellular"
    ? preferences.mobileDefaultQuality
    : preferences.wifiDefaultQuality;
}

export function choosePlaybackQuality(requested: number, accepted: number[]): number {
  const available = [...new Set(accepted.filter((quality) => Number.isInteger(quality) && quality > 0))]
    .sort((a, b) => b - a);
  if (available.length === 0) return requested;
  if (available.includes(requested)) return requested;
  return available.find((quality) => quality < requested) ?? available[available.length - 1]!;
}

export function qualityLabel(quality: number): string {
  return QUALITY_LABELS[quality] ?? `${quality}P`;
}

/** 4K/HDR/Dolby/8K exceed the browser MSE bandwidth cap. */
export const BROWSER_MSE_MAX_QUALITY = 116;

export function filterBrowserMseQualities(accepted: number[]): number[] {
  const valid = [...new Set(accepted.filter((quality) => Number.isInteger(quality) && quality > 0))];
  const playable = valid.filter((quality) => quality <= BROWSER_MSE_MAX_QUALITY).sort((a, b) => b - a);
  return playable.length > 0 ? playable : valid.sort((a, b) => b - a);
}
