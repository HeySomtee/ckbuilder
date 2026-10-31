import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account } from '../account/api';
import { amountShannons, displayShannons, totalShannons } from '../predictions/draft';
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
import { Notice } from '../../components/notice';
import { PaymentSummary } from './payment-invoice';
import { PaymentProgress, PaymentButtonState, type PaymentStage } from './payment-progress';

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
    refetchInterval: (query) =>
      active && !['confirmed', 'resolved', 'discarded'].includes(query.state.data?.status ?? '')
        ? 15_000
        : false,
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
  const acknowledged = !!status && ['submitted', 'committed', 'confirmed'].includes(status);
  const error =
    recovery.error ?? (acknowledged ? null : (resume.error ?? resolve.error ?? discard.error));
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
                  : status === 'awaiting-sponsor' && current.submissionAttemptedAt
                    ? 'Checking'
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
      <p role="status">
        {recovery.isFetching ? (
          <PaymentButtonState
            variant="wave"
            label={recovery.data?.message ?? 'Checking your saved payment...'}
          />
        ) : (
          (recovery.data?.message ?? 'Checking your saved payment...')
        )}
      </p>
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
          {recovery.isFetching ? <PaymentButtonState label="Refresh status" /> : 'Refresh status'}
        </button>
        {status && ['awaiting-sponsor', 'unknown', 'reorg'].includes(status) && (
          <button
            className="connect"
            disabled={busy || recovery.data?.inputsLive !== true}
            onClick={() => resume.mutate()}
          >
            {resume.isPending ? <PaymentButtonState label="Resuming..." /> : 'Resume payment'}
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
            {resolve.isPending ? <PaymentButtonState label="Verify conflict" /> : 'Verify conflict'}
          </button>
        </details>
      )}
      {!current.submissionAttemptedAt &&
        !current.finalSignedBytes &&
        current.status !== 'discarded' &&
        now >= current.offer.expiresAt && (
          <button className="quiet" disabled={busy} onClick={() => discard.mutate()}>
            {discard.isPending ? (
              <PaymentButtonState label="Discard expired, unshared signature" />
            ) : (
              'Discard expired, unshared signature'
            )}
          </button>
        )}
    </article>
  );
}

function SlipReceipt({
  record,
  client,
  active,
  refresh,
  draftStore,
}: {
  record: BatchRecord;
  client: BatchClient;
  active: boolean;
  refresh: () => void;
  draftStore: DraftStore;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="slip-receipt"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span>
          <strong>
            {record.offer.lines.length}{' '}
            {record.offer.lines.length === 1 ? 'prediction' : 'predictions'}
          </strong>
          <time dateTime={new Date(record.createdAt).toISOString()}>
            {new Date(record.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </time>
        </span>
        <p>{record.offer.lines.map((line) => line.fixture.label).join(' · ')}</p>
        <span>
          {money(record.offer.principalShannons)} in stakes <small>Receipt &amp; status ↗</small>
        </span>
      </summary>
      {expanded && (
        <>
          <BatchTransaction
            record={record}
            client={client}
            active={active}
            refresh={refresh}
            draftStore={draftStore}
          />
          <div className="receipt-costs">
            <p>Refundable storage: {money(record.offer.storageShannons)}</p>
            <p>Network fee: {money(record.offer.feeShannons)}</p>
            <p>Returned storage is claimed after settlement; a claim network fee applies.</p>
          </div>
        </>
      )}
    </details>
  );
}

export function BatchCheckout({
  store,
  account,
  accountReady,
  onSignIn,
  signInPending,
  signInStage,
  signInError,
  active,
  onBusy,
  onDismiss,
  onOpen,
  activityTarget,
  feedbackTarget,
  view = 'picks',
  onActivity,
}: {
  store: DraftStore;
  account: Account | null;
  accountReady: boolean;
  onSignIn: () => void;
  signInPending: boolean;
  signInStage?: string;
  signInError?: string;
  active: boolean;
  onBusy: (busy: boolean) => void;
  onDismiss?: () => void;
  onOpen?: () => void;
  activityTarget?: HTMLElement | null;
  feedbackTarget?: HTMLElement | null;
  view?: 'picks' | 'activity';
  onActivity?: () => void;
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
  const identityRef = useRef(identityKey);
  identityRef.current = identityKey;
  const [saved, setSaved] = useState<{ record: BatchRecord; identityKey: string } | null>(null);
  const [dismissedHash, setDismissedHash] = useState('');
  const [walletStep, setWalletStep] = useState<'preparing' | 'wallet' | 'saving'>('preparing');
  useEffect(() => {
    setSaved(null);
    setReceipt(null);
    setDismissedHash('');
  }, [identityKey]);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const now = useNow(active);
  const config = useQuery({
    queryKey: ['batch-config'],
    queryFn: ({ signal }) => getBatchConfig(signal),
    enabled: active && snapshot.draft.picks.length > 0,
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query) =>
      active
        ? query.state.data?.enabled === false || query.state.status === 'error'
          ? 5_000
          : 30_000
        : false,
    refetchIntervalInBackground: false,
  });
  const linked = useQuery({
    queryKey: ['direct-private', identityKey, 'batch-client'],
    enabled: !!connection && accountReady,
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
  const reconnect = useMutation({
    mutationFn: async () => {
      await chooseWallet();
      const selected = getWalletState().connection;
      if (selected && account) await assertWalletAccount(selected, account.walletAddress);
    },
    retry: false,
  });
  const history = useQuery({
    queryKey: ['direct-private', identityKey, 'batch-background-history'],
    enabled: !!linked.data && !!account && !saved && !signing.current,
    queryFn: async () => {
      const rows = await linked.data!.history();
      const ordered = rows
        .filter((row) => !['discarded', 'resolved'].includes(row.status))
        .sort((a, b) => b.createdAt - a.createdAt);
      // Pending signatures take precedence. Activity retains the full archive.
      const candidates = ordered.filter((row) => row.status !== 'committed').slice(0, 1);
      if (!candidates.length && ordered[0]) candidates.push(ordered[0]);
      for (const row of candidates) {
        const recovery = await linked.data!.recover(row);
        if (!['confirmed', 'resolved', 'discarded'].includes(recovery.status)) return recovery;
      }
      return null;
    },
    staleTime: Infinity,
    retry: false,
  });
  const archive = useQuery({
    queryKey: ['direct-private', identityKey, 'batch-slip-activity'],
    queryFn: () => linked.data!.history(),
    enabled: active && view === 'activity' && !!linked.data && !!account,
    staleTime: 10_000,
    retry: false,
  });
  useEffect(() => {
    if (history.data && !saved && !signing.current) {
      setSaved({ record: history.data.record, identityKey });
      setReceipt({ result: history.data, identityKey });
    }
  }, [history.data, saved, identityKey]);
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
    onMutate: () => {
      submit.reset();
      setSaved(null);
      setReceipt(null);
      setDismissedHash('');
      queryClient.setQueryData(['direct-private', identityKey, 'batch-background-history'], null);
    },
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
      setWalletStep('preparing');
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
        const record = await linked.data.signAndPersist(
          input.review,
          current,
          input.picks,
          (step) => {
            if (identityRef.current === input.identityKey) setWalletStep(step);
          },
        );
        if (identityRef.current === input.identityKey)
          setSaved({ record, identityKey: input.identityKey });
        refresh();
        await assertActiveWallet(connection);
        assertAccount();
        onDismiss?.();
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
  const editingLocked =
    prepare.isPending || (submit.isPending && saved?.identityKey !== identityKey);
  useEffect(() => {
    onBusy(editingLocked);
    return () => onBusy(false);
  }, [editingLocked, onBusy]);
  const result = receipt?.identityKey === identityKey ? receipt.result : null;
  const currentRecord = saved?.identityKey === identityKey ? saved.record : result?.record;
  const background = useQuery({
    queryKey: ['direct-private', currentRecord?.ownerHash, 'batch-recovery', currentRecord?.hash],
    queryFn: () => linked.data!.recover(currentRecord!),
    enabled: !!currentRecord && !!linked.data && !submit.isPending,
    retry: false,
    refetchInterval: currentRecord && !submit.isPending ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const recovered =
    background.data?.record.hash === currentRecord?.hash
      ? background.data
      : result?.record.hash === currentRecord?.hash
        ? result
        : null;
  const terminal = !!recovered && ['confirmed', 'resolved', 'discarded'].includes(recovered.status);
  const acknowledged =
    !!recovered && ['submitted', 'committed', 'confirmed'].includes(recovered.status);
  const error =
    (!acknowledged && submit.variables?.identityKey === identityKey ? submit.error : null) ??
    (prepare.variables?.identityKey === identityKey ? prepare.error : null) ??
    linked.error ??
    reconnect.error;
  useEffect(() => {
    if (
      recovered &&
      ['submitted', 'committed', 'confirmed'].includes(recovered.status) &&
      recovered.record.sourcePicks &&
      connection &&
      getWalletState().connection === connection &&
      queryClient.getQueryData<Account>(['account'])?.id === account?.id
    ) {
      store.retireSubmitted(recovered.record.sourcePicks);
    }
  }, [recovered, store, connection, account?.id, queryClient]);
  const pendingSaved = !!currentRecord && !terminal;
  const disabled =
    snapshot.blocked ||
    snapshot.conflict ||
    !snapshot.draft.picks.length ||
    pendingSaved ||
    history.isFetching ||
    history.isError;
  const principal = totalShannons(snapshot.draft.picks);
  const receiptRows = [
    ...new Map(
      [...(archive.data ?? []), ...(currentRecord ? [currentRecord] : [])].map((row) => [
        row.hash,
        row,
      ]),
    ).values(),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  const stage: PaymentStage | null =
    submit.isPending && submit.variables?.identityKey === identityKey
      ? currentRecord
        ? 'sending'
        : 'authorizing'
      : currentRecord
        ? recovered?.status === 'confirmed'
          ? 'confirmed'
          : recovered?.status === 'submitted' || recovered?.status === 'committed'
            ? 'confirming'
            : recovered?.status === 'unknown' ||
                recovered?.status === 'reorg' ||
                (recovered?.status === 'awaiting-sponsor' &&
                  !!recovered.record.submissionAttemptedAt) ||
                !recovered
              ? 'checking'
              : 'attention'
        : prepare.isPending && prepare.variables?.identityKey === identityKey
          ? 'preparing'
          : review
            ? 'ready'
            : error
              ? 'not-sent'
              : null;
  return (
    <section className="batch-checkout" aria-label="Slip payment">
      {activityTarget &&
        createPortal(
          <>
            <div className="slip-list-caption">
              <span>Recent payments on this device</span>
              <span>{receiptRows.length}</span>
            </div>
            {!connection || !account ? (
              <p className="batch-hint">
                Connect the wallet that made your predictions to view its saved payments. Your full
                activity is also available in My activity.
              </p>
            ) : archive.isError ? (
              <Notice title="Payment history needs a retry">
                <button onClick={() => void archive.refetch()}>Retry payment history</button>
              </Notice>
            ) : receiptRows.length === 0 ? (
              <p className="batch-hint">
                {archive.isFetching ? (
                  <PaymentButtonState variant="wave" label="Loading saved payments…" />
                ) : archive.isPending ? (
                  'Loading saved payments…'
                ) : (
                  'Your payment receipts will appear here. Your current picks stay in Picks.'
                )}
              </p>
            ) : (
              receiptRows.map(
                (row) =>
                  linked.data && (
                    <SlipReceipt
                      key={`${identityKey}:${row.hash}`}
                      record={row}
                      client={linked.data}
                      active={active && view === 'activity' && !submit.isPending}
                      refresh={refresh}
                      draftStore={store}
                    />
                  ),
              )
            )}
            <a
              className="quiet"
              href={activityHref}
              onClick={(event) => {
                followActivity(event);
                if (event.defaultPrevented) onDismiss?.();
              }}
            >
              All predictions and claims ↗
            </a>
          </>,
          activityTarget,
        )}
      {stage && onOpen && (
        <PaymentProgress
          operationKey={currentRecord?.hash ?? identityKey}
          stage={stage}
          terminal={terminal}
          count={currentRecord?.offer.lines.length ?? snapshot.draft.picks.length}
          hidden={active || (!!currentRecord && terminal && dismissedHash === currentRecord.hash)}
          onOpen={onOpen}
          onDismiss={terminal ? () => setDismissedHash(currentRecord!.hash) : undefined}
        >
          {currentRecord && linked.data ? (
            <BatchTransaction
              record={currentRecord}
              client={linked.data}
              active={!submit.isPending}
              refresh={refresh}
              draftStore={store}
            />
          ) : error ? (
            <Notice title="Payment not sent" tone="attention">
              {error.message}
            </Notice>
          ) : (
            <p>Your draft stays saved. No payment is sent until you approve it in your wallet.</p>
          )}
          {background.error && (
            <Notice title="Waiting for a network update" tone="attention">
              Your signed payment is saved. Check its status before trying another payment.
            </Notice>
          )}
        </PaymentProgress>
      )}
      <PaymentSummary
        key={identityKey}
        principal={principal}
        storage={
          review
            ? BigInt(review.storageShannons)
            : config.data
              ? BigInt(config.data.manifest.limits.claimStorageShannons) *
                BigInt(snapshot.draft.picks.length)
              : null
        }
        review={review}
        loading={config.isFetching}
        active={active && view === 'picks'}
      />
      {snapshot.draft.picks.length > 0 && (
        <>
          {!account ? (
            <>
              {signInError && !signInPending && (
                <Notice title="Sign-in did not finish" tone="attention">
                  {signInError} Your picks are saved. Sign-in does not send a payment.
                </Notice>
              )}
              <button
                className="review-button"
                disabled={!accountReady || signInPending || disabled}
                onClick={onSignIn}
              >
                {signInPending ? (
                  <PaymentButtonState label={signInStage ?? 'Connecting wallet'} />
                ) : connection ? (
                  'Sign in to continue'
                ) : (
                  'Connect wallet to pay'
                )}
              </button>
              <p className="batch-hint">Sign-in is free. You will review the payment separately.</p>
            </>
          ) : !connection ? (
            <button
              className="review-button"
              disabled={reconnect.isPending || disabled}
              onClick={() => reconnect.mutate()}
            >
              {reconnect.isPending ? (
                <PaymentButtonState label="Connecting wallet" />
              ) : (
                'Reconnect wallet to pay'
              )}
            </button>
          ) : !['CkbSecp256k1', 'EvmPersonal'].includes(connection.signer.signType) ? (
            <Notice title="Choose a wallet for predictions" tone="attention">
              Sponsored predictions support MetaMask, Zerion and native CKB wallets such as UTXO
              Global and REI. This wallet can sign in, but its payment format is not supported yet.
              Your picks are saved. Switch accounts in{' '}
              <a href="/season/?view=account">My Account</a> to continue.
            </Notice>
          ) : review && reviewed ? (
            <div className="batch-review" aria-label="Review all predictions">
              <h3 ref={reviewHeading} tabIndex={-1}>
                One payment. {review.offer.lines.length}{' '}
                {review.offer.lines.length === 1 ? 'prediction' : 'predictions'}.
              </h3>
              {now >= review.expiresAt && (
                <p className="pick-error">This quote expired. Review again for current amounts.</p>
              )}
              <button
                className="review-button"
                aria-busy={submit.isPending}
                disabled={working || disabled || now >= review.expiresAt}
                onClick={() => submit.mutate(reviewed)}
              >
                {submit.isPending ? (
                  <PaymentButtonState
                    label={
                      currentRecord
                        ? 'Sending your payment'
                        : walletStep === 'wallet'
                          ? 'Approve in your wallet'
                          : walletStep === 'saving'
                            ? 'Saving your signed payment'
                            : 'Preparing wallet approval'
                    }
                  />
                ) : (
                  `Pay ${money(review.totalShannons)}`
                )}
              </button>
              <button className="quiet" disabled={working} onClick={() => prepare.reset()}>
                Back to picks
              </button>
            </div>
          ) : (
            <button
              className="review-button"
              aria-busy={prepare.isPending || (history.isFetching && !pendingSaved)}
              disabled={working || disabled || !linked.data || !config.data?.enabled}
              onClick={() => prepare.mutate({ stamp, identityKey })}
            >
              {prepare.isPending ? (
                <PaymentButtonState label="Preparing your payment" />
              ) : pendingSaved ? (
                <PaymentButtonState label="Checking your saved payment" />
              ) : history.isFetching ? (
                <PaymentButtonState label="Checking saved payments" />
              ) : (
                `Review ${snapshot.draft.picks.length === 1 ? 'payment' : 'all predictions'}`
              )}
            </button>
          )}
          {!review && (
            <p className="batch-hint">One payment. Each prediction settles independently.</p>
          )}
          {pendingSaved && !working && (
            <button className="quiet pending-activity-link" onClick={onActivity}>
              View payment progress in Activity ↗
            </button>
          )}
          {(() => {
            const notices = (
              <>
                {history.isError && (
                  <Notice title="Check saved payments first" tone="attention">
                    Your previous payment status could not be checked.{' '}
                    <button onClick={() => void history.refetch()}>Retry saved payments</button>
                  </Notice>
                )}
                {connection && linked.isFetching && !linked.data && (
                  <p className="batch-hint" role="status">
                    <PaymentButtonState variant="wave" label="Checking your connected wallet..." />
                  </p>
                )}
                {config.isError && (
                  <Notice title="Payment availability needs a retry" tone="attention">
                    Your picks are saved.{' '}
                    <button className="quiet" onClick={() => void config.refetch()}>
                      Retry availability
                    </button>
                  </Notice>
                )}
                {config.data && !config.data.enabled && (
                  <Notice title="Payments are temporarily unavailable" tone="attention">
                    {config.data.unavailableReason && <p>{config.data.unavailableReason}</p>}
                    <p>
                      Your picks are saved. We’ll check again automatically while this slip is open.
                    </p>
                    <button
                      className="quiet"
                      disabled={config.isFetching}
                      onClick={() => void config.refetch()}
                    >
                      {config.isFetching ? (
                        <PaymentButtonState label="Checking payment service" />
                      ) : (
                        'Check again'
                      )}
                    </button>
                  </Notice>
                )}
                {error && (
                  <Notice
                    title={
                      submit.error ? 'Check your payment status' : 'Payment review needs attention'
                    }
                    tone="attention"
                  >
                    {error.message}{' '}
                    {linked.isError && (
                      <button className="quiet" onClick={() => void linked.refetch()}>
                        Retry wallet check
                      </button>
                    )}
                    {submit.error && (
                      <a
                        href={activityHref}
                        onClick={(event) => {
                          followActivity(event);
                          if (event.defaultPrevented) onDismiss?.();
                        }}
                      >
                        View activity
                      </a>
                    )}
                  </Notice>
                )}
              </>
            );
            return feedbackTarget ? createPortal(notices, feedbackTarget) : notices;
          })()}
        </>
      )}
    </section>
  );
}
