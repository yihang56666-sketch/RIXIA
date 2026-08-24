import { describe, expect, it } from "vitest";
import { CreatorVideoOrder } from "./extendedModels";
import {
  createBilibiliPublicContentService,
  extractBvid,
} from "./publicContentService";
import { clearWbiKeyCache } from "./wbiSign";
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
        tag: "线性代数,考研",
        episode_count_text: "共 12 集",
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

const SAMPLE_CREATOR_CARD = JSON.stringify({
  code: 0,
  data: {
    card: { mid: 999, name: "考研老师", face: "//i0.hdslb.com/bfs/face/def.jpg", sign: "教数学的", Official: { desc: "教育认证" } },
    follower: 100000,
    archive_count: 200,
    article_count: 3,
    like_num: 500000,
  },
});

const SAMPLE_CREATOR_VIDEOS = JSON.stringify({
  code: 0,
  data: {
    list: { vlist: [{ bvid: "BV1GJ411x7h7", title: "高数强化", pic: "//i0.hdslb.com/bfs/archive/abc.jpg", length: "10:00", author: "考研老师", play: 12345, video_review: 678, created: 1700000000, aid: 12345 }] },
    page: { count: 1 },
  },
});

const SAMPLE_COLLECTION_VIDEOS = JSON.stringify({
  code: 0,
  data: {
    archives: [{ bvid: "BV1GJ411x7h7", title: "高数强化", cover: "//i0.hdslb.com/bfs/archive/abc.jpg", duration: 600, stat: { view: 12345 }, pubdate: 1700000000 }],
    meta: { total: 1 },
  },
});

const SAMPLE_CREATOR_COLLECTIONS = JSON.stringify({
  code: 0,
  data: {
    items_lists: { seasons_list: [{ season_id: 123, title: "线性代数", cover: "//i0.hdslb.com/bfs/archive/abc.jpg", description: "系统课程", total: 2, stat: { view: 8 }, archives: [] }] },
    has_more: false,
  },
});

const SAMPLE_WBI_NAV = JSON.stringify({
  code: 0,
  data: { wbi_img: { img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz0123456789abcdef.png", sub_url: "https://i0.hdslb.com/bfs/wbi/qrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRST.png" } },
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

  it("starts the optional tag request while video metadata is still loading", async () => {
    let releaseVideoInfo!: (value: string) => void;
    let tagRequestStarted = false;
    const service = createBilibiliPublicContentService((url) => {
      if (url.includes("/x/web-interface/nav")) {
        return Promise.resolve(SAMPLE_WBI_NAV);
      }
      if (url.includes("/x/web-interface/wbi/view") || url.includes("/x/web-interface/view")) {
        return new Promise<string>((resolve) => {
          releaseVideoInfo = resolve;
        });
      }
      if (url.includes("/x/tag/archive/tags")) {
        tagRequestStarted = true;
        return Promise.resolve(SAMPLE_VIDEO_TAGS);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const lookup = service.lookupVideo("BV1GJ411x7h7");
    await Promise.resolve();
    expect(tagRequestStarted).toBe(true);
    for (let i = 0; i < 10 && typeof releaseVideoInfo !== "function"; i += 1) {
      await Promise.resolve();
    }

    releaseVideoInfo(SAMPLE_VIDEO_INFO);
    await expect(lookup).resolves.toMatchObject({ tags: ["考研", "数学", "高等数学"] });
  });

  it("lookupVideo prefers the WBI view endpoint when keys are available", async () => {
    clearWbiKeyCache();
    const requested: string[] = [];
    const service = createBilibiliPublicContentService(async (url) => {
      requested.push(url);
      if (url.includes("/x/web-interface/nav")) return SAMPLE_WBI_NAV;
      if (url.includes("/x/web-interface/wbi/view")) return SAMPLE_VIDEO_INFO;
      if (url.includes("/x/tag/archive/tags")) return SAMPLE_VIDEO_TAGS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    const video = await service.lookupVideo("BV1GJ411x7h7");
    expect(video.bvid).toBe("BV1GJ411x7h7");
    expect(requested.some((url) => url.includes("/x/web-interface/wbi/view") && url.includes("w_rid="))).toBe(true);
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
    expect(page.results[0]!.episodeCountText).toBe("共 12 集");
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

  it("suggestKeywords parses the current nested result tags returned by Bilibili", async () => {
    const service = makeService({
      "/main/suggest": JSON.stringify({
        code: 0,
        result: { tag: [{ value: "高等数学" }, { value: "线性代数" }] },
      }),
    });

    expect(await service.suggestKeywords("高数")).toEqual(["高等数学", "线性代数"]);
  });

  it("suggestKeywords returns empty for blank input", async () => {
    const service = makeService({});
    expect(await service.suggestKeywords("  ")).toEqual([]);
  });

  it("loads a creator profile and paged uploads", async () => {
    const service = makeService({
      "/x/web-interface/card": SAMPLE_CREATOR_CARD,
      "/x/space/arc/search": SAMPLE_CREATOR_VIDEOS,
    });
    const profile = await service.loadCreatorProfile(999);
    const videos = await service.listCreatorVideos(999, 1);
    expect(profile.name).toBe("考研老师");
    expect(profile.followerCount).toBe(100000);
    expect(videos.items[0]!.bvid).toBe("BV1GJ411x7h7");
    expect(videos.items[0]!.durationSeconds).toBe(600);
    expect(videos.items[0]!.stats.viewCount).toBe(12345);
    expect(videos.items[0]!.stats.danmakuCount).toBe(678);
    expect(videos.hasMore).toBe(false);
  });

  it("sends the creator video keyword and selected sort order to the public endpoint", async () => {
    let requestedUrl = "";
    const service = createBilibiliPublicContentService((url) => {
      requestedUrl = url;
      return Promise.resolve(SAMPLE_CREATOR_VIDEOS);
    });

    await service.listCreatorVideos(999, 1, { keyword: "线性代数", order: CreatorVideoOrder.mostPlayed });

    expect(requestedUrl).toContain("keyword=%E7%BA%BF%E6%80%A7%E4%BB%A3%E6%95%B0");
    expect(requestedUrl).toContain("order=click");
  });

  it("loads videos from a UGC collection", async () => {
    const service = makeService({ "/x/polymer/web-space/seasons_archives_list": SAMPLE_COLLECTION_VIDEOS });
    const page = await service.listCollectionVideos(999, 123, 1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.title).toBe("高数强化");
    expect(page.items[0]!.stats.viewCount).toBe(12345);
  });

  it("loads UGC collections created by a creator", async () => {
    const service = makeService({ "/x/polymer/web-space/seasons_series_list": SAMPLE_CREATOR_COLLECTIONS });
    const page = await service.listCreatorCollections(999, 1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe(123);
    expect(page.items[0]!.title).toBe("线性代数");
    expect(page.items[0]!.totalCount).toBe(2);
  });

  it("explains remaining upload risk control after both endpoints fail", async () => {
    const service = createBilibiliPublicContentService((url) => {
      if (url.includes("/x/web-interface/nav")) return Promise.resolve(SAMPLE_WBI_NAV);
      return Promise.resolve(JSON.stringify({ code: -352, message: "风控校验失败" }));
    });
    await expect(service.listCreatorVideos(999, 1)).rejects.toThrow(/请确认已经登录/);
  });

  it("retries WBI after a 412 from the legacy space endpoint", async () => {
    const requested: string[] = [];
    const service = createBilibiliPublicContentService((url) => {
      requested.push(url);
      if (url.includes("/x/space/wbi/arc/search")) return Promise.resolve(SAMPLE_CREATOR_VIDEOS);
      if (url.includes("/x/web-interface/nav")) return Promise.resolve(SAMPLE_WBI_NAV);
      return Promise.reject(new Error("HTTP 412"));
    });
    const page = await service.listCreatorVideos(999, 1);
    expect(requested.some((url) => url.includes("w_rid="))).toBe(true);
    expect(page.items[0]!.bvid).toBe("BV1GJ411x7h7");
  });

  it("uses the public WBI key even when nav reports the account as signed out", async () => {
    const requested: string[] = [];
    const unsignedNav = JSON.stringify({
      code: -101,
      message: "账号未登录",
      data: { wbi_img: { img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz0123456789abcdef.png", sub_url: "https://i0.hdslb.com/bfs/wbi/qrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRST.png" } },
    });
    const service = createBilibiliPublicContentService((url) => {
      requested.push(url);
      if (url.includes("/x/space/wbi/arc/search")) return Promise.resolve(SAMPLE_CREATOR_VIDEOS);
      if (url.includes("/x/web-interface/nav")) return Promise.resolve(unsignedNav);
      return Promise.resolve(JSON.stringify({ code: -352, message: "-352" }));
    });
    const page = await service.listCreatorVideos(999, 1);
    expect(requested.some((url) => url.includes("w_rid="))).toBe(true);
    expect(page.items[0]!.bvid).toBe("BV1GJ411x7h7");
  });

  it("falls back to a signed WBI upload request after space rate limiting", async () => {
    const requested: string[] = [];
    const service = createBilibiliPublicContentService((url) => {
      requested.push(url);
      if (url.includes("/x/space/wbi/arc/search")) return Promise.resolve(SAMPLE_CREATOR_VIDEOS);
      if (url.includes("/x/web-interface/nav")) return Promise.resolve(SAMPLE_WBI_NAV);
      return Promise.resolve(JSON.stringify({ code: -799, message: "请求过于频繁" }));
    });
    const page = await service.listCreatorVideos(999, 1);
    expect(requested.length).toBeGreaterThanOrEqual(3);
    expect(requested.some((url) => url.includes("w_rid="))).toBe(true);
    expect(page.items[0]!.bvid).toBe("BV1GJ411x7h7");
  });

  it("retries creator collections with browser context after risk control", async () => {
    let calls = 0;
    const service = createBilibiliPublicContentService((url) => {
      calls += 1;
      if (calls === 1) return Promise.resolve(JSON.stringify({ code: -352, message: "-352" }));
      expect(url).toContain("platform=web");
      return Promise.resolve(SAMPLE_CREATOR_COLLECTIONS);
    });
    const page = await service.listCreatorCollections(999, 1);
    expect(page.items[0]!.id).toBe(123);
    expect(calls).toBe(2);
  });

  it("retries collection videos with browser context after risk control", async () => {
    let calls = 0;
    const service = createBilibiliPublicContentService((url) => {
      calls += 1;
      if (calls === 1) return Promise.resolve(JSON.stringify({ code: -352, message: "-352" }));
      expect(url).toContain("platform=web");
      return Promise.resolve(SAMPLE_COLLECTION_VIDEOS);
    });
    const page = await service.listCollectionVideos(999, 123, 1);
    expect(page.items[0]!.bvid).toBe("BV1GJ411x7h7");
    expect(calls).toBe(2);
  });
});
