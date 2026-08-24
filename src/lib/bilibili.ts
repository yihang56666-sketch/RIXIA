const BVID_PATTERN = /BV[1-9a-zA-Z]{10}/;

/** 从任意文本（完整链接、分享口令、纯 BV 号）中提取 BV 号 */
export function extractBvid(input: string): string | null {
  const match = input.trim().match(BVID_PATTERN);
  return match ? match[0] : null;
}

/** 跳转哔哩哔哩搜索页（发现新内容用） */
export function buildSearchUrl(keyword: string): string {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
}
