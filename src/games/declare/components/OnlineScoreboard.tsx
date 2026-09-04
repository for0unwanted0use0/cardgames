type ScoreboardPlayer = {
  id: string;
  name: string;
  score: number;
};

type OnlineScoreboardProps = {
  roundNumber: number;
  players: ScoreboardPlayer[];
  completedRounds: Array<{ roundNumber: number; roundScores: Record<string, number> }>;
};

export default function OnlineScoreboard({ roundNumber, players, completedRounds }: OnlineScoreboardProps) {
  const lowestTotal = Math.min(...players.map((player) => player.score));

  return <details className="online-scoreboard" open>
    <summary className="scoreboard-heading">
      <p className="eyebrow">Declare</p>
      <h2 id="online-scoreboard-title">Score history · Round {roundNumber}</h2>
      <span aria-hidden="true">⌄</span>
    </summary>
    <div className="scoreboard-scroll">
      <table>
        <thead><tr><th>Player</th>{completedRounds.map((round) => <th key={round.roundNumber}>R{round.roundNumber}</th>)}<th>Total</th></tr></thead>
        <tbody>{players.map((player) => <tr key={player.id}>
          <th scope="row">{player.name}</th>
          {completedRounds.map((round) => <td key={round.roundNumber}>{round.roundScores[player.id] ?? 0}</td>)}
          <td className={player.score === lowestTotal ? "leading-score" : ""}>{player.score}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}
