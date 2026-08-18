import type { DeclarationResult, GameState, GameStatus } from "../engine/state";
import type { Card } from "../engine/types";

export type VisiblePlayer = {
  id: string;
  name: string;
  score: number;
  cardCount: number;
  hand: Card[] | null;
};

export type PlayerGameView = {
  gameId: string;
  revision: number;
  viewerPlayerId: string;
  players: VisiblePlayer[];
  playerOrder: string[];
  stockCount: number;
  previousDiscard: Card[];
  pendingDiscard: Card[];
  currentPlayerId: string;
  roundNumber: number;
  status: GameStatus;
  declarationResult: DeclarationResult | null;
  winnerIds: string[];
};

export function createPlayerView(state: GameState, viewerPlayerId: string, revision: number): PlayerGameView {
  if (!state.players.some((player) => player.id === viewerPlayerId)) {
    throw new Error("Viewer does not occupy a seat in this game.");
  }
  return {
    gameId: state.id,
    revision,
    viewerPlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      cardCount: player.hand.length,
      hand: player.id === viewerPlayerId ? player.hand : null,
    })),
    playerOrder: state.playerOrder,
    stockCount: state.stock.length,
    previousDiscard: state.previousDiscard,
    pendingDiscard: state.pendingDiscard,
    currentPlayerId: state.playerOrder[state.currentPlayerIndex],
    roundNumber: state.roundNumber,
    status: state.status,
    declarationResult: state.declarationResult,
    winnerIds: state.winnerIds,
  };
}
