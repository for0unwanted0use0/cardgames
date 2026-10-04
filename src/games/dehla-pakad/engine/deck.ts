import { RANKS, SUITS, type Card } from "./types";

export type RandomSource = () => number;

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })));
}

export function shuffleDeck(cards: Card[], random: RandomSource): Card[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = Math.max(0, Math.min(0.999999999, random()));
    const target = Math.floor(sample * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function rankLabel(rank: Card["rank"]): string {
  return rank === 14 ? "A" : rank === 13 ? "K" : rank === 12 ? "Q" : rank === 11 ? "J" : String(rank);
}
