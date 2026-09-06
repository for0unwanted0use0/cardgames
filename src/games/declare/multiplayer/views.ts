import type { DeclarationResult, GameState, GameStatus } from "../engine/state";
import type { Card } from "../engine/types";

export type VisiblePlayer = {
  id: string;
  name: string;
  score: number;
  cardCount: number;
  hand: Card[] | null;
};

export type DiscardVisibility = "public" | "nextPlayerOnly";

export type VisiblePreviousDiscard = {
  count: number;
  cards?: Card[];
};

export type VisibleRoundScore = {
  roundNumber: number;
  roundScores: Record<string, number>;
};

export type PlayerGameView = {
  gameId: string;
  revision: number;
  viewerPlayerId: string;
  players: VisiblePlayer[];
  playerOrder: string[];
  stockCount: number;
  previousDiscard: VisiblePreviousDiscard;
  currentPlayerId: string;
  roundNumber: number;
  completedRounds: VisibleRoundScore[];
  status: GameStatus;
  declarationResult: DeclarationResult | null;
  winnerIds: string[];
  completionReason?: "score" | "walkover";
};

export function createPlayerView(
  state: GameState,
  viewerPlayerId: string,
  revision: number,
  discardVisibility: DiscardVisibility = "public",
): PlayerGameView {
  if (!state.players.some((player) => player.id === viewerPlayerId)) {
    throw new Error("Viewer does not occupy a seat in this game.");
  }
  const maySeeDiscard = discardVisibility === "public"
    || state.playerOrder[state.currentPlayerIndex] === viewerPlayerId;
  const revealAllHands = state.status === "roundComplete" || state.status === "gameComplete";
  return {
    gameId: state.id,
    revision,
    viewerPlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      cardCount: player.hand.length,
      hand: revealAllHands || player.id === viewerPlayerId ? player.hand : null,
    })),
    playerOrder: state.playerOrder,
    stockCount: state.stock.length,
    previousDiscard: {
      count: state.previousDiscard.length,
      ...(maySeeDiscard ? { cards: state.previousDiscard } : {}),
    },
    currentPlayerId: state.playerOrder[state.currentPlayerIndex],
    roundNumber: state.roundNumber,
    completedRounds: state.rounds.map(({ roundNumber, roundScores }) => ({ roundNumber, roundScores })),
    status: state.status,
    declarationResult: state.declarationResult,
    winnerIds: state.winnerIds,
    ...(state.completionReason ? { completionReason: state.completionReason } : {}),
  };
}
