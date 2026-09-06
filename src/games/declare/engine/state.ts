import type { Card } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export type GameStatus = "playing" | "awaitingDraw" | "roundComplete" | "gameComplete";

export type PlayerState = {
  id: string;
  name: string;
  score: number;
  hand: Card[];
};

export type DeclarationResult = {
  declarerId: string;
  succeeded: boolean;
  handScores: Record<string, number>;
  roundScores: Record<string, number>;
};

export type RoundRecord = DeclarationResult & { roundNumber: number };

export type GameState = {
  version: 1;
  id: string;
  players: PlayerState[];
  playerOrder: string[];
  stock: Card[];
  previousDiscard: Card[];
  discardPool: Card[];
  pendingDiscard: Card[];
  currentPlayerIndex: number;
  roundNumber: number;
  status: GameStatus;
  declarationResult: DeclarationResult | null;
  rounds: RoundRecord[];
  winnerIds: string[];
  completionReason?: "score" | "walkover";
};

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string };

export function currentPlayer(state: GameState): PlayerState {
  const id = state.playerOrder[state.currentPlayerIndex];
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("Current player is missing from the game state.");
  return player;
}

export function allLocatedCards(state: GameState): Card[] {
  return [
    ...state.stock,
    ...state.players.flatMap((player) => player.hand),
    ...state.previousDiscard,
    ...state.discardPool,
    ...state.pendingDiscard,
  ];
}

export function assertCardInvariant(state: GameState): void {
  const cards = allLocatedCards(state);
  const ids = cards.map((card) => card.id);
  if (ids.length !== 55 || new Set(ids).size !== ids.length) {
    throw new Error("Card invariant violated: all 55 physical cards must exist in exactly one location.");
  }
}
