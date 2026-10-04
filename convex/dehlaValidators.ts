import { v } from "convex/values";

export const suitValidator = v.union(v.literal("clubs"), v.literal("diamonds"), v.literal("hearts"), v.literal("spades"));
export const rankValidator = v.union(...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((rank) => v.literal(rank)));
export const playerIdValidator = v.union(v.literal("player-1"), v.literal("player-2"), v.literal("player-3"), v.literal("player-4"));
export const teamValidator = v.union(v.literal("A"), v.literal("B"));
export const resultTypeValidator = v.union(v.literal("normal"), v.literal("coat"), v.literal("bavaniya"), v.literal("draw"));

export const cardValidator = v.object({ id: v.string(), suit: suitValidator, rank: rankValidator });
const playedCardValidator = v.object({ playerId: playerIdValidator, card: cardValidator });
const pendingLotStateHandValidator = v.object({ handNumber: v.number(), plays: v.array(playedCardValidator), winner: playerIdValidator });
const publicPendingLotHandValidator = v.object({
  handNumber: v.number(),
  winner: v.union(playerIdValidator, v.null()),
  winningTeam: v.union(teamValidator, v.null()),
  plays: v.array(v.object({ playerId: v.union(playerIdValidator, v.null()), card: cardValidator })),
});
const teamNumbersValidator = v.object({ A: v.number(), B: v.number() });
const playerNumbersValidator = v.record(v.string(), v.number());
const handsValidator = v.record(v.string(), v.array(cardValidator));
export const lotCaptureValidator = v.object({
  handNumber: v.number(),
  playerId: playerIdValidator,
  team: teamValidator,
  cardCount: v.number(),
  reason: v.union(v.literal("streak"), v.literal("finalHand")),
});
const standingsValidator = v.object({
  bavaniyas: teamNumbersValidator,
  coats: teamNumbersValidator,
  cumulativeTens: teamNumbersValidator,
  lifetime: v.object({
    roundsWon: teamNumbersValidator,
    coats: teamNumbersValidator,
    bavaniyas: teamNumbersValidator,
    draws: v.number(),
  }),
});
export const roundResultValidator = v.object({
  roundNumber: v.number(),
  dealer: playerIdValidator,
  dealingTeam: teamValidator,
  winningTeam: v.union(teamValidator, v.null()),
  resultType: resultTypeValidator,
  hukum: suitValidator,
  hukumDeclarer: playerIdValidator,
  hukumHandNumber: v.number(),
  tensCaptured: teamNumbersValidator,
  cardsCaptured: teamNumbersValidator,
  handsWon: playerNumbersValidator,
  lotHistory: v.array(lotCaptureValidator),
});
const dealerSelectionValidator = v.object({
  cards: v.record(v.string(), cardValidator),
  totals: teamNumbersValidator,
  winningTeam: teamValidator,
  dealingTeam: teamValidator,
  attempts: v.number(),
});

export const dehlaStateValidator = v.object({
  version: v.literal(1),
  id: v.string(),
  players: v.array(v.object({ id: playerIdValidator, name: v.string(), seat: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)), team: teamValidator })),
  phase: v.union(v.literal("awaitingInitialDeal"), v.literal("playingForHukum"), v.literal("roundPlay"), v.literal("roundComplete")),
  roundNumber: v.number(),
  roundAttempt: v.number(),
  dealerSelection: dealerSelectionValidator,
  dealer: playerIdValidator,
  dealingTeam: teamValidator,
  nextDealerByTeam: v.object({ A: playerIdValidator, B: playerIdValidator }),
  hands: handsValidator,
  undealt: v.array(cardValidator),
  currentPlayerId: v.union(playerIdValidator, v.null()),
  currentTrick: v.array(playedCardValidator),
  lastTrick: v.union(v.object({ handNumber: v.number(), cards: v.array(playedCardValidator), winner: playerIdValidator }), v.null()),
  handsCompleted: v.number(),
  hukum: v.union(suitValidator, v.null()),
  hukumDeclarer: v.union(playerIdValidator, v.null()),
  hukumHandNumber: v.union(v.number(), v.null()),
  pendingLot: v.array(cardValidator),
  pendingLotHands: v.optional(v.array(pendingLotStateHandValidator)),
  captured: v.object({ A: v.array(cardValidator), B: v.array(cardValidator) }),
  streakPlayer: v.union(playerIdValidator, v.null()),
  streakCount: v.number(),
  handsWon: playerNumbersValidator,
  lotHistory: v.array(lotCaptureValidator),
  standings: standingsValidator,
  completedRound: v.union(roundResultValidator, v.null()),
});

const historyDocumentValidator = v.object({
  _id: v.id("dehlaRoundHistory"),
  _creationTime: v.number(),
  gameId: v.id("dehlaGames"),
  roundNumber: v.number(),
  dealer: v.string(),
  dealingTeam: teamValidator,
  winningTeam: v.union(teamValidator, v.null()),
  resultType: resultTypeValidator,
  hukum: v.string(),
  hukumDeclarer: v.string(),
  hukumHandNumber: v.number(),
  tensCaptured: teamNumbersValidator,
  cardsCaptured: teamNumbersValidator,
  handsWon: playerNumbersValidator,
  lotHistory: v.array(lotCaptureValidator),
  createdAt: v.number(),
});

export const dehlaViewValidator = v.union(
  v.object({ kind: v.literal("unavailable"), code: v.string() }),
  v.object({
    kind: v.literal("lobby"), code: v.string(), viewerPlayerId: v.string(), hostPlayerId: v.string(),
    players: v.array(v.object({ id: v.string(), name: v.string() })),
  }),
  v.object({
    kind: v.literal("game"), code: v.string(), revision: v.number(), viewerPlayerId: playerIdValidator, hostPlayerId: v.string(),
    phase: v.union(v.literal("awaitingInitialDeal"), v.literal("playingForHukum"), v.literal("roundPlay"), v.literal("roundComplete")),
    roundNumber: v.number(), roundAttempt: v.number(), dealerSelection: dealerSelectionValidator,
    dealer: playerIdValidator, dealingTeam: teamValidator,
    players: v.array(v.object({ id: playerIdValidator, name: v.string(), seat: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)), team: teamValidator, cardCount: v.number(), hand: v.optional(v.array(cardValidator)) })),
    currentPlayerId: v.union(playerIdValidator, v.null()), currentTrick: v.array(playedCardValidator),
    lastTrick: v.union(v.object({ handNumber: v.number(), cards: v.array(playedCardValidator), winner: playerIdValidator }), v.null()),
    handsCompleted: v.number(), hukum: v.union(suitValidator, v.null()), hukumDeclarer: v.union(playerIdValidator, v.null()), hukumHandNumber: v.union(v.number(), v.null()),
    pendingLotCount: v.number(), pendingLotHands: v.array(publicPendingLotHandValidator), streakPlayer: v.union(playerIdValidator, v.null()), streakCount: v.number(),
    captured: v.object({ A: v.object({ cardCount: v.number(), tens: v.number() }), B: v.object({ cardCount: v.number(), tens: v.number() }) }),
    handsWon: playerNumbersValidator, standings: standingsValidator, completedRound: v.union(roundResultValidator, v.null()),
    history: v.array(historyDocumentValidator),
  }),
);

export { playerNumbersValidator, teamNumbersValidator };
