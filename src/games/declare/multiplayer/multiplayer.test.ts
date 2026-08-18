import { describe, expect, it } from "vitest";
import { createGame } from "../engine/actions";
import { currentPlayer } from "../engine/state";
import { executePlayerCommand, type AuthoritativeGame, type CommandEnvelope } from "./commands";
import { createPlayerView } from "./views";

const fixedRandom = () => 0;

function game(): AuthoritativeGame {
  return { revision: 4, state: createGame(["Alice", "Bob", "Cara"], fixedRandom) };
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

  it("rejects viewers without a seat", () => {
    expect(() => createPlayerView(game().state, "intruder", 0)).toThrow("does not occupy a seat");
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
});
