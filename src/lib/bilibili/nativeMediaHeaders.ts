export const NATIVE_MEDIA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function nativeMediaRequestHeaders(
  bvid: string,
  cookie?: string | null,
): Record<string, string> {
  const id = bvid.trim();
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Origin: "https://www.bilibili.com",
    Referer: /^BV[0-9A-Za-z]{10}$/i.test(id)
      ? `https://www.bilibili.com/video/${id}/`
      : "https://www.bilibili.com/",
    "User-Agent": NATIVE_MEDIA_USER_AGENT,
  };
  const session = cookie?.trim() ?? "";
  if (/SESSDATA=/.test(session)) headers.Cookie = session;
  return headers;
}
