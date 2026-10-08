import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createMatch, dealInitial, playCard, startNextRound } from "../src/games/dehla-pakad/engine/state";
import { countTens } from "../src/games/dehla-pakad/engine/rules";
import { teamForPlayer, type DehlaGameState, type PlayerId } from "../src/games/dehla-pakad/engine/types";
import { dehlaViewValidator } from "./dehlaValidators";

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

function validClientJoinId(clientJoinId: string) {
  if (clientJoinId.length < 24 || clientJoinId.length > 200) throw new ConvexError("Invalid join attempt identifier.");
  return clientJoinId;
}

async function existingSeatForJoin(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  clientJoinId: string,
  token: string,
) {
  const byJoinId = await ctx.db
    .query("seats")
    .withIndex("by_room_and_clientJoinId", (q) => q.eq("roomId", roomId).eq("clientJoinId", clientJoinId))
    .unique();
  if (byJoinId) {
    if (byJoinId.token !== token) throw new ConvexError("This join attempt belongs to different seat credentials.");
    return byJoinId;
  }
  return await ctx.db
    .query("seats")
    .withIndex("by_room_token", (q) => q.eq("roomId", roomId).eq("token", token))
    .unique();
}

function publicPendingLotHands(state: DehlaGameState) {
  const completedPendingHands = Math.floor(state.pendingLot.length / 4);
  const firstHandNumber = state.handsCompleted - completedPendingHands + 1;
  const trackedByHand = new Map((state.pendingLotHands ?? []).map((hand) => [hand.handNumber, hand]));
  return Array.from({ length: completedPendingHands }, (_, index) => ({
    handNumber: firstHandNumber + index,
    cards: state.pendingLot.slice(index * 4, index * 4 + 4),
  })).map(({ handNumber, cards }) => {
    const tracked = trackedByHand.get(handNumber);
    const lastTrick = state.lastTrick?.handNumber === handNumber ? state.lastTrick : null;
    const complete = tracked && tracked.plays.length === cards.length
      && tracked.plays.every((play, index) => play.card.id === cards[index].id)
      ? tracked
      : lastTrick && lastTrick.cards.length === cards.length
        && lastTrick.cards.every((play, index) => play.card.id === cards[index].id)
        ? { handNumber, plays: lastTrick.cards, winner: lastTrick.winner }
        : null;
    return {
      handNumber,
      winner: complete?.winner ?? null,
      winningTeam: complete ? teamForPlayer(complete.winner) : null,
      plays: complete?.plays ?? cards.map((card) => ({ playerId: null, card })),
    };
  });
}

async function roomAndSeat(ctx: QueryCtx | MutationCtx, codeInput: string, tokenInput: string) {
  const code = normalizedCode(codeInput);
  const token = validToken(tokenInput);
  const room = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (!room || room.gameType !== "dehla-pakad") throw new ConvexError("Dehla Pakad room not found.");
  const seat = await ctx.db.query("seats").withIndex("by_room_token", (q) => q.eq("roomId", room._id).eq("token", token)).unique();
  if (!seat) throw new ConvexError("This device does not hold a seat in the room.");
  return { room, seat };
}

function playerView(state: DehlaGameState, viewerId: PlayerId, revision: number) {
  return {
    kind: "game" as const,
    code: state.id,
    revision,
    viewerPlayerId: viewerId,
    phase: state.phase,
    roundNumber: state.roundNumber,
    roundAttempt: state.roundAttempt,
    dealerSelection: state.dealerSelection,
    dealer: state.dealer,
    dealingTeam: state.dealingTeam,
    players: state.players.map((player) => ({
      ...player,
      cardCount: state.hands[player.id].length,
      ...(player.id === viewerId ? { hand: state.hands[player.id] } : {}),
    })),
    currentPlayerId: state.currentPlayerId,
    currentTrick: state.currentTrick,
    lastTrick: state.lastTrick,
    handsCompleted: state.handsCompleted,
    hukum: state.hukum,
    hukumDeclarer: state.hukumDeclarer,
    hukumHandNumber: state.hukumHandNumber,
    pendingLotCount: state.pendingLot.length,
    pendingLotHands: publicPendingLotHands(state),
    streakPlayer: state.streakPlayer,
    streakCount: state.streakCount,
    captured: {
      A: { cardCount: state.captured.A.length, tens: countTens(state.captured.A) },
      B: { cardCount: state.captured.B.length, tens: countTens(state.captured.B) },
    },
    handsWon: state.handsWon,
    standings: state.standings,
    completedRound: state.completedRound,
  };
}

export const create = mutation({
  args: { code: v.string(), playerName: v.string(), seatToken: v.string(), clientJoinId: v.optional(v.string()) },
  returns: v.object({ code: v.string(), playerId: v.string() }),
  handler: async (ctx, args) => {
    const code = normalizedCode(args.code);
    const name = validName(args.playerName);
    const token = validToken(args.seatToken);
    const clientJoinId = validClientJoinId(args.clientJoinId ?? token);
    const existing = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing) {
      if (existing.gameType !== "dehla-pakad") throw new ConvexError("That room code is already in use.");
      const existingSeat = await existingSeatForJoin(ctx, existing._id, clientJoinId, token);
      if (existingSeat) return { code, playerId: existingSeat.playerId };
      throw new ConvexError("That room code is already in use.");
    }
    const roomId = await ctx.db.insert("rooms", {
      code,
      gameType: "dehla-pakad",
      hostPlayerId: "player-1",
      status: "waiting",
      revision: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("seats", { roomId, playerId: "player-1", name, token, clientJoinId, joinedAt: Date.now() });
    return { code, playerId: "player-1" };
  },
});

export const join = mutation({
  args: { code: v.string(), playerName: v.string(), seatToken: v.string(), clientJoinId: v.optional(v.string()) },
  returns: v.object({ code: v.string(), playerId: v.string() }),
  handler: async (ctx, args) => {
    const code = normalizedCode(args.code);
    const name = validName(args.playerName);
    const token = validToken(args.seatToken);
    const clientJoinId = validClientJoinId(args.clientJoinId ?? token);
    const room = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!room || room.gameType !== "dehla-pakad") throw new ConvexError("Dehla Pakad room not found.");
    const existingSeat = await existingSeatForJoin(ctx, room._id, clientJoinId, token);
    if (existingSeat) return { code, playerId: existingSeat.playerId };
    if (room.status !== "waiting") throw new ConvexError("This game has already started.");
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(5);
    if (seats.length >= 4) throw new ConvexError("This table already has four players.");
    const openNumber = [1, 2, 3, 4].find((number) => !seats.some((seat) => seat.playerId === `player-${number}`));
    if (!openNumber) throw new ConvexError("No seat is available.");
    const playerId = `player-${openNumber}`;
    await ctx.db.insert("seats", { roomId: room._id, playerId, name, token, clientJoinId, joinedAt: Date.now() });
    return { code, playerId };
  },
});

export const view = query({
  args: { code: v.string(), seatToken: v.string() },
  returns: dehlaViewValidator,
  handler: async (ctx, args) => {
    let roomAndMember;
    try {
      roomAndMember = await roomAndSeat(ctx, args.code, args.seatToken);
    } catch {
      return { kind: "unavailable" as const, code: args.code.trim().toUpperCase() };
    }
    const { room, seat } = roomAndMember;
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(5);
    seats.sort((left, right) => left.playerId.localeCompare(right.playerId, undefined, { numeric: true }));
    const game = await ctx.db.query("dehlaGames").withIndex("by_room", (q) => q.eq("roomId", room._id)).unique();
    if (!game) return {
      kind: "lobby" as const,
      code: room.code,
      viewerPlayerId: seat.playerId,
      hostPlayerId: room.hostPlayerId,
      players: seats.map(({ playerId, name }) => ({ id: playerId, name })),
    };
    const history = await ctx.db.query("dehlaRoundHistory")
      .withIndex("by_game_and_roundNumber", (q) => q.eq("gameId", game._id))
      .order("desc")
      .take(20);
    return { hostPlayerId: room.hostPlayerId, history, ...playerView(game.state as DehlaGameState, seat.playerId as PlayerId, game.revision) };
  },
});

export const start = mutation({
  args: { code: v.string(), seatToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (seat.playerId !== room.hostPlayerId) throw new ConvexError("Only the host may start the game.");
    if (room.status !== "waiting") throw new ConvexError("This room is not waiting to start.");
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(5);
    if (seats.length !== 4) throw new ConvexError("Dehla Pakad requires exactly four players.");
    seats.sort((left, right) => left.playerId.localeCompare(right.playerId, undefined, { numeric: true }));
    const state = createMatch(seats.map((item) => item.name), Math.random, room.code);
    const now = Date.now();
    await ctx.db.insert("dehlaGames", { roomId: room._id, revision: 0, state, createdAt: now, updatedAt: now });
    await ctx.db.patch("rooms", room._id, { status: "playing", revision: 0 });
    return null;
  },
});

export const deal = mutation({
  args: { code: v.string(), seatToken: v.string(), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    const game = await ctx.db.query("dehlaGames").withIndex("by_room", (q) => q.eq("roomId", room._id)).unique();
    if (!game) throw new ConvexError("The game has not started.");
    if (game.revision !== args.expectedRevision) throw new ConvexError("Game state changed; refresh and try again.");
    const result = dealInitial(game.state as DehlaGameState, seat.playerId as PlayerId, Math.random);
    if (!result.ok) throw new ConvexError(result.error);
    await ctx.db.patch("dehlaGames", game._id, { state: result.state, revision: game.revision + 1, updatedAt: Date.now() });
    return null;
  },
});

export const play = mutation({
  args: { code: v.string(), seatToken: v.string(), expectedRevision: v.number(), cardId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    const game = await ctx.db.query("dehlaGames").withIndex("by_room", (q) => q.eq("roomId", room._id)).unique();
    if (!game) throw new ConvexError("The game has not started.");
    if (game.revision !== args.expectedRevision) throw new ConvexError("Game state changed; refresh and try again.");
    const result = playCard(game.state as DehlaGameState, seat.playerId as PlayerId, args.cardId);
    if (!result.ok) throw new ConvexError(result.error);
    const now = Date.now();
    await ctx.db.patch("dehlaGames", game._id, { state: result.state, revision: game.revision + 1, updatedAt: now });
    if (result.roundCompleted) {
      const round = result.roundCompleted;
      await ctx.db.insert("dehlaRoundHistory", {
        gameId: game._id,
        roundNumber: round.roundNumber,
        dealer: round.dealer,
        dealingTeam: round.dealingTeam,
        winningTeam: round.winningTeam,
        resultType: round.resultType,
        hukum: round.hukum,
        hukumDeclarer: round.hukumDeclarer,
        hukumHandNumber: round.hukumHandNumber,
        tensCaptured: round.tensCaptured,
        cardsCaptured: round.cardsCaptured,
        handsWon: round.handsWon,
        lotHistory: round.lotHistory,
        createdAt: now,
      });
    }
    return null;
  },
});

export const advanceRound = mutation({
  args: { code: v.string(), seatToken: v.string(), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    if (seat.playerId !== room.hostPlayerId) throw new ConvexError("Only the host may advance the round.");
    const game = await ctx.db.query("dehlaGames").withIndex("by_room", (q) => q.eq("roomId", room._id)).unique();
    if (!game) throw new ConvexError("The game has not started.");
    if (game.revision !== args.expectedRevision) throw new ConvexError("Game state changed; refresh and try again.");
    const result = startNextRound(game.state as DehlaGameState);
    if (!result.ok) throw new ConvexError(result.error);
    await ctx.db.patch("dehlaGames", game._id, { state: result.state, revision: game.revision + 1, updatedAt: Date.now() });
    return null;
  },
});

export const leave = mutation({
  args: { code: v.string(), seatToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { room, seat } = await roomAndSeat(ctx, args.code, args.seatToken);
    const game = await ctx.db.query("dehlaGames").withIndex("by_room", (q) => q.eq("roomId", room._id)).unique();
    if (game) throw new ConvexError("A started Dehla Pakad match cannot be left without ending the table.");
    const seats = await ctx.db.query("seats").withIndex("by_room", (q) => q.eq("roomId", room._id)).take(5);
    const remaining = seats.filter((candidate) => candidate._id !== seat._id);
    await ctx.db.delete("seats", seat._id);
    if (remaining.length === 0) await ctx.db.delete("rooms", room._id);
    else if (room.hostPlayerId === seat.playerId) await ctx.db.patch("rooms", room._id, { hostPlayerId: remaining[0].playerId });
    return null;
  },
});
