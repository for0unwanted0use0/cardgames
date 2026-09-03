import { describe, expect, it } from "vitest";
import {
  canDeclare, createGame, declare, discardCards, drawFromPreviousDiscard,
  drawFromStock, endGame, startNextRound,
} from "./actions";
import { createDeck } from "./deck";
import { allLocatedCards, currentPlayer, type GameState } from "./state";
import type { Card, Rank, Suit } from "./types";

const fixedRandom = () => 0;

function card(rank: Rank, suit: Suit = "clubs"): Card {
  return { id: `${suit}-${rank}`, kind: "standard", rank, suit };
}

function withHands(hands: Card[][]): GameState {
  const base = createGame(hands.map((_, index) => `Player ${index + 1}`), fixedRandom);
  const used = new Set(hands.flat().map((item) => item.id));
  return {
    ...base,
    players: base.players.map((player, index) => ({ ...player, hand: hands[index] })),
    stock: createDeck().filter((item) => !used.has(item.id)),
    previousDiscard: [],
    discardPool: [],
    pendingDiscard: [],
    currentPlayerIndex: 0,
    status: "playing",
  };
}

describe("turn behavior", () => {
  it("rejects an invalid discard without changing state", () => {
    const state = createGame(["A", "B"], fixedRandom);
    const player = currentPlayer(state);
    const mixed = player.hand.slice(0, 2);
    if (mixed[0].kind === "standard" && mixed[1].kind === "standard" && mixed[0].rank === mixed[1].rank) {
      const firstRank = mixed[0].rank;
      mixed[1] = player.hand.find((item) => item.kind === "standard" && item.rank !== firstRank)!;
    }
    const result = discardCards(state, player.id, mixed.map((item) => item.id));
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });

  it("keeps the player active to draw after discarding, then advances the turn", () => {
    const state = createGame(["A", "B"], fixedRandom);
    const player = currentPlayer(state);
    const discarded = player.hand[0];
    const afterDiscard = discardCards(state, player.id, [discarded.id]);
    expect(afterDiscard.ok).toBe(true);
    if (!afterDiscard.ok) return;
    expect(afterDiscard.state.players.find((item) => item.id === player.id)?.hand).toHaveLength(6);
    expect(afterDiscard.state.status).toBe("awaitingDraw");
    expect(currentPlayer(afterDiscard.state).id).toBe(player.id);

    const afterDraw = drawFromStock(afterDiscard.state, player.id, fixedRandom);
    expect(afterDraw.ok).toBe(true);
    if (!afterDraw.ok) return;
    expect(afterDraw.state.players.find((item) => item.id === player.id)?.hand).toHaveLength(7);
    expect(afterDraw.state.previousDiscard.map((item) => item.id)).toEqual([discarded.id]);
    expect(currentPlayer(afterDraw.state).id).not.toBe(player.id);
  });

  it("draws only one selected card from the immediately previous discard", () => {
    let state = createGame(["A", "B"], fixedRandom);
    const first = currentPlayer(state);
    const firstDiscard = discardCards(state, first.id, [first.hand[0].id]);
    if (!firstDiscard.ok) throw new Error(firstDiscard.error);
    const firstDraw = drawFromStock(firstDiscard.state, first.id, fixedRandom);
    if (!firstDraw.ok) throw new Error(firstDraw.error);

    const second = currentPlayer(firstDraw.state);
    const secondDiscard = discardCards(firstDraw.state, second.id, [second.hand[0].id]);
    if (!secondDiscard.ok) throw new Error(secondDiscard.error);
    const availableId = secondDiscard.state.previousDiscard[0].id;
    const secondDraw = drawFromPreviousDiscard(secondDiscard.state, second.id, availableId);
    expect(secondDraw.ok).toBe(true);
    if (!secondDraw.ok) return;
    expect(secondDraw.state.players.find((item) => item.id === second.id)?.hand.some((item) => item.id === availableId)).toBe(true);
    expect(secondDraw.state.previousDiscard.map((item) => item.id)).toEqual([second.hand[0].id]);
    expect(allLocatedCards(secondDraw.state)).toHaveLength(55);
  });

  it("reshuffles recyclable discards while protecting active discard areas", () => {
    const state = createGame(["A", "B"], fixedRandom);
    const player = currentPlayer(state);
    const discarded = discardCards(state, player.id, [player.hand[0].id]);
    if (!discarded.ok) throw new Error(discarded.error);
    const exhausted = {
      ...discarded.state,
      stock: [],
      discardPool: [...discarded.state.discardPool, ...discarded.state.stock],
    };
    const result = drawFromStock(exhausted, player.id, fixedRandom);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allLocatedCards(result.state)).toHaveLength(55);
    expect(new Set(allLocatedCards(result.state).map((item) => item.id)).size).toBe(55);
    expect(result.state.previousDiscard.map((item) => item.id)).toEqual([player.hand[0].id]);
  });
});

describe("declaration and scoring", () => {
  it("allows scores 0 and 9, rejects 10, and never auto-wins an empty hand", () => {
    const zero = withHands([[], [card("K")]]);
    expect(canDeclare(zero, zero.players[0].id)).toBe(true);
    expect(zero.status).toBe("playing");
    const nine = withHands([[card("9")], [card("K")]]);
    expect(canDeclare(nine, nine.players[0].id)).toBe(true);
    const ten = withHands([[card("10")], [card("K")]]);
    expect(canDeclare(ten, ten.players[0].id)).toBe(false);
  });

  it("scores a successful unique-lowest declaration", () => {
    const state = withHands([[card("6")], [card("8")], [card("K"), card("3", "hearts")]]);
    const result = declare(state, state.players[0].id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.declarationResult?.succeeded).toBe(true);
    expect(result.state.declarationResult?.roundScores).toEqual({ "player-1": 0, "player-2": 8, "player-3": 16 });
  });

  it("fails a tied declaration and penalizes only the declarer with the highest hand", () => {
    const state = withHands([[card("8")], [card("8", "hearts")], [card("K"), card("9", "hearts")]]);
    const result = declare(state, state.players[0].id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.declarationResult?.succeeded).toBe(false);
    expect(result.state.declarationResult?.roundScores).toEqual({ "player-1": 22, "player-2": 0, "player-3": 0 });
  });

  it("fails when an opponent is lower, starts another round, and ends manually", () => {
    const state = withHands([[card("7")], [card("4")], [card("K"), card("6", "hearts")]]);
    const result = declare(state, state.players[0].id);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.declarationResult?.roundScores["player-1"]).toBe(19);
    const next = startNextRound(result.state, fixedRandom);
    expect(next.ok && next.state.roundNumber).toBe(2);
    if (!next.ok) return;
    const ended = endGame(next.state);
    expect(ended.ok && ended.state.status).toBe("gameComplete");
  });
});
