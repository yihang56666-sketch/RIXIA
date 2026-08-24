/** Normalize Bilibili CDN image URLs for https WebViews (Capacitor/Android). */

const TRUSTED_HOST_SUFFIXES = [".hdslb.com", ".biliimg.com"] as const;

export function normalizeBiliImageUrl(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withScheme = raw.startsWith("//") ? `https:${raw}` : raw;
  let parsed: URL | null = null;
  try {
    parsed = new URL(withScheme);
  } catch {
    parsed = null;
  }
  const trustedHost = parsed != null && TRUSTED_HOST_SUFFIXES.some((suffix) => parsed!.host.endsWith(suffix));
  if (!parsed || !trustedHost) return "";
  const uri = parsed.protocol === "http:" ? new URL(parsed.toString().replace("http://", "https://")) : parsed;
  return uri.protocol === "https:" ? uri.toString() : "";
}

export function normalizeBiliThumbnailUrl(value: string): string {
  const normalized = normalizeBiliImageUrl(value);
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  return `${normalized}@320w_200h_1c.webp`;
}
