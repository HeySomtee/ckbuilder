import { CellLoader } from '../../components/cell-loader';
import { useState } from 'react';
import { money, type FiveData } from './api';
export function RewardsPanel({
  data,
  pending,
  pendingBody,
  action,
  onContinue,
}: {
  data: FiveData;
  pending: boolean;
  pendingBody?: Record<string, unknown>;
  action: (b: Record<string, unknown>) => void;
  onContinue: () => void;
}) {
  const [conflict, setConflict] = useState('');
  const r = data.detail,
    a = data.rewardsAccount;
  if (!r) return null;
  const resolving = (id: string) =>
    pendingBody?.action === 'resolveContribution' && pendingBody.sponsorId === id;
  const moderating = (id: string, state: string) =>
    pendingBody?.action === 'moderate' &&
    pendingBody.sponsorId === id &&
    pendingBody.state === state;
  const collecting = pendingBody?.action === 'claim';
  return (
    <>
      {r.state === 'cancelled' && (
        <div className="five-message">
          This gameweek was cancelled. Confirmed contributions return as rewards-wallet balances.
        </div>
      )}
      {r.ownSponsorships.length > 0 && (
        <section className="glass five-contributions">
          <h3>{r.auction ? 'Your sponsor bids' : 'Your contributions'}</h3>
          {r.ownSponsorships.map((s) => (
            <div key={s.id}>
              <div className="five-summary-row">
                <span>
                  {money(s.amountShannons)} tCKB
                  <small>
                    {s.funding === 'submitted'
                      ? 'Confirming on CKB'
                      : s.funding === 'confirmed'
                        ? s.auctionOutcome || 'Added to the pool'
                        : s.funding === 'conflicted'
                          ? 'Not paid: wallet inputs spent elsewhere'
                          : 'Ready for wallet review'}
                  </small>
                </span>
                {s.funding === 'submitted' && <CellLoader variant="orbit" />}
                {s.funding === 'awaiting' && r.state === 'open' && (
                  <button className="btn" onClick={onContinue}>
                    Continue
                  </button>
                )}
                {s.transactionHash && (
                  <a
                    href={`https://pudge.explorer.nervos.org/transaction/${s.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View transaction ↗
                  </a>
                )}
              </div>
              {s.funding === 'submitted' && (
                <details>
                  <summary>Used these wallet inputs elsewhere?</summary>
                  <p>
                    If another confirmed transaction spent the same inputs, supply its hash. Streak
                    verifies it before closing this contribution. A slow payment alone is not a
                    conflict.
                  </p>
                  <label>
                    Conflicting transaction hash
                    <input
                      value={conflict}
                      maxLength={66}
                      onChange={(e) => setConflict(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn"
                    disabled={pending || !/^0x[0-9a-f]{64}$/i.test(conflict)}
                    aria-busy={resolving(s.id)}
                    onClick={() =>
                      action({
                        action: 'resolveContribution',
                        id: r.id,
                        sponsorId: s.id,
                        conflictingHash: conflict,
                      })
                    }
                  >
                    {resolving(s.id) && <CellLoader variant="orbit" />}
                    Check conflict
                  </button>
                </details>
              )}
            </div>
          ))}
        </section>
      )}
      {a && (
        <section className="glass five-rewards">
          <div>
            <p className="eyebrow">YOUR REWARDS</p>
            <h2>{money(a.availableShannons)} tCKB</h2>
            <p>
              {!data.fundingAvailable
                ? 'Rewards delivery is paused. Your balance and any saved payment remain recoverable.'
                : a.status === 'queued'
                  ? 'Your collection is queued. You can keep exploring.'
                  : BigInt(a.pendingShannons) > 0n
                    ? 'Your payout is confirming. You can keep exploring.'
                    : `Collect from ${money(a.minimumShannons)} tCKB. Smaller balances stay yours and accumulate across gameweeks.`}
            </p>
          </div>
          <button
            className="btn primary"
            disabled={
              pending ||
              !data.fundingAvailable ||
              BigInt(a.pendingShannons) > 0n ||
              a.status === 'queued' ||
              BigInt(a.availableShannons) < BigInt(a.minimumShannons)
            }
            onClick={() => action({ action: 'claim', id: r.id })}
            aria-busy={
              collecting ||
              (data.fundingAvailable && (BigInt(a.pendingShannons) > 0n || a.status === 'queued'))
            }
          >
            {!data.fundingAvailable ? (
              'Delivery paused'
            ) : BigInt(a.pendingShannons) > 0n || a.status === 'queued' ? (
              <>
                <CellLoader variant="orbit" />
                {a.status === 'queued' ? 'Collection queued' : 'Sending rewards'}
              </>
            ) : (
              <>
                {collecting && <CellLoader variant="orbit" />}
                Collect rewards
              </>
            )}
          </button>
          {a.transactionHash && (
            <a
              href={`https://pudge.explorer.nervos.org/transaction/${a.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View latest payout ↗
            </a>
          )}
        </section>
      )}
      {data.admin && r.moderation && r.moderation.length > 0 && (
        <section className="glass five-contributions">
          <h3>Sponsor recognition</h3>
          {r.moderation.map((s) => (
            <div className="five-summary-row" key={s.id}>
              <span>
                {s.name}
                <small>{s.moderation}</small>
                {s.introduction && <small>{s.introduction}</small>}
                {s.description && <p>{s.description}</p>}
                {s.logo && (
                  <a href={s.logo} target="_blank" rel="noopener noreferrer">
                    Review logo ↗
                  </a>
                )}
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer">
                    Review website ↗
                  </a>
                )}
              </span>
              <button
                className="btn"
                disabled={pending}
                aria-busy={moderating(s.id, 'approved')}
                onClick={() =>
                  action({ action: 'moderate', id: r.id, sponsorId: s.id, state: 'approved' })
                }
              >
                {moderating(s.id, 'approved') && <CellLoader variant="orbit" />}
                Approve
              </button>
              <button
                className="btn"
                disabled={pending}
                aria-busy={moderating(s.id, 'hidden')}
                onClick={() =>
                  action({ action: 'moderate', id: r.id, sponsorId: s.id, state: 'hidden' })
                }
              >
                {moderating(s.id, 'hidden') && <CellLoader variant="orbit" />}
                Hide
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
