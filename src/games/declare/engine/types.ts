export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export type StandardCard = {
  id: string;
  kind: "standard";
  rank: Rank;
  suit: Suit;
};

export type JokerCard = {
  id: string;
  kind: "joker";
};

export type Card = StandardCard | JokerCard;
