import { describe, expect, it } from "vitest";
import { createGame } from "../engine/actions";
import { currentPlayer } from "../engine/state";
import { executePlayerCommand, type AuthoritativeGame, type CommandEnvelope } from "./commands";
import { createPlayerView } from "./views";

const fixedRandom = () => 0;

function game(): AuthoritativeGame {
  return { revision: 4, state: createGame(["Alice", "Bob", "Cara"], fixedRandom) };
}

function completeCurrentTurn(authoritative: AuthoritativeGame): AuthoritativeGame {
  const actor = currentPlayer(authoritative.state);
  const discarded = executePlayerCommand(authoritative, {
    gameId: authoritative.state.id,
    playerId: actor.id,
    expectedRevision: authoritative.revision,
    command: { type: "discard", cardIds: [actor.hand[0].id] },
  });
  if (!discarded.ok) throw new Error(discarded.error);
  const drawn = executePlayerCommand(discarded.game, {
    gameId: discarded.game.state.id,
    playerId: actor.id,
    expectedRevision: discarded.game.revision,
    command: { type: "drawFromStock" },
  }, fixedRandom);
  if (!drawn.ok) throw new Error(drawn.error);
  return drawn.game;
}

describe("private player views", () => {
  it("shows the viewer's hand and hides every opponent hand", () => {
    const authoritative = game();
    const viewer = authoritative.state.players[1];
    const view = createPlayerView(authoritative.state, viewer.id, authoritative.revision);
    expect(view.players.find((player) => player.id === viewer.id)?.hand).toEqual(viewer.hand);
    expect(view.players.filter((player) => player.id !== viewer.id).every((player) => player.hand === null)).toBe(true);
    expect(view.players.map((player) => player.cardCount)).toEqual([7, 7, 7]);
  });

  it("does not leak opponent card IDs when serialized", () => {
    const authoritative = game();
    const viewer = authoritative.state.players[0];
    const serialized = JSON.stringify(createPlayerView(authoritative.state, viewer.id, authoritative.revision));
    for (const opponent of authoritative.state.players.slice(1)) {
      for (const card of opponent.hand) expect(serialized).not.toContain(card.id);
    }
  });

  it("reveals every hand only after a round or game has completed", () => {
    const authoritative = game();
    const viewer = authoritative.state.players[0];
    const activeView = createPlayerView(authoritative.state, viewer.id, authoritative.revision);
    expect(activeView.players.slice(1).every((player) => player.hand === null)).toBe(true);

    const roundComplete = { ...authoritative.state, status: "roundComplete" as const };
    const resultView = createPlayerView(roundComplete, viewer.id, authoritative.revision);
    expect(resultView.players.every((player, index) => player.hand === roundComplete.players[index].hand)).toBe(true);

    const gameComplete = { ...authoritative.state, status: "gameComplete" as const };
    const finalView = createPlayerView(gameComplete, viewer.id, authoritative.revision);
    expect(finalView.players.every((player, index) => player.hand === gameComplete.players[index].hand)).toBe(true);
  });

  it("shows the same completed round score history to every seated player", () => {
    const authoritative = game();
    const rounds = [{
      roundNumber: 1,
      declarerId: "player-1",
      succeeded: true,
      handScores: { "player-1": 4, "player-2": 9, "player-3": 12 },
      roundScores: { "player-1": 0, "player-2": 9, "player-3": 12 },
    }];
    const state = { ...authoritative.state, roundNumber: 2, rounds };

    for (const player of state.players) {
      expect(createPlayerView(state, player.id, authoritative.revision).completedRounds).toEqual([{
        roundNumber: 1,
        roundScores: { "player-1": 0, "player-2": 9, "player-3": 12 },
      }]);
    }
  });

  it("rejects viewers without a seat", () => {
    expect(() => createPlayerView(game().state, "intruder", 0)).toThrow("does not occupy a seat");
  });

  it("shows public discard identities to every seated player", () => {
    const completed = completeCurrentTurn(game());
    const extraCard = completed.state.stock[0];
    const groupState = {
      ...completed.state,
      stock: completed.state.stock.slice(1),
      previousDiscard: [...completed.state.previousDiscard, extraCard],
    };
    const discardedIds = groupState.previousDiscard.map((card) => card.id);
    for (const player of groupState.players) {
      const view = createPlayerView(groupState, player.id, completed.revision, "public");
      expect(view.previousDiscard.cards?.map((card) => card.id)).toEqual(discardedIds);
    }
  });

  it("omits next-player-only discard identities from every non-current view, including the host", () => {
    const authoritative = game();
    const host = currentPlayer(authoritative.state);
    const completed = completeCurrentTurn(authoritative);
    const eligible = currentPlayer(completed.state);
    const hiddenCard = completed.state.previousDiscard[0];
    const eligibleView = createPlayerView(completed.state, eligible.id, completed.revision, "nextPlayerOnly");
    expect(eligibleView.previousDiscard.cards).toEqual([hiddenCard]);

    for (const viewer of completed.state.players.filter((player) => player.id !== eligible.id)) {
      const view = createPlayerView(completed.state, viewer.id, completed.revision, "nextPlayerOnly");
      expect(view.previousDiscard).toEqual({ count: 1 });
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain(hiddenCard.id);
      const serializedDiscard = JSON.stringify(view.previousDiscard);
      expect(serializedDiscard).not.toContain("cards");
      expect(serializedDiscard).not.toContain("rank");
      expect(serializedDiscard).not.toContain("suit");
    }
    expect(host.id).not.toBe(eligible.id);
  });
});

describe("authoritative commands", () => {
  function envelope(authoritative: AuthoritativeGame, command: CommandEnvelope["command"]): CommandEnvelope {
    return {
      gameId: authoritative.state.id,
      playerId: currentPlayer(authoritative.state).id,
      expectedRevision: authoritative.revision,
      command,
    };
  }

  it("applies a valid command and advances the revision exactly once", () => {
    const authoritative = game();
    const cardId = currentPlayer(authoritative.state).hand[0].id;
    const result = executePlayerCommand(authoritative, envelope(authoritative, { type: "discard", cardIds: [cardId] }), fixedRandom);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.revision).toBe(5);
      expect(result.game.state.status).toBe("awaitingDraw");
    }
  });

  it("rejects stale commands without changing authoritative state", () => {
    const authoritative = game();
    const command = envelope(authoritative, { type: "discard", cardIds: [currentPlayer(authoritative.state).hand[0].id] });
    command.expectedRevision = 3;
    const result = executePlayerCommand(authoritative, command, fixedRandom);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("staleRevision");
      expect(result.game).toBe(authoritative);
    }
  });

  it("rejects commands for another game or another player's turn", () => {
    const authoritative = game();
    const wrongGame = envelope(authoritative, { type: "declare" });
    wrongGame.gameId = "other-game";
    const wrongGameResult = executePlayerCommand(authoritative, wrongGame);
    expect(!wrongGameResult.ok && wrongGameResult.code).toBe("wrongGame");

    const wrongPlayer = envelope(authoritative, { type: "discard", cardIds: [authoritative.state.players[1].hand[0].id] });
    wrongPlayer.playerId = authoritative.state.players[1].id;
    const wrongPlayerResult = executePlayerCommand(authoritative, wrongPlayer);
    expect(!wrongPlayerResult.ok && wrongPlayerResult.code).toBe("invalidAction");
  });

  it("uses server-provided randomness for stock draws", () => {
    const authoritative = game();
    const actor = currentPlayer(authoritative.state);
    const discarded = executePlayerCommand(authoritative, envelope(authoritative, { type: "discard", cardIds: [actor.hand[0].id] }));
    if (!discarded.ok) throw new Error(discarded.error);
    const drawCommand = envelope(discarded.game, { type: "drawFromStock" });
    const drawn = executePlayerCommand(discarded.game, drawCommand, fixedRandom);
    expect(drawn.ok && drawn.game.revision).toBe(6);
  });

  it("allows only the current player to take exactly one eligible discarded card", () => {
    const authoritative = game();
    const previousPlayer = currentPlayer(authoritative.state);
    const completed = completeCurrentTurn(authoritative);
    const extraCard = completed.state.stock[0];
    const groupGame: AuthoritativeGame = {
      revision: completed.revision,
      state: {
        ...completed.state,
        stock: completed.state.stock.slice(1),
        previousDiscard: [...completed.state.previousDiscard, extraCard],
      },
    };
    const eligible = currentPlayer(groupGame.state);
    const [cardId, remainderId] = groupGame.state.previousDiscard.map((card) => card.id);
    const prepared = executePlayerCommand(groupGame, envelope(groupGame, { type: "discard", cardIds: [eligible.hand[0].id] }));
    if (!prepared.ok) throw new Error(prepared.error);

    const wrongPlayer = executePlayerCommand(prepared.game, {
      gameId: prepared.game.state.id,
      playerId: previousPlayer.id,
      expectedRevision: prepared.game.revision,
      command: { type: "drawFromPreviousDiscard", cardId },
    });
    expect(!wrongPlayer.ok && wrongPlayer.code).toBe("invalidAction");

    const taken = executePlayerCommand(prepared.game, {
      gameId: prepared.game.state.id,
      playerId: eligible.id,
      expectedRevision: prepared.game.revision,
      command: { type: "drawFromPreviousDiscard", cardId },
    });
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    const eligibleAfterDraw = taken.game.state.players.find((player) => player.id === eligible.id)!;
    expect(eligibleAfterDraw.hand.filter((card) => card.id === cardId)).toHaveLength(1);
    expect(eligibleAfterDraw.hand.some((card) => card.id === remainderId)).toBe(false);
    expect(taken.game.state.discardPool.some((card) => card.id === remainderId)).toBe(true);
    expect(taken.game.state.previousDiscard).toEqual(prepared.game.state.pendingDiscard);
  });

  it("rejects cards outside the eligible discard and expires the opportunity after a stock draw", () => {
    const completed = completeCurrentTurn(game());
    const eligible = currentPlayer(completed.state);
    const eligibleId = completed.state.previousDiscard[0].id;
    const invalidId = eligible.hand[0].id;
    const prepared = executePlayerCommand(completed, envelope(completed, { type: "discard", cardIds: [invalidId] }));
    if (!prepared.ok) throw new Error(prepared.error);

    const invalid = executePlayerCommand(prepared.game, {
      gameId: prepared.game.state.id, playerId: eligible.id, expectedRevision: prepared.game.revision,
      command: { type: "drawFromPreviousDiscard", cardId: invalidId },
    });
    expect(!invalid.ok && invalid.code).toBe("invalidAction");

    const stockDraw = executePlayerCommand(prepared.game, {
      gameId: prepared.game.state.id, playerId: eligible.id, expectedRevision: prepared.game.revision,
      command: { type: "drawFromStock" },
    });
    if (!stockDraw.ok) throw new Error(stockDraw.error);
    const replay = executePlayerCommand(stockDraw.game, {
      gameId: stockDraw.game.state.id, playerId: eligible.id, expectedRevision: stockDraw.game.revision,
      command: { type: "drawFromPreviousDiscard", cardId: eligibleId },
    });
    expect(!replay.ok && replay.code).toBe("invalidAction");
  });

  it("rejects stale and replayed draw commands after the room revision changes", () => {
    const authoritative = game();
    const actor = currentPlayer(authoritative.state);
    const discarded = executePlayerCommand(authoritative, envelope(authoritative, { type: "discard", cardIds: [actor.hand[0].id] }));
    if (!discarded.ok) throw new Error(discarded.error);
    const eligible = currentPlayer(discarded.game.state);
    const draw = {
      gameId: discarded.game.state.id,
      playerId: eligible.id,
      expectedRevision: discarded.game.revision,
      command: { type: "drawFromStock" } as const,
    };
    const first = executePlayerCommand(discarded.game, draw, fixedRandom);
    if (!first.ok) throw new Error(first.error);
    const replay = executePlayerCommand(first.game, draw, fixedRandom);
    expect(!replay.ok && replay.code).toBe("staleRevision");
  });
});
