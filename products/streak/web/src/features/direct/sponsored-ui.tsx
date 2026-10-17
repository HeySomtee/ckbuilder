import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertActiveWallet, getWalletState } from '../../lib/wallet';
import { useNow } from '../../lib/use-now';
import { amountShannons, displayShannons } from '../predictions/draft';
import type { Pick } from '../predictions/draft';
import { getDemandFixtures } from './sponsored-api';
import type { SponsoredClient, SponsoredReview } from './sponsored-client';
import type { SponsoredRecord } from './sponsored-journal';
import type { DemandFixture } from './sponsored-protocol';
import type { Outcome } from './protocol';

const names = ['Home', 'Draw', 'Away'] as const;
const money = (value: string) => `${displayShannons(BigInt(value))} tCKB`;
const href = (hash: string) => `https://pudge.explorer.nervos.org/transaction/${hash}`;

export function SponsoredCheckout({
  fixture,
  client,
  signedIn,
  draftPick,
  onBusy,
  refresh,
}: {
  fixture: DemandFixture;
  client?: SponsoredClient;
  signedIn: boolean;
  draftPick?: Pick;
  onBusy: (busy: boolean) => void;
  refresh: () => void;
}) {
  const [outcome, setOutcome] = useState<Outcome>(
    draftPick ? ({ home: 0, draw: 1, away: 2 } as const)[draftPick.outcome] : 0,
  );
  const [amount, setAmount] = useState(draftPick?.amountCkb ?? '100');
  const [review, setReview] = useState<SponsoredReview | null>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null),
    signing = useRef(false);
  const now = useNow(true),
    principal = amountShannons(amount);
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  const prepare = useMutation({
    mutationFn: async () => {
      const wallet = getWalletState().connection;
      if (!wallet || !client || !signedIn || principal === null)
        throw Error('Sign in and connect the same wallet before reviewing this prediction.');
      await assertActiveWallet(wallet);
      onBusy(true);
      try {
        return await client.prepare(fixture, outcome, principal);
      } finally {
        onBusy(false);
      }
    },
    retry: false,
    onSuccess: (next) => {
      setReview(next);
      setNotice('Review your exact contribution before signing.');
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      const wallet = getWalletState().connection;
      if (signing.current || !wallet || !client || !review)
        throw Error('A wallet action is already in progress.');
      signing.current = true;
      onBusy(true);
      try {
        await assertActiveWallet(wallet);
        const [current] = await getDemandFixtures(undefined, fixture.fixtureId);
        if (!current) throw Error('Fixture availability changed. Your prediction remains saved.');
        const saved = await client.signAndPersist(review, current);
        setReview(null);
        refresh();
        await assertActiveWallet(wallet);
        setNotice('Your signature is saved. Streak is completing the same transaction.');
        return await client.submit(saved);
      } finally {
        signing.current = false;
        onBusy(false);
        refresh();
      }
    },
    retry: false,
    onSuccess: (result) => {
      setReview(null);
      setNotice(result.message);
    },
    onError: () => {
      refresh();
    },
  });
  const working = prepare.isPending || submit.isPending,
    error = prepare.error ?? submit.error;
  return (
    <section aria-label="Open a market with your prediction">
      <p className="notice">
        Your prediction opens this market in the same transaction. Streak supplies the 3,050 tCKB
        setup reserve. You pay only your stake, claim storage and network fee.
      </p>
      {!signedIn && (
        <p className="notice">
          Sign in with your wallet using the button above to request market sponsorship.
        </p>
      )}
      {fixture.state !== 'available' && !review && (
        <p className="notice">
          {fixture.state === 'reserved'
            ? 'Another first prediction is being reviewed. Refresh availability shortly.'
            : 'Market setup is awaiting confirmation or an operator check.'}
        </p>
      )}
      <div className="direct-outcomes" role="group" aria-label="Contract outcome">
        {names.map((name, index) => (
          <button
            key={name}
            aria-pressed={outcome === index}
            disabled={working}
            onClick={() => {
              setOutcome(index as Outcome);
              setReview(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <label className="direct-amount">
        Your stake{' '}
        <span>
          <input
            inputMode="decimal"
            aria-label="Contract stake in tCKB"
            value={amount}
            maxLength={32}
            disabled={working}
            onChange={(event) => {
              setAmount(event.target.value);
              setReview(null);
            }}
          />
          <b>tCKB</b>
        </span>
      </label>
      <p>Minimum 100 tCKB plus 321 tCKB recoverable claim storage. Wallet change remains yours.</p>
      <button
        className="review-button"
        disabled={
          !client ||
          !signedIn ||
          working ||
          principal === null ||
          principal < 10_000_000_000n ||
          fixture.state !== 'available' ||
          now + 120_000 >= fixture.cutoffMs
        }
        onClick={() => prepare.mutate()}
      >
        {prepare.isPending ? 'Preparing transaction...' : 'Review testnet prediction'}
      </button>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error.message}
        </p>
      )}
      {review && (
        <section className="direct-review" aria-label="Review wallet transaction">
          <p className="eyebrow">BEFORE YOU SIGN</p>
          <h2 ref={heading} tabIndex={-1}>
            Open the market. Make your call.
          </h2>
          <p>
            {fixture.label} · {names[review.outcome]}
          </p>
          <dl>
            <div>
              <dt>Prediction stake</dt>
              <dd>{money(review.principalShannons)}</dd>
            </div>
            <div>
              <dt>Recoverable storage</dt>
              <dd>{money(review.storageShannons)}</dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>{money(review.feeShannons)}</dd>
            </div>
            <div className="direct-total">
              <dt>Total from your wallet</dt>
              <dd>{money(review.totalShannons)}</dd>
            </div>
            <div>
              <dt>Market setup paid by Streak</dt>
              <dd>{money(review.sponsorReserveShannons)}</dd>
            </div>
          </dl>
          <p>
            The setup reserve belongs to the operator and is separate from your payout. Your
            signature authorizes this exact transaction; Streak adds its signature and broadcasts
            it.
          </p>
          <details>
            <summary>Settlement and trust terms</summary>
            <p>
              API-Football regulation time includes stoppage time and excludes extra time and
              penalties. The configured operator reports results and maps the fixture to its market.
              Protocol and creator fees are 2% and 1% of the losing pool. Void markets return
              principal without those fees.
            </p>
            <p>
              Admission uses the actual creation block time. A late prediction is refundable.
              Missing eligible results after six hours permit on-chain cancellation.
            </p>
          </details>
          {now >= review.expiresAt && (
            <p className="pick-error">This quote expired. Prepare a fresh review before signing.</p>
          )}
          <div className="direct-actions">
            <button
              className="review-button"
              disabled={working || now >= review.expiresAt}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Completing your prediction...' : 'Sign prediction in wallet'}
            </button>
            <button className="quiet" disabled={working} onClick={() => setReview(null)}>
              Back to editing
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

export function SponsoredTransaction({
  record,
  client,
  refresh,
  working,
}: {
  record: SponsoredRecord;
  client: SponsoredClient;
  refresh: () => void;
  working: boolean;
}) {
  const cache = useQueryClient(),
    [conflictHash, setConflictHash] = useState('');
  const now = useNow(true);
  const recovery = useQuery({
    queryKey: ['direct-private', record.ownerHash, 'sponsored-transaction', record.hash],
    queryFn: () => client.recover(record),
    retry: false,
    staleTime: 8_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      ['confirmed', 'resolved', 'conflict', 'discarded'].includes(query.state.data?.status ?? '')
        ? false
        : 10_000,
    refetchIntervalInBackground: false,
  });
  const updated = () => {
    void cache.invalidateQueries({ queryKey: ['direct-private'] });
    refresh();
  };
  const resume = useMutation({
    mutationFn: async () => {
      const wallet = getWalletState().connection;
      if (!wallet) throw Error('Reconnect the wallet that signed this prediction.');
      await assertActiveWallet(wallet);
      return client.submit(record);
    },
    retry: false,
    onSuccess: updated,
  });
  const resolve = useMutation({
    mutationFn: () => client.resolveConflict(record, conflictHash.trim()),
    retry: false,
    onSuccess: updated,
  });
  const discard = useMutation({
    mutationFn: () => client.discardUnsubmitted(record),
    retry: false,
    onSuccess: updated,
  });
  const state = recovery.data?.status ?? record.status;
  return (
    <article className="direct-transaction" aria-label="Sponsored prediction transaction">
      <div className="direct-row">
        <strong>First prediction · {record.descriptor.label}</strong>
        <span className="direct-state">{state}</span>
      </div>
      <p>
        {names[record.offer.outcome]} · {money(record.offer.principalShannons)} stake
      </p>
      <a href={href(record.hash)} target="_blank" rel="noreferrer">
        View transaction
      </a>
      <p>{recovery.data?.message ?? 'Your exact signed prediction is saved on this device.'}</p>
      {recovery.data?.confirmations ? <p>{recovery.data.confirmations} confirmations</p> : null}
      {(recovery.error ?? resume.error ?? resolve.error ?? discard.error) && (
        <p className="pick-error" role="alert">
          {(recovery.error ?? resume.error ?? resolve.error ?? discard.error)?.message} Your
          original transaction remains saved.
        </p>
      )}
      {!['confirmed', 'committed', 'submitted', 'resolved', 'discarded'].includes(state) && (
        <button
          className="quiet"
          disabled={working || resume.isPending || recovery.data?.inputsLive !== true}
          onClick={() => resume.mutate()}
        >
          {resume.isPending ? 'Resuming original transaction...' : 'Resume original transaction'}
        </button>
      )}
      {state !== 'discarded' &&
        !(recovery.data?.record ?? record).submissionAttemptedAt &&
        !(recovery.data?.record ?? record).finalSignedBytes &&
        now >= record.offer.expiresAt && (
          <button
            className="quiet"
            disabled={working || discard.isPending || resume.isPending}
            onClick={() => discard.mutate()}
          >
            Discard unshared expired signature
          </button>
        )}
      {['conflict', 'unknown', 'reorg', 'awaiting-sponsor'].includes(state) && (
        <details className="direct-conflict">
          <summary>Recover after a conflicting wallet transaction</summary>
          <p>
            An expired offer or missing response cannot cancel a shared signature. A confirmed
            transaction spending an original input can invalidate it.
          </p>
          <label>
            Conflicting transaction hash
            <input
              value={conflictHash}
              onChange={(event) => setConflictHash(event.target.value)}
              maxLength={66}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button
            className="quiet"
            disabled={
              working || resolve.isPending || !/^0x[0-9a-fA-F]{64}$/.test(conflictHash.trim())
            }
            onClick={() => resolve.mutate()}
          >
            Verify conflicting spend
          </button>
        </details>
      )}
    </article>
  );
}
