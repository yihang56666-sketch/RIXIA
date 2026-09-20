import { createJsonRequest } from "./httpAdapter";

export interface SubtitleTrack {
  id: number;
  language: string;
  label: string;
  locked: boolean;
  url: string;
}

export interface SubtitleCue {
  from: number;
  to: number;
  content: string;
}

export interface SubtitleService {
  listTracks(bvid: string, cid: number): Promise<SubtitleTrack[]>;
  loadCues(track: SubtitleTrack): Promise<SubtitleCue[]>;
}

export function createSubtitleService(requestJson: (url: string) => Promise<string> = createJsonRequest()): SubtitleService {
  return {
    async listTracks(bvid, cid) {
      if (!/^BV[0-9A-Za-z]{10}$/i.test(bvid) || !Number.isInteger(cid) || cid <= 0) return [];
      const response = await requestJson(`https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`);
      return parseTracks(response);
    },
    async loadCues(track) {
      if (!track.url || track.locked) return [];
      const response = await requestJson(track.url);
      return parseCues(response);
    },
  };
}

function parseTracks(response: string): SubtitleTrack[] {
  let decoded: unknown;
  try { decoded = JSON.parse(response); } catch { return []; }
  const root = asRecord(decoded);
  if (root.code !== 0) return [];
  const data = asRecord(root.data);
  const subtitle = asRecord(data.subtitle);
  const raw = Array.isArray(subtitle.subtitles) ? subtitle.subtitles : [];
  return raw.map((item) => {
    const entry = asRecord(item);
    const id = number(entry.id);
    const language = text(entry.lan);
    const label = text(entry.lan_doc) || language || "字幕";
    const rawUrl = text(entry.subtitle_url);
    return { id, language, label, locked: Boolean(entry.is_lock), url: rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl };
  }).filter((track) => track.id > 0 && track.url);
}

function parseCues(response: string): SubtitleCue[] {
  let decoded: unknown;
  try { decoded = JSON.parse(response); } catch { return []; }
  const root = asRecord(decoded);
  const raw = Array.isArray(root.body) ? root.body : [];
  return raw.map((item) => {
    const entry = asRecord(item);
    return { from: number(entry.from), to: number(entry.to), content: text(entry.content).trim() };
  }).filter((cue) => Number.isFinite(cue.from) && Number.isFinite(cue.to) && cue.to > cue.from && cue.content.length > 0 && cue.content.length <= 300).slice(0, 20_000);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

const SUBTITLE_ARROW = "-->";

/** 解析 SRT/WebVTT 定时戳（支持 HH:MM:SS,mmm 与 MM:SS.mmm 两种写法）。 */
function parseSubtitleTimestamp(value: string): number {
  const match = value.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!match) return NaN;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]!);
  const seconds = Number(match[3]!);
  const millis = Number(match[4]!.padEnd(3, "0"));
  if (![hours, minutes, seconds, millis].every((part) => Number.isFinite(part))) return NaN;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * 解析本地字幕文件（SRT / WebVTT），返回与 CC 轨一致的 cue 列表。
 * 文件按空行分块；每块可选序号行，随后是定时行与正文，正文去除内联标签。
 */
export function parseSubtitleDocument(raw: string): SubtitleCue[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  if (!text.trim()) return [];
  const out: SubtitleCue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    const timingIndex = lines.findIndex((line) => line.includes(SUBTITLE_ARROW));
    if (timingIndex < 0) continue;
    const timingParts = lines[timingIndex]!.split(SUBTITLE_ARROW);
    const from = parseSubtitleTimestamp(timingParts[0] ?? "");
    let to = parseSubtitleTimestamp(timingParts[1] ?? "");
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (to <= from) to = from + 0.1;
    const content = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (!content) continue;
    out.push({ from, to, content });
    if (out.length >= 20_000) break;
  }
  return out;
}

