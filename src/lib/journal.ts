/** 从 markdown 正文中提取 #tag 标签（借鉴自 usememos/memos）。 */
export function extractTags(body: string): string[] {
  // 先把 `code span` 内的内容替换为空，避免识别颜色码等。
  const sanitized = body.replace(/`[^`]*`/g, "");
  // 仅匹配形如 #标签 的片段，标签前后必须是空白或行首，且不以 # 开头的 markdown 标题（# 后必须紧跟非空白字符）
  const matches = sanitized.match(/(?:^|\s)#([^\s#][^\s]+)/gm);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const tag = match.trim().slice(1);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/** 从 markdown 正文中提取 [[wiki 链接]]（借鉴自 AFFiNE 的 daily-doc）。 */
export function extractWikiLinks(body: string): string[] {
  // 仅匹配同一行内的 [[text]]，不允许换行。
  const matches = body.match(/\[\[([^\]\n]+)\]\]/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const inner = match.slice(2, -2).trim();
    if (inner && !seen.has(inner)) {
      seen.add(inner);
      out.push(inner);
    }
  }
  return out;
}
