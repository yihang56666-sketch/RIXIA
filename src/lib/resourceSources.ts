export type ResourceSource = "bilibili" | "quark" | "baidu" | "direct";

export function identifyResourceSource(input: string): ResourceSource | null {
  let url: URL;
  try { url = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`); } catch { return null; }
  // 网盘分享链接带提取码，明文 HTTP 会把它暴露出去；一律拒绝非 HTTPS。
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "bilibili.com" || host.endsWith(".bilibili.com")) return "bilibili";
  if (host === "pan.quark.cn" || host.endsWith(".quark.cn")) return "quark";
  if (host === "pan.baidu.com" || host.endsWith(".baidu.com")) return "baidu";
  // Scheme-less input is convenient for real domains, but short identifiers
  // such as "BV1" must not become fake HTTPS resources.
  return host.includes(".") ? "direct" : null;
}

/** 把用户输入（可能无 scheme）规范化成可安全打开的绝对 HTTPS 地址。 */
export function normalizeResourceLink(input: string): string | null {
  let url: URL;
  try { url = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`); } catch { return null; }
  if (url.protocol !== "https:") return null;
  return url.toString();
}

export function resourceSourceLabel(source: ResourceSource): string {
  return source === "bilibili" ? "哔哩哔哩" : source === "quark" ? "夸克网盘" : source === "baidu" ? "百度网盘" : "HTTPS 直链";
}

export function isProtectedCloudSource(source: ResourceSource): boolean {
  return source === "quark" || source === "baidu";
}
