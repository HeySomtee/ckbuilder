import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account } from '../account/api';
import { amountShannons, displayShannons } from '../predictions/draft';
import type { DraftStore, Pick } from '../predictions/draft';
import {
  assertActiveWallet,
  assertWalletAccount,
  chooseWallet,
  getWalletState,
  subscribeWallet,
} from '../../lib/wallet';
import { activityHref, followActivity } from '../../lib/direct-route';
import { useNow } from '../../lib/use-now';
import { getBatchConfig, batchTransport } from './batch-api';
import type { BatchClient, BatchReview, BatchRecovery } from './batch-client';
import type { BatchRecord } from './batch-journal';

const money = (value: string | bigint) => `${displayShannons(value)} tCKB`;
const explorer = (hash: string) => `https://pudge.explorer.nervos.org/transaction/${hash}`;
const names = ['Home', 'Draw', 'Away'];
const outcomes = { home: 0, draw: 1, away: 2 } as const;

export function BatchTransaction({
  record,
  client,
  active = true,
  refresh,
  draftStore,
}: {
  record: BatchRecord;
  client: BatchClient;
  active?: boolean;
  refresh: () => void;
  draftStore?: DraftStore;
}) {
  const [conflict, setConflict] = useState('');
  const recovery = useQuery({
    queryKey: ['direct-private', record.ownerHash, 'batch-recovery', record.hash],
    queryFn: () => client.recover(record),
    enabled: active,
    retry: false,
    refetchInterval: active ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const resume = useMutation({
    mutationFn: () => client.submit(recovery.data?.record ?? record),
    retry: false,
    onSettled: () => {
      void recovery.refetch();
      refresh();
    },
  });
  const resolve = useMutation({
    mutationFn: () => client.resolveConflict(recovery.data?.record ?? record, conflict.trim()),
    retry: false,
    onSettled: () => {
      void recovery.refetch();
      refresh();
    },
  });
  const discard = useMutation({
    mutationFn: () => client.discardUnsubmitted(recovery.data?.record ?? record),
    retry: false,
    onSettled: () => {
      void recovery.refetch();
      refresh();
    },
  });
  const now = useNow(active);
  const current = recovery.data?.record ?? record;
  const status = recovery.data?.status;
  useEffect(() => {
    if (status && ['submitted', 'committed', 'confirmed'].includes(status) && record.sourcePicks)
      draftStore?.retireSubmitted(record.sourcePicks);
  }, [status, record.sourcePicks, draftStore]);
  const error = recovery.error ?? resume.error ?? resolve.error ?? discard.error;
  const busy = resume.isPending || resolve.isPending || discard.isPending;
  return (
    <article className="batch-transaction" aria-label="Combined prediction payment">
      <div className="batch-transaction-head">
        <strong>
          {record.offer.lines.length}{' '}
          {record.offer.lines.length === 1 ? 'prediction' : 'predictions'}
        </strong>
        <span className="status">
          {status === 'confirmed'
            ? 'Confirmed'
            : status === 'committed'
              ? 'Confirming'
              : status === 'submitted'
                ? 'Submitted'
                : status === 'resolved' || status === 'discarded'
                  ? 'Not paid'
                  : 'Check payment'}
        </span>
      </div>
      <ul>
        {record.offer.lines.map((line) => (
          <li key={line.fixture.fixtureId}>
            <span>
              {line.fixture.label} <small>{names[line.outcome]}</small>
            </span>
            <strong>{money(line.principalShannons)}</strong>
          </li>
        ))}
      </ul>
      <p role="status">{recovery.data?.message ?? 'Checking your saved payment...'}</p>
      {error && (
        <p className="pick-error" role="alert">
          {error.message}
        </p>
      )}
      <div className="batch-actions">
        <a href={explorer(record.hash)} target="_blank" rel="noreferrer">
          View transaction ↗
        </a>
        <button
          className="quiet"
          disabled={recovery.isFetching || busy}
          onClick={() => void recovery.refetch()}
        >
          Refresh status
        </button>
        {status && ['awaiting-sponsor', 'unknown', 'reorg'].includes(status) && (
          <button
            className="connect"
            disabled={busy || recovery.data?.inputsLive !== true}
            onClick={() => resume.mutate()}
          >
            {resume.isPending ? 'Resuming...' : 'Resume payment'}
          </button>
        )}
      </div>
      {status && ['conflict', 'unknown', 'reorg'].includes(status) && (
        <details>
          <summary>Resolve a conflicting transaction</summary>
          <label>
            Confirmed transaction hash
            <input
              value={conflict}
              onChange={(event) => setConflict(event.target.value)}
              maxLength={66}
            />
          </label>
          <button
            disabled={busy || !/^0x[0-9a-f]{64}$/.test(conflict.trim())}
            onClick={() => resolve.mutate()}
          >
            Verify conflict
          </button>
        </details>
      )}
      {!current.submissionAttemptedAt &&
        !current.finalSignedBytes &&
        current.status !== 'discarded' &&
        now >= current.offer.expiresAt && (
          <button className="quiet" disabled={busy} onClick={() => discard.mutate()}>
            Discard expired, unshared signature
          </button>
        )}
    </article>
  );
}

export function BatchCheckout({
  store,
  account,
  accountReady,
  onSignIn,
  signInPending,
  active,
  onBusy,
  onDismiss,
}: {
  store: DraftStore;
  account: Account | null;
  accountReady: boolean;
  onSignIn: () => void;
  signInPending: boolean;
  active: boolean;
  onBusy: (busy: boolean) => void;
  onDismiss?: () => void;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const wallet = useSyncExternalStore(subscribeWallet, getWalletState);
  const connection = wallet.connection;
  const queryClient = useQueryClient();
  const stamp = JSON.stringify(snapshot.draft);
  const identityKey = `${account?.id ?? 'guest'}:${wallet.revision}`;
  const [receipt, setReceipt] = useState<{ result: BatchRecovery; identityKey: string } | null>(
    null,
  );
  const signing = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const now = useNow(active);
  const config = useQuery({
    queryKey: ['batch-config'],
    queryFn: ({ signal }) => getBatchConfig(signal),
    enabled: active && snapshot.draft.picks.length > 0,
    staleTime: 15_000,
    retry: false,
    refetchInterval: active ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const linked = useQuery({
    queryKey: ['direct-private', identityKey, 'batch-client'],
    enabled: !!connection && accountReady && active,
    queryFn: async () => {
      if (!connection) throw Error('Connect your wallet to continue.');
      await assertActiveWallet(connection);
      if (account) await assertWalletAccount(connection, account.walletAddress);
      const { BatchClient } = await import('./batch-client');
      const client = new BatchClient(connection.signer, batchTransport);
      await client.history();
      await assertActiveWallet(connection);
      return client;
    },
    staleTime: Infinity,
    retry: false,
  });
  const reconnect = useMutation({ mutationFn: chooseWallet, retry: false });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['direct-private'] });
    void queryClient.invalidateQueries({ queryKey: ['private', 'wallet-balance'] });
    void queryClient.invalidateQueries({ queryKey: ['batch-config'] });
  };
  const assertDraft = (expected: string) => {
    const current = store.getSnapshot();
    if (current.blocked || current.conflict || JSON.stringify(current.draft) !== expected)
      throw Error('Your slip changed. Review the updated picks before paying.');
  };
  const assertAccount = () => {
    if (
      !account ||
      queryClient.getQueryData<Account>(['account'])?.id !== account.id ||
      getWalletState().connection !== connection
    )
      throw Error('Your wallet or account changed. Review the slip again.');
  };
  const prepare = useMutation({
    mutationFn: async (input: { stamp: string; identityKey: string }) => {
      if (!connection || !linked.data || !account)
        throw Error('Sign in with your wallet to continue.');
      await assertWalletAccount(connection, account.walletAddress);
      assertDraft(input.stamp);
      const latest = await getBatchConfig();
      if (!latest.enabled)
        throw Error(
          latest.unavailableReason ?? 'Payments are temporarily unavailable. Your picks are saved.',
        );
      assertDraft(input.stamp);
      assertAccount();
      const picks = structuredClone(store.getSnapshot().draft.picks);
      const lines = picks.map((pick) => {
        const fixture = latest.fixtures.find((row) => row.fixtureId === pick.matchId);
        const principal = amountShannons(pick.amountCkb);
        if (!fixture || !['available', 'funded'].includes(fixture.state))
          throw Error(
            `${fixture?.label ?? 'A selected match'} is not available. Your picks are saved.`,
          );
        if (principal === null || principal < BigInt(latest.manifest.limits.minPrincipalShannons))
          throw Error(
            `Enter at least ${money(latest.manifest.limits.minPrincipalShannons)} for ${fixture.label}.`,
          );
        return { fixture, outcome: outcomes[pick.outcome], principal };
      });
      const review = await linked.data.prepare(lines);
      await assertActiveWallet(connection);
      assertDraft(input.stamp);
      assertAccount();
      return { ...input, review, picks };
    },
    retry: false,
  });
  const reviewed =
    prepare.data?.stamp === stamp &&
    prepare.data.identityKey === identityKey &&
    !snapshot.blocked &&
    !snapshot.conflict
      ? prepare.data
      : null;
  const review: BatchReview | null = reviewed?.review ?? null;
  useEffect(() => {
    if (review) reviewHeading.current?.focus({ preventScroll: true });
  }, [review]);
  const submit = useMutation({
    mutationFn: async (input: {
      review: BatchReview;
      picks: Pick[];
      stamp: string;
      identityKey: string;
    }) => {
      if (signing.current || !connection || !linked.data || !account)
        throw Error('Connect your wallet and review your slip.');
      signing.current = true;
      try {
        assertDraft(input.stamp);
        assertAccount();
        await assertWalletAccount(connection, account.walletAddress);
        const latest = await getBatchConfig();
        if (!latest.enabled)
          throw Error('Payments are temporarily unavailable. Your picks are saved.');
        assertDraft(input.stamp);
        assertAccount();
        const current = input.picks.map((pick) => {
          const fixture = latest.fixtures.find((row) => row.fixtureId === pick.matchId);
          if (!fixture) throw Error('A match is no longer available. Review your slip again.');
          return fixture;
        });
        const record = await linked.data.signAndPersist(input.review, current, input.picks);
        refresh();
        await assertActiveWallet(connection);
        assertAccount();
        const result = await linked.data.submit(record);
        if (
          getWalletState().connection === connection &&
          queryClient.getQueryData<Account>(['account'])?.id === account.id &&
          ['submitted', 'committed', 'confirmed'].includes(result.status)
        )
          store.retireSubmitted(input.picks);
        return { result, identityKey: input.identityKey };
      } finally {
        signing.current = false;
        refresh();
      }
    },
    retry: false,
    onSuccess: (value) => {
      setReceipt(value);
      prepare.reset();
    },
    onError: () => {
      prepare.reset();
      refresh();
    },
  });
  const working = prepare.isPending || submit.isPending;
  useEffect(() => {
    onBusy(working);
    return () => onBusy(false);
  }, [working, onBusy]);
  const error =
    (submit.variables?.identityKey === identityKey ? submit.error : null) ??
    (prepare.variables?.identityKey === identityKey ? prepare.error : null) ??
    linked.error ??
    reconnect.error;
  const result = receipt?.identityKey === identityKey ? receipt.result : null;
  const disabled = snapshot.blocked || snapshot.conflict || !snapshot.draft.picks.length;
  return (
    <section className="batch-checkout" aria-label="Slip payment">
      {result && linked.data && (
        <BatchTransaction
          record={result.record}
          client={linked.data}
          active={active}
          refresh={refresh}
          draftStore={store}
        />
      )}
      {snapshot.draft.picks.length > 0 && (
        <>
          {!account ? (
            <button
              className="review-button"
              disabled={!accountReady || signInPending || disabled}
              onClick={onSignIn}
            >
              {signInPending ? 'Connecting...' : 'Connect wallet to pay'}
            </button>
          ) : !connection ? (
            <button
              className="review-button"
              disabled={reconnect.isPending || disabled}
              onClick={() => reconnect.mutate()}
            >
              {reconnect.isPending ? 'Connecting...' : 'Reconnect wallet to pay'}
            </button>
          ) : review && reviewed ? (
            <div className="batch-review" aria-label="Review all predictions">
              <h3 ref={reviewHeading} tabIndex={-1}>
                One payment. {review.offer.lines.length}{' '}
                {review.offer.lines.length === 1 ? 'prediction' : 'predictions'}.
              </h3>
              <dl>
                <div>
                  <dt>Stakes</dt>
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
                <div className="batch-total">
                  <dt>You pay</dt>
                  <dd>{money(review.totalShannons)}</dd>
                </div>
              </dl>
              <p>
                Each prediction settles independently. Storage returns when you claim. Streak covers{' '}
                {money(review.sponsorReserveShannons)} of market setup.
              </p>
              {now >= review.expiresAt && (
                <p className="pick-error">This quote expired. Review again for current amounts.</p>
              )}
              <button
                className="review-button"
                disabled={working || disabled || now >= review.expiresAt}
                onClick={() => submit.mutate(reviewed)}
              >
                {submit.isPending
                  ? 'Complete the wallet request...'
                  : `Pay ${money(review.totalShannons)}`}
              </button>
              <button className="quiet" disabled={working} onClick={() => prepare.reset()}>
                Back to picks
              </button>
            </div>
          ) : (
            <button
              className="review-button"
              disabled={working || disabled || !linked.data || !config.data?.enabled}
              onClick={() => prepare.mutate({ stamp, identityKey })}
            >
              {prepare.isPending
                ? 'Reviewing every prediction...'
                : `Review ${snapshot.draft.picks.length === 1 ? 'payment' : 'all predictions'}`}
            </button>
          )}
          {!review && (
            <p className="batch-hint">
              One payment. Each prediction settles independently. Review includes recoverable
              storage and the network fee.
            </p>
          )}
          {config.isError && (
            <p className="pick-error">
              Payment availability could not be checked.{' '}
              <button className="quiet" onClick={() => void config.refetch()}>
                Retry availability
              </button>
            </p>
          )}
          {config.data && !config.data.enabled && (
            <p className="pick-error">
              {config.data.unavailableReason ??
                'Payments are temporarily unavailable. Your picks are saved.'}
            </p>
          )}
          {error && (
            <p className="pick-error" role="alert">
              {error.message}{' '}
              <a
                href={activityHref}
                onClick={(event) => {
                  followActivity(event);
                  if (event.defaultPrevented) onDismiss?.();
                }}
              >
                View activity
              </a>
            </p>
          )}
        </>
      )}
    </section>
  );
}
