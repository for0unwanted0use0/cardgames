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
  return discardValidationError(cards) === null;
}

export function discardValidationError(cards: readonly Card[]): string | null {
  if (cards.length === 0) return "Select at least one card to discard.";
  if (cards.length === 1) return null;
  if (isSameRankGroup(cards) || isValidSequenceWithJokers(cards)) return null;

  const naturalCards = cards.filter((card) => card.kind === "standard");
  const jokerCount = cards.length - naturalCards.length;
  if (cards.length === 2) {
    if (jokerCount > 0) return "A two-card discard must be two natural cards of the same rank. Jokers may be used only in sequences of three or more cards.";
    return "These two cards have different ranks. A two-card discard must be a matching pair.";
  }

  const naturalRanks = naturalCards.map((card) => rankIndex.get(card.rank)!);
  if (new Set(naturalRanks).size !== naturalRanks.length) {
    return "This selection repeats a rank but is not a complete same-rank group. A sequence cannot contain duplicate natural ranks.";
  }
  if (naturalRanks.length === 0) return null;
  const sorted = [...naturalRanks].sort((a, b) => a - b);
  const missingRanks = sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length;
  if (missingRanks > jokerCount) {
    return `This sequence has ${missingRanks} missing rank${missingRanks === 1 ? "" : "s"}, but only ${jokerCount} Joker${jokerCount === 1 ? " is" : "s are"} available to fill the gap${missingRanks === 1 ? "" : "s"}.`;
  }
  return "Select either cards of one matching rank or a consecutive sequence of at least three cards. Jokers may fill missing ranks.";
}
