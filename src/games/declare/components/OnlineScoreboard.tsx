type ScoreboardPlayer = {
  id: string;
  name: string;
  score: number;
};

type OnlineScoreboardProps = {
  roundNumber: number;
  players: ScoreboardPlayer[];
  roundScores?: Record<string, number> | null;
};

export default function OnlineScoreboard({ roundNumber, players, roundScores }: OnlineScoreboardProps) {
  const lowestTotal = Math.min(...players.map((player) => player.score));

  return <details className="online-scoreboard" open>
    <summary className="scoreboard-heading">
      <p className="eyebrow">Declare</p>
      <h2 id="online-scoreboard-title">Round {roundNumber} scores</h2>
      <span aria-hidden="true">⌄</span>
    </summary>
    <div className="scoreboard-scroll">
      <table>
        <thead><tr><th>Player</th><th>Round</th><th>Total</th></tr></thead>
        <tbody>{players.map((player) => <tr key={player.id}>
          <th scope="row">{player.name}</th>
          <td>{roundScores?.[player.id] ?? 0}</td>
          <td className={player.score === lowestTotal ? "leading-score" : ""}>{player.score}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}
