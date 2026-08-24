import { describe, expect, it } from "vitest";
import { FocusSessionStatus } from "./focusSessionModel";
import { shouldAutoCompleteFocus } from "./focusCompletionPolicy";

describe("focus completion policy", () => {
  it("completes only a running session whose clock reached zero", () => {
    expect(shouldAutoCompleteFocus(FocusSessionStatus.running, 0)).toBe(true);
    expect(shouldAutoCompleteFocus(FocusSessionStatus.running, 1)).toBe(false);
    expect(shouldAutoCompleteFocus(FocusSessionStatus.paused, 0)).toBe(false);
  });
});
