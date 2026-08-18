"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Card } from "../engine/types";

type Credentials = { code: string; seatToken: string };
const STORAGE_KEY = "declare-online-seat-v1";
const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
const cardLabel = (card: Card) => card.kind === "joker" ? "Joker" : `${card.rank}${symbols[card.suit]}`;
const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");

export default function OnlineDeclareGame() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const createRoom = useMutation(api.rooms.create);
  const joinRoom = useMutation(api.rooms.join);
  const startRoom = useMutation(api.rooms.start);
  const play = useMutation(api.rooms.play);
  const advanceRound = useMutation(api.rooms.advanceRound);
  const finish = useMutation(api.rooms.finish);
  const room = useQuery(api.rooms.view, credentials ? { code: credentials.code, seatToken: credentials.seatToken } : "skip");

  useEffect(() => {
    try { setCredentials(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")); } catch { /* ignore invalid local data */ }
    setLoaded(true);
  }, []);

  function remember(next: Credentials) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setCredentials(next);
  }

  async function perform(action: () => Promise<unknown>) {
    try { setMessage(""); await action(); setSelected([]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The room action failed."); }
  }

  async function create() {
    const code = newCode();
    const seatToken = newToken();
    await perform(async () => { await createRoom({ code, playerName: name, seatToken }); remember({ code, seatToken }); });
  }

  async function join() {
    const code = joinCode.trim().toUpperCase();
    const seatToken = newToken();
    await perform(async () => { await joinRoom({ code, playerName: name, seatToken }); remember({ code, seatToken }); });
  }

  function leave() {
    localStorage.removeItem(STORAGE_KEY);
    setCredentials(null);
    setSelected([]);
    setMessage("");
  }

  if (!loaded) return <section className="game-panel">Loading…</section>;
  if (!credentials) return <section className="game-panel setup-panel">
    <p className="eyebrow">Separate screens</p><h1>Online Declare</h1>
    <p>Create a room or join with a six-character code.</p>
    <div className="name-list">
      <input aria-label="Your name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
      <button disabled={!name.trim()} onClick={create}>Create room</button>
      <div className="join-row">
        <input aria-label="Room code" maxLength={6} placeholder="ROOM CODE" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} />
        <button disabled={!name.trim() || joinCode.trim().length !== 6} onClick={join}>Join room</button>
      </div>
    </div>
    {message && <p className="error">{message}</p>}
  </section>;

  if (room === undefined) return <section className="game-panel"><p>Connecting to room {credentials.code}…</p></section>;
  if (room.kind === "lobby") {
    const isHost = room.viewerPlayerId === room.hostPlayerId;
    return <section className="game-panel setup-panel">
      <p className="eyebrow">Room code</p><h1 className="room-code">{room.code}</h1>
      <p>Share this code. The lobby updates automatically when players join.</p>
      <div className="lobby-list">{room.players.map((player) => <div key={player.id}>{player.name}{player.id === room.hostPlayerId ? " — host" : ""}</div>)}</div>
      {isHost ? <button disabled={room.players.length < 2} onClick={() => perform(() => startRoom({ code: credentials.code, seatToken: credentials.seatToken }))}>Start game</button> : <p className="subtle">Waiting for the host to start…</p>}
      <button className="quiet danger" onClick={leave}>Leave this device</button>
      {message && <p className="error">{message}</p>}
    </section>;
  }

  const viewer = room.players.find((player) => player.id === room.viewerPlayerId)!;
  const isTurn = room.currentPlayerId === room.viewerPlayerId;
  const isHost = room.hostPlayerId === room.viewerPlayerId;
  const ownHand = (viewer.hand ?? []) as Card[];
  const send = (command: { type: "discard"; cardIds: string[] } | { type: "drawFromStock" } | { type: "drawFromPreviousDiscard"; cardId: string } | { type: "declare" }) =>
    perform(() => play({ code: credentials.code, seatToken: credentials.seatToken, expectedRevision: room.revision, command }));

  return <section className="game-panel">
    <header className="game-header"><div><p className="eyebrow">Room {credentials.code} · Round {room.roundNumber}</p><h1>Online Declare</h1></div><div className="stock-count">Stock <strong>{room.stockCount}</strong></div></header>
    <p className="turn-banner">{isTurn ? `Your turn: ${room.status === "awaitingDraw" ? "draw one card" : "discard or Declare"}` : `Waiting for ${room.players.find((player) => player.id === room.currentPlayerId)?.name}`}</p>
    <div className="score-strip">{room.players.map((player) => <span key={player.id}>{player.name}: <strong>{player.score}</strong> · {player.cardCount} cards</span>)}</div>
    <article className="hand current"><div className="hand-title"><h2>Your hand</h2><span>{ownHand.length} cards</span></div><div className="cards">{ownHand.map((card) => <button key={card.id} disabled={!isTurn || room.status !== "playing"} onClick={() => setSelected((items) => items.includes(card.id) ? items.filter((id) => id !== card.id) : [...items, card.id])} className={`card ${card.kind === "standard" && (card.suit === "hearts" || card.suit === "diamonds") ? "red" : ""} ${selected.includes(card.id) ? "selected" : ""}`}>{cardLabel(card)}</button>)}</div></article>
    {isTurn && room.status === "playing" && <div className="turn-actions"><button disabled={!selected.length} onClick={() => send({ type: "discard", cardIds: selected })}>Discard selected ({selected.length})</button><button className="declare" onClick={() => send({ type: "declare" })}>Declare</button></div>}
    {isTurn && room.status === "awaitingDraw" && <div className="draw-panel"><p><strong>Your discard:</strong> {(room.pendingDiscard as Card[]).map(cardLabel).join(", ")}</p><button onClick={() => send({ type: "drawFromStock" })}>Draw from stock</button><p><strong>Or take one previous discard:</strong></p><div className="cards compact">{(room.previousDiscard as Card[]).map((card) => <button className="card" key={card.id} onClick={() => send({ type: "drawFromPreviousDiscard", cardId: card.id })}>{cardLabel(card)}</button>)}</div></div>}
    {room.status === "roundComplete" && room.declarationResult && <div className={`result ${room.declarationResult.succeeded ? "success" : "failure"}`}><h2>Declaration {room.declarationResult.succeeded ? "succeeded" : "failed"}</h2>{room.players.map((player) => <p key={player.id}>{player.name}: hand {room.declarationResult!.handScores[player.id]}, round +{room.declarationResult!.roundScores[player.id]}, total {player.score}</p>)}{isHost && <div className="actions"><button onClick={() => perform(() => advanceRound({ code: credentials.code, seatToken: credentials.seatToken, expectedRevision: room.revision }))}>Next round</button><button className="secondary" onClick={() => perform(() => finish({ code: credentials.code, seatToken: credentials.seatToken, expectedRevision: room.revision }))}>End game</button></div>}</div>}
    {room.status === "gameComplete" && <div className="result success"><h2>Game complete</h2><p>Winner{room.winnerIds.length === 1 ? "" : "s"}: {room.players.filter((player) => room.winnerIds.includes(player.id)).map((player) => player.name).join(", ")}</p></div>}
    {message && <p className="error">{message}</p>}<div className="footer-actions"><button className="quiet danger" onClick={leave}>Forget room on this device</button></div>
  </section>;
}
