import './fixture-run.css';

export type FixtureOutlook = {
  opponent: string;
  opponentName?: string;
  home: boolean;
  kickoff: string | null;
  event?: number | null;
  difficulty?: number;
};

export function FixtureRun({
  fixtures,
  label = 'Next three fixtures',
}: {
  fixtures: FixtureOutlook[];
  label?: string;
}) {
  return (
    <span className="fixture-outlook" role="group" aria-label={label}>
      <span className="fixture-outlook-label">NEXT 3</span>
      <span className="fixture-outlook-chips">
        {Array.from({ length: 3 }, (_, index) => {
          const fixture = fixtures[index];
          const details = fixture
            ? `${fixture.opponentName ?? fixture.opponent}, ${fixture.home ? 'home' : 'away'}${fixture.event ? `, Gameweek ${fixture.event}` : ''}. ${fixture.kickoff ? new Date(fixture.kickoff).toLocaleString() : 'Date to be confirmed'}${fixture.difficulty ? `. FPL difficulty ${fixture.difficulty} of 5` : ''}`
            : 'No further confirmed fixture available';
          return (
            <span
              key={index}
              className="fixture-chip"
              data-difficulty={fixture?.difficulty}
              data-empty={!fixture}
              title={details}
              aria-label={details}
            >
              <b>{fixture?.opponent ?? 'TBC'}</b>
              <small>{fixture ? (fixture.home ? 'H' : 'A') : ''}</small>
            </span>
          );
        })}
      </span>
    </span>
  );
}
