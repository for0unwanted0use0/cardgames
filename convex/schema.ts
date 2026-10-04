import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { dehlaStateValidator, lotCaptureValidator, playerNumbersValidator, teamNumbersValidator } from "./dehlaValidators";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    gameType: v.optional(v.union(v.literal("declare"), v.literal("dehla-pakad"))),
    hostPlayerId: v.string(),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("awaitingDraw"), v.literal("roundComplete"), v.literal("gameComplete")),
    revision: v.number(),
    discardVisibility: v.optional(v.union(v.literal("public"), v.literal("nextPlayerOnly"))),
    gameState: v.optional(v.any()),
    lastEvent: v.optional(v.object({ kind: v.literal("playerLeft"), message: v.string(), createdAt: v.number() })),
    createdAt: v.number(),
  }).index("by_code", ["code"]),
  seats: defineTable({
    roomId: v.id("rooms"),
    playerId: v.string(),
    name: v.string(),
    token: v.string(),
    joinedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_token", ["roomId", "token"]),
  dehlaGames: defineTable({
    roomId: v.id("rooms"),
    revision: v.number(),
    state: dehlaStateValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_room", ["roomId"]),
  dehlaRoundHistory: defineTable({
    gameId: v.id("dehlaGames"),
    roundNumber: v.number(),
    dealer: v.string(),
    dealingTeam: v.union(v.literal("A"), v.literal("B")),
    winningTeam: v.union(v.literal("A"), v.literal("B"), v.null()),
    resultType: v.union(v.literal("normal"), v.literal("coat"), v.literal("bavaniya"), v.literal("draw")),
    hukum: v.string(),
    hukumDeclarer: v.string(),
    hukumHandNumber: v.number(),
    tensCaptured: teamNumbersValidator,
    cardsCaptured: teamNumbersValidator,
    handsWon: playerNumbersValidator,
    lotHistory: v.array(lotCaptureValidator),
    createdAt: v.number(),
  }).index("by_game_and_roundNumber", ["gameId", "roundNumber"]),
});
