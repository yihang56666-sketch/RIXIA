import { useEffect, useState } from "react";
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
  const [loadError, setLoadError] = useState("");
  const directVideo = Boolean(resource?.url && isVideoUrl(resource.url));

  useEffect(() => {
    setFrameLoading(true);
    setLoadError("");
  }, [resourceId, resource?.url]);

  useEffect(() => {
    if (!resource?.url || directVideo || !frameLoading) return;
    const timeout = window.setTimeout(() => {
      setFrameLoading(false);
      setLoadError("资源加载超时，请检查网络后重试，或在浏览器打开。");
    }, 15_000);
    return () => window.clearTimeout(timeout);
  }, [resourceId, resource?.url, directVideo, frameLoading, frameReload]);

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
  const resourceKey = `${resource.id}:${resource.url}:${frameReload}`;

  function reloadFrame() {
    setFrameLoading(true);
    setLoadError("");
    setFrameReload((count) => count + 1);
  }

  function handleLoadError() {
    setFrameLoading(false);
    setLoadError("资源加载失败，请检查网络后重试，或在浏览器打开。");
  }

  return (
    <RixiaWorkspacePage title={resource.title}>
      <section className="cloud-resource-viewer">
        <header className="cloud-resource-toolbar">
          <button className="icon-button" onClick={() => setView("library")} aria-label="返回资料库" title="返回资料库"><ArrowLeft size={18} /></button>
          <div className="cloud-resource-heading"><strong>{resource.title}</strong><span>{sourceLabel}</span></div>
          <button className="icon-button" onClick={reloadFrame} aria-label="重新加载" title="重新加载"><RotateCw size={16} /></button>
          <button className="icon-button" onClick={() => window.open(resource.url, "_blank", "noopener,noreferrer")} aria-label="在浏览器打开" title="在浏览器打开"><ExternalLink size={17} /></button>
        </header>
        {loadError && <p className="background-error" role="alert">{loadError}</p>}
        <div className="cloud-resource-frame">
          {directVideo ? (
            <video key={resourceKey} controls playsInline preload="metadata" src={resource.url} aria-label={resource.title} onError={handleLoadError} />
          ) : (
            <>
              {frameLoading && (
                <div className="cloud-resource-loading" aria-hidden="true">
                  <Loader2 size={26} className="spin" />
                  <span>正在应用内加载{sourceLabel}…</span>
                </div>
              )}
              <iframe
                key={resourceKey}
                title={`${sourceLabel}资源：${resource.title}`}
                src={resource.url}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                referrerPolicy="no-referrer"
                onLoad={() => { setFrameLoading(false); setLoadError(""); }}
              />
            </>
          )}
        </div>
        <p className="cloud-resource-hint">在线资源需要网络连接，不会自动离线缓存。网盘页面可能限制应用内嵌入；若{sourceLabel}页面空白、无法播放或无法登录，可使用右上角「在浏览器打开」。</p>
      </section>
    </RixiaWorkspacePage>
  );
}
