#!/usr/bin/env node
/**
 * 从品牌素材（scripts/beid-icon-source.png，猫咪图标）生成全平台图标 — 纯 Node，无第三方依赖。
 *
 * 产物：
 * - public/beid-icon.png / public/favicon.png（512，保留素材自带圆角透明）
 * - android mipmap-*dpi：ic_launcher.png（方底）、ic_launcher_round.png（圆形遮罩）、
 *   ic_launcher_foreground.png（自适应图标前景，108dp 全出血）
 * - android/app/src/main/res/drawable/ic_launcher_background.xml（取素材边框均色的纯色底）
 *
 * 解码支持：8-bit、非隔行、灰度/RGB/RGBA/调色板 PNG（足够覆盖常见来源）。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "scripts", "beid-icon-source.png");
const resDir = join(root, "android", "app", "src", "main", "res");
const publicDir = join(root, "public");

// ---------- PNG 解码 ----------

function decodePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("不是 PNG 文件");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      trns = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`不支持的位深：${bitDepth}`);
  if (interlace !== 0) throw new Error("不支持隔行 PNG");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的彩色类型：${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    unfilterLine(line, previous, filter, channels);
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      const base = x * channels;
      if (colorType === 6) {
        pixels[out] = line[base];
        pixels[out + 1] = line[base + 1];
        pixels[out + 2] = line[base + 2];
        pixels[out + 3] = line[base + 3];
      } else if (colorType === 2) {
        pixels[out] = line[base];
        pixels[out + 1] = line[base + 1];
        pixels[out + 2] = line[base + 2];
        pixels[out + 3] = 255;
      } else if (colorType === 0) {
        pixels[out] = pixels[out + 1] = pixels[out + 2] = line[base];
        pixels[out + 3] = 255;
      } else if (colorType === 4) {
        pixels[out] = pixels[out + 1] = pixels[out + 2] = line[base];
        pixels[out + 3] = line[base + 1];
      } else if (colorType === 3) {
        const index = line[base];
        pixels[out] = palette[index * 3];
        pixels[out + 1] = palette[index * 3 + 1];
        pixels[out + 2] = palette[index * 3 + 2];
        pixels[out + 3] = trns && index < trns.length ? trns[index] : 255;
      }
    }
    previous = line;
  }
  return { width, height, pixels };
}

function unfilterLine(line, previous, filter, channels) {
  const bpp = channels;
  const length = line.length;
  switch (filter) {
    case 0:
      return;
    case 1:
      for (let i = bpp; i < length; i++) line[i] = (line[i] + line[i - bpp]) & 0xff;
      return;
    case 2:
      for (let i = 0; i < length; i++) line[i] = (line[i] + previous[i]) & 0xff;
      return;
    case 3:
      for (let i = 0; i < length; i++) {
        const left = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = previous[i];
        const c = i >= bpp ? previous[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + predictor) & 0xff;
      }
      return;
    default:
      throw new Error(`未知 PNG 行滤波：${filter}`);
  }
}

// ---------- 缩放（缩小用面积平均，放大用双线性） ----------

function resample(source, targetWidth, targetHeight) {
  const { width: sw, height: sh, pixels } = source;
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  const downscale = targetWidth <= sw && targetHeight <= sh;
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const outIndex = (y * targetWidth + x) * 4;
      if (downscale) {
        const x0 = (x * sw) / targetWidth;
        const x1 = ((x + 1) * sw) / targetWidth;
        const y0 = (y * sh) / targetHeight;
        const y1 = ((y + 1) * sh) / targetHeight;
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let sy = Math.floor(y0); sy < Math.min(sh, Math.ceil(y1)); sy++) {
          for (let sx = Math.floor(x0); sx < Math.min(sw, Math.ceil(x1)); sx++) {
            const index = (sy * sw + sx) * 4;
            const alpha = pixels[index + 3] / 255;
            // 预乘 alpha 后平均，避免透明像素拉黑边缘
            r += pixels[index] * alpha;
            g += pixels[index + 1] * alpha;
            b += pixels[index + 2] * alpha;
            a += alpha;
            count += 1;
          }
        }
        if (a > 0) {
          out[outIndex] = Math.round(r / a);
          out[outIndex + 1] = Math.round(g / a);
          out[outIndex + 2] = Math.round(b / a);
        }
        out[outIndex + 3] = Math.round((a / Math.max(1, count)) * 255);
      } else {
        const gx = ((x + 0.5) * sw) / targetWidth - 0.5;
        const gy = ((y + 0.5) * sh) / targetHeight - 0.5;
        const x0 = Math.max(0, Math.floor(gx));
        const y0 = Math.max(0, Math.floor(gy));
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);
        const fx = Math.max(0, Math.min(1, gx - x0));
        const fy = Math.max(0, Math.min(1, gy - y0));
        for (let channel = 0; channel < 4; channel++) {
          const p00 = source.pixels[(y0 * sw + x0) * 4 + channel];
          const p10 = source.pixels[(y0 * sw + x1) * 4 + channel];
          const p01 = source.pixels[(y1 * sw + x0) * 4 + channel];
          const p11 = source.pixels[(y1 * sw + x1) * 4 + channel];
          const top = p00 + (p10 - p00) * fx;
          const bottom = p01 + (p11 - p01) * fx;
          out[outIndex + channel] = Math.round(top + (bottom - top) * fy);
        }
      }
    }
  }
  return { width: targetWidth, height: targetHeight, pixels: out };
}

/** 圆形 alpha 遮罩（3×3 超采样抗锯齿）。 */
function applyCircleMask(image) {
  const { width, height, pixels } = image;
  const radius = width / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let coverage = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const sampleX = x + (sx + 0.5) / 3;
          const sampleY = y + (sy + 0.5) / 3;
          if (Math.hypot(sampleX - centerX, sampleY - centerY) <= radius) coverage += 1;
        }
      }
      const index = (y * width + x) * 4;
      pixels[index + 3] = Math.round(pixels[index + 3] * (coverage / 9));
    }
  }
  return image;
}

/** 取素材不透明边缘像素的均色，作为自适应图标纯色背景。 */
function sampleBorderColor(image) {
  const { width, height, pixels } = image;
  let r = 0, g = 0, b = 0, count = 0;
  const sample = (x, y) => {
    const index = (y * width + x) * 4;
    if (pixels[index + 3] > 200) {
      r += pixels[index];
      g += pixels[index + 1];
      b += pixels[index + 2];
      count += 1;
    }
  };
  for (let x = 0; x < width; x += 4) {
    sample(x, 2);
    sample(x, height - 3);
  }
  for (let y = 0; y < height; y += 4) {
    sample(2, y);
    sample(width - 3, y);
  }
  if (count === 0) return "#1E2A4A";
  const hex = (value) => Math.round(value / count).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ---------- PNG 编码（8-bit RGBA，filter 0） ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 生成 ----------

const source = decodePng(readFileSync(SOURCE));
console.log(`素材：${source.width}x${source.height}`);
const backgroundColor = sampleBorderColor(source);
console.log(`自适应底色：${backgroundColor}`);

function toPng(image) {
  return encodePng(image.width, image.height, image.pixels);
}

// Web 图标：512，保留素材自带圆角
const webIcon = resample(source, 512, 512);
writeFileSync(join(publicDir, "beid-icon.png"), toPng(webIcon));
writeFileSync(join(publicDir, "favicon.png"), toPng(webIcon));
console.log("public/beid-icon.png / favicon.png (512x512)");

// Android mipmap
const DENSITIES = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];
const FOREGROUND_SIZES = [
  ["mdpi", 108],
  ["hdpi", 162],
  ["xhdpi", 216],
  ["xxhdpi", 324],
  ["xxxhdpi", 432],
];
for (const [density, size] of DENSITIES) {
  const dir = join(resDir, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ic_launcher.png"), toPng(resample(source, size, size)));
  writeFileSync(join(dir, "ic_launcher_round.png"), toPng(applyCircleMask(resample(source, size, size))));
  console.log(`mipmap-${density}: ic_launcher / ic_launcher_round (${size}x${size})`);
}
for (const [density, size] of FOREGROUND_SIZES) {
  const dir = join(resDir, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ic_launcher_foreground.png"), toPng(resample(source, size, size)));
  console.log(`mipmap-${density}: ic_launcher_foreground (${size}x${size})`);
}

// 自适应图标背景：素材均色纯色矢量
const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<!-- BEID 自适应图标背景：取品牌素材边缘均色（generate-android-icons.mjs 自动生成） -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${backgroundColor}"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;
writeFileSync(join(resDir, "drawable", "ic_launcher_background.xml"), backgroundXml);
console.log("drawable/ic_launcher_background.xml");
