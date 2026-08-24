import { TOOLS, TOOL_ICONS } from "../../catalog";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";

export function ToolsView() {
  const { enabledTools, setView } = useAppStore();

  return (
    <RixiaWorkspacePage title="工具">
    <div className="stack">
      <section className="card">
        <p className="muted">按需使用工具，保持工作台简洁。可在「外观、密度与备份」里选择要显示的工具。</p>
      </section>
      <div className="grid">
        {TOOLS.filter((tool) => enabledTools.includes(tool.key)).map((tool) => {
          const Icon = TOOL_ICONS[tool.key];
          return (
            <button key={tool.key} className="card tool-card" onClick={() => setView(tool.key)}>
              <span
                style={{
                  display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 12,
                  background: "var(--accent-soft)", color: "var(--accent)",
                }}
              >
                <Icon size={19} strokeWidth={1.9} />
              </span>
              <strong>{tool.title}</strong>
              <span className="muted">{tool.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
    </RixiaWorkspacePage>
  );
}
