const MAX_EDGE = 2560

/**
 * 背景 data URL 的体积预算（≈300KB 原始数据）。它随每个 store 快照一起写入
 * localStorage——超预算的大图会让整个应用的持久化静默失败，必须压缩到位。
 * 预算需要足够宽松：压低压缩比换来的体积感会让壁纸在大屏幕上发糊发雾。
 */
export const MAX_DATA_URL_CHARS = 1_600_000

export function fitBackgroundSize(width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * 预算守门：超预算返回 null（调用方应放弃该图而不是塞进 store）。
 * 不支持 WebP 编码的引擎（旧版 Safari、Firefox）里 canvas 会静默回退成
 * PNG，体积轻松翻几倍——此时的"最小结果"仍然可能远超预算，绝不能放行。
 */
export function enforceDataUrlBudget(dataUrl: string): string | null {
  return dataUrl.length <= MAX_DATA_URL_CHARS ? dataUrl : null
}

export async function compressBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')

  const source = await readFile(file)
  const image = await loadImage(source)
  const fitted = fitBackgroundSize(image.naturalWidth, image.naturalHeight)

  // 先降质量再缩尺寸，压进预算为止；质量下限要高，低端质量就是大雾的元凶。
  const scales = [1, 0.85, 0.7]
  let fallback: string | null = null
  for (const scale of scales) {
    const width = Math.max(1, Math.round(fitted.width * scale))
    const height = Math.max(1, Math.round(fitted.height * scale))
    for (const quality of [0.92, 0.88, 0.84, 0.8]) {
      const dataUrl = drawToDataUrl(image, width, height, quality)
      if (!fallback || dataUrl.length < fallback.length) fallback = dataUrl
      if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl
    }
  }
  // 全部候选都超预算（典型：引擎只肯输出 PNG）。宁可拒绝背景，也不能让
  // 一张图把整个应用的持久化静默炸掉。
  throw new Error('图片压缩后仍然过大，请换一张较小的图片')
}

function drawToDataUrl(
  image: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/webp', quality)
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error('图片无法解析'))
    image.onload = () => resolve(image)
    image.src = source
  })
}
