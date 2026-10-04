"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import VoicePanel from "../../declare/components/VoicePanel";
import { rankLabel } from "../engine/deck";
import type { Card, PlayerId, Suit, Team } from "../engine/types";
import { sortHandForDisplay } from "../presentation/cards";

type Credentials = { code: string; seatToken: string };
type LobbyView = { kind: "lobby"; code: string; viewerPlayerId: string; hostPlayerId: string; players: Array<{ id: string; name: string }> };
type UnavailableView = { kind: "unavailable"; code: string };
type GamePlayer = { id: PlayerId; name: string; team: Team; cardCount: number; hand?: Card[] };
type GameView = {
  kind: "game"; code: string; revision: number; viewerPlayerId: PlayerId; hostPlayerId: string;
  phase: "awaitingInitialDeal" | "playingForHukum" | "roundPlay" | "roundComplete";
  roundNumber: number; roundAttempt: number;
  dealerSelection: { cards: Record<PlayerId, Card>; totals: Record<Team, number>; winningTeam: Team; dealingTeam: Team; attempts: number };
  dealer: PlayerId; dealingTeam: Team; players: GamePlayer[]; currentPlayerId: PlayerId | null;
  currentTrick: Array<{ playerId: PlayerId; card: Card }>;
  lastTrick: { handNumber: number; cards: Array<{ playerId: PlayerId; card: Card }>; winner: PlayerId } | null;
  handsCompleted: number; hukum: Suit | null; hukumDeclarer: PlayerId | null; hukumHandNumber: number | null;
  pendingLotCount: number;
  pendingLotHands: Array<{
    handNumber: number; winner: PlayerId | null; winningTeam: Team | null;
    plays: Array<{ playerId: PlayerId | null; card: Card }>;
  }>;
  streakPlayer: PlayerId | null; streakCount: number;
  captured: Record<Team, { cardCount: number; tens: number }>;
  standings: {
    bavaniyas: Record<Team, number>; coats: Record<Team, number>; cumulativeTens: Record<Team, number>;
    lifetime: { roundsWon: Record<Team, number>; coats: Record<Team, number>; bavaniyas: Record<Team, number>; draws: number };
  };
  completedRound: null | {
    dealer: PlayerId; dealingTeam: Team; resultType: "normal" | "coat" | "bavaniya" | "draw"; winningTeam: Team | null;
    hukum: Suit; hukumDeclarer: PlayerId; hukumHandNumber: number;
    tensCaptured: Record<Team, number>; cardsCaptured: Record<Team, number>;
  };
};
type RoomView = LobbyView | UnavailableView | GameView;

const STORAGE_KEY = "dehla-pakad-online-seat-v1";
const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");
const suitSymbol: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const suitName = (suit: Suit | null) => suit ? `${suit[0].toUpperCase()}${suit.slice(1)} ${suitSymbol[suit]}` : "Not set";
type TablePosition = "local" | "left" | "partner" | "right";
const tablePositions: TablePosition[] = ["local", "left", "partner", "right"];
type TableMoment = { key: string; kind: "capture" | "carry"; title: string; detail: string };

function DehlaCard({ card, disabled = false, onClick, compact = false, hukum = false, playable = false, unavailable = false }: { card: Card; disabled?: boolean; onClick?: () => void; compact?: boolean; hukum?: boolean; playable?: boolean; unavailable?: boolean }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const className = `playing-card dehla-card${red ? " red" : ""}${compact ? " compact" : ""}${hukum ? " hukum-card" : ""}${card.rank === 10 ? " ten-card" : ""}${playable ? " playable" : ""}${unavailable ? " unavailable" : ""}`;
  const interactionLabel = unavailable ? ", unavailable because you must follow suit" : playable ? ", playable" : "";
  return <button type="button" className={className} data-card-id={card.id} data-suit={card.suit} data-rank={card.rank} disabled={disabled} onClick={onClick} aria-label={`${rankLabel(card.rank)} of ${card.suit}${hukum ? ", Hukum suit" : ""}${interactionLabel}`}><span className="dehla-card-corner">{rankLabel(card.rank)}<small>{suitSymbol[card.suit]}</small></span><span className="dehla-card-suit" aria-hidden="true">{suitSymbol[card.suit]}</span>{hukum && <span className="hukum-mark" aria-hidden="true">H</span>}</button>;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.replace(/^\[CONVEX [^\]]+\]\s*/, "");
  return "The table could not complete that action.";
}

export default function OnlineDehlaPakadGame() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [restoredSeat, setRestoredSeat] = useState(false);
  const [showHukumEvent, setShowHukumEvent] = useState(false);
  const [showSecondDealEvent, setShowSecondDealEvent] = useState(false);
  const [showPendingLot, setShowPendingLot] = useState(false);
  const [tableMoment, setTableMoment] = useState<TableMoment | null>(null);
  const previousRoundState = useRef<{ revision: number; roundNumber: number; handsCompleted: number; pendingLotCount: number; capturedA: number; capturedB: number } | null>(null);
  const createRoom = useMutation(api.dehlaRooms.create);
  const joinRoom = useMutation(api.dehlaRooms.join);
  const startRoom = useMutation(api.dehlaRooms.start);
  const deal = useMutation(api.dehlaRooms.deal);
  const play = useMutation(api.dehlaRooms.play);
  const advanceRound = useMutation(api.dehlaRooms.advanceRound);
  const leaveRoom = useMutation(api.dehlaRooms.leave);
  const room = useQuery(api.dehlaRooms.view, credentials ? { code: credentials.code, seatToken: credentials.seatToken } : "skip") as RoomView | undefined;
  const hukumEventKey = room?.kind === "game" && room.hukum ? `${room.roundNumber}:${room.hukumHandNumber}:${room.hukum}` : null;
  const secondDealEventKey = room?.kind === "game" && room.phase === "roundPlay" && room.hukum ? `${room.roundNumber}:${room.hukumHandNumber}:second-deal` : null;

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Credentials | null; setCredentials(saved); setRestoredSeat(Boolean(saved)); } catch { /* Ignore damaged local credentials. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!hukumEventKey || restoredSeat) { setShowHukumEvent(false); return; }
    setShowHukumEvent(true);
    const timer = window.setTimeout(() => setShowHukumEvent(false), 4500);
    return () => window.clearTimeout(timer);
  }, [hukumEventKey, restoredSeat]);

  useEffect(() => {
    if (!secondDealEventKey || restoredSeat) { setShowSecondDealEvent(false); return; }
    setShowSecondDealEvent(true);
    const timer = window.setTimeout(() => setShowSecondDealEvent(false), 4500);
    return () => window.clearTimeout(timer);
  }, [secondDealEventKey, restoredSeat]);

  useEffect(() => {
    if (room?.kind !== "game") { previousRoundState.current = null; return; }
    const current = {
      revision: room.revision,
      roundNumber: room.roundNumber,
      handsCompleted: room.handsCompleted,
      pendingLotCount: room.pendingLotCount,
      capturedA: room.captured.A.cardCount,
      capturedB: room.captured.B.cardCount,
    };
    const previous = previousRoundState.current;
    previousRoundState.current = current;
    if (!previous || restoredSeat || previous.roundNumber !== current.roundNumber || previous.revision === current.revision || room.phase === "roundComplete") return;

    const capturedA = current.capturedA - previous.capturedA;
    const capturedB = current.capturedB - previous.capturedB;
    if (previous.pendingLotCount > 0 && current.pendingLotCount === 0 && (capturedA > 0 || capturedB > 0)) {
      const team: Team = capturedA > 0 ? "A" : "B";
      const cardCount = Math.max(capturedA, capturedB);
      setTableMoment({ key: `capture:${current.revision}`, kind: "capture", title: `Team ${team} collects ${cardCount} cards`, detail: "The pending lot has been lifted." });
      return;
    }

    const tenCarriedLot = current.handsCompleted > previous.handsCompleted
      && room.streakCount >= 2
      && room.pendingLotCount > 0
      && room.lastTrick?.cards.some(({ card }) => card.rank === 10);
    if (tenCarriedLot) setTableMoment({ key: `carry:${current.revision}`, kind: "carry", title: "10 played", detail: "Collection carries forward." });
  }, [room?.kind === "game" ? room.revision : null, restoredSeat]);

  useEffect(() => {
    if (!tableMoment) return;
    const timer = window.setTimeout(() => setTableMoment(null), 4000);
    return () => window.clearTimeout(timer);
  }, [tableMoment]);

  useEffect(() => {
    if (!showPendingLot) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPendingLot(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showPendingLot]);

  function remember(next: Credentials) { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setRestoredSeat(false); setCredentials(next); }
  async function perform(action: () => Promise<unknown>) {
    try { setError(null); await action(); } catch (cause) { setError(errorMessage(cause)); }
  }

  if (!loaded) return <section className="game-panel loading-panel">Preparing the Dehla Pakad table…</section>;
  if (!credentials) return <section className="game-panel lobby-shell dehla-lobby">
    <div className="lobby-intro"><p className="eyebrow">Partnership card game</p><h1>Dehla Pakad</h1><div className="lobby-facts" aria-label="Four players, two teams, partners sit opposite"><span><strong>4</strong> Players</span><span><strong>2</strong> Teams</span><span><strong>↕</strong> Partners opposite</span></div><p>Create a private table, share its six-character code, and take seats with fixed opposite partners.</p></div>
    <div className="lobby-grid">
      <section className="lobby-card"><span className="lobby-step">01</span><h2>Create a table</h2><label className="field-label">Your name<input value={name} maxLength={30} placeholder="e.g. Meera" onChange={(event) => setName(event.target.value)} /></label><p className="subtle">You take P1. Partners will sit opposite once all four seats are filled.</p><button disabled={!name.trim()} onClick={() => perform(async () => { const next = { code: newCode(), seatToken: newToken() }; await createRoom({ code: next.code, playerName: name, seatToken: next.seatToken }); remember(next); })}>Create private table</button></section>
      <section className="lobby-card"><span className="lobby-step">02</span><h2>Join a table</h2><label className="field-label">Room code<input className="code-input" maxLength={6} value={joinCode} placeholder="ABC123" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label><button disabled={!name.trim() || joinCode.trim().length !== 6} onClick={() => perform(async () => { const next = { code: joinCode.trim().toUpperCase(), seatToken: newToken() }; await joinRoom({ code: next.code, playerName: name, seatToken: next.seatToken }); remember(next); })}>Join table</button></section>
    </div>{error && <p className="error">{error}</p>}
  </section>;

  if (room === undefined) return <section className="game-panel loading-panel">Taking your seat in {credentials.code}…</section>;
  if (room.kind === "unavailable") return <section className="game-panel lobby-shell"><p className="eyebrow">Room unavailable</p><h1>{room.code || "Saved room"} cannot be opened</h1><p>It may have expired or belong to another game.</p><button onClick={() => { localStorage.removeItem(STORAGE_KEY); setCredentials(null); }}>Forget saved seat</button></section>;

  if (room.kind === "lobby") {
    const host = room.viewerPlayerId === room.hostPlayerId;
    return <section className="game-panel waiting-lobby dehla-lobby">
      <header className="lobby-room-header"><div><p className="eyebrow">Dehla Pakad waiting room</p><h1>Seat all four players</h1></div><button className="room-code-button" onClick={() => navigator.clipboard.writeText(room.code)}><small>Room code · tap to copy</small><strong>{room.code}</strong></button></header>
      <div className="waiting-layout"><section><div className="waiting-heading"><h2>Teams and seats</h2><span>{room.players.length}/4 seated</span></div><div className="lobby-list dehla-seat-preview">{[1, 2, 3, 4].map((seat) => { const player = room.players.find((candidate) => candidate.id === `player-${seat}`); const team = seat % 2 ? "A" : "B"; return <div key={seat} className={`team-${team.toLowerCase()}${player ? " occupied" : " open"}`}><span className="seat-initials">P{seat}</span><span className="preview-copy"><strong>{player?.name ?? "Open seat"}</strong><small>Team {team}{player?.id === room.hostPlayerId ? " · Host" : ""}</small></span><b>{seat === 1 || seat === 3 ? "A partners" : "B partners"}</b></div>; })}</div></section><aside className="lobby-settings"><p className="eyebrow">Partnerships</p><strong>P1 + P3 · Team A</strong><p>P2 + P4 · Team B. Play moves clockwise around the table.</p><div className="partner-map" aria-hidden="true"><span>P3</span><i>↕</i><span>P1</span><span>P2</span><i>↔</i><span>P4</span></div></aside></div>
      {host ? <div className="lobby-actions"><button disabled={room.players.length !== 4} onClick={() => perform(() => startRoom({ code: room.code, seatToken: credentials.seatToken }))}>Start match · {room.players.length}/4</button>{room.players.length !== 4 && <span className="subtle">All four seats are required.</span>}</div> : <p className="turn-banner waiting"><strong>Waiting for the host</strong></p>}
      <button className="quiet danger lobby-leave" onClick={() => perform(async () => { await leaveRoom({ code: room.code, seatToken: credentials.seatToken }); localStorage.removeItem(STORAGE_KEY); setCredentials(null); })}>Leave this table</button>{error && <p className="error">{error}</p>}
    </section>;
  }

  const own = room.players.find((player) => player.id === room.viewerPlayerId)!;
  const ownHand = sortHandForDisplay(own.hand ?? []);
  const current = room.players.find((player) => player.id === room.currentPlayerId);
  const leadSuit = room.currentTrick[0]?.card.suit ?? null;
  const mustFollow = leadSuit ? ownHand.some((card) => card.suit === leadSuit) : false;
  const isTurn = room.viewerPlayerId === room.currentPlayerId;
  const isHost = room.viewerPlayerId === room.hostPlayerId;
  const nameFor = (playerId: PlayerId | null) => room.players.find((player) => player.id === playerId)?.name ?? "—";
  const phaseLabel = room.phase === "awaitingInitialDeal" ? "Waiting for deal" : room.phase === "playingForHukum" ? "Finding Hukum" : room.phase === "roundPlay" ? "Round play" : "Round complete";
  const isFirstDealerSelection = room.roundNumber === 1 && room.roundAttempt === 0;
  const isNoHukumRedeal = room.phase === "awaitingInitialDeal" && room.roundAttempt > 0;
  const viewerIndex = room.players.findIndex((player) => player.id === room.viewerPlayerId);
  const positionFor = (playerId: PlayerId): TablePosition => {
    const playerIndex = room.players.findIndex((player) => player.id === playerId);
    return tablePositions[(playerIndex - viewerIndex + room.players.length) % room.players.length];
  };
  const tensTrack = Array.from({ length: 4 }, (_, index) => index < room.captured.A.tens ? "A" : index < room.captured.A.tens + room.captured.B.tens ? "B" : null);
  const hukumLabel = room.hukum ? `${room.hukum[0].toUpperCase()}${room.hukum.slice(1)}` : "Not declared";
  const streakBlockedByTen = Boolean(room.streakPlayer && room.streakCount >= 2 && room.pendingLotCount > 0 && room.lastTrick?.cards.some(({ card }) => card.rank === 10));

  return <section className="dehla-shell">
    <header className="dehla-header">
      <div className="dehla-title"><p className="eyebrow">Dehla Pakad · Round {room.roundNumber}</p><h1>{phaseLabel}</h1>{room.phase === "playingForHukum" && <small>Hand {Math.min(room.handsCompleted + 1, 5)} of max 5</small>}</div>
      <div className="dehla-header-tools">
        <div className="game-meta"><span className="meta-chip connection-chip"><small>Connection</small><strong>{restoredSeat ? "Live · restored seat" : "Live · private room"}</strong></span><span className="meta-chip room-chip"><small>Room</small><strong>{room.code}</strong></span><span className="meta-chip"><small>Dealer</small><strong>{nameFor(room.dealer)}</strong></span><span className="meta-chip"><small>Deal</small><strong>Team {room.dealingTeam}</strong></span></div>
        <div className={`hukum-display${room.hukum ? ` declared suit-${room.hukum}` : ""}`} data-hukum={room.hukum ?? ""} aria-label={`Hukum: ${hukumLabel}`}><small>Hukum</small><strong aria-hidden="true">{room.hukum ? suitSymbol[room.hukum] : "—"}</strong><span>{hukumLabel}</span>{!room.hukum && room.phase === "playingForHukum" && <em>Finding</em>}</div>
      </div>
    </header>

    {room.phase === "awaitingInitialDeal" && <section className={`dealer-stage${isNoHukumRedeal ? " redeal-stage" : ""}`} data-testid="dealer-stage">{isNoHukumRedeal && <div className="redeal-notice" role="status"><strong>No Hukum</strong><span>Redealing with the same dealer…</span></div>}<div><p className="eyebrow">{isFirstDealerSelection ? "Dealer selection" : isNoHukumRedeal ? "No-Hukum redeal" : `Round ${room.roundNumber} dealer`}</p><h2>{isFirstDealerSelection ? `Team ${room.dealerSelection.dealingTeam} lost the draw and deals` : isNoHukumRedeal ? `${nameFor(room.dealer)} deals again` : `Team ${room.dealingTeam} deals · ${nameFor(room.dealer)} is next`}</h2><p>{isFirstDealerSelection ? `Team A ${room.dealerSelection.totals.A} · Team B ${room.dealerSelection.totals.B}${room.dealerSelection.attempts > 1 ? ` · ${room.dealerSelection.attempts - 1} tied draw${room.dealerSelection.attempts === 2 ? "" : "s"} automatically redrawn` : ""}` : isNoHukumRedeal ? "The attempt ended without Hukum after five hands. Captures and standings did not change." : "The match-level standing selected the behind team; its stored alternating dealer sequence selected this dealer."}</p></div>{isFirstDealerSelection && <div className="selection-cards">{room.players.map((player) => <div key={player.id}><DehlaCard compact card={room.dealerSelection.cards[player.id]} disabled /><small>{player.name}</small></div>)}</div>}{room.viewerPlayerId === room.dealer ? <button onClick={() => perform(() => deal({ code: room.code, seatToken: credentials.seatToken, expectedRevision: room.revision }))}>Shuffle and deal five</button> : <p className="turn-banner waiting"><strong>Waiting for {nameFor(room.dealer)} to deal</strong></p>}</section>}

    {room.phase !== "awaitingInitialDeal" && <>
      <div className={`turn-banner ${isTurn ? "your-turn" : "waiting"}`}><span className="turn-symbol" aria-hidden="true">{isTurn ? "◆" : "○"}</span><span><strong>{isTurn ? "Your turn" : `${current?.name ?? "Player"}’s turn`}</strong><small>{leadSuit ? `Lead suit: ${suitName(leadSuit)}` : "Lead any card"}{mustFollow && isTurn ? " · You must follow suit" : ""}</small></span></div>
      {showHukumEvent && room.hukum && <p className="hukum-event" role="status"><span className="event-suit" aria-hidden="true">{suitSymbol[room.hukum]}</span><span><strong>Hukum declared</strong><small>{nameFor(room.hukumDeclarer)} established {hukumLabel} on hand {room.hukumHandNumber}. The card acted as Hukum immediately.</small></span></p>}
      {showSecondDealEvent && <p className={`second-deal-event${showHukumEvent ? " stacked" : ""}`} role="status"><span className="deal-spark" aria-hidden="true">✦</span><span><strong>Second deal complete</strong><small>Hukum established · eight remaining cards added to every hand.</small></span></p>}
      {tableMoment && <p key={tableMoment.key} className={`table-moment ${tableMoment.kind}`} role="status"><span aria-hidden="true">{tableMoment.kind === "capture" ? "↑" : "10"}</span><span><strong>{tableMoment.title}</strong><small>{tableMoment.detail}</small></span></p>}
      <div className="dehla-layout">
        <main className="dehla-table-column">
          <section className="dehla-table" aria-label="Dehla Pakad table">
            <div className="dehla-seats">{room.players.map((player) => {
              const position = positionFor(player.id);
              const isOwnSeat = position === "local";
              const isPartner = position === "partner";
              return <article key={player.id} data-player-id={player.id} data-team={player.team} data-own-seat={isOwnSeat ? "true" : "false"} data-table-position={position} className={`dehla-seat seat-${player.id} position-${position} team-${player.team.toLowerCase()}${player.id === room.currentPlayerId ? " active" : ""}`} aria-label={`${isOwnSeat ? "You" : player.name}, Team ${player.team}, ${player.cardCount} cards${isPartner ? ", your partner" : ""}${player.id === room.dealer ? ", dealer" : ""}`}>
                <span className="seat-initials" aria-hidden="true">P{player.id.slice(-1)}</span>
                <span className="seat-copy"><span className="seat-role">{isOwnSeat ? "You" : isPartner ? "Partner" : `Team ${player.team}`}</span><strong>{player.name}</strong><small>Team {player.team} · {player.cardCount} cards</small></span>
                <span className="seat-badges">{player.id === room.dealer && <b>Dealer</b>}{player.id === room.currentPlayerId && <b>Turn</b>}</span>
              </article>;
            })}</div>
            <div className="dehla-center">
              <div className="trick-zone" aria-label={`Current trick, hand ${room.handsCompleted + 1}`}>
                <div className="trick-heading"><p className="pile-label">Current trick</p><strong>Hand {room.handsCompleted + 1}</strong></div>
                <div className="trick-cards" aria-live="polite">{room.currentTrick.map((cardPlay) => {
                  const position = positionFor(cardPlay.playerId);
                  return <div key={cardPlay.playerId} className={`trick-play trick-${position}`} data-table-position={position}><DehlaCard compact card={cardPlay.card} hukum={room.hukum === cardPlay.card.suit} disabled /><small>{position === "local" ? "You" : nameFor(cardPlay.playerId)}</small></div>;
                })}{room.currentTrick.length === 0 && <div className="empty-pile trick-empty"><span>Lead</span><small>Waiting for the first card</small></div>}</div>
              </div>
              <div className={`pending-lot${room.pendingLotCount ? " has-cards" : ""}`} aria-label={`Pending lot: ${room.pendingLotCount} cards`}>
                <button type="button" className="lot-stack" aria-label={`Inspect pending lot, ${room.pendingLotCount} cards`} aria-expanded={showPendingLot} aria-controls="pending-lot-dialog" onClick={() => setShowPendingLot(true)}><span key={room.pendingLotCount} className="lot-count">{room.pendingLotCount}</span><small>cards</small></button>
                <div className="lot-copy"><strong>Pending lot</strong><small>{room.pendingLotCount ? "Waiting to be lifted" : "The table is clear"}</small></div>
                <div className={`streak-status${room.streakPlayer ? " active" : ""}${streakBlockedByTen ? " carried" : ""}`} aria-label={room.streakPlayer ? `Player ${room.streakPlayer.slice(-1)} has a ${room.streakCount} hand lifting streak. ${streakBlockedByTen ? "A ten carried collection forward." : room.streakCount >= 2 ? "Ready to collect." : "Building streak."}` : "No active lifting streak"}><span aria-hidden="true">{room.streakPlayer ? "🔥" : "○"}</span><strong>{room.streakPlayer ? `P${room.streakPlayer.slice(-1)} ×${room.streakCount}` : "No active streak"}</strong><small>{streakBlockedByTen ? "Collection carries forward" : room.streakCount >= 2 ? "Ready to collect" : room.streakPlayer ? "Building streak" : "Individual lifting streak"}</small></div>
              </div>
            </div>
          </section>
          <section className={`player-hand dehla-player-hand${isTurn ? " active-hand" : ""}`} data-player-id={room.viewerPlayerId}><div className="hand-title"><div><p className="eyebrow">You · Team {own.team}</p><h2>Your hand <span>({ownHand.length})</span></h2></div><small className="hand-hint">{isTurn ? mustFollow ? `Follow ${suitName(leadSuit)}` : "Choose a card" : `Waiting for ${current?.name ?? "the next player"}`}</small></div><div className={`hand-cards${ownHand.length >= 10 ? " large-hand" : ""}`}>{ownHand.map((card) => { const followsSuit = !mustFollow || card.suit === leadSuit; const legal = isTurn && followsSuit; const unavailable = isTurn && mustFollow && !followsSuit; return <DehlaCard key={card.id} card={card} hukum={room.hukum === card.suit} playable={legal} unavailable={unavailable} disabled={!legal || room.phase === "roundComplete"} onClick={() => perform(() => play({ code: room.code, seatToken: credentials.seatToken, expectedRevision: room.revision, cardId: card.id }))} />; })}</div></section>
        </main>
        <aside className="dehla-stats">
          <section className="round-capture"><div className="panel-heading"><p className="eyebrow">Four tens</p><strong>{room.captured.A.tens + room.captured.B.tens}/4 publicly captured</strong></div><div className="tens-score" aria-label={`Team A ${room.captured.A.tens}, Team B ${room.captured.B.tens} captured tens`}><span><small>Team A</small><strong>{room.captured.A.tens}</strong></span><b>{room.captured.A.tens}–{room.captured.B.tens}<small>Tens</small></b><span><small>Team B</small><strong>{room.captured.B.tens}</strong></span></div><div className="tens-track" aria-hidden="true">{tensTrack.map((team, index) => <span key={index} className={team ? `captured team-${team.toLowerCase()}` : ""}><b>10</b><small>{team ?? "—"}</small></span>)}</div><div className="capture-teams"><div className="team-stat team-a"><strong>Team A</strong><span>{room.captured.A.cardCount} captured cards</span></div><div className="team-stat team-b"><strong>Team B</strong><span>{room.captured.B.cardCount} captured cards</span></div></div></section>
          <section className="match-standing"><p className="eyebrow">Net match standing</p><p className="stat-note">Compared from top to bottom. These are not interchangeable points.</p><div className="standing-board"><div className="standing-board-head"><strong>Team A</strong><span>Match</span><strong>Team B</strong></div><div className="standing-row standing-primary"><b>{room.standings.bavaniyas.A}</b><span><strong>Bavaniya</strong><small>Highest priority</small></span><b>{room.standings.bavaniyas.B}</b></div><div className="standing-row standing-secondary"><b>{room.standings.coats.A}</b><span><strong>Coat</strong><small>Second priority</small></span><b>{room.standings.coats.B}</b></div><div className="standing-row standing-tertiary"><b>{room.standings.cumulativeTens.A}</b><span><strong>Cumulative 10s</strong><small>Third priority</small></span><b>{room.standings.cumulativeTens.B}</b></div></div></section>
          <details><summary><strong>Historical totals</strong><span>+</span></summary><p className="stat-note"><strong>Statistics only.</strong> These totals are separate from the net match standing.</p><div className="standing-grid"><span>Team</span><span>Rounds</span><span>Bavaniya</span><span>Coat</span><strong>A</strong><b>{room.standings.lifetime.roundsWon.A}</b><b>{room.standings.lifetime.bavaniyas.A}</b><b>{room.standings.lifetime.coats.A}</b><strong>B</strong><b>{room.standings.lifetime.roundsWon.B}</b><b>{room.standings.lifetime.bavaniyas.B}</b><b>{room.standings.lifetime.coats.B}</b></div><p className="stat-note">Exact draws: {room.standings.lifetime.draws}</p></details>
          <VoicePanel roomCode={room.code} seatToken={credentials.seatToken} />
        </aside>
      </div>
    </>}

    {room.phase === "roundComplete" && room.completedRound && <section className={`round-result dehla-result result-${room.completedRound.resultType}`} role="dialog" aria-modal="true" aria-labelledby="dehla-result-title"><header className="dehla-result-header"><p className="eyebrow">Round {room.roundNumber} complete</p><h2 id="dehla-result-title">{room.completedRound.resultType === "draw" ? "Round drawn" : `Team ${room.completedRound.winningTeam} wins`}</h2><strong className="result-kind">{room.completedRound.resultType === "bavaniya" ? "Bavaniya" : room.completedRound.resultType === "coat" ? "Coat" : room.completedRound.resultType === "draw" ? "Exact 2–2 draw" : "Normal win"}</strong>{room.completedRound.resultType === "bavaniya" && <p>Team {room.completedRound.winningTeam} captured all 52 cards.</p>}{room.completedRound.resultType === "coat" && <p>Team {room.completedRound.winningTeam} captured all four 10s.</p>}</header><div className="result-metrics"><div><small>10s</small><strong>{room.completedRound.tensCaptured.A} <i>—</i> {room.completedRound.tensCaptured.B}</strong><span>A · B</span></div><div><small>Cards</small><strong>{room.completedRound.cardsCaptured.A} <i>—</i> {room.completedRound.cardsCaptured.B}</strong><span>A · B</span></div><div><small>Hukum</small><strong className={room.completedRound.hukum === "hearts" || room.completedRound.hukum === "diamonds" ? "red" : ""}>{suitSymbol[room.completedRound.hukum]}</strong><span>{room.completedRound.hukum}</span></div></div><section className="result-standing"><p className="eyebrow">Net match standing</p><div><span>Bavaniya</span><strong>{room.standings.bavaniyas.A} — {room.standings.bavaniyas.B}</strong><small>A · B</small></div><div><span>Coat</span><strong>{room.standings.coats.A} — {room.standings.coats.B}</strong><small>A · B</small></div><div><span>Cumulative 10s</span><strong>{room.standings.cumulativeTens.A} — {room.standings.cumulativeTens.B}</strong><small>A · B</small></div></section><div className="next-dealer"><span className="seat-initials" aria-hidden="true">P{room.dealer.slice(-1)}</span><span><small>Next dealer · Team {room.dealingTeam}</small><strong>{nameFor(room.dealer)}</strong></span></div><p className="result-context">Hukum declared by {nameFor(room.completedRound.hukumDeclarer)} on hand {room.completedRound.hukumHandNumber}. Round dealer: {nameFor(room.completedRound.dealer)} · Team {room.completedRound.dealingTeam}.</p>{isHost ? <button autoFocus onClick={() => perform(() => advanceRound({ code: room.code, seatToken: credentials.seatToken, expectedRevision: room.revision }))}>Prepare next round</button> : <p className="result-waiting-copy">Waiting for the host to continue…</p>}</section>}
    {showPendingLot && <div className="pending-lot-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowPendingLot(false); }}>
      <section id="pending-lot-dialog" className="pending-lot-dialog" role="dialog" aria-modal="true" aria-labelledby="pending-lot-title">
        <header><div><p className="eyebrow">Public cards</p><h2 id="pending-lot-title">Pending lot · {room.pendingLotCount} cards</h2></div><button type="button" className="quiet" autoFocus onClick={() => setShowPendingLot(false)} aria-label="Close pending lot">Close</button></header>
        <div className="pending-lot-scroll">
          <p className="pending-lot-intro">Every card shown here has already been played publicly. Cards remain in their original play order.</p>
          {room.pendingLotHands.length ? <div className="pending-lot-hands">{room.pendingLotHands.map((hand) => <section key={hand.handNumber} data-hand-number={hand.handNumber} data-winner={hand.winner ?? ""} data-winning-team={hand.winningTeam ?? ""}>
            <header className="pending-lot-hand-heading"><h3>Hand {hand.handNumber}</h3><strong>{hand.winner && hand.winningTeam ? `Won by ${nameFor(hand.winner)} · P${hand.winner.slice(-1)} · Team ${hand.winningTeam}` : "Winner unavailable for this earlier hand"}</strong></header>
            <div className="pending-lot-plays">{hand.plays.map((play, index) => <div key={play.card.id} className={`pending-lot-play${play.playerId === hand.winner ? " winning-play" : ""}`} data-play-order={index + 1} data-player-id={play.playerId ?? ""}><span>{play.playerId ? `P${play.playerId.slice(-1)} · ${nameFor(play.playerId)}` : `Play ${index + 1}`}</span><DehlaCard card={play.card} compact disabled hukum={room.hukum === play.card.suit} /></div>)}</div>
          </section>)}</div> : <div className="pending-lot-empty"><strong>The table is clear</strong><span>No cards are waiting to be collected.</span></div>}
        </div>
      </section>
    </div>}
    {error && <p className="error floating-notice">{error}</p>}
  </section>;
}
