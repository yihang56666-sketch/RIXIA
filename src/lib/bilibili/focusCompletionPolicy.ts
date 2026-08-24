import { FocusSessionStatus } from "./focusSessionModel";

export function shouldAutoCompleteFocus(status: FocusSessionStatus, remainingMs: number): boolean {
  return status === FocusSessionStatus.running && Number.isFinite(remainingMs) && remainingMs <= 0;
}
