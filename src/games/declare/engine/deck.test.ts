import { describe, expect, it } from "vitest";
import {
  createDeck,
  dealCards,
  DECLARE_DECK_SIZE,
  DECLARE_HAND_SIZE,
  shuffleDeck,
} from "./deck";

describe("Declare deck", () => {
  it("contains 52 standard cards and exactly 3 Jokers", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(DECLARE_DECK_SIZE);
    expect(deck.filter((card) => card.kind === "standard")).toHaveLength(52);
    expect(deck.filter((card) => card.kind === "joker")).toHaveLength(3);
  });

  it("gives every physical card a unique ID", () => {
    const deck = createDeck();
    expect(new Set(deck.map((card) => card.id)).size).toBe(DECLARE_DECK_SIZE);
  });

  it("contains all thirteen ranks in all four suits", () => {
    const standardCards = createDeck().filter((card) => card.kind === "standard");
    const combinations = new Set(standardCards.map((card) => `${card.suit}-${card.rank}`));
    expect(combinations.size).toBe(52);
  });

  it("shuffles without adding, losing, or mutating cards", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, () => 0.25);
    expect(shuffled).not.toBe(deck);
    expect(shuffled.map((card) => card.id).sort()).toEqual(deck.map((card) => card.id).sort());
  });

  it.each([2, 3, 4, 5, 6])("deals seven unique cards to each of %i players", (players) => {
    const { hands, stock } = dealCards(shuffleDeck(createDeck(), () => 0.42), players);
    expect(hands).toHaveLength(players);
    hands.forEach((hand) => expect(hand).toHaveLength(DECLARE_HAND_SIZE));

    const allCards = [...hands.flat(), ...stock];
    expect(allCards).toHaveLength(DECLARE_DECK_SIZE);
    expect(new Set(allCards.map((card) => card.id)).size).toBe(DECLARE_DECK_SIZE);
  });

  it("rejects unsupported player counts", () => {
    expect(() => dealCards(createDeck(), 1)).toThrow(RangeError);
    expect(() => dealCards(createDeck(), 7)).toThrow(RangeError);
  });
});
