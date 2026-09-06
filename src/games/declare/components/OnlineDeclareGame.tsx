"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { calculateHandScore } from "../engine/scoring";
import type { Card } from "../engine/types";
import type { DiscardVisibility } from "../multiplayer/views";
import { playerFacingError } from "../multiplayer/errors";
import { PlayerSeat, PlayingCard, RevealedHands, RoundResult } from "./FeltTable";
import OnlineScoreboard from "./OnlineScoreboard";
import TurnAlertControl from "./TurnAlertControl";
import VoicePanel from "./VoicePanel";
import { trackEvent } from "../../../lib/analytics";

type Credentials = { code: string; seatToken: string };
const STORAGE_KEY = "declare-online-seat-v1";
const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");

export default function OnlineDeclareGame() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [discardVisibility, setDiscardVisibility] = useState<DiscardVisibility>("public");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const lastTrackedResult = useRef("");
  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.rooms.join);
  const startRoom = useMutation(api.rooms.start);
  const play = useMutation(api.rooms.play);
  const advanceRound = useMutation(api.rooms.advanceRound);
  const finish = useMutation(api.rooms.finish);
  const leaveRoom = useMutation(api.rooms.leave);
  const room = useQuery(api.rooms.view, credentials ? { code: credentials.code, seatToken: credentials.seatToken } : "skip");

  useEffect(() => {
    try { setCredentials(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")); } catch { /* ignore invalid local data */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!room || room.kind !== "game" || room.viewerPlayerId !== room.hostPlayerId || (room.status !== "roundComplete" && room.status !== "gameComplete")) return;
    const key = `${room.status}:${room.roundNumber}:${room.revision}`;
    if (lastTrackedResult.current === key) return;
    lastTrackedResult.current = key;
    if (room.status === "roundComplete") trackEvent("round_complete", { round_number: room.roundNumber, player_count: room.players.length });
    else trackEvent("game_complete", { round_number: room.roundNumber, player_count: room.players.length, completion_reason: room.completionReason ?? "score" });
  }, [room]);

  function remember(next: Credentials) { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setCredentials(next); }
  async function perform(action: () => Promise<unknown>) {
    try { setMessage(""); await action(); setSelected([]); }
    catch (error) { setMessage(playerFacingError(error)); }
  }
  async function create() {
    const code = newCode(); const seatToken = newToken();
    await perform(async () => { await createRoom({ code, playerName: name, seatToken, discardVisibility }); remember({ code, seatToken }); trackEvent("create_room", { discard_visibility: discardVisibility }); });
  }
  async function join() {
    const code = joinCode.trim().toUpperCase(); const seatToken = newToken();
    await perform(async () => { await joinRoom({ code, playerName: name, seatToken }); remember({ code, seatToken }); trackEvent("join_group", { method: "room_code" }); });
  }
  function leave() { localStorage.removeItem(STORAGE_KEY); setCredentials(null); setSelected([]); setMessage(""); }
  async function confirmLeave() {
    if (!credentials) return;
    const forfeits = room && room.kind === "game" && room.status !== "gameComplete";
    const question = forfeits
      ? "Leave this game? This counts as a forfeit and cannot be undone."
      : "Leave this room and return home?";
    if (!window.confirm(question)) return;
    try { setMessage(""); await leaveRoom({ code: credentials.code, seatToken: credentials.seatToken }); trackEvent("leave_game", { game_status: room?.kind === "game" ? room.status : "waiting", forfeited: Boolean(forfeits) }); leave(); }
    catch (error) { setMessage(playerFacingError(error)); }
  }
  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); setMessage("Room code copied."); }
    catch { setMessage(`Room code: ${code}`); }
  }

  if (!loaded) return <section className="game-panel loading-panel">Preparing the table…</section>;
  if (!credentials) return <section className="game-panel lobby-shell">
    <div className="lobby-intro"><p className="eyebrow">Play on separate screens</p><h1>Online Declare</h1><p>Set up a private table, share the six-character code, and play together in real time.</p></div>
    <div className="lobby-grid">
      <section className="lobby-card"><span className="lobby-step">01</span><h2>Create a table</h2><label className="field-label">Your name<input placeholder="e.g. Rahul" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <fieldset className="visibility-options"><legend>Who can see the discard?</legend>
          <label><input type="radio" name="discardVisibility" checked={discardVisibility === "public"} onChange={() => setDiscardVisibility("public")} /><span><strong>Everyone</strong><small>All players see it; only the next player may draw.</small></span></label>
          <label><input type="radio" name="discardVisibility" checked={discardVisibility === "nextPlayerOnly"} onChange={() => setDiscardVisibility("nextPlayerOnly")} /><span><strong>Next player only</strong><small>Other players see the discard count, never its identities.</small></span></label>
        </fieldset><button disabled={!name.trim()} onClick={create}>Create private table</button>
      </section>
      <section className="lobby-card"><span className="lobby-step">02</span><h2>Join a table</h2><p>Use the same name field, then enter the room code shared by the host.</p><label className="field-label">Room code<input className="code-input" maxLength={6} autoCapitalize="characters" placeholder="ABC123" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label><button disabled={!name.trim() || joinCode.trim().length !== 6} onClick={join}>Join table</button></section>
    </div>{message && <p className="error" role="alert">{message}</p>}
  </section>;

  if (room === undefined) return <section className="game-panel loading-panel"><p className="eyebrow">Room {credentials.code}</p><h1>Taking your seat…</h1></section>;
  if (room.kind === "unavailable") return <section className="game-panel lobby-shell"><p className="eyebrow">Room unavailable</p><h1>{room.code || "Saved room"} is no longer available</h1><p>The room may have expired or belong to a different deployment. Forget this saved seat to return safely.</p><button onClick={leave}>Return to room setup</button></section>;
  if (room.kind === "lobby") {
    const isHost = room.viewerPlayerId === room.hostPlayerId;
    return <section className="game-panel waiting-lobby">
      <header className="lobby-room-header"><div><p className="eyebrow">Waiting room</p><h1>Gather at the table</h1></div><button className="room-code-button" onClick={() => copyCode(room.code)} aria-label={`Copy room code ${room.code}`}><small>Room code · tap to copy</small><strong>{room.code}</strong></button></header>
      <div className="waiting-layout"><section><h2>Players seated</h2><div className="lobby-list">{room.players.map((player, index) => <div key={player.id}><span className="seat-initials">{player.name[0]?.toUpperCase()}</span><strong>{player.name}</strong><small>{player.id === room.hostPlayerId ? "Host" : `Seat ${index + 1}`}</small></div>)}</div></section><aside className="lobby-settings"><p className="eyebrow">Table setting</p><strong>{room.discardVisibility === "nextPlayerOnly" ? "Private discard" : "Public discard"}</strong><p>{room.discardVisibility === "nextPlayerOnly" ? "Only the next player sees card identities." : "Everyone sees the eligible discard."}</p></aside></div>
      {isHost ? <div className="lobby-actions"><button disabled={room.players.length < 2} onClick={() => perform(async () => { await startRoom({ code: credentials.code, seatToken: credentials.seatToken }); trackEvent("game_start", { player_count: room.players.length, discard_visibility: room.discardVisibility }); })}>Start game · {room.players.length}/6</button>{room.players.length < 2 && <span className="subtle">At least two players are needed.</span>}</div> : <p className="turn-banner waiting"><strong>Waiting for the host</strong><span>The game will begin automatically on this screen.</span></p>}
      <button className="quiet danger lobby-leave" onClick={confirmLeave}>Leave this table</button>{message && <p className="error" role="alert">{message}</p>}
    </section>;
  }

  const viewer = room.players.find((player) => player.id === room.viewerPlayerId)!;
  const currentPlayer = room.players.find((player) => player.id === room.currentPlayerId)!;
  const opponents = room.players.filter((player) => player.id !== room.viewerPlayerId);
  const isTurn = room.currentPlayerId === room.viewerPlayerId;
  const isHost = room.hostPlayerId === room.viewerPlayerId;
  const ownHand = (viewer.hand ?? []) as Card[];
  const discardCards = (room.previousDiscard.cards ?? []) as Card[];
  const canDeclare = isTurn && room.status === "playing" && calculateHandScore(ownHand) < 10;
  const activeGame = room.status === "playing" || room.status === "awaitingDraw";
  const send = (command: { type: "discard"; cardIds: string[] } | { type: "drawFromStock" } | { type: "drawFromPreviousDiscard"; cardId: string } | { type: "declare" }) => perform(() => play({ code: credentials.code, seatToken: credentials.seatToken, expectedRevision: room.revision, command }));
  const turnInstruction = room.status === "awaitingDraw" ? "Choose one card to draw" : "Choose cards to discard";

  return <section className="online-game-shell"><div className="gameplay-stage">
    <header className="online-game-header"><div className="game-title"><p className="eyebrow">Classic Declare</p><h1>Online Declare</h1></div><div className="game-meta"><button className="meta-chip room-chip" onClick={() => copyCode(credentials.code)} aria-label={`Copy room code ${credentials.code}`}><small>Room</small><strong>{credentials.code}</strong></button><span className="meta-chip"><small>Round</small><strong>{room.roundNumber}</strong></span><span className="meta-chip"><small>Stock</small><strong>{room.stockCount}</strong></span><button className="home-button" onClick={confirmLeave} aria-label="Leave room and return home">Home</button></div></header>
    {activeGame && <div className={`turn-banner ${isTurn ? "your-turn" : "waiting"}`} aria-live="polite"><span className="turn-symbol" aria-hidden="true">{isTurn ? "◆" : "○"}</span><span><strong>{isTurn ? "Your turn" : `${currentPlayer.name}’s turn`}</strong><small>{isTurn ? turnInstruction : `Waiting for ${currentPlayer.name} to ${room.status === "awaitingDraw" ? "draw" : "discard or Declare"}`}</small></span></div>}
    <div className="game-layout"><main className="table-column">
      <section className="felt-table" aria-label="Card table"><div className="opponent-strip">{opponents.map((player) => <PlayerSeat key={player.id} name={player.name} cardCount={player.cardCount} score={player.score} isCurrent={player.id === room.currentPlayerId} />)}</div><div className="table-center">
        <section className="pile-zone discard-zone" aria-label="Previous discard"><p className="pile-label">Previous discard</p>{room.previousDiscard.count === 0 ? <div className="empty-pile"><span>Empty</span></div> : discardCards.length > 0 ? <div className="discard-cards">{discardCards.map((card) => <PlayingCard card={card} compact key={card.id} />)}</div> : <div className="hidden-discard"><strong>{room.previousDiscard.count}</strong><span>cards hidden</span></div>}<small>{room.previousDiscard.count > 0 && discardCards.length === 0 ? "Visible only to the eligible player" : `${room.previousDiscard.count} card${room.previousDiscard.count === 1 ? "" : "s"}`}</small></section><span className="table-or">or</span>
        <section className="pile-zone stock-zone" aria-label={`${room.stockCount} cards in stock`}><p className="pile-label">Stock</p><button className="stock-pile" disabled={!(isTurn && room.status === "awaitingDraw")} onClick={() => send({ type: "drawFromStock" })} aria-label={isTurn && room.status === "awaitingDraw" ? `Draw from stock, ${room.stockCount} cards remaining` : `Stock, ${room.stockCount} cards remaining`}><span className="card-back-mark">CT</span></button><small>{room.stockCount} remaining</small></section>
      </div></section>
      <section className="player-hand" aria-labelledby="your-hand-title"><div className="hand-title"><div><p className="eyebrow">Your cards</p><h2 id="your-hand-title">Your hand <span>({ownHand.length})</span></h2></div>{isTurn && room.status === "playing" && <small>{selected.length ? `${selected.length} selected` : "Tap cards to select"}</small>}</div><div className="hand-cards">{ownHand.map((card) => <PlayingCard key={card.id} card={card} selected={selected.includes(card.id)} disabled={!isTurn || room.status !== "playing"} onClick={() => setSelected((items) => items.includes(card.id) ? items.filter((id) => id !== card.id) : [...items, card.id])} />)}{ownHand.length === 0 && <span className="subtle">Your hand is empty. Declare to resolve the round.</span>}</div></section>
      <section className="action-bar" aria-label="Game actions">
        {isTurn && room.status === "playing" && <><div><strong>Select cards to discard</strong><small>Choose one or more cards from your hand.</small></div><div className="action-buttons"><button disabled={!selected.length} onClick={() => send({ type: "discard", cardIds: selected })}>Discard selected{selected.length ? ` · ${selected.length}` : ""}</button>{canDeclare && <button className="declare" onClick={() => send({ type: "declare" })}>Declare</button>}</div></>}
        {isTurn && room.status === "awaitingDraw" && <><div><strong>Choose your draw</strong><small>Take one eligible discard card or draw from stock.</small></div><div className="draw-options"><div className="draw-discard-cards">{discardCards.map((card) => <PlayingCard compact key={card.id} card={card} onClick={() => send({ type: "drawFromPreviousDiscard", cardId: card.id })} />)}</div><button onClick={() => send({ type: "drawFromStock" })}>Draw from stock</button></div></>}
        {!isTurn && activeGame && <div className="waiting-action"><span className="waiting-dots" aria-hidden="true">•••</span><span><strong>Waiting for {currentPlayer.name}</strong><small>Your cards will unlock when it is your turn.</small></span></div>}
      </section>
    </main></div></div>
    <aside className="utility-rail" aria-label="Game information"><OnlineScoreboard roundNumber={room.roundNumber} players={room.players} completedRounds={room.completedRounds} /><VoicePanel roomCode={credentials.code} seatToken={credentials.seatToken} /><details className="game-details"><summary><span>Table information</span><span aria-hidden="true">⌄</span></summary><dl><div><dt>Discard visibility</dt><dd>{room.discardVisibility === "nextPlayerOnly" ? "Next player only" : "Visible to all"}</dd></div></dl><TurnAlertControl isTurn={isTurn} activeGame={activeGame} /><button className="quiet danger" onClick={confirmLeave}>Forget room on this device</button></details></aside>
    {room.status === "roundComplete" && room.declarationResult && <RoundResult result={room.declarationResult} players={room.players} isHost={isHost} onNextRound={() => perform(() => advanceRound({ code: credentials.code, seatToken: credentials.seatToken, expectedRevision: room.revision }))} onEndGame={() => perform(() => finish({ code: credentials.code, seatToken: credentials.seatToken, expectedRevision: room.revision }))} onLeave={confirmLeave} />}
    {room.lastEvent && <p className="room-event" role="status">{room.lastEvent.message}</p>}
    {room.status === "gameComplete" && <section className="round-result game-complete celebration" role="status"><div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div><p className="eyebrow">Final result</p><h2>{room.completionReason === "walkover" ? "Victory by walkover" : "Game complete"}</h2><p>Winner{room.winnerIds.length === 1 ? "" : "s"}: <strong>{room.players.filter((player) => room.winnerIds.includes(player.id)).map((player) => player.name).join(", ")}</strong></p><RevealedHands players={room.players} /><button className="return-home" onClick={confirmLeave}>Return home</button></section>}
    {message && <p className="error floating-error" role="alert">{message}</p>}
  </section>;
}
