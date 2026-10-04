import { partnerOf, type MatchStandings, type PlayerId, type RoundResult, type Team } from "./types";

export type DealerState = {
  dealer: PlayerId;
  dealingTeam: Team;
  nextDealerByTeam: Record<Team, PlayerId>;
};

export type DealerTransitionReason =
  | "behindContinues"
  | "opposingBavaniyaPartnerSwitch"
  | "aheadInvariantCrosses"
  | "exactDrawLevelCrosses"
  | "levelStandingCrosses";

export type DealerTransition = DealerState & {
  reason: DealerTransitionReason;
};

export function applyNetAward(standing: Record<Team, number>, winner: Team): Record<Team, number> {
  const loser: Team = winner === "A" ? "B" : "A";
  if (standing[loser] > 0) return { ...standing, [loser]: standing[loser] - 1 };
  return { ...standing, [winner]: standing[winner] + 1 };
}

/** Positive means Team A leads, negative means Team B leads. */
export function compareStandings(standings: MatchStandings): -1 | 0 | 1 {
  const levels: Array<Record<Team, number>> = [standings.bavaniyas, standings.coats, standings.cumulativeTens];
  for (const level of levels) {
    if (level.A !== level.B) return level.A > level.B ? 1 : -1;
  }
  return 0;
}

export function compareTeamStanding(team: Team, standings: MatchStandings): -1 | 0 | 1 {
  const comparison = compareStandings(standings);
  return team === "A" ? comparison : comparison === 0 ? 0 : comparison === 1 ? -1 : 1;
}

export function updateMatchStandings(standings: MatchStandings, result: RoundResult): MatchStandings {
  const next = JSON.parse(JSON.stringify(standings)) as MatchStandings;
  next.cumulativeTens.A += result.tensCaptured.A;
  next.cumulativeTens.B += result.tensCaptured.B;
  if (!result.winningTeam) {
    next.lifetime.draws += 1;
    return next;
  }
  next.lifetime.roundsWon[result.winningTeam] += 1;
  if (result.resultType === "coat") {
    next.coats = applyNetAward(next.coats, result.winningTeam);
    next.lifetime.coats[result.winningTeam] += 1;
  }
  if (result.resultType === "bavaniya") {
    next.bavaniyas = applyNetAward(next.bavaniyas, result.winningTeam);
    next.lifetime.bavaniyas[result.winningTeam] += 1;
  }
  return next;
}

function unchanged(state: DealerState, reason: DealerTransitionReason): DealerTransition {
  return { ...state, nextDealerByTeam: { ...state.nextDealerByTeam }, reason };
}

function crossToOtherTeam(state: DealerState, reason: DealerTransitionReason): DealerTransition {
  const dealingTeam: Team = state.dealingTeam === "A" ? "B" : "A";
  const dealer = state.nextDealerByTeam[dealingTeam];
  return {
    dealer,
    dealingTeam,
    nextDealerByTeam: { ...state.nextDealerByTeam, [dealingTeam]: partnerOf(dealer) },
    reason,
  };
}

export function assertSettledDealerInvariant(state: DealerState, standings: MatchStandings): void {
  if (compareTeamStanding(state.dealingTeam, standings) > 0) {
    throw new Error("Dealer invariant violated: the settled dealing team cannot be ahead.");
  }
}

/**
 * Resolves only match-level dealer rules. It does not inspect cards, tricks, or
 * mutate game state. The resulting hierarchy is authoritative: only a team
 * that is behind retains the deal. Ahead and level states cross to the other
 * team's stored next dealer, except for the opposing-Bavaniya partner switch.
 */
export function resolveNextDealerState(
  state: DealerState,
  standingsAfterRound: MatchStandings,
  result: RoundResult,
): DealerTransition {
  if (result.dealer !== state.dealer || result.dealingTeam !== state.dealingTeam) {
    throw new Error("Completed-round dealer state does not match the active match dealer state.");
  }
  const relativeStanding = compareTeamStanding(state.dealingTeam, standingsAfterRound);

  if (result.resultType === "bavaniya" && result.winningTeam && result.winningTeam !== state.dealingTeam) {
    if (relativeStanding >= 0) throw new Error("An opposing Bavaniya must leave the dealing team behind.");
    const dealer = partnerOf(state.dealer);
    const transition: DealerTransition = {
      dealer,
      dealingTeam: state.dealingTeam,
      nextDealerByTeam: { ...state.nextDealerByTeam, [state.dealingTeam]: partnerOf(dealer) },
      reason: "opposingBavaniyaPartnerSwitch",
    };
    assertSettledDealerInvariant(transition, standingsAfterRound);
    return transition;
  }

  if (relativeStanding < 0) {
    const transition = unchanged(state, "behindContinues");
    assertSettledDealerInvariant(transition, standingsAfterRound);
    return transition;
  }

  if (relativeStanding > 0) {
    const transition = crossToOtherTeam(state, "aheadInvariantCrosses");
    assertSettledDealerInvariant(transition, standingsAfterRound);
    return transition;
  }

  if (result.resultType === "draw") {
    const transition = crossToOtherTeam(state, "exactDrawLevelCrosses");
    assertSettledDealerInvariant(transition, standingsAfterRound);
    return transition;
  }

  const transition = crossToOtherTeam(state, "levelStandingCrosses");
  assertSettledDealerInvariant(transition, standingsAfterRound);
  return transition;
}
