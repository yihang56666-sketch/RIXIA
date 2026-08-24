/**
 * 分享卡片 PNG 捕获 — 复刻 FocuBili 的 RepaintBoundary + RenderRepaintBoundary.toImage 语义。
 *
 * Flutter 通过 RepaintBoundary 把组件树渲染成 PNG；Web 端没有等价原生 API，
 * 使用 SVG <foreignObject> 把 DOM 序列化为图片是浏览器唯一纯前端方案，
 * 避免引入 html-to-image / html2canvas 这类重量级依赖（与本项目的轻量原则一致）。
 *
 * 失败时返回 null，由调用方回退到纯文本分享。
 */

const PNG_PIXEL_RATIO = 2;

export async function captureNodeAsPng(node: HTMLElement, fileName: string): Promise<{ blob: Blob; dataUrl: string; fileName: string } | null> {
  if (typeof window === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const rect = node.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const cloned = node.cloneNode(true) as HTMLElement;
  inlineComputedStyles(node, cloned);
  const svg = buildForeignObjectSvg(cloned, width, height);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const bitmap = await renderToBitmap(svgUrl, width, height, PNG_PIXEL_RATIO);
    if (!bitmap) return null;
    const blob = await bitmapToBlob(bitmap);
    if (!blob) return null;
    return { blob, dataUrl: bitmap.toDataURL("image/png"), fileName: `${fileName}.png` };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function buildForeignObjectSvg(source: HTMLElement, width: number, height: number): string {
  const serialized = new XMLSerializer().serializeToString(source);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">${serialized}</foreignObject>
  </svg>`;
}

function inlineComputedStyles(source: HTMLElement, target: HTMLElement): void {
  const sourceStyle = window.getComputedStyle(source);
  const targetStyle = window.getComputedStyle(target);
  const props = new Set<string>();
  for (let i = 0; i < sourceStyle.length; i += 1) {
    const prop = sourceStyle.item(i);
    if (prop) props.add(prop);
  }
  for (let i = 0; i < targetStyle.length; i += 1) {
    const prop = targetStyle.item(i);
    if (prop) props.add(prop);
  }
  const inline: string[] = [];
  props.forEach((prop) => {
    const value = sourceStyle.getPropertyValue(prop);
    if (value) inline.push(`${prop}: ${value}`);
  });
  target.setAttribute("style", inline.join("; "));
  Array.from(source.children).forEach((child, index) => {
    const targetChild = target.children[index];
    if (child instanceof HTMLElement && targetChild instanceof HTMLElement) {
      inlineComputedStyles(child, targetChild);
    }
  });
}

async function renderToBitmap(svgUrl: string, width: number, height: number, pixelRatio: number): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.scale(pixelRatio, pixelRatio);
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas);
    };
    image.onerror = () => resolve(null);
    image.src = svgUrl;
  });
}

function bitmapToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export interface ShareImageDependencies {
  share?: (data: { title: string; text: string; files: File[] }) => Promise<void>;
}

interface NavigatorWithCanShare {
  share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  canShare?: (data: ShareData & { files?: File[] }) => boolean;
}

export async function shareImageFile(
  payload: { title: string; text: string; image: { blob: Blob; fileName: string } },
  dependencies: ShareImageDependencies = browserImageShareDependencies(),
): Promise<boolean> {
  if (!dependencies.share) return false;
  try {
    const file = new File([payload.image.blob], payload.image.fileName, { type: "image/png" });
    await dependencies.share({ title: payload.title, text: payload.text, files: [file] });
    return true;
  } catch (error) {
    console.warn("Image share failed", error);
    return false;
  }
}

function browserImageShareDependencies(): ShareImageDependencies {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & NavigatorWithCanShare;
  if (typeof nav.share !== "function") return {};
  if (typeof nav.canShare === "function" && typeof File !== "undefined") {
    const probe = new File([new Blob(["x"], { type: "text/plain" })], "probe.txt");
    if (!nav.canShare({ files: [probe] })) return {};
  }
  return {
    share: (data) => nav.share!(data),
  };
}
