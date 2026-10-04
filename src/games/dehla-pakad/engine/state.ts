import { createDeck, shuffleDeck, type RandomSource } from "./deck";
import { resolveNextDealerState, updateMatchStandings } from "./match";
import { classifyRound, hasTen, isLegalPlay, trickWinner } from "./rules";
import {
  PLAYER_IDS,
  nextClockwise,
  partnerOf,
  teamForPlayer,
  type Card,
  type DealerSelection,
  type DehlaGameState,
  type EngineResult,
  type MatchStandings,
  type Player,
  type PlayerId,
  type RoundResult,
  type Team,
} from "./types";

function emptyHands(): Record<PlayerId, Card[]> {
  return { "player-1": [], "player-2": [], "player-3": [], "player-4": [] };
}

function emptyHandsWon(): Record<PlayerId, number> {
  return { "player-1": 0, "player-2": 0, "player-3": 0, "player-4": 0 };
}

function initialStandings(): MatchStandings {
  return {
    bavaniyas: { A: 0, B: 0 },
    coats: { A: 0, B: 0 },
    cumulativeTens: { A: 0, B: 0 },
    lifetime: {
      roundsWon: { A: 0, B: 0 },
      coats: { A: 0, B: 0 },
      bavaniyas: { A: 0, B: 0 },
      draws: 0,
    },
  };
}

function choose<T>(items: readonly T[], random: RandomSource): T {
  const sample = Math.max(0, Math.min(0.999999999, random()));
  return items[Math.floor(sample * items.length)];
}

export function selectDealer(random: RandomSource): { selection: DealerSelection; dealer: PlayerId; nextDealerByTeam: Record<Team, PlayerId> } {
  for (let attempts = 1; attempts <= 1000; attempts += 1) {
    const deck = shuffleDeck(createDeck(), random);
    const cards = Object.fromEntries(PLAYER_IDS.map((id, index) => [id, deck[index]])) as Record<PlayerId, Card>;
    const totals = {
      A: cards["player-1"].rank + cards["player-3"].rank,
      B: cards["player-2"].rank + cards["player-4"].rank,
    };
    if (totals.A === totals.B) continue;
    const winningTeam: Team = totals.A > totals.B ? "A" : "B";
    const dealingTeam: Team = winningTeam === "A" ? "B" : "A";
    const dealer = choose(dealingTeam === "A" ? ["player-1", "player-3"] as const : ["player-2", "player-4"] as const, random);
    const otherTeam: Team = dealingTeam === "A" ? "B" : "A";
    const otherFirst = choose(otherTeam === "A" ? ["player-1", "player-3"] as const : ["player-2", "player-4"] as const, random);
    return {
      selection: { cards, totals, winningTeam, dealingTeam, attempts },
      dealer,
      nextDealerByTeam: {
        [dealingTeam]: partnerOf(dealer),
        [otherTeam]: otherFirst,
      } as Record<Team, PlayerId>,
    };
  }
  throw new Error("Dealer selection did not resolve after repeated ties.");
}

export function createMatch(names: string[], random: RandomSource, id: string): DehlaGameState {
  if (names.length !== 4) throw new Error("Dehla Pakad requires exactly four players.");
  const players = PLAYER_IDS.map((playerId, index): Player => ({
    id: playerId,
    name: names[index],
    seat: (index + 1) as Player["seat"],
    team: teamForPlayer(playerId),
  }));
  const dealerState = selectDealer(random);
  return {
    version: 1,
    id,
    players,
    phase: "awaitingInitialDeal",
    roundNumber: 1,
    roundAttempt: 0,
    dealerSelection: dealerState.selection,
    dealer: dealerState.dealer,
    dealingTeam: dealerState.selection.dealingTeam,
    nextDealerByTeam: dealerState.nextDealerByTeam,
    hands: emptyHands(),
    undealt: [],
    currentPlayerId: null,
    currentTrick: [],
    lastTrick: null,
    handsCompleted: 0,
    hukum: null,
    hukumDeclarer: null,
    hukumHandNumber: null,
    pendingLot: [],
    pendingLotHands: [],
    captured: { A: [], B: [] },
    streakPlayer: null,
    streakCount: 0,
    handsWon: emptyHandsWon(),
    lotHistory: [],
    standings: initialStandings(),
    completedRound: null,
  };
}

function dealCards(state: DehlaGameState, cardsPerPlayer: number, deck: Card[]): Card[] {
  let cursor = nextClockwise(state.dealer);
  for (let pass = 0; pass < cardsPerPlayer; pass += 1) {
    for (let seat = 0; seat < 4; seat += 1) {
      const card = deck.shift();
      if (!card) throw new Error("The deck ran out while dealing.");
      state.hands[cursor].push(card);
      cursor = nextClockwise(cursor);
    }
  }
  return deck;
}

function cloneState(state: DehlaGameState): DehlaGameState {
  return JSON.parse(JSON.stringify(state)) as DehlaGameState;
}

export function dealInitial(state: DehlaGameState, playerId: PlayerId, random: RandomSource): EngineResult {
  if (state.phase !== "awaitingInitialDeal") return { ok: false, error: "This round is not waiting for its initial deal." };
  if (playerId !== state.dealer) return { ok: false, error: "Only the dealer may shuffle and deal." };
  const next = cloneState(state);
  next.hands = emptyHands();
  next.undealt = dealCards(next, 5, shuffleDeck(createDeck(), random));
  next.phase = "playingForHukum";
  next.roundAttempt += 1;
  next.currentPlayerId = nextClockwise(next.dealer);
  next.currentTrick = [];
  next.lastTrick = null;
  next.handsCompleted = 0;
  next.hukum = null;
  next.hukumDeclarer = null;
  next.hukumHandNumber = null;
  next.pendingLot = [];
  next.pendingLotHands = [];
  next.captured = { A: [], B: [] };
  next.streakPlayer = null;
  next.streakCount = 0;
  next.handsWon = emptyHandsWon();
  next.lotHistory = [];
  next.completedRound = null;
  return { ok: true, state: next, roundCompleted: null, roundReset: false };
}

function finishRound(state: DehlaGameState): RoundResult {
  if (!state.hukum || !state.hukumDeclarer || !state.hukumHandNumber) throw new Error("A completed round must have Hukum.");
  const classification = classifyRound(state.captured);
  const result: RoundResult = {
    roundNumber: state.roundNumber,
    dealer: state.dealer,
    dealingTeam: state.dealingTeam,
    winningTeam: classification.winningTeam,
    resultType: classification.resultType,
    hukum: state.hukum,
    hukumDeclarer: state.hukumDeclarer,
    hukumHandNumber: state.hukumHandNumber,
    tensCaptured: classification.tensCaptured,
    cardsCaptured: classification.cardsCaptured,
    handsWon: { ...state.handsWon },
    lotHistory: [...state.lotHistory],
  };
  state.standings = updateMatchStandings(state.standings, result);
  const dealerTransition = resolveNextDealerState({
    dealer: state.dealer,
    dealingTeam: state.dealingTeam,
    nextDealerByTeam: state.nextDealerByTeam,
  }, state.standings, result);
  state.dealer = dealerTransition.dealer;
  state.dealingTeam = dealerTransition.dealingTeam;
  state.nextDealerByTeam = dealerTransition.nextDealerByTeam;
  state.phase = "roundComplete";
  state.currentPlayerId = null;
  state.completedRound = result;
  return result;
}

function resetAbortedRound(state: DehlaGameState) {
  state.phase = "awaitingInitialDeal";
  state.hands = emptyHands();
  state.undealt = [];
  state.currentPlayerId = null;
  state.currentTrick = [];
  state.lastTrick = null;
  state.handsCompleted = 0;
  state.hukum = null;
  state.hukumDeclarer = null;
  state.hukumHandNumber = null;
  state.pendingLot = [];
  state.pendingLotHands = [];
  state.captured = { A: [], B: [] };
  state.streakPlayer = null;
  state.streakCount = 0;
  state.handsWon = emptyHandsWon();
  state.lotHistory = [];
  state.completedRound = null;
}

export function playCard(state: DehlaGameState, playerId: PlayerId, cardId: string): EngineResult {
  if (state.phase !== "playingForHukum" && state.phase !== "roundPlay") return { ok: false, error: "Cards cannot be played in the current phase." };
  if (state.currentPlayerId !== playerId) return { ok: false, error: "It is not your turn." };
  const hand = state.hands[playerId];
  const leadSuit = state.currentTrick[0]?.card.suit ?? null;
  if (!isLegalPlay(hand, cardId, leadSuit)) return { ok: false, error: "You must follow the lead suit when you can." };
  const next = cloneState(state);
  const cardIndex = next.hands[playerId].findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return { ok: false, error: "That card is not in your hand." };
  const [card] = next.hands[playerId].splice(cardIndex, 1);
  const declaringHukum = Boolean(leadSuit && card.suit !== leadSuit && !next.hukum);
  if (declaringHukum) {
    next.hukum = card.suit;
    next.hukumDeclarer = playerId;
    next.hukumHandNumber = next.handsCompleted + 1;
  }
  next.currentTrick.push({ playerId, card });
  if (next.currentTrick.length < 4) {
    next.currentPlayerId = nextClockwise(playerId);
    return { ok: true, state: next, roundCompleted: null, roundReset: false };
  }

  const handNumber = next.handsCompleted + 1;
  const winner = trickWinner(next.currentTrick, next.hukum);
  const completedTrick = [...next.currentTrick];
  next.handsCompleted = handNumber;
  next.handsWon[winner] += 1;
  next.pendingLot.push(...completedTrick.map((play) => play.card));
  next.pendingLotHands = [...(next.pendingLotHands ?? []), { handNumber, plays: completedTrick, winner }];
  next.lastTrick = { handNumber, cards: completedTrick, winner };
  next.currentTrick = [];
  next.currentPlayerId = winner;

  if (declaringHukum || next.hukumHandNumber === handNumber) {
    next.streakPlayer = winner;
    next.streakCount = 1;
  } else if (next.streakPlayer === winner) {
    next.streakCount += 1;
  } else {
    next.streakPlayer = winner;
    next.streakCount = 1;
  }

  const finalHand = handNumber === 13;
  const canLift = !finalHand && next.streakCount >= 2 && !hasTen(completedTrick);
  if (finalHand || canLift) {
    const team = teamForPlayer(winner);
    next.lotHistory.push({ handNumber, playerId: winner, team, cardCount: next.pendingLot.length, reason: finalHand ? "finalHand" : "streak" });
    next.captured[team].push(...next.pendingLot);
    next.pendingLot = [];
    next.pendingLotHands = [];
    next.streakPlayer = null;
    next.streakCount = 0;
  }

  if (!next.hukum && handNumber === 5) {
    resetAbortedRound(next);
    return { ok: true, state: next, roundCompleted: null, roundReset: true };
  }

  if (next.hukumHandNumber === handNumber && next.phase === "playingForHukum") {
    next.undealt = dealCards(next, 8, next.undealt);
    next.phase = "roundPlay";
  }

  if (finalHand) {
    const roundCompleted = finishRound(next);
    return { ok: true, state: next, roundCompleted, roundReset: false };
  }
  return { ok: true, state: next, roundCompleted: null, roundReset: false };
}

export function startNextRound(state: DehlaGameState): EngineResult {
  if (state.phase !== "roundComplete") return { ok: false, error: "The current round is not complete." };
  const next = cloneState(state);
  next.phase = "awaitingInitialDeal";
  next.roundNumber += 1;
  next.roundAttempt = 0;
  next.hands = emptyHands();
  next.undealt = [];
  next.currentPlayerId = null;
  next.currentTrick = [];
  next.lastTrick = null;
  next.handsCompleted = 0;
  next.hukum = null;
  next.hukumDeclarer = null;
  next.hukumHandNumber = null;
  next.pendingLot = [];
  next.pendingLotHands = [];
  next.captured = { A: [], B: [] };
  next.streakPlayer = null;
  next.streakCount = 0;
  next.handsWon = emptyHandsWon();
  next.lotHistory = [];
  next.completedRound = null;
  return { ok: true, state: next, roundCompleted: null, roundReset: false };
}
