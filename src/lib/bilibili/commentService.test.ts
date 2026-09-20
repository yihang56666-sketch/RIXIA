import { describe, expect, it, vi } from "vitest";
import { createBilibiliCommentService, parseCommentPage } from "./commentService";
import { BilibiliLookupError } from "./types";

function reply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    code: 0,
    data: {
      page: { acount: 321, count: 20, num: 1, size: 20 },
      replies: [
        {
          rpid: 9001,
          like: 1520,
          rcount: 12,
          ctime: 1726700000,
          member: { uname: "上岸的路人" },
          content: { message: "这一讲的例题必考，反复看！\n配套讲义在置顶。" },
          ...overrides,
        },
      ],
    },
  });
}

describe("commentService", () => {
  it("requests the reply API through the JSON adapter and parses the page", async () => {
    const requestJson = vi.fn().mockResolvedValue(reply());
    const page = await createBilibiliCommentService(requestJson).listComments(40429357187, { sort: "time" });

    expect(requestJson).toHaveBeenCalledWith(
      "https://api.bilibili.com/x/v2/reply?type=1&oid=40429357187&pn=1&ps=20&sort=0",
    );
    expect(page.totalCount).toBe(321);
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({
      rpid: 9001,
      authorName: "上岸的路人",
      likeCount: 1520,
      replyCount: 12,
      createdAtSeconds: 1726700000,
    });
    expect(page.comments[0]!.content).toContain("例题必考");
  });

  it("clamps page and page size into sane bounds", async () => {
    const requestJson = vi.fn().mockResolvedValue(reply());
    await createBilibiliCommentService(requestJson).listComments(42, { page: 99, pageSize: 500 });

    expect(requestJson).toHaveBeenCalledWith(
      expect.stringContaining("&pn=50&ps=49&sort=2"),
    );
  });

  it("rejects non-zero codes and invalid aid", async () => {
    const service = createBilibiliCommentService(vi.fn().mockResolvedValue('{"code":-404,"message":"啥都木有"}'));
    await expect(service.listComments(42)).rejects.toThrow(BilibiliLookupError);
    await expect(service.listComments(0)).rejects.toThrow(BilibiliLookupError);
  });

  it("parses defensively: malformed replies and bodies are skipped", () => {
    const page = parseCommentPage(reply({ content: { message: "   " }, member: null }), 2);
    expect(page.comments).toHaveLength(0);
    expect(page.totalCount).toBe(321);
  });
});
