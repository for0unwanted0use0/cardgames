import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { createGame, endGame, forfeitPlayer, startNextRound } from "../src/games/declare/engine/actions";
import type { GameState } from "../src/games/declare/engine/state";
import { executePlayerCommand, type PlayerCommand } from "../src/games/declare/multiplayer/commands";
import { createPlayerView, type DiscardVisibility } from "../src/games/declare/multiplayer/views";

const discardVisibilityValidator = v.union(v.literal("public"), v.literal("nextPlayerOnly"));

const commandValidator = v.union(
  v.object({ type: v.literal("discard"), cardIds: v.array(v.string()) }),
  v.object({ type: v.literal("drawFromStock") }),
  v.object({ type: v.literal("drawFromPreviousDiscard"), cardId: v.string() }),
  v.object({ type: v.literal("declare") }),
);

function normalizedCode(code: string) {
  const value = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(value)) throw new ConvexError("Room codes must contain exactly six letters or numbers.");
  return value;
}

function validName(name: string) {
  const value = name.trim();
  if (value.length < 1 || value.length > 30) throw new ConvexError("Player names must contain 1–30 characters.");
  return value;
}

function validToken(token: string) {
  if (token.length < 24 || token.length > 200) throw new ConvexError("Invalid seat token.");
  return token;
}

export const create = mutation({
  args: { code: v.string(), playerName: v.string(), seatToken: v.string(), discardVisibility: discardVisibilityValidator },
  returns: v.object({ code: v.string(), playerId: v.string() }),
  handler: async (ctx, args) => {
    const code = normalizedCode(args.code);
    const name = validName(args.playerName);
    const token = validToken(args.seatToken);
    const existing = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing) throw new ConvexError("That room code is already in use.");
    const playerId = "player-1";
    const roomId = await ctx.db.insert("rooms", {
      code, gameType: "declare", hostPlayerId: playerId, status: "waiting", revision: 0,
      discardVisibility: args.discardVisibility, createdAt: Date.now(),
    });
    await ctx.db.insert("seats", { roomId, playerId, name, token, joinedAt: Date.now() });
    return { code, playerId };
  },
});

export const join = mutation({
  args: { code: v.string(), playerName: v.string(), seatToken: v.string() },
  returns: v.object({ code: v.string(), playerId: v.string() }),
  handler: async (ctx, args) => {
    const code = normalizedCode(args.code);
    const name = validName(args.playerName);
    const token = validToken(args.seatToken);
    const room = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!room) throw new ConvexError("Room not found.");
    if (room.gameType && room.gameType !== "declare") throw new ConvexError("That code belongs to a different card game.");
    if (room.status !== "waiting") throw new ConvexError("This game has already started.");
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(7);
    if (seats.length >= 6) throw new ConvexError("This room is full.");
    if (seats.some((seat) => seat.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new ConvexError("That player name is already used in this room.");
    const existingToken = seats.find((seat) => seat.token === token);
    if (existingToken) return { code, playerId: existingToken.playerId };
    const occupiedPlayerIds = new Set(seats.map((seat) => seat.playerId));
    let playerNumber = 1;
    while (occupiedPlayerIds.has(`player-${playerNumber}`)) playerNumber += 1;
    const playerId = `player-${playerNumber}`;
    await ctx.db.insert("seats", { roomId: room._id, playerId, name, token, joinedAt: Date.now() });
    return { code, playerId };
  },
});

async function roomAndSeat(ctx: QueryCtx | MutationCtx, codeInput: string, tokenInput: string) {
  const code = normalizedCode(codeInput);
  const token = validToken(tokenInput);
  const room = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (!room) throw new ConvexError("Room not found.");
  const seat = await ctx.db.query("seats").withIndex("by_room_token", (q) => q.eq("roomId", room._id).eq("token", token)).unique();
  if (!seat) throw new ConvexError("This device does not hold a seat in the room.");
  return { room, seat };
}

export const view = query({
  args: { code: v.string(), seatToken: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    let code: string;
    let token: string;
    try {
      code = normalizedCode(args.code);
      token = validToken(args.seatToken);
    } catch {
      return { kind: "unavailable" as const, code: args.code.trim().toUpperCase() };
    }
    const room = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!room) return { kind: "unavailable" as const, code };
    if (room.gameType && room.gameType !== "declare") return { kind: "unavailable" as const, code };
    const seat = await ctx.db.query("seats").withIndex("by_room_token", (q) => q.eq("roomId", room._id).eq("token", token)).unique();
    if (!seat) return { kind: "unavailable" as const, code };
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(6);
    if (!room.gameState) {
      return {
        kind: "lobby" as const, code: room.code, viewerPlayerId: seat.playerId,
        hostPlayerId: room.hostPlayerId, discardVisibility: room.discardVisibility ?? "public",
        players: seats.map(({ playerId, name }) => ({ id: playerId, name })),
      };
    }
    const discardVisibility: DiscardVisibility = room.discardVisibility ?? "public";
    return {
      kind: "game" as const, hostPlayerId: room.hostPlayerId, discardVisibility,
      lastEvent: room.lastEvent ?? null,
      ...createPlayerView(room.gameState as GameState, seat.playerId, room.revision, discardVisibility),
    };
  },
});

export const leave = mutation({
  args: { code: v.string(), seatToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (room.gameType && room.gameType !== "declare") throw new ConvexError("That code belongs to a different card game.");
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(6);
    const remainingSeats = seats
      .filter((candidate) => candidate._id !== seat._id)
      .sort((a, b) => a.playerId.localeCompare(b.playerId, undefined, { numeric: true }));
    if (!room.gameState) {
      await ctx.db.delete("seats", seat._id);
      if (remainingSeats.length === 0) await ctx.db.delete("rooms", room._id);
      else if (seat.playerId === room.hostPlayerId) await ctx.db.patch(room._id, { hostPlayerId: remainingSeats[0].playerId });
      return null;
    }
    const state = room.gameState as GameState;
    if (state.status !== "gameComplete") {
      const result = forfeitPlayer(state, seat.playerId);
      if (!result.ok) throw new ConvexError(result.error);
      await ctx.db.patch(room._id, {
        gameState: result.state,
        status: result.state.status,
        revision: room.revision + 1,
        ...(seat.playerId === room.hostPlayerId && remainingSeats[0] ? { hostPlayerId: remainingSeats[0].playerId } : {}),
        lastEvent: { kind: "playerLeft", message: `${seat.name} left the table.`, createdAt: Date.now() },
      });
    }
    await ctx.db.delete("seats", seat._id);
    return null;
  },
});

export const voiceIdentity = query({
  args: { code: v.string(), seatToken: v.string() },
  returns: v.object({ roomCode: v.string(), playerId: v.string(), playerName: v.string() }),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    return { roomCode: room.code, playerId: seat.playerId, playerName: seat.name };
  },
});

export const start = mutation({
  args: { code: v.string(), seatToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (room.gameType && room.gameType !== "declare") throw new ConvexError("That code belongs to a different card game.");
    if (seat.playerId !== room.hostPlayerId) throw new ConvexError("Only the host may start the game.");
    if (room.status !== "waiting") throw new ConvexError("This room is not waiting to start.");
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(6);
    if (seats.length < 2) throw new ConvexError("At least two players must join before starting.");
    seats.sort((a, b) => a.playerId.localeCompare(b.playerId, undefined, { numeric: true }));
    const state = createGame(seats.map((item) => item.name), Math.random, room.code);
    await ctx.db.patch(room._id, { gameState: state, status: "playing", revision: 0 });
    return null;
  },
});

export const play = mutation({
  args: { code: v.string(), seatToken: v.string(), expectedRevision: v.number(), command: commandValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (room.gameType && room.gameType !== "declare") throw new ConvexError("That code belongs to a different card game.");
    if (!room.gameState) throw new ConvexError("The game has not started.");
    const result = executePlayerCommand(
      { revision: room.revision, state: room.gameState as GameState },
      { gameId: room.code, playerId: seat.playerId, expectedRevision: args.expectedRevision, command: args.command as PlayerCommand },
      Math.random,
    );
    if (!result.ok) throw new ConvexError({ code: result.code, message: result.error });
    await ctx.db.patch(room._id, { gameState: result.game.state, revision: result.game.revision, status: result.game.state.status });
    return null;
  },
});

export const advanceRound = mutation({
  args: { code: v.string(), seatToken: v.string(), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (room.gameType && room.gameType !== "declare") throw new ConvexError("That code belongs to a different card game.");
    if (seat.playerId !== room.hostPlayerId) throw new ConvexError("Only the host may advance the round.");
    if (args.expectedRevision !== room.revision) throw new ConvexError("Game state changed; refresh and try again.");
    const result = startNextRound(room.gameState as GameState, Math.random);
    if (!result.ok) throw new ConvexError(result.error);
    await ctx.db.patch(room._id, { gameState: result.state, status: result.state.status, revision: room.revision + 1 });
    return null;
  },
});

export const finish = mutation({
  args: { code: v.string(), seatToken: v.string(), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (room.gameType && room.gameType !== "declare") throw new ConvexError("That code belongs to a different card game.");
    if (seat.playerId !== room.hostPlayerId) throw new ConvexError("Only the host may end the game.");
    if (args.expectedRevision !== room.revision) throw new ConvexError("Game state changed; refresh and try again.");
    const result = endGame(room.gameState as GameState);
    if (!result.ok) throw new ConvexError(result.error);
    await ctx.db.patch(room._id, { gameState: result.state, status: result.state.status, revision: room.revision + 1 });
    return null;
  },
});
