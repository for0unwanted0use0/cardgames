import type { Card, PlayedCard, PlayerId, RoundResultType, Suit, Team } from "./types";
import { teamForPlayer } from "./types";

export function isLegalPlay(hand: Card[], cardId: string, leadSuit: Suit | null): boolean {
  const card = hand.find((candidate) => candidate.id === cardId);
  if (!card) return false;
  if (!leadSuit || card.suit === leadSuit) return true;
  return !hand.some((candidate) => candidate.suit === leadSuit);
}

export function trickWinner(cards: PlayedCard[], hukum: Suit | null): PlayerId {
  if (cards.length !== 4) throw new Error("A complete hand must contain four cards.");
  const leadSuit = cards[0].card.suit;
  const hukumCards = hukum ? cards.filter((play) => play.card.suit === hukum) : [];
  const eligible = hukumCards.length > 0 ? hukumCards : cards.filter((play) => play.card.suit === leadSuit);
  return eligible.reduce((best, play) => play.card.rank > best.card.rank ? play : best).playerId;
}

export function countTens(cards: Card[]): number {
  return cards.filter((card) => card.rank === 10).length;
}

export function classifyRound(captured: Record<Team, Card[]>): {
  winningTeam: Team | null;
  resultType: RoundResultType;
  tensCaptured: Record<Team, number>;
  cardsCaptured: Record<Team, number>;
} {
  const tensCaptured = { A: countTens(captured.A), B: countTens(captured.B) };
  const cardsCaptured = { A: captured.A.length, B: captured.B.length };
  if (cardsCaptured.A === 52 || cardsCaptured.B === 52) {
    return { winningTeam: cardsCaptured.A === 52 ? "A" : "B", resultType: "bavaniya", tensCaptured, cardsCaptured };
  }
  if (tensCaptured.A === 4 || tensCaptured.B === 4) {
    return { winningTeam: tensCaptured.A === 4 ? "A" : "B", resultType: "coat", tensCaptured, cardsCaptured };
  }
  if (tensCaptured.A !== tensCaptured.B) {
    return { winningTeam: tensCaptured.A > tensCaptured.B ? "A" : "B", resultType: "normal", tensCaptured, cardsCaptured };
  }
  if (cardsCaptured.A !== cardsCaptured.B) {
    return { winningTeam: cardsCaptured.A > cardsCaptured.B ? "A" : "B", resultType: "normal", tensCaptured, cardsCaptured };
  }
  return { winningTeam: null, resultType: "draw", tensCaptured, cardsCaptured };
}

export function hasTen(cards: PlayedCard[]): boolean {
  return cards.some((play) => play.card.rank === 10);
}

export function winningTeamForPlayer(playerId: PlayerId): Team {
  return teamForPlayer(playerId);
}
