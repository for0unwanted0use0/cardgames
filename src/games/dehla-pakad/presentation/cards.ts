import type { Card, Suit } from "../engine/types";

const DISPLAY_SUIT_ORDER: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

/** Returns a sorted copy for rendering without changing authoritative hand order. */
export function sortHandForDisplay(cards: readonly Card[]): Card[] {
  return [...cards].sort((left, right) => (
    DISPLAY_SUIT_ORDER[left.suit] - DISPLAY_SUIT_ORDER[right.suit]
    || right.rank - left.rank
  ));
}
