import { describe, expect, it } from "vitest";
import type { Card } from "../engine/types";
import { sortHandForDisplay } from "./cards";

describe("sortHandForDisplay", () => {
  it("sorts spades, hearts, diamonds, clubs with ranks high to low", () => {
    const cards: Card[] = [
      { id: "c2", suit: "clubs", rank: 2 },
      { id: "h10", suit: "hearts", rank: 10 },
      { id: "sa", suit: "spades", rank: 14 },
      { id: "da", suit: "diamonds", rank: 14 },
      { id: "s2", suit: "spades", rank: 2 },
      { id: "ha", suit: "hearts", rank: 14 },
      { id: "dk", suit: "diamonds", rank: 13 },
      { id: "ca", suit: "clubs", rank: 14 },
    ];

    expect(sortHandForDisplay(cards).map((card) => card.id)).toEqual([
      "sa", "s2", "ha", "h10", "da", "dk", "ca", "c2",
    ]);
    expect(cards.map((card) => card.id)).toEqual([
      "c2", "h10", "sa", "da", "s2", "ha", "dk", "ca",
    ]);
  });
});
