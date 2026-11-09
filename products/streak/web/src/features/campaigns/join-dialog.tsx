import type { ReactNode } from 'react';
import type { CampaignDetail } from './api';
import { ckb, dateTime, Dialog } from './presentation';

export function CampaignJoinDialog({
  detail,
  pending,
  onClose,
  children,
}: {
  detail: CampaignDetail;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const five = detail.kind === 'five';
  return (
    <Dialog
      className="campaign-join-dialog"
      eyebrow={five ? 'STREAK FIVE COMPETITION' : 'PREDICTION COMPETITION'}
      title={detail.name}
      onClose={onClose}
      pending={pending}
    >
      <p className="campaign-join-intro">Join for free. Your place on the leaderboard is ready.</p>
      <dl className="campaign-join-facts">
        <div>
          <dt>{detail.rehearsal ? 'Test prize pool' : 'Prize pool'}</dt>
          <dd>
            {ckb(detail.prizeTotalShannons)} <small>CKB</small>
          </dd>
        </div>
        <div>
          <dt>Winning places</dt>
          <dd>{detail.prizePlaces}</dd>
        </div>
        <div>
          <dt>{five ? 'Format' : 'Fixtures'}</dt>
          <dd>{five ? 'Five-a-side' : detail.fixtureCount}</dd>
        </div>
      </dl>
      <div className="campaign-join-rules">
        <h3>How your entry counts</h3>
        <ul>
          {five ? (
            <>
              <li>Your saved squad for {detail.gameweek?.name ?? 'this gameweek'} counts.</li>
              <li>Streak Five points decide the table. Earlier final squad saves break a tie.</li>
            </>
          ) : (
            <>
              <li>Only your first qualifying paid prediction per fixture counts.</li>
              <li>
                {detail.predictionEntryPolicy === 'explicit-entry-v3'
                  ? 'Select this competition in your slip before paying. Regular predictions never use your competition entry.'
                  : detail.predictionEntryPolicy === 'first-admitted-v2'
                    ? 'Earlier valid predictions on these fixtures count when you join before registration closes.'
                    : 'For this competition, only predictions admitted after registration count.'}
              </li>
              <li>Correct result: 3 points. Stake size does not affect points.</li>
              <li>Tied on points? The earlier final qualifying prediction wins.</li>
            </>
          )}
        </ul>
      </div>
      <p className="campaign-join-disclosure">
        <strong>{detail.rehearsal ? 'Rehearsal only.' : 'Testnet play, mainnet prizes.'}</strong>{' '}
        {detail.rehearsal
          ? 'No mainnet rewards or payout addresses. Prize amounts are for testing.'
          : 'Playing uses testnet tCKB. Mainnet CKB prizes are paid by the organizer after approval.'}
      </p>
      <div className="campaign-join-actions">{children}</div>
      <p className="campaign-join-deadline">
        Registration closes {dateTime(detail.registrationClosesAt)} · Local time
      </p>
    </Dialog>
  );
}
