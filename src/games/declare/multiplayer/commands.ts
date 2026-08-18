import { declare, discardCards, drawFromPreviousDiscard, drawFromStock, type RandomSource } from "../engine/actions";
import type { ActionResult, GameState } from "../engine/state";

export type PlayerCommand =
  | { type: "discard"; cardIds: string[] }
  | { type: "drawFromStock" }
  | { type: "drawFromPreviousDiscard"; cardId: string }
  | { type: "declare" };

export type CommandEnvelope = {
  gameId: string;
  playerId: string;
  expectedRevision: number;
  command: PlayerCommand;
};

export type AuthoritativeGame = {
  revision: number;
  state: GameState;
};

export type CommandResult =
  | { ok: true; game: AuthoritativeGame }
  | { ok: false; game: AuthoritativeGame; error: string; code: "wrongGame" | "staleRevision" | "invalidAction" };

export function executePlayerCommand(
  game: AuthoritativeGame,
  envelope: CommandEnvelope,
  random: RandomSource = Math.random,
): CommandResult {
  if (envelope.gameId !== game.state.id) {
    return { ok: false, game, error: "The command targets a different game.", code: "wrongGame" };
  }
  if (envelope.expectedRevision !== game.revision) {
    return { ok: false, game, error: "Game state changed; refresh before acting again.", code: "staleRevision" };
  }

  let result: ActionResult;
  switch (envelope.command.type) {
    case "discard":
      result = discardCards(game.state, envelope.playerId, envelope.command.cardIds);
      break;
    case "drawFromStock":
      result = drawFromStock(game.state, envelope.playerId, random);
      break;
    case "drawFromPreviousDiscard":
      result = drawFromPreviousDiscard(game.state, envelope.playerId, envelope.command.cardId);
      break;
    case "declare":
      result = declare(game.state, envelope.playerId);
      break;
  }

  if (!result.ok) return { ok: false, game, error: result.error, code: "invalidAction" };
  return { ok: true, game: { revision: game.revision + 1, state: result.state } };
}
