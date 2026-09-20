# 从品牌源图（scripts/beid-icon-cat-src.png）生成全平台图标：
# - public/beid-icon.png / favicon.png（512，web + Electron）
# - android mipmap ic_launcher / ic_launcher_round（48-192，圆角与圆形两种）
# - android mipmap ic_launcher_foreground（108-432，图形收进 66/108 安全区）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/generate-icons-from-source.ps1
param(
  [string]$SourcePath = (Join-Path $PSScriptRoot "beid-icon-cat-src.png")
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$resDir = Join-Path $root "android\app\src\main\res"
$publicDir = Join-Path $root "public"

$src = [System.Drawing.Bitmap]::new($SourcePath)

function New-Resized([System.Drawing.Bitmap]$bitmap, [int]$size) {
  $out = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $rect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $g.DrawImage($bitmap, $rect)
  $g.Dispose()
  return $out
}

function New-CircleCropped([System.Drawing.Bitmap]$bitmap) {
  $size = $bitmap.Width
  $out = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddEllipse(0, 0, $size, $size)
  $g.SetClip($path)
  $rect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $g.DrawImage($bitmap, $rect)
  $g.ResetClip()
  $path.Dispose()
  $g.Dispose()
  return $out
}

# 自适应图标前景：先铺一层拉伸的原图当底（保留纵向渐变，边缘无缝），
# 再把原图缩到 62% 居中（环形 + 猫 + 文字整体收进 66/108 安全区）。
function New-AdaptiveForeground([System.Drawing.Bitmap]$bitmap, [int]$size) {
  $out = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  # 底色用与原图一致的纵向渐变（顶部 #20375F -> 底部 #181D43），让原图自身的
  # 圆角矩形边缘完全融入背景，只留下环形 + 猫 + 文字的整体图形。
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 0, $size, $size),
    [System.Drawing.Color]::FromArgb(255, 32, 55, 99),
    [System.Drawing.Color]::FromArgb(255, 24, 29, 67),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($brush, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
  $brush.Dispose()
  $art = [int][Math]::Floor($size * 0.62)
  $offset = [int][Math]::Floor(($size - $art) / 2)
  $inner = [System.Drawing.Rectangle]::new($offset, $offset, $art, $art)
  $g.DrawImage($bitmap, $inner)
  $g.Dispose()
  return $out
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Output "wrote $path"
}

# --- web / Electron ---
$web512 = New-Resized $src 512
Save-Png $web512 (Join-Path $publicDir "beid-icon.png")
$favicon = New-Resized $src 512
Save-Png $favicon (Join-Path $publicDir "favicon.png")

# --- Android 启动图标 ---
$densities = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
foreach ($density in $densities.Keys) {
  $size = $densities[$density]
  $dir = Join-Path $resDir "mipmap-$density"
  $launcher = New-Resized $src $size
  Save-Png $launcher (Join-Path $dir "ic_launcher.png")
  $round = New-CircleCropped (New-Resized $src $size)
  Save-Png $round (Join-Path $dir "ic_launcher_round.png")
}
# --- Android 自适应前景（108dp 视口 × 密度） ---
$fgSizes = @{ "mdpi" = 108; "hdpi" = 162; "xhdpi" = 216; "xxhdpi" = 324; "xxxhdpi" = 432 }
foreach ($density in $fgSizes.Keys) {
  $size = $fgSizes[$density]
  $dir = Join-Path $resDir "mipmap-$density"
  $foreground = New-AdaptiveForeground $src $size
  Save-Png $foreground (Join-Path $dir "ic_launcher_foreground.png")
}

$src.Dispose()
Write-Output "done"
