import { createBilibiliDeepLinkService, type DeepLinkTarget } from "./deepLinkService";

export interface IncomingBilibiliHandlers {
  openVideo?: (bvid: string, cid?: number, page?: number) => void;
  openSearch?: (keyword: string) => void;
  openUser?: (mid: number) => void;
}

type RedirectFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isBilibiliShortLink(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return host === "b23.tv" || host === "www.b23.tv" || host === "bili23.cn" || host === "www.bili23.cn";
  } catch {
    return false;
  }
}

/** Resolves Bilibili share short-links before applying the normal deep-link parser. */
export async function resolveIncomingBilibiliUrl(
  input: string,
  redirectFetcher: RedirectFetcher = fetch,
): Promise<DeepLinkTarget> {
  const direct = createBilibiliDeepLinkService().parse(input);
  if (!isBilibiliShortLink(input) || direct.kind !== "unknown") return direct;
  try {
    const response = await redirectFetcher(input, { method: "GET", redirect: "follow" });
    if (!response.ok || !response.url) return direct;
    return createBilibiliDeepLinkService().parse(response.url);
  } catch {
    return direct;
  }
}

/** Routes a URL received from a native share sheet or deep-link intent. */
export function routeIncomingBilibiliUrl(input: string, handlers: IncomingBilibiliHandlers): boolean {
  const service = createBilibiliDeepLinkService();
  return service.apply(service.parse(input), handlers);
}

/** Async counterpart used by native intents so b23.tv links can be followed first. */
export async function routeIncomingBilibiliUrlAsync(
  input: string,
  handlers: IncomingBilibiliHandlers,
  redirectFetcher?: RedirectFetcher,
): Promise<boolean> {
  const service = createBilibiliDeepLinkService();
  return service.apply(await resolveIncomingBilibiliUrl(input, redirectFetcher), handlers);
}
