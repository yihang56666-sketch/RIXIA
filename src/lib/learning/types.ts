import type { CourseResource, TimestampNote } from "../../types";

export type ProviderErrorCode =
  | "offline"
  | "invalid-input"
  | "unavailable"
  | "network";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
  externalUrl?: string;
}

export interface LearningCapabilities {
  canSearch: boolean;
  canOpenPlayer: boolean;
  canReadProgress: boolean;
  canSaveTimestampNote: boolean;
  source: "web" | "native";
}

export interface LearningFilters {
  keyword?: string;
}

export interface CourseResult {
  bvid: string;
  title: string;
  cover?: string;
  author?: string;
  externalUrl: string;
}

export interface CourseResourceRef {
  resourceId: string;
  bvid: string;
  title: string;
  externalUrl: string;
}

export interface PlayerSession {
  resourceId: string;
  bvid: string;
  iframeUrl?: string;
  externalUrl: string;
}

export interface LearningProgress {
  resourceId: string;
  seconds: number;
  durationSeconds?: number;
  updatedAt: string;
}

export interface TimestampNoteInput {
  resourceId: string;
  seconds: number;
  body: string;
}

export interface LearningProvider {
  capabilities(): Promise<LearningCapabilities>;
  search(query: string, filters?: LearningFilters): Promise<CourseResult[]>;
  resolve(input: string): Promise<CourseResourceRef>;
  openPlayer(resourceId: string, episodeId?: string): Promise<PlayerSession>;
  getProgress(resourceId: string): Promise<LearningProgress | null>;
  saveTimestampNote(note: TimestampNoteInput): Promise<TimestampNote>;
}

export class ProviderErrorImpl extends Error implements ProviderError {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly externalUrl?: string;

  constructor(code: ProviderErrorCode, message: string, opts: { retryable?: boolean; externalUrl?: string } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.externalUrl = opts.externalUrl;
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "retryable" in value
  );
}

export type { CourseResource };
