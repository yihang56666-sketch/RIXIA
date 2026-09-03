import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./ProgressRing";

describe("ProgressRing", () => {
  it("renders the center content and the arc", () => {
    const { container } = render(
      <ProgressRing percent={50} size={120} stroke={12}>
        <span>50%</span>
      </ProgressRing>,
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    const arc = container.querySelector(".progress-ring-arc") as SVGCircleElement | null;
    expect(arc).not.toBeNull();
    expect(arc?.getAttribute("stroke-dashoffset")).not.toBeNull();
  });

  it("clamps the displayed percent between 0 and 100", () => {
    const size = 80;
    const stroke = 8;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    const full = render(<ProgressRing percent={150} size={size} stroke={stroke} />).container.querySelector(".progress-ring-arc") as SVGCircleElement | null;
    expect(full?.getAttribute("stroke-dashoffset")).toBe("0");

    const empty = render(<ProgressRing percent={-20} size={size} stroke={stroke} />).container.querySelector(".progress-ring-arc") as SVGCircleElement | null;
    expect(empty?.getAttribute("stroke-dashoffset")).toBe(String(circumference));
  });

  it("applies the base class together with a custom className", () => {
    const { container } = render(
      <ProgressRing percent={0} className="ring-custom">
        <span>0%</span>
      </ProgressRing>,
    );

    expect(container.firstChild).toHaveClass("progress-ring", "ring-custom");
    expect(container.querySelector(".progress-ring-arc")?.getAttribute("stroke-dashoffset")).not.toBe("0");
  });
});
