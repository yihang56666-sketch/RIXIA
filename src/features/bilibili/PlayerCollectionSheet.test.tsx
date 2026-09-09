import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerCollectionSheet } from "./PlayerCollectionSheet";
import type { VideoCollection } from "../../lib/bilibili/types";

const collection: VideoCollection = {
  id: 1,
  title: "前端入门合集",
  description: "",
  coverUrl: "",
  ownerMid: 1,
  totalCount: 3,
  stats: { viewCount: 0, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 },
  entries: [
    { aid: 1, bvid: "BV-current", cid: 11, title: "第一讲", thumbnailUrl: "", durationSeconds: 120, publishedAt: "2025-01-01T00:00:00.000Z", stats: { viewCount: 10, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } },
    { aid: 2, bvid: "BV-next", cid: 12, title: "第二讲", thumbnailUrl: "", durationSeconds: 240, publishedAt: "2025-02-01T00:00:00.000Z", stats: { viewCount: 30, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } },
    { aid: 3, bvid: "BV-last", cid: 13, title: "第三讲", thumbnailUrl: "", durationSeconds: 180, publishedAt: "2024-12-01T00:00:00.000Z", stats: { viewCount: 20, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } },
  ],
};

describe("PlayerCollectionSheet", () => {
  it("filters, sorts, and opens a non-current collection entry", () => {
    const onClose = vi.fn();
    const onOpenVideo = vi.fn();
    render(<PlayerCollectionSheet collection={collection} currentBvid="BV-current" onClose={onClose} onOpenVideo={onOpenVideo} />);

    expect(screen.getByRole("dialog", { name: "合集 · 前端入门合集" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "合集 · 前端入门合集" })).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "正在播放 第一讲" })).toBeDisabled();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索合集视频" }), { target: { value: "第二" } });
    expect(screen.queryByText("第一讲")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开 第二讲" }));

    expect(onOpenVideo).toHaveBeenCalledWith("BV-next", "第二讲");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("adds a non-current entry to the learning list without closing the sheet", () => {
    const onAddToLearningList = vi.fn();
    render(
      <PlayerCollectionSheet
        collection={collection}
        currentBvid="BV-current"
        onClose={vi.fn()}
        onOpenVideo={vi.fn()}
        onAddToLearningList={onAddToLearningList}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "加入学习清单 第二讲" }));

    expect(onAddToLearningList).toHaveBeenCalledWith(collection.entries[1]);
    expect(screen.getByRole("dialog", { name: "合集 · 前端入门合集" })).toBeInTheDocument();
  });

  it("does not render add-to-learning-list buttons without a handler", () => {
    render(<PlayerCollectionSheet collection={collection} currentBvid="BV-current" onClose={vi.fn()} onOpenVideo={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /加入学习清单/ })).not.toBeInTheDocument();
  });
});
