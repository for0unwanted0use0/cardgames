import { describe, expect, it } from "vitest";
import { calculateHandScore, getCardValue } from "./scoring";
import { isSameRankGroup, isValidDiscard, isValidSequenceWithJokers } from "./rules";
import type { Card, Rank, Suit } from "./types";

const card = (rank: Rank, suit: Suit = "clubs"): Card => ({
  id: `${suit}-${rank}-${Math.random()}`,
  kind: "standard",
  rank,
  suit,
});
const joker = (id = "joker"): Card => ({ id, kind: "joker" });

describe("card scoring", () => {
  it.each([["A", 1], ["2", 2], ["10", 10], ["J", 11], ["Q", 12], ["K", 13]] as const)(
    "scores %s as %i",
    (rank, value) => expect(getCardValue(card(rank))).toBe(value),
  );
  it("scores Jokers as zero and totals a hand", () => {
    expect(getCardValue(joker())).toBe(0);
    expect(calculateHandScore([card("A"), card("K"), joker()])).toBe(14);
  });
});

describe("same-rank groups", () => {
  it("accepts matching pairs, triples, and four-card groups", () => {
    expect(isSameRankGroup([card("7", "clubs"), card("7", "hearts")])).toBe(true);
    expect(isSameRankGroup([card("Q"), card("Q", "diamonds"), card("Q", "spades")])).toBe(true);
    expect(isSameRankGroup([card("5"), card("5", "diamonds"), card("5", "hearts"), card("5", "spades")])).toBe(true);
  });
  it("rejects mixed ranks and Joker wildcards", () => {
    expect(isSameRankGroup([card("7"), card("8")])).toBe(false);
    expect(isSameRankGroup([card("7"), card("7", "hearts"), joker()])).toBe(false);
  });
});

describe("sequences", () => {
  it.each([
    ["A", "2", "3"], ["2", "3", "4"], ["8", "9", "10"],
    ["9", "10", "J"], ["10", "J", "Q"], ["J", "Q", "K"],
  ] as Rank[][])("accepts %s-%s-%s", (...ranks) => {
    expect(isValidSequenceWithJokers(ranks.map((rank, index) => card(rank, ["clubs", "hearts", "spades"][index] as Suit)))).toBe(true);
  });
  it.each([
    ["Q", "K", "A"], ["K", "A", "2"], ["2", "4", "5"], ["8", "9"], ["4", "4", "5"],
  ] as Rank[][])("rejects invalid ranks", (...ranks) => {
    expect(isValidSequenceWithJokers(ranks.map((rank) => card(rank)))).toBe(false);
  });
  it("allows suits to differ", () => {
    expect(isValidSequenceWithJokers([card("3", "clubs"), card("4", "hearts"), card("5", "spades")])).toBe(true);
  });
  it("fills sequence gaps and ends with Jokers", () => {
    expect(isValidSequenceWithJokers([card("3"), card("4"), joker()])).toBe(true);
    expect(isValidSequenceWithJokers([card("7"), joker(), card("9")])).toBe(true);
    expect(isValidSequenceWithJokers([card("J"), joker(), card("K")])).toBe(true);
    expect(isValidSequenceWithJokers([card("5"), joker("j1"), joker("j2"), card("8")])).toBe(true);
    expect(isValidSequenceWithJokers([joker(), card("9"), card("10")])).toBe(true);
  });
  it("rejects Joker combinations with no possible assignment", () => {
    expect(isValidSequenceWithJokers([card("A"), joker(), card("K")])).toBe(false);
    expect(isValidSequenceWithJokers([card("A"), card("K"), joker(), joker("j2")])).toBe(false);
  });
});

describe("discard validation", () => {
  it("accepts every single card", () => {
    expect(isValidDiscard([card("4")])).toBe(true);
    expect(isValidDiscard([joker()])).toBe(true);
  });
});
