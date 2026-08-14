import { createDeck, dealCards, shuffleDeck } from "./deck";
import { isValidDiscard } from "./rules";
import { calculateHandScore } from "./scoring";
import {
  MAX_PLAYERS, MIN_PLAYERS, assertCardInvariant, currentPlayer,
  type ActionResult, type DeclarationResult, type GameState, type PlayerState,
} from "./state";
import type { Card } from "./types";

export type RandomSource = () => number;

function randomIndex(length: number, random: RandomSource): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

function newRoundState(players: readonly PlayerState[], random: RandomSource) {
  const dealt = dealCards(shuffleDeck(createDeck(), random), players.length);
  return {
    players: players.map((player, index) => ({ ...player, hand: dealt.hands[index] })),
    stock: dealt.stock,
    previousDiscard: [] as Card[],
    discardPool: [] as Card[],
    pendingDiscard: [] as Card[],
    currentPlayerIndex: randomIndex(players.length, random),
    status: "playing" as const,
    declarationResult: null,
  };
}

export function createGame(names: readonly string[], random: RandomSource = Math.random): GameState {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length < MIN_PLAYERS || cleaned.length > MAX_PLAYERS) {
    throw new RangeError(`Declare supports ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
  }
  const players: PlayerState[] = cleaned.map((name, index) => ({
    id: `player-${index + 1}`, name, score: 0, hand: [],
  }));
  const state: GameState = {
    version: 1,
    id: globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}`,
    playerOrder: players.map((player) => player.id),
    roundNumber: 1,
    rounds: [],
    winnerIds: [],
    ...newRoundState(players, random),
  };
  assertCardInvariant(state);
  return state;
}

function failure(state: GameState, error: string): ActionResult {
  return { ok: false, state, error };
}

function success(state: GameState): ActionResult {
  assertCardInvariant(state);
  return { ok: true, state };
}

function verifyTurn(state: GameState, playerId: string, requiredStatus: GameState["status"]): string | null {
  if (state.status !== requiredStatus) return `This action is not available while the game is ${state.status}.`;
  if (currentPlayer(state).id !== playerId) return "A player may act only on their own turn.";
  return null;
}

export function discardCards(state: GameState, playerId: string, cardIds: readonly string[]): ActionResult {
  const turnError = verifyTurn(state, playerId, "playing");
  if (turnError) return failure(state, turnError);
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) {
    return failure(state, "Select one or more distinct cards to discard.");
  }
  const player = currentPlayer(state);
  const selected = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (selected.some((card) => !card)) return failure(state, "The selected cards are not all in this hand.");
  if (!isValidDiscard(selected as Card[])) return failure(state, "That is not a valid single, same-rank group, or sequence.");
  return success({
    ...state,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, hand: candidate.hand.filter((card) => !cardIds.includes(card.id)) }
      : candidate),
    pendingDiscard: selected as Card[],
    status: "awaitingDraw",
  });
}

function replenishStock(state: GameState, random: RandomSource): GameState {
  if (state.stock.length > 0 || state.discardPool.length === 0) return state;
  return { ...state, stock: shuffleDeck(state.discardPool, random), discardPool: [] };
}

function finishTurn(state: GameState, drawnCard: Card, oldDiscardRemainder: Card[]): GameState {
  const player = currentPlayer(state);
  return {
    ...state,
    players: state.players.map((candidate) => candidate.id === player.id
      ? { ...candidate, hand: [...candidate.hand, drawnCard] }
      : candidate),
    discardPool: [...state.discardPool, ...oldDiscardRemainder],
    previousDiscard: state.pendingDiscard,
    pendingDiscard: [],
    currentPlayerIndex: (state.currentPlayerIndex + 1) % state.playerOrder.length,
    status: "playing",
  };
}

export function drawFromStock(state: GameState, playerId: string, random: RandomSource = Math.random): ActionResult {
  const turnError = verifyTurn(state, playerId, "awaitingDraw");
  if (turnError) return failure(state, turnError);
  const replenished = replenishStock(state, random);
  const [drawnCard, ...stock] = replenished.stock;
  if (!drawnCard) return failure(state, "No cards are available in the stock or recyclable discard pool.");
  return success(finishTurn({ ...replenished, stock }, drawnCard, replenished.previousDiscard));
}

export function drawFromPreviousDiscard(state: GameState, playerId: string, cardId: string): ActionResult {
  const turnError = verifyTurn(state, playerId, "awaitingDraw");
  if (turnError) return failure(state, turnError);
  const drawnCard = state.previousDiscard.find((card) => card.id === cardId);
  if (!drawnCard) return failure(state, "Choose one card from the immediately previous discard.");
  return success(finishTurn(state, drawnCard, state.previousDiscard.filter((card) => card.id !== cardId)));
}

export function canDeclare(state: GameState, playerId: string): boolean {
  return state.status === "playing" && currentPlayer(state).id === playerId
    && calculateHandScore(currentPlayer(state).hand) < 10;
}

export function resolveDeclaration(state: GameState, declarerId: string): DeclarationResult {
  const handScores = Object.fromEntries(state.players.map((player) => [player.id, calculateHandScore(player.hand)]));
  const declarerScore = handScores[declarerId];
  if (declarerScore === undefined) throw new Error("Declarer is not a player in this game.");
  const succeeded = state.players.every((player) => player.id === declarerId || declarerScore < handScores[player.id]);
  const highest = Math.max(...Object.values(handScores));
  const roundScores = Object.fromEntries(state.players.map((player) => [
    player.id,
    succeeded ? (player.id === declarerId ? 0 : handScores[player.id]) : (player.id === declarerId ? highest : 0),
  ]));
  return { declarerId, succeeded, handScores, roundScores };
}

export function declare(state: GameState, playerId: string): ActionResult {
  const turnError = verifyTurn(state, playerId, "playing");
  if (turnError) return failure(state, turnError);
  if (!canDeclare(state, playerId)) return failure(state, "A player may Declare only with a hand score below 10.");
  const result = resolveDeclaration(state, playerId);
  return success({
    ...state,
    players: state.players.map((player) => ({ ...player, score: player.score + result.roundScores[player.id] })),
    status: "roundComplete",
    declarationResult: result,
    rounds: [...state.rounds, { ...result, roundNumber: state.roundNumber }],
  });
}

export function startNextRound(state: GameState, random: RandomSource = Math.random): ActionResult {
  if (state.status !== "roundComplete") return failure(state, "Complete the current round before starting another.");
  return success({ ...state, ...newRoundState(state.players, random), roundNumber: state.roundNumber + 1 });
}

export function endGame(state: GameState): ActionResult {
  if (state.status === "awaitingDraw") return failure(state, "Complete the current turn before ending the game.");
  if (state.status === "gameComplete") return failure(state, "This game has already ended.");
  const lowest = Math.min(...state.players.map((player) => player.score));
  return success({
    ...state,
    status: "gameComplete",
    winnerIds: state.players.filter((player) => player.score === lowest).map((player) => player.id),
  });
}
