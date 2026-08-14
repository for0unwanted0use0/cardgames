import type { Card, Rank } from "./types";

const VALUES: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

export function getCardValue(card: Card): number {
  return card.kind === "joker" ? 0 : VALUES[card.rank];
}

export function calculateHandScore(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + getCardValue(card), 0);
}
