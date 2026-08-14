import { RANKS, type Card } from "./types";

const rankIndex = new Map(RANKS.map((rank, index) => [rank, index]));

export function isSameRankGroup(cards: readonly Card[]): boolean {
  if (cards.length < 2 || cards.some((card) => card.kind === "joker")) return false;
  const [first] = cards;
  return first.kind === "standard" && cards.every(
    (card) => card.kind === "standard" && card.rank === first.rank,
  );
}

export function isValidSequence(cards: readonly Card[]): boolean {
  if (cards.length < 3 || cards.some((card) => card.kind === "joker")) return false;
  const ranks = cards
    .map((card) => card.kind === "standard" ? rankIndex.get(card.rank)! : -1)
    .sort((a, b) => a - b);
  return new Set(ranks).size === ranks.length
    && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
}

export function isValidSequenceWithJokers(cards: readonly Card[]): boolean {
  if (cards.length < 3) return false;
  const naturalRanks = cards
    .filter((card) => card.kind === "standard")
    .map((card) => rankIndex.get(card.rank)!)
    .sort((a, b) => a - b);
  const jokerCount = cards.length - naturalRanks.length;

  if (naturalRanks.length === 0) return cards.length <= RANKS.length;
  if (new Set(naturalRanks).size !== naturalRanks.length) return false;

  const span = naturalRanks[naturalRanks.length - 1] - naturalRanks[0] + 1;
  const missingInside = span - naturalRanks.length;
  if (missingInside > jokerCount) return false;

  const remainingJokers = jokerCount - missingInside;
  const roomOutside = naturalRanks[0] + (RANKS.length - 1 - naturalRanks[naturalRanks.length - 1]);
  return remainingJokers <= roomOutside;
}

export function isValidDiscard(cards: readonly Card[]): boolean {
  if (cards.length === 1) return true;
  return isSameRankGroup(cards) || isValidSequenceWithJokers(cards);
}
