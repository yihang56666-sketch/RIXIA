import type { ReactNode } from "react";
import { useAppStore } from "../../store/useAppStore";
import type { ViewKey } from "../../types";
import { Mi } from "./m3";

export function RixiaWorkspacePage({
  title,
  backView = "settings",
  backLabel = "返回我的",
  embedded = false,
  children,
}: {
  title: string;
  backView?: ViewKey;
  backLabel?: string;
  embedded?: boolean;
  children: ReactNode;
}) {
  const setView = useAppStore((state) => state.setView);
  if (embedded) return <>{children}</>;
  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView(backView)} aria-label={backLabel}>
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>{title}</h1>
      </header>
      <div className="fb-page-scroll">{children}</div>
    </div>
  );
}
