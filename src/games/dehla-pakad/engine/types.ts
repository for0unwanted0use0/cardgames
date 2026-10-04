export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
};

export const PLAYER_IDS = ["player-1", "player-2", "player-3", "player-4"] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];
export type Team = "A" | "B";

export type Player = {
  id: PlayerId;
  name: string;
  seat: 1 | 2 | 3 | 4;
  team: Team;
};

export type PlayedCard = { playerId: PlayerId; card: Card };

export type PendingLotHand = {
  handNumber: number;
  plays: PlayedCard[];
  winner: PlayerId;
};

export type DealerSelection = {
  cards: Record<PlayerId, Card>;
  totals: Record<Team, number>;
  winningTeam: Team;
  dealingTeam: Team;
  attempts: number;
};

export type NetStanding = Record<Team, number>;

export type MatchStandings = {
  bavaniyas: NetStanding;
  coats: NetStanding;
  cumulativeTens: Record<Team, number>;
  lifetime: {
    roundsWon: Record<Team, number>;
    coats: Record<Team, number>;
    bavaniyas: Record<Team, number>;
    draws: number;
  };
};

export type RoundResultType = "normal" | "coat" | "bavaniya" | "draw";

export type RoundResult = {
  roundNumber: number;
  dealer: PlayerId;
  dealingTeam: Team;
  winningTeam: Team | null;
  resultType: RoundResultType;
  hukum: Suit;
  hukumDeclarer: PlayerId;
  hukumHandNumber: number;
  tensCaptured: Record<Team, number>;
  cardsCaptured: Record<Team, number>;
  handsWon: Record<PlayerId, number>;
  lotHistory: LotCapture[];
};

export type LotCapture = {
  handNumber: number;
  playerId: PlayerId;
  team: Team;
  cardCount: number;
  reason: "streak" | "finalHand";
};

export type RoundPhase = "awaitingInitialDeal" | "playingForHukum" | "roundPlay" | "roundComplete";

export type DehlaGameState = {
  version: 1;
  id: string;
  players: Player[];
  phase: RoundPhase;
  roundNumber: number;
  roundAttempt: number;
  dealerSelection: DealerSelection;
  dealer: PlayerId;
  dealingTeam: Team;
  nextDealerByTeam: Record<Team, PlayerId>;
  hands: Record<PlayerId, Card[]>;
  undealt: Card[];
  currentPlayerId: PlayerId | null;
  currentTrick: PlayedCard[];
  lastTrick: { handNumber: number; cards: PlayedCard[]; winner: PlayerId } | null;
  handsCompleted: number;
  hukum: Suit | null;
  hukumDeclarer: PlayerId | null;
  hukumHandNumber: number | null;
  pendingLot: Card[];
  /** Public completed-hand metadata. Optional only for pre-feature persisted states. */
  pendingLotHands?: PendingLotHand[];
  captured: Record<Team, Card[]>;
  streakPlayer: PlayerId | null;
  streakCount: number;
  handsWon: Record<PlayerId, number>;
  lotHistory: LotCapture[];
  standings: MatchStandings;
  completedRound: RoundResult | null;
};

export type EngineResult =
  | { ok: true; state: DehlaGameState; roundCompleted: RoundResult | null; roundReset: boolean }
  | { ok: false; error: string };

export function teamForPlayer(playerId: PlayerId): Team {
  return playerId === "player-1" || playerId === "player-3" ? "A" : "B";
}

export function partnerOf(playerId: PlayerId): PlayerId {
  const partners: Record<PlayerId, PlayerId> = {
    "player-1": "player-3",
    "player-2": "player-4",
    "player-3": "player-1",
    "player-4": "player-2",
  };
  return partners[playerId];
}

export function nextClockwise(playerId: PlayerId): PlayerId {
  return PLAYER_IDS[(PLAYER_IDS.indexOf(playerId) + 1) % PLAYER_IDS.length];
}
