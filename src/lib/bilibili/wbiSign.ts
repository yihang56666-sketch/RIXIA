import CryptoJS from "crypto-js";
import type { JsonRequest } from "./types";

const MIXIN_ORDER = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

let cachedMixinKey: { value: string; expireAt: number } | null = null;

export function signWbiQuery(params: Record<string, string>, mixinKey: string): string {
  const withTimestamp: Record<string, string> = {
    ...params,
    wts: params.wts ?? String(Math.floor(Date.now() / 1000)),
  };
  const query = Object.keys(withTimestamp)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(withTimestamp[key] ?? "").replace(/[!'()*]/g, ""))}`)
    .join("&");
  const rid = CryptoJS.MD5(`${query}${mixinKey}`).toString();
  return `${query}&w_rid=${rid}`;
}

export async function signBiliWbiUrl(
  host: string,
  path: string,
  params: Record<string, string>,
  requestJson: JsonRequest,
): Promise<string> {
  const mixinKey = await loadMixinKey(requestJson);
  return `https://${host}${path}?${signWbiQuery(params, mixinKey)}`;
}

export function clearWbiKeyCache(): void {
  cachedMixinKey = null;
}

async function loadMixinKey(requestJson: JsonRequest): Promise<string> {
  if (cachedMixinKey && cachedMixinKey.expireAt > Date.now()) return cachedMixinKey.value;
  const navText = await requestJson("https://api.bilibili.com/x/web-interface/nav");
  let decoded: unknown;
  try {
    decoded = JSON.parse(navText);
  } catch {
    throw new Error("WBI 密钥接口返回的数据格式不正确。");
  }
  if (typeof decoded !== "object" || decoded === null) throw new Error("WBI 密钥接口返回的数据格式不正确。");
  const root = decoded as Record<string, unknown>;
  const code = typeof root.code === "number" ? root.code : Number.parseInt(String(root.code ?? ""), 10);
  if (code !== 0 && code !== -101) throw new Error("WBI 密钥暂时不可用。");
  const data = typeof root.data === "object" && root.data !== null ? root.data as Record<string, unknown> : {};
  const wbi = typeof data.wbi_img === "object" && data.wbi_img !== null ? data.wbi_img as Record<string, unknown> : {};
  const imageKey = wbiFilename(typeof wbi.img_url === "string" ? wbi.img_url : "");
  const subKey = wbiFilename(typeof wbi.sub_url === "string" ? wbi.sub_url : "");
  const rawKey = `${imageKey}${subKey}`;
  if (rawKey.length < 64) throw new Error("WBI 密钥暂时不可用。");
  const mixinKey = MIXIN_ORDER.map((index) => rawKey[index] ?? "").join("").slice(0, 32);
  cachedMixinKey = { value: mixinKey, expireAt: Date.now() + 2 * 60 * 60 * 1000 };
  return mixinKey;
}

function wbiFilename(url: string): string {
  const match = url.match(/\/([^/]+)\.[A-Za-z0-9]+$/);
  return match?.[1] ?? "";
}
