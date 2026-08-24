import { describe, expect, it } from "vitest";
import { shouldPresentInteractiveChoice, interactiveChoiceTarget } from "./interactivePlaybackPolicy";
import type { InteractiveVideoNode } from "./extendedModels";

const node: InteractiveVideoNode = {
  title: "选择下一步",
  edgeId: 1,
  isLeaf: false,
  choices: [{ edgeId: 2, cid: 200, label: "继续" }],
  choicePromptLeadTimeMs: 5000,
  pauseVideoForChoice: true,
};

describe("interactive playback policy", () => {
  it("presents choices near the end only once", () => {
    expect(shouldPresentInteractiveChoice(node, 96, 100, false)).toBe(true);
    expect(shouldPresentInteractiveChoice(node, 94, 100, false)).toBe(false);
    expect(shouldPresentInteractiveChoice(node, 99, 100, true)).toBe(false);
  });

  it("returns the selected branch cid and edge id", () => {
    expect(interactiveChoiceTarget(node.choices[0])).toEqual({ cid: 200, edgeId: 2 });
  });
});
