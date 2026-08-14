"use client";

import { useEffect, useState } from "react";
import { canDeclare, createGame, declare, discardCards, drawFromPreviousDiscard, drawFromStock, endGame, startNextRound } from "../engine/actions";
import { calculateHandScore } from "../engine/scoring";
import { currentPlayer, type ActionResult, type GameState } from "../engine/state";
import type { Card } from "../engine/types";
import { clearActiveGame, loadActiveGame, loadGameHistory, saveGame } from "../../../storage/declare";

const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
const label = (card: Card) => card.kind === "joker" ? "Joker" : `${card.rank}${symbols[card.suit]}`;

export default function DeclareGame() {
  const [names, setNames] = useState(["", ""]);
  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    setGame(loadActiveGame());
    setHistoryCount(loadGameHistory().length);
    setLoaded(true);
  }, []);

  function update(result: ActionResult) {
    if (!result.ok) return setMessage(result.error);
    setGame(result.state);
    setSelected([]);
    setMessage("");
    saveGame(result.state);
    if (result.state.status === "gameComplete") setHistoryCount(loadGameHistory().length);
  }

  function begin() {
    try {
      const next = createGame(names);
      setGame(next);
      saveGame(next);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the game.");
    }
  }

  function reset() {
    clearActiveGame();
    setGame(null);
    setSelected([]);
    setMessage("");
  }

  if (!loaded) return <section className="game-panel">Loading saved game…</section>;
  if (!game) return (
    <section className="game-panel setup-panel">
      <p className="eyebrow">Local game</p><h1>Play Declare</h1>
      <p>Enter 2–6 players. Every player receives seven cards.</p>
      <div className="name-list">
        {names.map((name, index) => <div className="name-row" key={index}>
          <input aria-label={`Player ${index + 1} name`} placeholder={`Player ${index + 1}`} value={name}
            onChange={(event) => setNames((current) => current.map((item, i) => i === index ? event.target.value : item))} />
          {names.length > 2 && <button className="quiet" onClick={() => setNames((current) => current.filter((_, i) => i !== index))}>Remove</button>}
        </div>)}
      </div>
      <div className="actions">
        {names.length < 6 && <button className="secondary" onClick={() => setNames((current) => [...current, ""])}>Add player</button>}
        <button onClick={begin}>Deal cards</button>
      </div>
      {historyCount > 0 && <p className="subtle">Completed local games: {historyCount}</p>}
      {message && <p className="error">{message}</p>}
    </section>
  );

  const active = currentPlayer(game);
  const result = game.declarationResult;
  const winners = game.players.filter((player) => game.winnerIds.includes(player.id));

  return <section className="game-panel">
    <header className="game-header"><div><p className="eyebrow">Round {game.roundNumber}</p><h1>Declare</h1></div><div className="stock-count">Stock <strong>{game.stock.length}</strong></div></header>
    {(game.status === "playing" || game.status === "awaitingDraw") && <p className="turn-banner">{active.name}: {game.status === "playing" ? "select a discard, or Declare" : "draw exactly one card"}</p>}
    <div className="score-strip">{game.players.map((player) => <span key={player.id}>{player.name}: <strong>{player.score}</strong></span>)}</div>
    <div className="hands">{game.players.map((player) => {
      const selectable = player.id === active.id && game.status === "playing";
      return <article className={`hand ${player.id === active.id ? "current" : ""}`} key={player.id}>
        <div className="hand-title"><h2>{player.name}</h2><span>Hand: {calculateHandScore(player.hand)}</span></div>
        <div className="cards">{player.hand.map((card) => <button key={card.id} disabled={!selectable}
          className={`card ${card.kind === "standard" && (card.suit === "hearts" || card.suit === "diamonds") ? "red" : ""} ${selected.includes(card.id) ? "selected" : ""}`}
          onClick={() => setSelected((items) => items.includes(card.id) ? items.filter((id) => id !== card.id) : [...items, card.id])}>{label(card)}</button>)}
          {player.hand.length === 0 && <span className="subtle">Empty hand — Declare to resolve the round.</span>}
        </div>
      </article>;
    })}</div>
    {game.status === "playing" && <div className="turn-actions">
      <button disabled={!selected.length} onClick={() => update(discardCards(game, active.id, selected))}>Discard selected ({selected.length})</button>
      <button className="declare" disabled={!canDeclare(game, active.id)} onClick={() => update(declare(game, active.id))}>Declare</button>
    </div>}
    {game.status === "awaitingDraw" && <div className="draw-panel">
      <p><strong>Your discard:</strong> {game.pendingDiscard.map(label).join(", ")}</p>
      <button onClick={() => update(drawFromStock(game, active.id))}>Draw from stock</button>
      <p><strong>Or take one from the previous discard:</strong></p>
      <div className="cards compact">{game.previousDiscard.length === 0 ? <span className="subtle">None available</span> : game.previousDiscard.map((card) => <button className="card" key={card.id} onClick={() => update(drawFromPreviousDiscard(game, active.id, card.id))}>{label(card)}</button>)}</div>
    </div>}
    {game.status === "roundComplete" && result && <div className={`result ${result.succeeded ? "success" : "failure"}`}>
      <h2>Declaration {result.succeeded ? "succeeded" : "failed"}</h2>
      {game.players.map((player) => <p key={player.id}>{player.name}: hand {result.handScores[player.id]}, round +{result.roundScores[player.id]}, total {player.score}</p>)}
      <div className="actions"><button onClick={() => update(startNextRound(game))}>Start next round</button><button className="secondary" onClick={() => update(endGame(game))}>End game</button></div>
    </div>}
    {game.status === "gameComplete" && <div className="result success"><h2>Game complete</h2><p>Winner{winners.length === 1 ? "" : "s"}: {winners.map((player) => player.name).join(", ")}</p><button onClick={reset}>New game</button></div>}
    {message && <p className="error">{message}</p>}
    {(game.status === "playing" || game.status === "gameComplete") && <div className="footer-actions">{game.status === "playing" && <button className="quiet" onClick={() => update(endGame(game))}>End game</button>}<button className="quiet danger" onClick={reset}>Abandon game</button></div>}
  </section>;
}
