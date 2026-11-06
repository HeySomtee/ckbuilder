import { useState } from 'react';
import { Icon } from '../../components/icon';
import { Notice } from '../../components/notice';
import { CellLoader } from '../../components/cell-loader';
import type { CampaignAward, CampaignDetail } from './api';
import { Badge, ckb, dateTime, Dialog, exportCsv, label } from './presentation';

export function DeleteCampaign({
  detail,
  pending,
  error,
  onDelete,
  onClose,
}: {
  detail: CampaignDetail;
  pending: boolean;
  error: string;
  onDelete: (snapshot: { id: string; revision: number; confirmName: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [target] = useState({ id: detail.id, revision: detail.revision, name: detail.name });
  const [step, setStep] = useState(1),
    [confirmation, setConfirmation] = useState('');
  const current =
    detail.id === target.id && detail.revision === target.revision && detail.name === target.name;
  return (
    <Dialog
      title={step === 1 ? 'Delete this competition?' : 'Confirm deletion'}
      onClose={onClose}
      pending={pending}
    >
      <Badge tone="amber">
        STEP {step} OF 2 · {step === 1 ? 'REVIEW' : 'CONFIRM'}
      </Badge>
      {!current && (
        <Notice tone="attention" title="The competition changed">
          Close this dialog and review the latest details before deleting.
        </Notice>
      )}
      {error && (
        <Notice tone="attention" title="The competition was not deleted">
          {error}
        </Notice>
      )}
      {step === 1 ? (
        <>
          <div className="campaign-delete-target">
            <Icon name={detail.kind === 'five' ? 'five' : 'markets'} />
            <strong>{target.name}</strong>
            <small>
              {detail.kind === 'five'
                ? (detail.gameweek?.name ?? 'Streak Five')
                : `${detail.fixtureCount} selected fixtures`}
            </small>
          </div>
          <p>
            It will disappear from active competition listings and stop accepting new registrations.
          </p>
          <ul>
            <li>Its results and deletion history remain available in the admin archive.</li>
            <li>Existing predictions, squads and payment recovery stay intact.</li>
            <li>Deleting the listing does not cancel prizes already owed.</li>
          </ul>
          <p>Next, type the exact competition name to confirm.</p>
          <div className="campaign-dialog-actions">
            <button className="btn" type="button" onClick={onClose}>
              Keep competition
            </button>
            <button
              className="btn campaign-delete-outline"
              type="button"
              disabled={!current}
              onClick={() => {
                setConfirmation('');
                setStep(2);
              }}
            >
              Continue <Icon name="arrow" />
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Type the exact competition name below.</p>
          <div className="campaign-delete-name">{target.name}</div>
          <label className="campaign-field" htmlFor="campaign-delete-name">
            Competition name
            <input
              id="campaign-delete-name"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={pending}
              aria-describedby="campaign-delete-match"
            />
          </label>
          <p id="campaign-delete-match" aria-live="polite" className="campaign-small">
            {confirmation === target.name
              ? 'Name matches. You can delete this competition.'
              : confirmation
                ? 'The name does not match yet.'
                : 'Use the same letters, capitals and spaces.'}
          </p>
          <p>Financial records and existing obligations are retained.</p>
          <div className="campaign-dialog-actions">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmation('');
                setStep(1);
              }}
            >
              Back
            </button>
            <button
              className="btn campaign-danger"
              type="button"
              disabled={pending || !current || confirmation !== target.name}
              onClick={() =>
                void onDelete({
                  id: target.id,
                  revision: target.revision,
                  confirmName: confirmation,
                })
              }
            >
              {pending && <CellLoader />} Delete competition
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

export function CampaignAdmin({
  detail,
  tab,
  pending,
  onEdit,
  onFinalize,
  onRefresh,
  onRecordPayout,
}: {
  detail: CampaignDetail;
  tab: 'monitor' | 'evidence';
  pending: boolean;
  onEdit: () => void;
  onFinalize: () => void;
  onRefresh: () => void;
  onRecordPayout: (award: CampaignAward) => void;
}) {
  const [search, setSearch] = useState(''),
    [copied, setCopied] = useState('');
  const entrants = detail.adminEntries ?? [];
  const shown = entrants.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const exportUrl = `/api/campaigns?action=export&id=${encodeURIComponent(detail.id)}`;
  const exportAwards = () =>
    exportCsv(
      `streak-${detail.id}-awards.csv`,
      [
        'campaign_id',
        'mode',
        'place',
        'recipient_id',
        'display_name',
        'amount_shannons',
        'usd_reference',
        'receiving_address',
        'status',
        'transaction_hash',
      ],
      detail.awards.map((a) => [
        detail.id,
        detail.rehearsal ? 'rehearsal' : 'community',
        a.place,
        a.publicId ?? '',
        a.name ?? '',
        a.amountShannons,
        a.usdReference,
        a.receivingAddress ?? '',
        a.status,
        a.transactionHash ?? '',
      ]),
    );
  return (
    <>
      <header className="campaign-heading compact">
        <div>
          <span className="campaign-eyebrow">
            {tab === 'evidence' ? 'CAMPAIGN EVIDENCE' : 'COMPETITION CONTROL'}
          </span>
          <h1>{detail.name}</h1>
          <p>
            <Badge>{label(detail.state)}</Badge>{' '}
            {detail.rehearsal && <Badge tone="amber">Rehearsal</Badge>}
          </p>
        </div>
        <button type="button" className="btn" onClick={onRefresh} disabled={pending}>
          {pending && <CellLoader />} Refresh records
        </button>
      </header>
      {detail.state === 'deleted' && (
        <Notice title="This competition is archived">
          Deleted {dateTime(detail.deletedAt)}. Entries, results and existing awards are retained.
          New registrations are closed.
        </Notice>
      )}
      <div className="campaign-admin-metrics">
        <div>
          <small>REGISTERED ACCOUNTS</small>
          <strong>{detail.registeredCount}</strong>
          <span>Includes those who have not played</span>
        </div>
        <div>
          <small>PARTICIPATING</small>
          <strong>{detail.activeCount}</strong>
          <span>At least one qualifying entry</span>
        </div>
        <div>
          <small>PRIZE POOL</small>
          <strong>
            {ckb(detail.prizeTotalShannons)} <small>CKB</small>
          </strong>
          <span>{detail.prizePlaces} winning places</span>
        </div>
        <div>
          <small>SCORE STATUS</small>
          <strong className="campaign-metric-label">{detail.scoreStatus.replace('-', ' ')}</strong>
          <span>
            {detail.verifiedAt
              ? `Checked ${dateTime(detail.verifiedAt)}`
              : 'No verified score update yet'}
          </span>
        </div>
      </div>
      {tab === 'evidence' ? (
        <div className="campaign-results-grid">
          <section className="campaign-panel campaign-evidence">
            <div className="campaign-panel-heading">
              <h2>Records you can trace</h2>
              <p>Exports contain server records for this competition.</p>
            </div>
            {detail.rehearsal && (
              <Notice tone="attention" title="Excluded from community campaign evidence">
                These records are rehearsal activity. Keep them separate from real participant and
                grant statistics.
              </Notice>
            )}
            <dl>
              <div>
                <dt>Registration source</dt>
                <dd>Signed-in application accounts</dd>
              </div>
              <div>
                <dt>Participation source</dt>
                <dd>
                  {detail.kind === 'five'
                    ? 'Saved Five entries'
                    : 'Qualifying confirmed market positions'}
                </dd>
              </div>
              <div>
                <dt>Score source</dt>
                <dd>
                  {detail.kind === 'five' ? 'Gameweek player scoring' : 'Verified market results'}
                </dd>
              </div>
              <div>
                <dt>Reward network</dt>
                <dd>{detail.rehearsal ? 'No mainnet rewards in rehearsal' : 'Mainnet CKB'}</dd>
              </div>
              <div>
                <dt>Prediction network</dt>
                <dd>CKB testnet</dd>
              </div>
            </dl>
            <p>
              Accounts are not a proof of unique people. Registration counts and prediction counts
              measure different actions.
            </p>
            <p>
              These exports do not claim total platform users, unverified volume or automatic payout
              delivery.
            </p>
            <div className="campaign-action-row">
              <a className="btn" href={`${exportUrl}&format=csv`} download>
                Export entry evidence <Icon name="arrow" />
              </a>
              <a className="btn" href={exportUrl} download>
                Download verified JSON <Icon name="arrow" />
              </a>
              <button
                type="button"
                className="btn"
                onClick={exportAwards}
                disabled={!detail.awards.length}
              >
                Export prize records <Icon name="arrow" />
              </button>
            </div>
            {entrants.length < detail.registeredCount && (
              <p className="campaign-small">
                This view contains {entrants.length} of {detail.registeredCount} registered
                accounts. The server export includes all registered accounts.
              </p>
            )}
          </section>
          <section className="campaign-panel campaign-evidence">
            <div className="campaign-panel-heading">
              <h2>What each status means</h2>
            </div>
            <h3>Registered</h3>
            <p>An account joined this competition. It appears on the leaderboard immediately.</p>
            <h3>Participating</h3>
            <p>
              A qualifying entry has been linked. Opening a slip or signing a request alone does not
              count.
            </p>
            <h3>Final</h3>
            <p>The verified standings have been finalized. Award amounts stay fixed.</p>
            <h3>Paid</h3>
            <p>
              The prize transaction has been verified on the reward network. An address or planned
              payout is not payment evidence.
            </p>
          </section>
        </div>
      ) : (
        <>
          <section className="campaign-panel">
            <div className="campaign-panel-heading campaign-split">
              <div>
                <h2>Players on the table</h2>
                <p>Track entries, scores and the exact tie-break time.</p>
              </div>
              <a className="btn" href={`${exportUrl}&format=csv`} download>
                Export entrants <Icon name="arrow" />
              </a>
            </div>
            <label className="campaign-search">
              <Icon name="search" />
              <span className="sr-only">Search registered players</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a player"
              />
            </label>
            <div className="campaign-table-scroll">
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Points</th>
                    <th>Entry</th>
                    <th>Tie-break time</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.publicId}>
                      <td>{p.rank}</td>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>{p.points}</td>
                      <td>
                        {p.participated ? `${p.qualifyingEntries} qualifying` : 'No entry yet'}
                      </td>
                      <td>{dateTime(p.tieBreakAt)}</td>
                      <td>{dateTime(p.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!shown.length && (
              <div className="campaign-empty compact">
                <p>
                  {entrants.length ? 'No players match that search.' : 'Nobody has registered yet.'}
                </p>
              </div>
            )}
          </section>
          <section className="campaign-panel campaign-awards-admin">
            <div className="campaign-panel-heading campaign-split">
              <div>
                <h2>Prizes & payouts</h2>
                <p>
                  {detail.rehearsal
                    ? 'Rehearsal awards are test records. No mainnet rewards are payable.'
                    : 'Winner status and payment status are tracked separately.'}
                </p>
              </div>
              <button
                className="btn"
                type="button"
                onClick={exportAwards}
                disabled={!detail.awards.length}
              >
                Export awards <Icon name="arrow" />
              </button>
            </div>
            {detail.state === 'finished' || detail.state === 'deleted' ? (
              <>
                <div className="campaign-table-scroll">
                  <table className="campaign-table">
                    <thead>
                      <tr>
                        <th>Place</th>
                        <th>Winner</th>
                        <th>Prize</th>
                        <th>Status</th>
                        <th>Receiving address</th>
                        <th>Payment proof</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.awards.map((a) => (
                        <tr key={a.place}>
                          <td>{a.place}</td>
                          <td>{a.name ?? 'Unawarded'}</td>
                          <td>{ckb(a.amountShannons)} CKB</td>
                          <td>
                            <Badge tone={a.status === 'paid' ? 'mint' : ''}>
                              {detail.rehearsal ? 'Rehearsal award' : a.status.replace('-', ' ')}
                            </Badge>
                          </td>
                          <td>
                            {detail.rehearsal ? (
                              'Not collected for rehearsal'
                            ) : a.receivingAddress ? (
                              <button
                                type="button"
                                className="btn"
                                onClick={() => {
                                  void navigator.clipboard
                                    .writeText(a.receivingAddress!)
                                    .then(() => setCopied(String(a.place)))
                                    .catch(() => setCopied('failed'));
                                }}
                              >
                                {copied === String(a.place) ? 'Copied' : 'Copy address'}
                              </button>
                            ) : (
                              'Waiting for recipient'
                            )}
                          </td>
                          <td>
                            {detail.rehearsal ? (
                              'No mainnet payment'
                            ) : a.receivingAddress && a.publicId ? (
                              <button
                                type="button"
                                className="btn"
                                disabled={pending || detail.scoreStatus === 'review-required'}
                                onClick={() => onRecordPayout(a)}
                              >
                                {a.status === 'paid' ? 'Recheck payment' : 'Verify payment'}
                              </button>
                            ) : (
                              'Address required'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {copied === 'failed' && (
                  <Notice tone="attention" title="Address could not be copied">
                    Use the private award export to read the submitted address.
                  </Notice>
                )}
                <p className="campaign-small">
                  {detail.rehearsal
                    ? 'Keep these test awards separate from community campaign rewards.'
                    : 'Review recipients and exact CKB amounts before approving a transfer from your organizer wallet. Exporting addresses does not send funds.'}
                </p>
              </>
            ) : (
              <div className="campaign-award-list">
                {detail.draft.prizes.map((prize) => (
                  <div key={prize.place}>
                    <strong>Place {prize.place}</strong>
                    <span>{ckb(prize.amountShannons)} CKB</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="campaign-action-row">
            {detail.state === 'draft' && (
              <button className="btn primary" type="button" onClick={onEdit}>
                Continue setup <Icon name="arrow" />
              </button>
            )}
            {['live', 'finalizing'].includes(detail.state) && (
              <button className="btn primary" type="button" disabled={pending} onClick={onFinalize}>
                Review final standings <Icon name="arrow" />
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
