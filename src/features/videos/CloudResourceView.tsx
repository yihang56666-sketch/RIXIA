import { useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, MonitorPlay, RotateCw } from "lucide-react";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";
import { resourceSourceLabel } from "../../lib/resourceSources";

function isVideoUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|m3u8|mov)(?:$|[?#])/.test(path);
  } catch {
    return false;
  }
}

export function CloudResourceView() {
  const resourceId = useAppStore((state) => state.activeCloudResourceId);
  const resource = useAppStore((state) => state.resources.find((item) => item.id === resourceId && item.url));
  const setView = useAppStore((state) => state.setView);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameReload, setFrameReload] = useState(0);

  if (!resource?.url) {
    return (
      <RixiaWorkspacePage title="网盘资源">
        <section className="card cloud-resource-empty">
          <MonitorPlay size={32} aria-hidden="true" />
          <h2>资源不存在</h2>
          <button className="primary compact" onClick={() => setView("library")}><ArrowLeft size={15} /> 返回资料库</button>
        </section>
      </RixiaWorkspacePage>
    );
  }

  const sourceLabel = resource.source ? resourceSourceLabel(resource.source) : "网盘";
  const directVideo = isVideoUrl(resource.url);

  function reloadFrame() {
    setFrameLoading(true);
    setFrameReload((count) => count + 1);
  }

  return (
    <RixiaWorkspacePage title={resource.title}>
      <section className="cloud-resource-viewer">
        <header className="cloud-resource-toolbar">
          <button className="icon-button" onClick={() => setView("library")} aria-label="返回资料库" title="返回资料库"><ArrowLeft size={18} /></button>
          <div className="cloud-resource-heading"><strong>{resource.title}</strong><span>{sourceLabel}</span></div>
          {!directVideo && (
            <button className="icon-button" onClick={reloadFrame} aria-label="重新加载" title="重新加载"><RotateCw size={16} /></button>
          )}
          <button className="icon-button" onClick={() => window.open(resource.url, "_blank", "noopener,noreferrer")} aria-label="在浏览器打开" title="在浏览器打开"><ExternalLink size={17} /></button>
        </header>
        <div className="cloud-resource-frame">
          {directVideo ? (
            <video controls playsInline preload="metadata" src={resource.url} aria-label={resource.title} />
          ) : (
            <>
              {frameLoading && (
                <div className="cloud-resource-loading" aria-hidden="true">
                  <Loader2 size={26} className="spin" />
                  <span>正在应用内加载{sourceLabel}…</span>
                </div>
              )}
              <iframe
                key={frameReload}
                title={`${sourceLabel}资源：${resource.title}`}
                src={resource.url}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                referrerPolicy="no-referrer"
                onLoad={() => setFrameLoading(false)}
              />
            </>
          )}
        </div>
        <p className="cloud-resource-hint">资源始终在 App 内播放。若{sourceLabel}要求登录，请直接在上方页面完成授权；长时间空白时点右上角重新加载。</p>
      </section>
    </RixiaWorkspacePage>
  );
}
