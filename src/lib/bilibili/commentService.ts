/**
 * RIXIA B 站评论区客户端 — 拉取视频评论（x/v2/reply 主评论列表），
 * 供播放器"评论导入"面板浏览，并把评论一键导入为视频笔记。
 *
 * 与公开内容服务一致：不带登录 Cookie、桌面 UA、失败抛中文错误。
 * dev/桌面环境经 /bili-api 本地代理（httpAdapter 统一路由）。
 */

import { BilibiliLookupError, type JsonRequest } from "./types";
import { createJsonRequest } from "./httpAdapter";

export type CommentSort = "hot" | "time";

export interface BilibiliComment {
  rpid: number;
  authorName: string;
  content: string;
  likeCount: number;
  replyCount: number;
  /** 评论发布时间（秒级 Unix 时间戳）。 */
  createdAtSeconds: number;
}

export interface BilibiliCommentPage {
  comments: BilibiliComment[];
  /** 评论区总条数（含楼中楼）。 */
  totalCount: number;
  page: number;
}

export interface BilibiliCommentService {
  listComments(
    aid: number,
    options?: { page?: number; sort?: CommentSort; pageSize?: number },
  ): Promise<BilibiliCommentPage>;
}

/** x/v2/reply 的 sort 取值：2=按热度（默认），0=按时间。 */
function sortValue(sort: CommentSort): number {
  return sort === "time" ? 0 : 2;
}

export function createBilibiliCommentService(
  requestJson: JsonRequest = createJsonRequest(),
): BilibiliCommentService {
  return {
    async listComments(aid, options = {}) {
      if (!Number.isInteger(aid) || aid <= 0) {
        throw new BilibiliLookupError("缺少有效的视频 aid，无法读取评论区。");
      }
      const page = Math.max(1, Math.min(50, Math.trunc(options.page ?? 1)));
      const pageSize = Math.max(1, Math.min(49, Math.trunc(options.pageSize ?? 20)));
      const url = "https://api.bilibili.com/x/v2/reply" +
        `?type=1&oid=${aid}&pn=${page}&ps=${pageSize}&sort=${sortValue(options.sort ?? "hot")}`;
      return parseCommentPage(await requestJson(url), page);
    },
  };
}

export function parseCommentPage(responseText: string, page: number): BilibiliCommentPage {
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new BilibiliLookupError("评论接口返回了无法解析的数据。");
  }
  const root = payload as { code?: unknown; message?: unknown; data?: unknown };
  if (typeof root.code !== "number" || root.code !== 0) {
    throw new BilibiliLookupError(
      typeof root.message === "string" && root.message ? `评论区读取失败：${root.message}` : "评论区读取失败。",
    );
  }
  const data = (root.data ?? {}) as {
    page?: { acount?: unknown; count?: unknown };
    replies?: unknown;
  };
  const rawReplies = Array.isArray(data.replies) ? data.replies : [];
  const comments: BilibiliComment[] = [];
  for (const raw of rawReplies) {
    const reply = raw as {
      rpid?: unknown;
      like?: unknown;
      rcount?: unknown;
      ctime?: unknown;
      member?: { uname?: unknown };
      content?: { message?: unknown };
    };
    const message = typeof reply.content?.message === "string" ? reply.content.message.trim() : "";
    if (!message) continue;
    comments.push({
      rpid: typeof reply.rpid === "number" ? reply.rpid : comments.length + 1,
      authorName: typeof reply.member?.uname === "string" ? reply.member.uname : "B站用户",
      content: message,
      likeCount: typeof reply.like === "number" ? reply.like : 0,
      replyCount: typeof reply.rcount === "number" ? reply.rcount : 0,
      createdAtSeconds: typeof reply.ctime === "number" ? reply.ctime : 0,
    });
  }
  const totalCount = typeof data.page?.acount === "number"
    ? data.page.acount
    : typeof data.page?.count === "number"
      ? data.page.count
      : comments.length;
  return { comments, totalCount, page };
}
