import { describe, expect, it } from "vitest";
import {
  createBilibiliPublicContentService,
  extractBvid,
} from "./publicContentService";
import { BilibiliLookupError, VideoDurationRange, VideoPublishedRange, VideoSearchOrder } from "./types";

const SAMPLE_VIDEO_INFO = JSON.stringify({
  code: 0,
  message: "0",
  data: {
    bvid: "BV1GJ411x7h7",
    aid: 12345,
    cid: 67890,
    duration: 600,
    title: "高数强化 第 3 讲",
    pic: "//i0.hdslb.com/bfs/archive/abc.jpg",
    pubdate: 1700000000,
    desc: "本节讲解极限的 ε-δ 定义。",
    desc_v2: [],
    owner: {
      mid: 999,
      name: "考研老师",
      face: "//i0.hdslb.com/bfs/face/def.jpg",
    },
    stat: {
      view: 12345,
      danmaku: 678,
      reply: 90,
      favorite: 1234,
      coin: 567,
      share: 89,
      like: 2345,
    },
    pages: [
      { cid: 67890, page: 1, part: "第 1 节", duration: 600 },
      { cid: 67891, page: 2, part: "第 2 节", duration: 720 },
    ],
    ugc_season: null,
  },
});

const SAMPLE_VIDEO_TAGS = JSON.stringify({
  code: 0,
  data: [
    { tag_name: "考研" },
    { tag_name: "数学" },
    { tag_name: "" },
    { tag_name: "高等数学" },
  ],
});

const SAMPLE_VIDEO_SEARCH = JSON.stringify({
  code: 0,
  data: {
    page: 1,
    numPages: 3,
    result: [
      {
        bvid: "BV1GJ411x7h7",
        title: "<em>高数</em>强化",
        author: "考研老师",
        pic: "//i0.hdslb.com/bfs/archive/abc.jpg",
        duration: "10:00",
        play: 12345,
        video_review: 678,
        pubdate: 1700000000,
        tag: "12 集",
      },
    ],
  },
});

const SAMPLE_USER_SEARCH = JSON.stringify({
  code: 0,
  data: {
    page: 1,
    numPages: 2,
    result: [
      {
        mid: 999,
        uname: "<em>考研</em>老师",
        upic: "//i0.hdslb.com/bfs/face/def.jpg",
        usign: "教数学的",
        fans: 100000,
        videos: 200,
        level: 6,
        is_upuser: 1,
        official_verify: { desc: "优质教育领域" },
      },
    ],
  },
});

const SAMPLE_SUGGEST = JSON.stringify({
  code: 0,
  tag: {
    value: [
      { name: "考研数学" },
      { name: "考研英语" },
    ],
  },
});

describe("extractBvid", () => {
  it("extracts from bare BV", () => {
    expect(extractBvid("BV1GJ411x7h7")).toBe("BV1GJ411x7h7");
  });

  it("extracts from URL", () => {
    expect(extractBvid("https://www.bilibili.com/video/BV1GJ411x7h7?p=2")).toBe("BV1GJ411x7h7");
  });

  it("returns null when no BV", () => {
    expect(extractBvid("https://www.bilibili.com/video/av12345")).toBeNull();
  });
});

describe("BilibiliPublicContentService", () => {
  function makeService(responses: Record<string, string>) {
    const fetcher = (url: string) => {
      for (const [key, value] of Object.entries(responses)) {
        if (url.includes(key)) return Promise.resolve(value);
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    return createBilibiliPublicContentService(fetcher);
  }

  it("lookupVideo parses video info + tags", async () => {
    const service = makeService({
      "/x/web-interface/view": SAMPLE_VIDEO_INFO,
      "/x/tag/archive/tags": SAMPLE_VIDEO_TAGS,
    });
    const v = await service.lookupVideo("https://www.bilibili.com/video/BV1GJ411x7h7");
    expect(v.bvid).toBe("BV1GJ411x7h7");
    expect(v.aid).toBe(12345);
    expect(v.cid).toBe(67890);
    expect(v.title).toBe("高数强化 第 3 讲");
    expect(v.ownerName).toBe("考研老师");
    expect(v.ownerMid).toBe(999);
    expect(v.parts).toHaveLength(2);
    expect(v.parts[0]!.cid).toBe(67890);
    expect(v.parts[1]!.title).toBe("第 2 节");
    expect(v.stats.viewCount).toBe(12345);
    expect(v.stats.likeCount).toBe(2345);
    expect(v.tags).toEqual(["考研", "数学", "高等数学"]);
    expect(v.thumbnailUrl).toContain("@320w_200h_1c.webp");
  });

  it("lookupVideo rejects malformed BV", async () => {
    const service = makeService({});
    await expect(service.lookupVideo("not a bv")).rejects.toBeInstanceOf(BilibiliLookupError);
  });

  it("lookupVideo handles server error code", async () => {
    const service = makeService({
      "/x/web-interface/view": JSON.stringify({ code: -404, message: "啥都没有" }),
    });
    await expect(service.lookupVideo("BV1GJ411x7h7")).rejects.toMatchObject({
      name: "BilibiliLookupError",
    });
  });

  it("searchVideos parses results with stripped HTML", async () => {
    const service = makeService({ "/x/web-interface/wbi/search/type": SAMPLE_VIDEO_SEARCH });
    const page = await service.searchVideos("高数", 1, {
      order: VideoSearchOrder.relevance,
      durationRange: VideoDurationRange.tenToThirtyMinutes,
      publishedRange: VideoPublishedRange.lastWeek,
    });
    expect(page.results).toHaveLength(1);
    expect(page.results[0]!.bvid).toBe("BV1GJ411x7h7");
    expect(page.results[0]!.title).toBe("高数强化");
    expect(page.results[0]!.ownerName).toBe("考研老师");
    expect(page.results[0]!.durationSeconds).toBe(600);
    expect(page.results[0]!.playCount).toBe(12345);
    expect(page.results[0]!.episodeCountText).toBe("12 集");
    expect(page.totalPages).toBe(3);
  });  it("searchVideos rejects empty keyword", async () => {
    const service = makeService({});
    await expect(service.searchVideos("  ")).rejects.toBeInstanceOf(BilibiliLookupError);
  });

  it("searchUsers parses user results", async () => {
    const service = makeService({ "/x/web-interface/wbi/search/type": SAMPLE_USER_SEARCH });
    const page = await service.searchUsers("考研");
    expect(page.results).toHaveLength(1);
    expect(page.results[0]!.mid).toBe(999);
    expect(page.results[0]!.name).toBe("考研老师");
    expect(page.results[0]!.followerCount).toBe(100000);
    expect(page.results[0]!.level).toBe(6);
    expect(page.results[0]!.isUploader).toBe(true);
    expect(page.results[0]!.certification).toBe("优质教育领域");
  });

  it("suggestKeywords parses suggestion tags", async () => {
    const service = makeService({ "/main/suggest": SAMPLE_SUGGEST });
    const suggestions = await service.suggestKeywords("考");
    expect(suggestions).toEqual(["考研数学", "考研英语"]);
  });

  it("suggestKeywords returns empty for blank input", async () => {
    const service = makeService({});
    expect(await service.suggestKeywords("  ")).toEqual([]);
  });
});
