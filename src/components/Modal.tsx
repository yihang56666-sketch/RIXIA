import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useOverlayInteraction } from "../lib/overlayStack";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useOverlayInteraction(true, onClose);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="card modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
