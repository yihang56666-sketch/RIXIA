import { X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { FEATURE_MAP_CATEGORIES } from "./featureMapCatalog";
import type { TourTaskId } from "./featureTourTasks";

interface FeatureMapDialogProps {
  open: boolean;
  onClose: () => void;
  onStartTour: (taskId?: TourTaskId) => void;
}

export function FeatureMapDialog({ open, onClose, onStartTour }: FeatureMapDialogProps) {
  const setView = useAppStore((state) => state.setView);
  if (!open) return null;

  return (
    <div className="feature-map-overlay" role="presentation" onClick={onClose}>
      <section
        className="feature-map-card"
        role="dialog"
        aria-modal="true"
        aria-label="教学中心"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="feature-map-head">
          <div>
            <h2>教学中心</h2>
            <p>先看要做什么，再点对应功能开始教学或直达页面。</p>
          </div>
          <button className="feature-map-close" onClick={onClose} aria-label="关闭功能地图">
            <X size={16} />
          </button>
        </header>
        <div className="feature-map-grid">
          {FEATURE_MAP_CATEGORIES.map((category) => (
            <section key={category.id} className="feature-map-section">
              <h3>{category.title}</h3>
              <p>{category.purpose}</p>
              <div className="feature-map-items">
                {category.items.map((item) => (
                  <button
                    key={item.id}
                    className="feature-map-item"
                    onClick={() => {
                      if (item.tourTaskId) {
                        onStartTour(item.tourTaskId);
                      } else {
                        setView(item.route);
                      }
                    }}
                    aria-label={`${item.title} · ${item.purpose}`}
                  >
                    <span className="feature-map-item-icon">
                      <item.icon size={16} />
                    </span>
                    <span className="feature-map-item-body">
                      <strong>{item.title}</strong>
                      <span>{item.purpose}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
