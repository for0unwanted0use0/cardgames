import type { DeclarationResult } from "../engine/state";
import type { Card } from "../engine/types";

const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
const suitNames = { clubs: "Clubs", diamonds: "Diamonds", hearts: "Hearts", spades: "Spades" } as const;

export function cardText(card: Card) {
  return card.kind === "joker" ? "Joker" : `${card.rank}${symbols[card.suit]}`;
}

export function cardAriaLabel(card: Card, selected = false) {
  const rankNames: Record<string, string> = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };
  const label = card.kind === "joker" ? "Joker" : `${rankNames[card.rank] ?? card.rank} of ${suitNames[card.suit]}`;
  return `${label}${selected ? ", selected" : ""}`;
}

type PlayingCardProps = {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
};

export function PlayingCard({ card, selected = false, disabled = false, compact = false, onClick }: PlayingCardProps) {
  const red = card.kind === "standard" && (card.suit === "hearts" || card.suit === "diamonds");
  const className = `playing-card${red ? " red" : ""}${selected ? " selected" : ""}${compact ? " compact" : ""}`;
  if (!onClick) return <span className={className} role="img" aria-label={cardAriaLabel(card)}><span>{cardText(card)}</span></span>;
  return <button type="button" className={className} disabled={disabled} aria-pressed={selected} aria-label={cardAriaLabel(card, selected)} onClick={onClick}><span>{cardText(card)}</span></button>;
}

type PlayerSeatProps = {
  name: string;
  cardCount: number;
  score: number;
  isCurrent: boolean;
  isViewer?: boolean;
};

export function PlayerSeat({ name, cardCount, score, isCurrent, isViewer = false }: PlayerSeatProps) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <article className={`player-seat${isCurrent ? " active" : ""}`} aria-label={`${name}, ${cardCount} cards, score ${score}${isCurrent ? ", current turn" : ""}`}>
    <span className="seat-initials" aria-hidden="true">{initials || "?"}</span>
    <span className="seat-copy"><strong>{isViewer ? "You" : name}</strong><small>{cardCount} card{cardCount === 1 ? "" : "s"} · {score} pts</small></span>
    {isCurrent && <span className="turn-marker">Turn</span>}
  </article>;
}

type ResultPlayer = { id: string; name: string; score: number };

export function RoundResult({ result, players, isHost, onNextRound, onEndGame, onLeave }: {
  result: DeclarationResult;
  players: ResultPlayer[];
  isHost: boolean;
  onNextRound: () => void;
  onEndGame: () => void;
  onLeave: () => void;
}) {
  const declarer = players.find((player) => player.id === result.declarerId);
  return <section className="round-result" role="dialog" aria-modal="false" aria-labelledby="round-result-title">
    <p className="eyebrow">{declarer?.name ?? "Player"} declared {result.handScores[result.declarerId]}</p>
    <h2 id="round-result-title">{result.succeeded ? "Successful Declare" : "Declare failed"}</h2>
    <p>{result.succeeded ? "Lowest hand confirmed. Round scores have been added." : `${declarer?.name ?? "The declarer"} receives the highest hand score.`}</p>
    <div className="result-scores">
      {players.map((player) => <div key={player.id}><span>{player.name}</span><strong>+{result.roundScores[player.id]}</strong><small>Total {player.score}</small></div>)}
    </div>
    {isHost ? <div className="actions"><button onClick={onNextRound}>Next round</button><button className="secondary" onClick={onEndGame}>End game</button><button className="result-exit" onClick={onLeave}>Leave table</button></div> : <div className="result-waiting"><p>Waiting for the host to continue…</p><button className="result-exit" onClick={onLeave}>Leave table</button></div>}
  </section>;
}
