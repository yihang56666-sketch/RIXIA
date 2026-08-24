/** B 站媒体 CDN 白名单：给 /bili-media 代理和播放器选源共用，避免把代理变成任意 URL 跳板。 */

const OFFICIAL_MEDIA_HOST_SUFFIXES = [".bilivideo.com", ".bilivideo.cn", ".hdslb.com", ".akamaized.net"] as const;
const PARTNER_MEDIA_HOST_SUFFIXES = [".mountaintoys.cn", ".szbdyd.com"] as const;

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  const host = normalizeHostname(hostname);
  const apex = suffix.startsWith(".") ? suffix.slice(1) : suffix;
  return host === apex || host.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`);
}

export function isOfficialBiliMediaHost(hostname: string): boolean {
  return OFFICIAL_MEDIA_HOST_SUFFIXES.some((suffix) => hostMatchesSuffix(hostname, suffix));
}

export function isAllowedBiliMediaHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host || host === "localhost" || host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return [...OFFICIAL_MEDIA_HOST_SUFFIXES, ...PARTNER_MEDIA_HOST_SUFFIXES].some((suffix) => hostMatchesSuffix(host, suffix));
}

export function rankMediaSourceUrls(urls: string[]): string[] {
  const unique: string[] = [];
  for (const value of urls) {
    const url = value.trim();
    if (url && !unique.includes(url)) unique.push(url);
  }
  const parsed: Array<{ url: string; official: boolean }> = [];
  for (const url of unique) {
    try {
      const target = new URL(url);
      if (target.protocol !== "https:" || !isAllowedBiliMediaHost(target.hostname)) continue;
      parsed.push({ url, official: isOfficialBiliMediaHost(target.hostname) });
    } catch {
      // 非法 URL 直接丢弃。
    }
  }
  return [
    ...parsed.filter((item) => item.official).map((item) => item.url),
    ...parsed.filter((item) => !item.official).map((item) => item.url),
  ];
}
