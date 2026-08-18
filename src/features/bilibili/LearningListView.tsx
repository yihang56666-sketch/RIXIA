import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import {
  createBilibiliPublicContentService,
  extractBvid,
} from "../../lib/bilibili/publicContentService";
import {
  createLearningListService,
} from "../../lib/bilibili/services";
import type { LearningListEntry } from "../../lib/bilibili/types";
import { createId } from "../../lib/id";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

/**
 * RIXIA 学习列表页 — 复刻 FocuBili 的 learning_list_page.dart。
 *
 * 用户可以维护一个学习清单：
 * - 添加视频（BV 或链接）
 * - 标记完成 / 重新打开
 * - 删除条目
 * - 点击进入内嵌播放器
 */
export function LearningListView() {
  const service = useMemo(() => createLearningListService(), []);
  const bilibiliService = useMemo(() => createBilibiliPublicContentService(), []);
  const setView = useAppStore((state) => state.setView);
  const addResource = useAppStore((state) => state.addResource);
  const [entries, setEntries] = useState<LearningListEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    service.list().then(setEntries);
  }, [service]);

  async function add() {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const bvid = extractBvid(input);
      if (!bvid) {
        setError("没有识别到 BV 号");
        return;
      }
      const video = await bilibiliService.lookupVideo(input);
      const entry: LearningListEntry = {
        id: createId(),
        bvid: video.bvid,
        title: video.title,
        ownerName: video.ownerName,
        coverUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        addedAt: new Date().toISOString(),
      };
      await service.add(entry);
      addResource(bvid, video.title);
      const list = await service.list();
      setEntries(list);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setLoading(false);
    }
  }

  async function markOpened(id: string) {
    await service.markOpened(id);
    setEntries(await service.list());
  }

  async function markCompleted(id: string) {
    await service.markCompleted(id);
    setEntries(await service.list());
  }

  async function remove(id: string) {
    await service.remove(id);
    setEntries(await service.list());
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>学习列表</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          维护一份要学习的 B 站视频清单。添加后会自动加入资料库。
        </p>
        <div className="bilibili-note-input" style={{ marginTop: 10 }}>
          <input
            className="field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴 BV 号或视频链接"
          />
          <button className="primary compact" onClick={add} disabled={loading || !input.trim()}>
            <Plus size={14} /> 添加
          </button>
        </div>
        {error && <p className="background-error">{error}</p>}
      </section>

      {entries.length === 0 ? (
        <section className="card">
          <p className="muted" style={{ textAlign: "center", padding: 16 }}>
            还没有学习清单条目
          </p>
        </section>
      ) : (
        <ul className="bilibili-result-list">
          {entries.map((e) => (
            <li key={e.id} className="bilibili-result-item">
              {e.coverUrl ? (
                <img
                  src={e.coverUrl}
                  alt={e.title}
                  className="bilibili-result-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                />
              ) : (
                <div className="bilibili-result-cover" />
              )}
              <div className="bilibili-result-info">
                <button
                  className="bilibili-result-title"
                  onClick={() => { markOpened(e.id); setView("bilibili-player"); }}
                >
                  {e.title}
                </button>
                <p className="muted bilibili-result-meta">
                  {e.ownerName} · {Math.floor(e.durationSeconds / 60)} 分钟 · 添加于 {relativeTime(e.addedAt)}
                  {e.lastOpenedAt ? ` · 最近看 ${relativeTime(e.lastOpenedAt)}` : ""}
                  {e.completedAt ? ` · 已完成 ${relativeTime(e.completedAt)}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="icon-button"
                  onClick={() => markCompleted(e.id)}
                  aria-label={e.completedAt ? "已完成" : "标记完成"}
                  title={e.completedAt ? "已完成" : "标记完成"}
                >
                  {e.completedAt ? <CheckCircle2 size={16} color="var(--good)" /> : <Circle size={16} />}
                </button>
                <button
                  className="icon-button"
                  onClick={() => remove(e.id)}
                  aria-label="删除"
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
