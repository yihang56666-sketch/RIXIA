const DIAGNOSTIC_ERRORS_KEY = "focubili.diagnostics.errors.v1";
const MAX_ERRORS = 20;

export interface DiagnosticErrorEntry {
  message: string;
  occurredAt: string;
  source: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DiagnosticsService {
  list(): DiagnosticErrorEntry[];
  record(error: unknown, source: string): void;
  clear(): void;
}

export function createDiagnosticsService(storage: StorageLike = localStorage): DiagnosticsService {
  function list(): DiagnosticErrorEntry[] {
    try {
      const raw = storage.getItem(DIAGNOSTIC_ERRORS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isEntry).slice(-MAX_ERRORS).reverse();
    } catch {
      return [];
    }
  }

  return {
    list,
    record(error, source) {
      try {
        const current = list().reverse();
        const message = redactDiagnosticText(error instanceof Error ? error.message : String(error));
        if (!message) return;
        current.push({ message, occurredAt: new Date().toISOString(), source: redactDiagnosticText(source) || "app" });
        storage.setItem(DIAGNOSTIC_ERRORS_KEY, JSON.stringify(current.slice(-MAX_ERRORS)));
      } catch {
        // Diagnostics must never interfere with the user flow that failed.
      }
    },
    clear() {
      try { storage.removeItem(DIAGNOSTIC_ERRORS_KEY); } catch { /* ignore */ }
    },
  };
}

function isEntry(value: unknown): value is DiagnosticErrorEntry {
  return Boolean(value && typeof value === "object" && typeof (value as DiagnosticErrorEntry).message === "string" && typeof (value as DiagnosticErrorEntry).occurredAt === "string" && typeof (value as DiagnosticErrorEntry).source === "string");
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, (url) => url.split(/[?#]/, 1)[0] ?? "")
    .replace(/(SESSDATA|bili_jct|DedeUserID|sid)=([^;\s,&]+)/gi, "$1=[redacted]")
    .trim()
    .slice(0, 500);
}
