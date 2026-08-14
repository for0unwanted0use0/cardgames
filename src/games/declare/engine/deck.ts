import { RANKS, SUITS, type Card } from "./types";

export const DECLARE_DECK_SIZE = 55;
export const DECLARE_JOKER_COUNT = 3;
export const DECLARE_HAND_SIZE = 7;

export function createDeck(): Card[] {
  const standardCards: Card[] = SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${suit}-${rank}`,
      kind: "standard" as const,
      rank,
      suit,
    })),
  );

  const jokers: Card[] = Array.from({ length: DECLARE_JOKER_COUNT }, (_, index) => ({
    id: `joker-${index + 1}`,
    kind: "joker" as const,
  }));

  return [...standardCards, ...jokers];
}

export function shuffleDeck(cards: readonly Card[], random: () => number = Math.random): Card[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export type DealResult = {
  hands: Card[][];
  stock: Card[];
};

export function dealCards(
  cards: readonly Card[],
  playerCount: number,
  handSize = DECLARE_HAND_SIZE,
): DealResult {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new RangeError("Declare supports between 2 and 6 players.");
  }
  if (cards.length < playerCount * handSize) {
    throw new RangeError("The deck does not contain enough cards for this deal.");
  }

  const stock = [...cards];
  const hands = Array.from({ length: playerCount }, () => [] as Card[]);

  for (let cardIndex = 0; cardIndex < handSize; cardIndex += 1) {
    for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
      const card = stock.shift();
      if (!card) throw new Error("Unexpected empty stock while dealing.");
      hands[playerIndex].push(card);
    }
  }

  return { hands, stock };
}
