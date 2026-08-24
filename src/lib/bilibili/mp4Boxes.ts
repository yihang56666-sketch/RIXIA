/**
 * fMP4 box 级解析工具 — 给 DashPlayer 的"跳到未缓冲区域"提供字节定位：
 *
 * - B 站 DASH 的 m4s 是 [ftyp][moov][sidx][moof+mdat]* 结构。sidx 记录了每个
 *   分段（moof+mdat）的字节区间与时间戳，是 seek 到任意时间点的精确地图。
 * - 网络分块边界不保证对齐 box 头，扫描 moof 时需要携带上一块的最后 7 字节
 *   兜住"size+type 恰好跨块"的情况。
 */

/** sidx 里解析出的一个分段：字节区间 [byteStart, byteEnd)，时间区间 [timeStart, timeEnd)（秒）。 */
export interface SegmentIndexEntry {
  byteStart: number;
  byteEnd: number;
  timeStart: number;
  timeEnd: number;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

/**
 * 解析 init 段（ftyp+moov+sidx，到首个 moof 为止）里的 sidx，产出分段索引。
 * 没有 sidx 或数据不完整时返回 null（调用方回退到码率线性估算）。
 */
export function parseSegmentIndex(initBytes: Uint8Array): SegmentIndexEntry[] | null {
  let offset = 0;
  while (offset + 8 <= initBytes.length) {
    const size = readUint32(initBytes, offset);
    if (size < 8 || offset + size > initBytes.length) return null;
    const type = boxType(initBytes, offset + 4);
    if (type === "sidx") {
      const entries = parseSidxBox(initBytes, offset, size);
      return entries && entries.length > 0 ? entries : null;
    }
    // moov 等容器 box 继续向内走没有意义——sidx 一定是顶层 box，直接跳过。
    offset += size;
  }
  return null;
}

function parseSidxBox(bytes: Uint8Array, boxStart: number, boxSize: number): SegmentIndexEntry[] | null {
  const dataStart = boxStart + 8; // 跳过 size+type
  const version = bytes[dataStart]!;
  let cursor = dataStart + 4; // version(1)+flags(3)
  cursor += 4; // reference_ID
  const timescale = readUint32(bytes, cursor);
  cursor += 4;
  if (timescale <= 0) return null;
  let earliestPresentationTime: number;
  let firstOffset: number;
  if (version === 0) {
    earliestPresentationTime = readUint32(bytes, cursor);
    firstOffset = readUint32(bytes, cursor + 4);
    cursor += 8;
  } else {
    if (cursor + 16 > boxStart + boxSize) return null;
    earliestPresentationTime = readUint32(bytes, cursor) * 2 ** 32 + readUint32(bytes, cursor + 4);
    firstOffset = readUint32(bytes, cursor + 8) * 2 ** 32 + readUint32(bytes, cursor + 12);
    cursor += 16;
  }
  cursor += 2; // reserved
  // reference_count 是 16 位字段，不能借道 readUint32 再截断——会把首个引用项
  // 的 size 字节混进来。
  const referenceCount = ((bytes[cursor]! << 8) | bytes[cursor + 1]!) & 0xffff;
  cursor += 2;
  const anchor = boxStart + boxSize + firstOffset; // 参照物：sidx 结束后的第一个字节
  const entries: SegmentIndexEntry[] = [];
  let byteCursor = anchor;
  let timeCursor = earliestPresentationTime / timescale;
  for (let i = 0; i < referenceCount; i += 1) {
    if (cursor + 12 > bytes.length) return entries.length > 0 ? entries : null;
    const reference = readUint32(bytes, cursor);
    const referencedSize = reference & 0x7fffffff;
    const subsegmentDuration = readUint32(bytes, cursor + 4);
    cursor += 12;
    if (referencedSize <= 0 || subsegmentDuration <= 0) continue;
    entries.push({
      byteStart: byteCursor,
      byteEnd: byteCursor + referencedSize,
      timeStart: timeCursor,
      timeEnd: timeCursor + subsegmentDuration / timescale,
    });
    byteCursor += referencedSize;
    timeCursor += subsegmentDuration / timescale;
  }
  return entries;
}

/**
 * 在 chunk（可携带上一块最后 7 字节的尾巴，兜住 box 头跨块的情况）里找第一个
 * moof box 的起点。返回相对 chunk 起点的偏移；可能为负数——表示 moof 头起始于
 * 上一块被消费的尾巴里。找不到返回 null。moof 前的 4 字节必须是一个合理的
 * box size，排除 mdat 里恰好出现 "moof" 字样的伪命中。
 */
export function findFirstMoofOffset(chunk: Uint8Array, tail: Uint8Array = EMPTY_BYTES): number | null {
  const tailLength = tail.length;
  const total = tailLength + chunk.length;
  const read = (at: number): number => (at < tailLength ? tail[at]! : chunk[at - tailLength]!);
  for (let i = 0; i + 8 <= total; i += 1) {
    if (read(i + 4) === 0x6d && read(i + 5) === 0x6f && read(i + 6) === 0x6f && read(i + 7) === 0x66) {
      const size = ((read(i) << 24) | (read(i + 1) << 16) | (read(i + 2) << 8) | read(i + 3)) >>> 0;
      if (size >= 8 && size <= 64 * 1024 * 1024) return i - tailLength;
    }
  }
  return null;
}

const EMPTY_BYTES = new Uint8Array(0);

/** 找到时间点所属分段的起始字节；索引缺失或时间越界时返回 null。 */
export function mapTimeToSegmentByte(entries: SegmentIndexEntry[], timeSeconds: number): number | null {
  if (entries.length === 0) return null;
  if (timeSeconds <= entries[0]!.timeStart) return entries[0]!.byteStart;
  for (const entry of entries) {
    if (timeSeconds >= entry.timeStart && timeSeconds < entry.timeEnd) return entry.byteStart;
  }
  return entries[entries.length - 1]!.byteStart;
}

/** chunk 的最后 7 字节（恰好兜住一个 box 头 size+type 跨块的情况）。 */
export function chunkTail(chunk: Uint8Array): Uint8Array {
  return chunk.length <= 7 ? chunk : chunk.subarray(chunk.length - 7);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    merged.set(part, cursor);
    cursor += part.length;
  }
  return merged;
}

/** 构造 ftyp+moov+sidx+moof 形状的合成字节流，供解析单测使用。 */
export function buildSyntheticIndexedInit(segmentCount: number, segmentBytes: number, segmentDuration: number, timescale: number): Uint8Array {
  const references: Array<{ size: number; duration: number }> = [];
  for (let i = 0; i < segmentCount; i += 1) references.push({ size: segmentBytes, duration: segmentDuration });
  const sidxSize = 8 + 4 + 4 + 4 + 4 + 4 + 2 + 2 + references.length * 12;
  const ftyp = makeBox("ftyp", 8);
  const moov = makeBox("moov", 24);
  const sidx = new Uint8Array(sidxSize);
  const view = new DataView(sidx.buffer);
  view.setUint32(0, sidxSize);
  sidx.set(ascii("sidx"), 4);
  view.setUint8(8, 0); // version
  view.setUint32(12, 1); // reference_ID
  view.setUint32(16, timescale);
  view.setUint32(20, 0); // earliest_presentation_time
  view.setUint32(24, 0); // first_offset
  view.setUint16(28, 0); // reserved
  view.setUint16(30, references.length);
  let cursor = 32;
  for (const reference of references) {
    view.setUint32(cursor, reference.size & 0x7fffffff);
    view.setUint32(cursor + 4, reference.duration);
    view.setUint32(cursor + 8, 0);
    cursor += 12;
  }
  const moof = makeBox("moof", 48);
  return concatBytes([ftyp, moov, sidx, moof]);
}

function makeBox(type: string, payloadSize: number): Uint8Array {
  const box = new Uint8Array(8 + payloadSize);
  new DataView(box.buffer).setUint32(0, box.length);
  box.set(ascii(type), 4);
  return box;
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
}
