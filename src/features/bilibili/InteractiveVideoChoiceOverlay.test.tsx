import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveVideoChoiceOverlay } from "./InteractiveVideoChoiceOverlay";

describe("InteractiveVideoChoiceOverlay", () => {
  it("only selects a branch after the learner clicks a choice", () => {
    const onChoiceSelected = vi.fn();
    render(
      <InteractiveVideoChoiceOverlay
        title="选择下一步"
        choices={[
          { edgeId: 2, cid: 200, label: "继续前进" },
          { edgeId: 3, cid: 300, label: "返回调查" },
        ]}
        onChoiceSelected={onChoiceSelected}
      />,
    );
    expect(onChoiceSelected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "返回调查" }));
    expect(onChoiceSelected).toHaveBeenCalledWith({ edgeId: 3, cid: 300, label: "返回调查" });
  });
});
