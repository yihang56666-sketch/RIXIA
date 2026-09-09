import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useOverlayInteraction } from "../../lib/overlayStack";

export function Mi({
  name,
  fill,
  size,
  className,
  style,
}: {
  name: string;
  fill?: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={fill ? `mi mi-fill${className ? ` ${className}` : ""}` : `mi${className ? ` ${className}` : ""}`}
      style={size || style ? { ...(size ? { fontSize: size } : {}), ...style } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

interface SnackbarMessage {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface M3Feedback {
  showMessage: (text: string, options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) => void;
}

const M3FeedbackContext = createContext<M3Feedback>({ showMessage: () => {} });

export function useM3Feedback(): M3Feedback {
  return useContext(M3FeedbackContext);
}

export function M3FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const counter = useRef(0);

  const showMessage = useCallback<M3Feedback["showMessage"]>((text, options) => {
    counter.current += 1;
    setMessage({
      id: counter.current,
      text,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
      durationMs: options?.durationMs ?? 4000,
    });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), message.durationMs);
    return () => window.clearTimeout(timer);
  }, [message]);

  const value = useMemo(() => ({ showMessage }), [showMessage]);

  return (
    <M3FeedbackContext.Provider value={value}>
      {children}
      {message && (
        <div className="m3-snackbar" role="status">
          <span>{message.text}</span>
          {message.actionLabel && (
            <button
              onClick={() => {
                message.onAction?.();
                setMessage(null);
              }}
            >
              {message.actionLabel}
            </button>
          )}
        </div>
      )}
    </M3FeedbackContext.Provider>
  );
}

export function M3Dialog({
  icon,
  title,
  children,
  actions,
  centerContent,
  centerActions,
  onClose,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  centerContent?: boolean;
  centerActions?: boolean;
  onClose?: () => void;
}) {
  // Escape 只由全局浮层栈派发给栈顶浮层，避免多层弹窗被一次按键全部关闭。
  const titleId = useId();
  const dialogRef = useOverlayInteraction<HTMLDivElement>(true, onClose);

  return (
    <div
      className="m3-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className="m3-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        {icon && <div className="m3-dialog-icon">{icon}</div>}
        <h2 id={titleId} className="m3-dialog-title">{title}</h2>
        {children && (
          <div className={centerContent ? "m3-dialog-content center" : "m3-dialog-content"}>{children}</div>
        )}
        {actions && (
          <div className={centerActions ? "m3-dialog-actions center" : "m3-dialog-actions"}>{actions}</div>
        )}
      </div>
    </div>
  );
}
