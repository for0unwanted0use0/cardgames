import { describe, expect, it } from "vitest";
import { playerFacingError } from "./errors";

describe("player-facing errors", () => {
  it("uses structured Convex error messages without technical wrappers", () => {
    expect(playerFacingError({ data: { code: "invalidAction", message: "These two cards have different ranks." } }))
      .toBe("These two cards have different ranks.");
    expect(playerFacingError({ data: "This room is full." })).toBe("This room is full.");
  });

  it("removes the Convex runtime prefix and has a safe fallback", () => {
    expect(playerFacingError(new Error("[CONVEX M(rooms:play)] Server Error\nUncaught ConvexError: Select at least one card to discard.")))
      .toBe("Select at least one card to discard.");
    expect(playerFacingError(null)).toBe("The room action failed. Please try again.");
  });
});
