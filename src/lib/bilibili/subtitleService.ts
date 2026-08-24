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

