import { CellLoader } from '../../components/cell-loader';
import { Icon } from '../../components/icon';
import { money, type FiveRound } from './api';
import './refund-status.css';

const refundCopy = {
  owed: ['Refund recorded', 'Your refund is saved and awaiting delivery.'],
  queued: ['Refund queued', 'Your refund is waiting to be sent. You can leave this page.'],
  paused: [
    'Refund delivery paused',
    'Your refund is still recorded. Delivery will resume when the rewards service is available.',
  ],
  confirming: [
    'Refund confirming on CKB',
    'The payment is being checked for confirmation. You can leave this page.',
  ],
  delayed: [
    'Refund is taking longer than expected',
    'Your refund is saved. Streak is retrying delivery checks. You do not need to bid again.',
  ],
  returned: ['Refund returned', 'Confirmed on CKB and returned to your wallet.'],
  review: [
    'Refund needs a delivery check',
    'Your refund is recorded. The saved payment needs review before delivery can continue.',
  ],
} as const;

export function SponsorRefund({ round }: { round: FiveRound }) {
  const refund = round.sponsorRefund;
  if (!refund) return null;
  const [title, description] = refundCopy[refund.state];
  return (
    <div className="five-refund-status" data-state={refund.state}>
      <p className="five-refund-heading" role="status">
        {refund.state === 'confirming' ? (
          <CellLoader variant="wave" />
        ) : (
          <Icon name={refund.state === 'returned' ? 'shield' : 'wallet'} />
        )}
        <strong>{title}</strong>
        <span>{money(refund.totalShannons)} tCKB</span>
      </p>
      <p>{description}</p>
      {BigInt(refund.returnedShannons) > 0n &&
        BigInt(refund.returnedShannons) < BigInt(refund.totalShannons) && (
          <p>
            {money(refund.returnedShannons)} tCKB returned ·{' '}
            {money((BigInt(refund.totalShannons) - BigInt(refund.returnedShannons)).toString())}{' '}
            tCKB remaining
          </p>
        )}
      {refund.transactionHashes.length > 0 && (
        <details>
          <summary>
            View refund payments <Icon name="chevron-down" />
          </summary>
          <div className="five-refund-links">
            {refund.transactionHashes.map((hash, index) => (
              <a
                key={hash}
                href={`https://pudge.explorer.nervos.org/transaction/${encodeURIComponent(hash)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Refund payment {index + 1} <Icon name="arrow" />
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function SponsorAuction({
  round,
  available,
  onBid,
}: {
  round: FiveRound;
  available: boolean;
  onBid: () => void;
}) {
  const a = round.auction;
  if (!a) return null;
  const open = a.state === 'open',
    settling = a.state === 'confirming',
    cancelled = a.state === 'cancelled';
  const own = a.ownShannons !== '0';
  const status: Record<string, string> = {
    leading: "You're leading",
    outbid: 'Another sponsor leads',
    won: 'You won the sponsor spot',
    refunding: 'Your refund is awaiting a delivery update',
    confirming: 'Your bid is confirming',
  };
  return (
    <section className="five-auction glass" aria-label="Gameweek sponsor auction">
      <div className="five-auction-main">
        <p className="eyebrow">ONE GAMEWEEK. YOUR NAME ON IT.</p>
        <div className="five-auction-title">
          <h2>
            {cancelled
              ? 'Auction cancelled'
              : open
                ? 'Take the sponsor spot.'
                : settling
                  ? 'Finding our matchday sponsor.'
                  : 'This week, made possible.'}
          </h2>
          <span className="five-tag">
            {open
              ? 'Bidding open'
              : settling
                ? 'Confirming bids'
                : cancelled
                  ? 'Refunds queued'
                  : 'Auction closed'}
          </span>
        </div>
        <p>
          {open
            ? 'Back the players. The highest funded bid wins the sponsor spot and funds the prize pool.'
            : settling
              ? 'Bidding has closed. Accepted payments have up to 30 minutes to confirm before the winner is locked in.'
              : cancelled
                ? 'Funded bids are returned automatically to their original wallets.'
                : 'Only the winning bid funds the pool. Other funded bids are returned automatically.'}
        </p>
        <div className="five-auction-metrics">
          <div>
            <small>{open || settling ? 'LEADING FUNDED BID' : 'WINNING BID'}</small>
            <strong>
              {money(a.leadingShannons)} <span>tCKB</span>
            </strong>
          </div>
          <div>
            <small>FUNDED BIDDERS</small>
            <strong>{a.bidderCount}</strong>
          </div>
          {own && (
            <div>
              <small>YOUR TOTAL</small>
              <strong>
                {money(a.ownShannons)} <span>tCKB</span>
              </strong>
            </div>
          )}
        </div>
        {round.sponsorRefund ? (
          <SponsorRefund round={round} />
        ) : (
          status[a.ownStatus] && (
            <p className="five-auction-status" role="status">
              {a.ownStatus === 'confirming' && <CellLoader variant="wave" />}
              {status[a.ownStatus]}
            </p>
          )
        )}
      </div>
      <div className="five-auction-action">
        <small>
          {open ? 'Bidding closes' : 'Bidding closed'}{' '}
          {new Date(a.closesAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </small>
        {open && (
          <button
            className="btn primary"
            disabled={!available || round.state !== 'open'}
            onClick={onBid}
          >
            {own ? 'Increase your bid' : 'Place a sponsor bid'}
          </button>
        )}
        <small>
          {open
            ? `Top-ups add together. Minimum ${money(round.terms.minimumShannons)} tCKB per payment.`
            : round.poolShannons !== '0'
              ? `Top ${round.terms.qualifyingBps / 100}% share ${money(round.poolShannons)} tCKB by final points. Cutoff ties qualify.`
              : 'Squad entry is free, with or without a prize pool.'}
        </small>
        <small>Optional name and logo. Testnet, no cash value.</small>
      </div>
    </section>
  );
}
