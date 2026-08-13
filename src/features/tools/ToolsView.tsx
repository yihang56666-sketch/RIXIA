import { TOOLS } from "../../catalog";
import { useAppStore } from "../../store/useAppStore";

export function ToolsView() {
  const { enabledTools, setView } = useAppStore();

  return (
    <div className="stack">
      <section className="card">
        <p className="muted">按需打开工具，保持工作台简洁。</p>
      </section>
      <div className="grid">
        {TOOLS.filter((tool) => enabledTools.includes(tool.key)).map((tool) => (
          <button key={tool.key} className="card tool-card" onClick={() => setView(tool.key)}>
            <strong>{tool.title}</strong>
            <span className="muted">{tool.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
