import { describe, expect, it } from "vitest";
import { cropRectForFrame } from "./videoShotService";

describe("cropRectForFrame", () => {
  it("maps a sprite cell to source coordinates", () => {
    expect(cropRectForFrame({
      imageUrl: "https://i0.hdslb.com/shot.jpg",
      column: 3,
      row: 2,
      frameWidth: 160,
      frameHeight: 90,
      sheetColumns: 5,
      sheetRows: 4,
    })).toEqual({ sx: 480, sy: 180, width: 160, height: 90 });
  });
});
