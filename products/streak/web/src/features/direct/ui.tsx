import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/core';
import { getDirectMarkets } from './api';
import { Activity } from './activity';
import { DirectClient } from './client';
import type { Review } from './client';
import { SponsoredClient } from './sponsored-client';
import { BatchClient } from './batch-client';
import { batchTransport } from './batch-api';
import { BatchTransaction } from './batch-ui';
import { getDemandFixtures, sponsorTransport } from './sponsored-api';
import { SponsoredCheckout, SponsoredTransaction } from './sponsored-ui';
import type { JournalRecord } from './journal';
import { MANIFEST, MIN_PRINCIPAL } from './protocol';
import type { Descriptor, Outcome, Point } from './protocol';
import { getPublicMarket } from '../predictions/api';
import { amountShannons, displayShannons } from '../predictions/draft';
import type { Pick, DraftStore } from '../predictions/draft';
import type { Account } from '../account/api';
import {
  assertActiveWallet,
  assertWalletAccount,
  chooseWallet,
  disconnectWallet,
  getWalletState,
  subscribeWallet,
} from '../../lib/wallet';
import { directHref, followDirect } from '../../lib/direct-route';
import { marketHref, followMarket, navigateMarket } from '../../lib/market-route';
import { TeamBadge } from '../../components/team-badge';
import { useNow } from '../../lib/use-now';
import '../../design-system/direct.css';

const outcomeNames = ['Home', 'Draw', 'Away'] as const;
const outcomeIndexes = { home: 0, draw: 1, away: 2 } as const;
const transactionUrl = (hash: string) => `https://pudge.explorer.nervos.org/transaction/${hash}`;
const money = (value: string | bigint) => `${displayShannons(BigInt(value))} tCKB`;
function browseMarkets(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigateMarket(null);
}
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'This action could not finish. Your saved transaction is retained.';

interface Connection {
  client: DirectClient;
  sponsored: SponsoredClient;
  batch: BatchClient;
  address: string;
  ownerHash: string;
}

function TransactionLink({ hash, label = 'View transaction' }: { hash: string; label?: string }) {
  return (
    <a href={transactionUrl(hash)} target="_blank" rel="noreferrer">
      {label} <span aria-hidden="true">↗</span>
    </a>
  );
}

function PendingTransaction({
  record,
  connection,
  refresh,
}: {
  record: JournalRecord;
  connection: Connection;
  refresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflictHash, setConflictHash] = useState('');
  const recovery = useQuery({
    queryKey: ['direct-private', connection.ownerHash, 'transaction', record.hash],
    queryFn: () => connection.client.recover(record),
    retry: false,
    staleTime: 8_000,
    refetchInterval: (query) =>
      ['confirmed', 'resolved', 'rejected', 'conflict'].includes(query.state.data?.status ?? '')
        ? false
        : 10_000,
    refetchIntervalInBackground: false,
  });
  const retry = useMutation({
    mutationFn: () => connection.client.broadcast(record),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['direct-private', connection.ownerHash] });
      refresh();
    },
  });
  const resolveConflict = useMutation({
    mutationFn: () => connection.client.resolveConflict(record, conflictHash.trim()),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['direct-private', connection.ownerHash] });
      refresh();
    },
  });
  const state = recovery.data?.status ?? record.status;
  return (
    <article className="direct-transaction">
      <div className="direct-row">
        <strong>
          {record.kind === 'claim' ? 'Claim' : 'Prediction'} · {record.descriptor.label}
        </strong>
        <span className="direct-state">{state}</span>
      </div>
      <p>
        {record.kind === 'claim'
          ? `${money(record.payoutShannons)} to your wallet`
          : `${record.outcome === null ? '' : outcomeNames[record.outcome]} · ${money(record.principalShannons)} stake`}
      </p>
      <TransactionLink hash={record.hash} />
      {recovery.data && (
        <p>
          {recovery.data.message}
          {recovery.data.confirmations > 0
            ? ` ${recovery.data.confirmations} confirmation${recovery.data.confirmations === 1 ? '' : 's'}.`
            : ''}
        </p>
      )}
      {recovery.isError && (
        <p className="pick-error" role="alert">
          {recovery.error.message} Confirmation is unknown. Do not submit another payment.
        </p>
      )}
      {retry.isError && (
        <p className="pick-error" role="alert">
          {retry.error.message}
        </p>
      )}
      {['conflict', 'rejected', 'unknown', 'reorg'].includes(state) && (
        <details className="direct-conflict">
          <summary>Recover after a conflicting wallet transaction</summary>
          <p>
            If another transaction spent one of these inputs, enter its hash. Streak checks the
            confirmed spend before allowing a new review. Your original signed transaction stays
            saved.
          </p>
          <label>
            Conflicting transaction hash
            <input
              value={conflictHash}
              onChange={(event) => setConflictHash(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              maxLength={66}
            />
          </label>
          <button
            className="quiet"
            disabled={
              resolveConflict.isPending ||
              retry.isPending ||
              !/^0x[0-9a-fA-F]{64}$/.test(conflictHash.trim())
            }
            onClick={() => resolveConflict.mutate()}
          >
            {resolveConflict.isPending
              ? 'Checking confirmed spend...'
              : 'Verify conflicting transaction'}
          </button>
          {resolveConflict.isError && (
            <p className="pick-error" role="alert">
              {resolveConflict.error.message}
            </p>
          )}
        </details>
      )}
      {(state === 'signed' ||
        ((state === 'unknown' || state === 'reorg' || state === 'rejected') &&
          recovery.data?.inputsLive === true)) && (
        <button
          className="quiet"
          disabled={retry.isPending || recovery.isFetching}
          onClick={() => retry.mutate()}
        >
          {retry.isPending ? 'Checking saved transaction...' : 'Retry saved transaction'}
        </button>
      )}
      {state === 'committed' && record.kind === 'deposit' && (
        <small>Committed to CKB. Admission and settlement are checked separately below.</small>
      )}
    </article>
  );
}

function MarketPositions({
  descriptor,
  connection,
  onClaim,
  working,
}: {
  descriptor: Descriptor;
  connection: Connection;
  onClaim: (descriptor: Descriptor, point: Point) => void;
  working: boolean;
}) {
  const snapshot = useQuery({
    queryKey: [
      'direct-private',
      connection.ownerHash,
      'positions',
      descriptor.type.codeHash,
      descriptor.type.args,
      descriptor.creationTxHash,
    ],
    queryFn: () => connection.client.discover(descriptor),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  return (
    <article className="direct-position-market">
      <div className="direct-row">
        <h3>{descriptor.label}</h3>
        <span className="direct-state">{snapshot.data?.phase ?? 'Checking chain'}</span>
        <button
          className="quiet"
          disabled={snapshot.isFetching}
          onClick={() => void snapshot.refetch()}
        >
          {snapshot.isFetching ? 'Checking...' : 'Check result'}
        </button>
      </div>
      {snapshot.isError && (
        <div className="notice error" role="alert">
          <p>{snapshot.error.message}</p>
          <button className="quiet" onClick={() => void snapshot.refetch()}>
            Retry chain read
          </button>
        </div>
      )}
      {snapshot.data?.uncertainty && <p className="notice">{snapshot.data.uncertainty}</p>}
      {snapshot.data?.report && (
        <p>
          {snapshot.data.report.eligible
            ? `A timely ${outcomeNames[snapshot.data.report.outcome]} result is awaiting settlement.`
            : 'The submitted report is outside the valid time window and cannot settle this market.'}{' '}
          <TransactionLink hash={snapshot.data.report.transactionHash} label="View result report" />
        </p>
      )}
      {snapshot.data?.positions.map((position) => (
        <div className="direct-position" key={position.id}>
          <div>
            <strong>
              {outcomeNames[position.outcome]} · {money(position.principalShannons)}
            </strong>
            <p>{position.status}</p>
          </div>
          {position.status === 'claimable' && (
            <button
              className="connect"
              disabled={working}
              onClick={() => onClaim(descriptor, position.outPoint)}
            >
              Review claim
            </button>
          )}
          {position.entitlementShannons && (
            <small>
              {money(position.entitlementShannons)}{' '}
              {position.status === 'claimed' || position.status === 'refunded'
                ? 'returned'
                : 'recoverable'}
              , including storage
            </small>
          )}
          {position.transactionHash && <TransactionLink hash={position.transactionHash} />}
          {position.claimTransactionHash && (
            <TransactionLink hash={position.claimTransactionHash} label="View claim payment" />
          )}
        </div>
      ))}
      {snapshot.data && snapshot.data.positions.length === 0 && (
        <p>
          No live positions for this wallet in this market. Saved transactions remain in your
          activity.
        </p>
      )}
      <small>
        Reports are checked against their CKB block time. A countdown alone cannot settle or cancel
        a market.
      </small>
    </article>
  );
}

export default function DirectPage({
  marketId,
  account,
  accountReady,
  draftPick,
  activityOnly = false,
  draftStore,
}: {
  marketId?: string;
  account: Account | null;
  accountReady: boolean;
  draftPick?: Pick;
  activityOnly?: boolean;
  draftStore?: DraftStore;
}) {
  const queryClient = useQueryClient();
  const title = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const reviewEpoch = useRef(0);
  const wallet = useSyncExternalStore(subscribeWallet, getWalletState);
  const activeWallet = wallet.connection;
  const linkedWallet = useQuery({
    queryKey: ['direct-private', activeWallet?.revision, 'connection', account?.walletAddress],
    enabled: !!activeWallet && accountReady,
    queryFn: async (): Promise<Connection> => {
      if (!activeWallet) throw Error('Connect your wallet first.');
      await assertActiveWallet(activeWallet);
      if (account) await assertWalletAccount(activeWallet, account.walletAddress);
      const { signer, address } = activeWallet;
      const lock = (await ccc.Address.fromString(address, signer.client)).script;
      const client = new DirectClient(signer, MANIFEST, 'wallet');
      await client.balance();
      await client.history();
      await assertActiveWallet(activeWallet);
      const sponsored = new SponsoredClient(signer, sponsorTransport);
      await sponsored.history();
      const batch = new BatchClient(signer, batchTransport);
      await batch.history();
      return { client, sponsored, batch, address, ownerHash: lock.hash() };
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const connection = activeWallet ? (linkedWallet.data ?? null) : null;
  const [outcome, setOutcome] = useState<Outcome>(
    draftPick ? outcomeIndexes[draftPick.outcome] : 0,
  );
  const [amount, setAmount] = useState(draftPick?.amountCkb ?? '100');
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState('');
  const [sponsoredBusy, setSponsoredBusy] = useState(false);
  const [visibleMarkets, setVisibleMarkets] = useState(4);
  const [visibleTransactions, setVisibleTransactions] = useState(8);
  useEffect(() => {
    reviewEpoch.current++;
    setReview(null);
    setNotice('');
  }, [activeWallet?.revision]);
  const now = useNow(true);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    mounted.current = true;
    title.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
    };
  }, []);
  const detail = useQuery({
    queryKey: ['public-market', marketId],
    enabled: !!marketId,
    queryFn: ({ signal }) => getPublicMarket(marketId!, signal),
    staleTime: 15_000,
    retry: 1,
  });
  const catalogue = useQuery({
    queryKey: ['direct-catalogue'],
    queryFn: ({ signal }) => getDirectMarkets(signal),
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const descriptor = catalogue.data?.find(
    (row) => row.fixtureId === detail.data?.market.matchId && row.entryEnabled,
  );
  const demand = useQuery({
    queryKey: ['direct-demand', detail.data?.market.matchId],
    enabled: !!detail.data?.market.matchId && !descriptor,
    queryFn: ({ signal }) => getDemandFixtures(signal, detail.data!.market.matchId),
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const demandFixture = demand.data?.[0];
  const history = useQuery({
    queryKey: ['direct-private', connection?.ownerHash, 'history'],
    enabled: !!connection,
    queryFn: () => connection!.client.history(),
    retry: false,
    staleTime: 5_000,
  });
  const balance = useQuery({
    queryKey: ['direct-private', connection?.ownerHash, 'balance'],
    enabled: !!connection,
    queryFn: () => connection!.client.balance(),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const sponsoredHistory = useQuery({
    queryKey: ['direct-private', connection?.ownerHash, 'sponsored-history'],
    enabled: !!connection,
    queryFn: () => connection!.sponsored.history(),
    retry: false,
    staleTime: 5_000,
  });
  const batchHistory = useQuery({
    queryKey: ['direct-private', connection?.ownerHash, 'batch-history'],
    enabled: !!connection,
    queryFn: () => connection!.batch.history(),
    retry: false,
    staleTime: 5_000,
  });
  const connect = useMutation({
    mutationFn: chooseWallet,
    retry: false,
    onSuccess: () => {
      if (mounted.current) {
        setReview(null);
        setNotice('Wallet connected. Review every amount before signing.');
      }
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['direct-private'] });
  };
  const prepare = useMutation({
    mutationFn: async (claim?: { descriptor: Descriptor; point: Point }) => {
      if (!connection || !activeWallet) throw Error('Connect your wallet first.');
      const epoch = reviewEpoch.current;
      await assertActiveWallet(activeWallet);
      if (claim) {
        const result = await connection.client.prepareClaim(claim.descriptor, claim.point);
        await assertActiveWallet(activeWallet);
        return { result, epoch, revision: activeWallet.revision };
      }
      const principal = amountShannons(amount);
      if (
        !descriptor ||
        !descriptor.entryEnabled ||
        principal === null ||
        principal < MIN_PRINCIPAL
      )
        throw Error('Choose an open contract market and a stake of at least 100 tCKB.');
      if (
        detail.data?.market.matchId !== descriptor.fixtureId ||
        Date.parse(detail.data.market.kickoff) !== descriptor.cutoffMs
      )
        throw Error('Football fixture details changed. New entries are paused.');
      const result = await connection.client.prepareDeposit(descriptor, outcome, principal);
      await assertActiveWallet(activeWallet);
      return { result, epoch, revision: activeWallet.revision };
    },
    retry: false,
    onSuccess: ({ result, epoch, revision }) => {
      if (
        mounted.current &&
        epoch === reviewEpoch.current &&
        getWalletState().connection?.revision === revision
      ) {
        setReview(result);
        setNotice('Review the exact wallet transaction below.');
      }
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (busy.current || !connection || !review || !activeWallet)
        throw Error('A wallet action is already in progress.');
      busy.current = true;
      try {
        await assertActiveWallet(activeWallet);
        let current = review.descriptor;
        if (review.kind === 'deposit') {
          const latest = await getDirectMarkets(undefined, review.descriptor.fixtureId);
          const found = latest.find((row) => row.id === review.descriptor.id);
          if (!found?.entryEnabled)
            throw Error('New entries are unavailable. Your draft is retained.');
          current = found;
        }
        const signed = await connection.client.signAndPersist(review, current);
        await assertActiveWallet(activeWallet);
        if (mounted.current && getWalletState().connection?.revision === activeWallet.revision)
          setNotice('Signed transaction saved. Sending the same transaction to CKB.');
        const result = await connection.client.broadcast(signed);
        return { signed, result, revision: activeWallet.revision };
      } finally {
        busy.current = false;
      }
    },
    retry: false,
    onSuccess: ({ revision }) => {
      if (mounted.current && getWalletState().connection?.revision === revision) {
        setReview(null);
        setNotice('Transaction saved. Follow confirmation and admission in your activity below.');
        refresh();
      }
    },
    onError: () => {
      if (mounted.current) {
        setReview(null);
        refresh();
      }
    },
  });
  const savedDescriptors = new Map<string, Descriptor>();
  const definitionKey = (row: Descriptor) =>
    `${row.type.codeHash}:${row.type.args}:${row.creationTxHash}`;
  for (const row of history.data ?? [])
    savedDescriptors.set(definitionKey(row.descriptor), row.descriptor);
  for (const row of sponsoredHistory.data ?? [])
    if (row.status === 'committed' || row.finalSignedBytes)
      savedDescriptors.set(definitionKey(row.descriptor), row.descriptor);
  if (descriptor) savedDescriptors.set(definitionKey(descriptor), descriptor);
  for (const row of batchHistory.data ?? [])
    if (row.status === 'committed' || row.finalSignedBytes)
      for (const item of row.descriptors) savedDescriptors.set(definitionKey(item), item);
  // Catalogue discovery also restores positions when this browser has no transaction history.
  for (const row of catalogue.data ?? []) savedDescriptors.set(definitionKey(row), row);
  const working = prepare.isPending || submit.isPending || sponsoredBusy;
  const principal = amountShannons(amount);
  const reviewExpired = !!review && now >= review.expiresAt;
  const error = linkedWallet.error ?? connect.error ?? prepare.error ?? submit.error;
  const teams = detail.data?.market;
  function exportRecovery() {
    if (!connection || !history.data) return;
    const backup = {
      format: 'streak-direct-recovery-v1',
      network: 'testnet',
      manifest: MANIFEST,
      ownerHash: connection.ownerHash,
      markets: Array.from(savedDescriptors.values()),
      records: history.data,
      sponsoredRecords: sponsoredHistory.data ?? [],
      batchRecords: batchHistory.data ?? [],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'streak-testnet-recovery.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const paymentTools = connection ? (
    <section className="glass direct-history" aria-label="Saved testnet transactions">
      <div className="direct-row">
        <div>
          <p className="eyebrow">PAYMENTS</p>
          <h2>Recent transactions</h2>
        </div>
        <button className="quiet" disabled={history.isFetching || working} onClick={refresh}>
          Refresh status
        </button>
      </div>
      {history.isError && (
        <p className="notice error" role="alert">
          {history.error.message} New signing is paused.
        </p>
      )}
      {sponsoredHistory.isError && (
        <p className="notice error" role="alert">
          {sponsoredHistory.error.message} New signing is paused.
        </p>
      )}
      {batchHistory.isError && (
        <p className="notice error" role="alert">
          {batchHistory.error.message} New signing is paused.
        </p>
      )}
      {history.data?.length === 0 &&
        sponsoredHistory.data?.length === 0 &&
        batchHistory.data?.length === 0 && (
          <p>No saved transactions for this wallet on this device.</p>
        )}
      {batchHistory.data
        ?.slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, visibleTransactions)
        .map((record) => (
          <BatchTransaction
            key={record.hash}
            record={record}
            client={connection.batch}
            refresh={refresh}
            draftStore={draftStore}
          />
        ))}
      {history.data
        ?.slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, visibleTransactions)
        .map((record) => (
          <PendingTransaction
            key={record.hash}
            record={record}
            connection={connection}
            refresh={refresh}
          />
        ))}
      {sponsoredHistory.data
        ?.slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, visibleTransactions)
        .map((record) => (
          <SponsoredTransaction
            key={record.hash}
            record={record}
            client={connection.sponsored}
            refresh={refresh}
            working={working}
          />
        ))}
      {Math.max(
        history.data?.length ?? 0,
        sponsoredHistory.data?.length ?? 0,
        batchHistory.data?.length ?? 0,
      ) > visibleTransactions && (
        <button className="quiet" onClick={() => setVisibleTransactions((count) => count + 8)}>
          Show eight more transactions
        </button>
      )}
      <button className="quiet" disabled={!history.data || working} onClick={exportRecovery}>
        Download recovery backup
      </button>
      <small>
        Contains public transaction data, market definitions and saved signatures. Confirmed
        positions can be claimed with the standalone tool. First predictions still awaiting Streak's
        signature resume from this browser's saved activity.
      </small>
    </section>
  ) : null;
  if (activityOnly)
    return (
      <Activity
        key={activeWallet?.revision ?? 'disconnected'}
        client={connection?.client}
        ownerHash={connection?.ownerHash}
        descriptors={Array.from(savedDescriptors.values())}
        records={history.data ?? []}
        sourceIssue={
          history.isError || sponsoredHistory.isError || batchHistory.isError || catalogue.isError
        }
        sourcesLoading={
          history.isLoading ||
          sponsoredHistory.isLoading ||
          batchHistory.isLoading ||
          catalogue.isLoading
        }
        onConnect={() => (activeWallet ? void linkedWallet.refetch() : connect.mutate())}
        connecting={connect.isPending || !accountReady || linkedWallet.isFetching}
        connectionPending={!!activeWallet}
        recovery={paymentTools}
        onClaim={(selected, point) => {
          if (!working) prepare.mutate({ descriptor: selected, point });
        }}
        review={review?.ownerHash === connection?.ownerHash ? review : null}
        onSign={() => submit.mutate()}
        onDismissReview={() => {
          reviewEpoch.current++;
          setReview(null);
        }}
        working={working}
        signing={submit.isPending}
        notice={notice}
        error={error ? message(error) : undefined}
        onRefresh={refresh}
      />
    );

  return (
    <section
      className={`direct-page${activityOnly ? ' activity-page' : ''}`}
      aria-label={activityOnly ? 'My activity' : 'Direct testnet predictions'}
    >
      <div className="detail-page-head">
        <div>
          <p className="eyebrow">
            {activityOnly ? 'YOUR PREDICTIONS' : 'YOUR WALLET. YOUR PREDICTION.'}
          </p>
          <h1 ref={title} tabIndex={-1}>
            {activityOnly
              ? 'My activity'
              : teams
                ? `${teams.home} vs ${teams.away}`
                : 'Your testnet touchline.'}
          </h1>
          <p>
            {activityOnly
              ? 'Track your predictions, payments and returns.'
              : 'Follow every prediction from your wallet to its final claim.'}
          </p>
        </div>
        {marketId ? (
          <a
            className="quiet"
            href={marketHref(marketId)}
            onClick={(event) => followMarket(event, marketId)}
          >
            Back to match
          </a>
        ) : (
          <a className="quiet" href="/season/" onClick={browseMarkets}>
            Browse matches
          </a>
        )}
      </div>
      {activityOnly && !connection && (
        <section className="glass activity-connect">
          <h2>{activeWallet ? 'Loading your predictions' : 'Your matchday history starts here'}</h2>
          <p>
            {activeWallet
              ? 'Checking this wallet for saved payments and claims.'
              : 'Connect your wallet to see your predictions and collect returns.'}
          </p>
          {!activeWallet && (
            <button
              className="connect"
              disabled={connect.isPending || !accountReady}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? 'Connecting...' : 'Connect wallet'}
            </button>
          )}
          {linkedWallet.isError && (
            <button className="quiet" onClick={() => void linkedWallet.refetch()}>
              Retry activity
            </button>
          )}
        </section>
      )}
      {!activityOnly && (
        <div className="direct-layout">
          <section className="glass direct-wallet-card" aria-label="Testnet wallet">
            <p className="eyebrow">CKB PUDGE TESTNET</p>
            <h2>Your available CKB</h2>
            <strong className="direct-balance">
              {balance.data === undefined
                ? linkedWallet.isError || balance.isError
                  ? 'Balance unavailable'
                  : activeWallet
                    ? 'Checking balance...'
                    : 'Connect to view'
                : money(balance.data)}
            </strong>
            <p>
              Spendable plain wallet cells. Your existing Streak balance stays in{' '}
              <a href="/index.html#wallet">legacy Wallet</a>.
            </p>
            {activeWallet ? (
              <>
                <code className="direct-address">{activeWallet.address}</code>
                <button
                  className="quiet"
                  disabled={working}
                  onClick={() => {
                    disconnectWallet();
                    setReview(null);
                  }}
                >
                  Disconnect wallet
                </button>
              </>
            ) : (
              <button
                className="connect"
                disabled={connect.isPending || !accountReady}
                onClick={() => connect.mutate()}
              >
                {connect.isPending ? 'Connecting wallet...' : 'Connect testnet wallet'}
              </button>
            )}
            {wallet.notice && <p role="status">{wallet.notice}</p>}
            {account && !activeWallet && (
              <p>
                Your sign-in is active. Reconnect your wallet in this tab to view your balance and
                approve payments.
              </p>
            )}
            {linkedWallet.isError && activeWallet && (
              <button className="quiet" onClick={() => void linkedWallet.refetch()}>
                Retry wallet checks
              </button>
            )}
            {balance.isError && (
              <p className="pick-error" role="alert">
                Balance unavailable.{' '}
                <button onClick={() => void balance.refetch()}>Retry balance</button>
              </p>
            )}
            <a href="https://faucet.nervos.org/" target="_blank" rel="noreferrer">
              Get testnet CKB ↗
            </a>
            <small>Testnet CKB has no monetary value.</small>
          </section>
          <section className="glass direct-stake-card" aria-label="Contract prediction">
            {teams ? (
              <>
                <div className="direct-match">
                  <TeamBadge logo={teams.homeLogo} code={teams.homeCode} side="home" />
                  <strong>
                    {teams.home} <span>vs</span> {teams.away}
                  </strong>
                  <TeamBadge logo={teams.awayLogo} code={teams.awayCode} side="away" />
                </div>
                {catalogue.isError ? (
                  <div className="notice error" role="alert">
                    Contract catalogue unavailable. Existing saved claims remain recoverable.{' '}
                    <button onClick={() => void catalogue.refetch()}>Retry catalogue</button>
                  </div>
                ) : !descriptor && demandFixture ? (
                  <SponsoredCheckout
                    key={`${demandFixture.fixtureId}:${activeWallet?.revision ?? 0}`}
                    fixture={demandFixture}
                    client={sponsoredHistory.isError ? undefined : connection?.sponsored}
                    signedIn={!!account}
                    draftPick={draftPick}
                    onBusy={setSponsoredBusy}
                    refresh={refresh}
                  />
                ) : !descriptor ? (
                  <p className="notice">
                    {catalogue.isPending || demand.isFetching
                      ? 'Checking contract availability...'
                      : demand.isError
                        ? 'Market sponsorship is unavailable. Your saved slip is unchanged.'
                        : 'This fixture is not available for payment yet. Your saved slip is unchanged.'}
                    {demand.isError && (
                      <button className="quiet" onClick={() => void demand.refetch()}>
                        Retry sponsorship
                      </button>
                    )}
                  </p>
                ) : (
                  <>
                    {!descriptor.entryEnabled && (
                      <p className="notice">{descriptor.entryUnavailableReason}</p>
                    )}
                    <div className="direct-outcomes" role="group" aria-label="Contract outcome">
                      {outcomeNames.map((label, index) => (
                        <button
                          key={label}
                          className="outcome-glass"
                          data-outcome={['home', 'draw', 'away'][index]}
                          aria-pressed={outcome === index}
                          disabled={working || !descriptor.entryEnabled}
                          onClick={() => {
                            setOutcome(index as Outcome);
                            setReview(null);
                          }}
                        >
                          {index === 0 ? teams.home : index === 2 ? teams.away : label}
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
                    <p>
                      Minimum 100 tCKB. An additional 321 tCKB funds your claim cell and is
                      recoverable after settlement. Network fees are quoted at review.
                    </p>
                    <button
                      className="review-button"
                      disabled={
                        !connection ||
                        working ||
                        !descriptor.entryEnabled ||
                        now >= descriptor.cutoffMs ||
                        principal === null ||
                        principal < MIN_PRINCIPAL ||
                        history.isError ||
                        sponsoredHistory.isError ||
                        catalogue.isError
                      }
                      onClick={() => prepare.mutate(undefined)}
                    >
                      {prepare.isPending ? 'Preparing transaction...' : 'Review testnet prediction'}
                    </button>
                    <small>
                      One prediction per transaction in this contract version. Your multi-pick draft
                      remains saved.
                    </small>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="eyebrow">FROM KICKOFF TO CLAIM</p>
                <h2>Your next move.</h2>
                <p>
                  Open a match and choose its testnet prediction to stake directly. Connect here to
                  restore pending transactions and find claims owned by your wallet.
                </p>
                <a className="connect" href="/season/" onClick={browseMarkets}>
                  Find a match
                </a>
              </>
            )}
            {detail.isError && (
              <p className="pick-error" role="alert">
                {detail.error.message}
              </p>
            )}
          </section>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {message(error)}
        </p>
      )}
      {review && (
        <section className="glass direct-review" aria-label="Review wallet transaction">
          <p className="eyebrow">BEFORE YOU SIGN</p>
          <h2 ref={reviewHeading} tabIndex={-1}>
            {review.kind === 'claim' ? 'Bring your CKB home.' : 'Make this prediction yours.'}
          </h2>
          <p>
            {review.descriptor.label}
            {review.kind === 'deposit' ? ` · ${outcomeNames[outcome]}` : ''}
          </p>
          <dl>
            <div>
              <dt>{review.kind === 'claim' ? 'Return to your wallet' : 'Prediction stake'}</dt>
              <dd>
                {money(
                  review.kind === 'claim'
                    ? (review.payoutShannons ?? '0')
                    : review.principalShannons,
                )}
              </dd>
            </div>
            <div>
              <dt>{review.kind === 'claim' ? 'Included storage return' : 'Recoverable storage'}</dt>
              <dd>{money(review.storageShannons)}</dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>{money(review.feeShannons)}</dd>
            </div>
            {review.kind === 'deposit' && (
              <div className="direct-total">
                <dt>Total wallet capacity</dt>
                <dd>{money(review.totalShannons)}</dd>
              </div>
            )}
          </dl>
          <p>
            {review.kind === 'claim'
              ? 'The full funded claim returns to its pinned owner. A separate wallet input pays the network fee.'
              : 'Protocol and creator fees are 2% and 1% of the losing pool when a nonempty winning outcome settles. Void markets return principal without those fees.'}
          </p>
          <details>
            <summary>Settlement and trust terms</summary>
            <p>
              API-Football regulation time including stoppage time, excluding extra time and
              penalties. The configured operator reports results. This version trusts the operator’s
              immutable mapping from the football fixture to its CKB market.
            </p>
            <p>
              No eligible result by six hours after pinned kickoff permits on-chain cancellation. A
              timely eligible report still settles when verified later. Pending late stakes are
              refunded separately.
            </p>
            <TransactionLink
              hash={review.descriptor.creationTxHash}
              label="Verify market creation"
            />
          </details>
          {reviewExpired && (
            <p className="pick-error">This quote expired. Prepare a fresh review before signing.</p>
          )}
          <div className="direct-actions">
            <button
              className="review-button"
              disabled={working || reviewExpired}
              onClick={() => submit.mutate()}
            >
              {submit.isPending
                ? 'Complete the wallet request...'
                : review.kind === 'claim'
                  ? 'Sign claim in wallet'
                  : 'Sign prediction in wallet'}
            </button>
            <button className="quiet" disabled={working} onClick={() => setReview(null)}>
              Back to editing
            </button>
          </div>
        </section>
      )}
      {connection && (
        <>
          {paymentTools}
          <section className="glass direct-positions" aria-label="Contract positions and claims">
            <p className="eyebrow">PREDICTIONS</p>
            <h2>Results and returns</h2>
            <p>
              Accepted predictions await settlement. Winning claims include payout and storage;
              losing claims return storage. Voided predictions return principal and storage.
            </p>
            {Array.from(savedDescriptors.values())
              .slice(0, visibleMarkets)
              .map((row) => (
                <MarketPositions
                  key={definitionKey(row)}
                  descriptor={row}
                  connection={connection}
                  working={working}
                  onClaim={(selected, point) => {
                    if (!working) prepare.mutate({ descriptor: selected, point });
                  }}
                />
              ))}
            {savedDescriptors.size > visibleMarkets && (
              <button className="quiet" onClick={() => setVisibleMarkets((count) => count + 4)}>
                Check four more markets
              </button>
            )}
            {savedDescriptors.size === 0 && (
              <p>No registered markets or saved market descriptors are available yet.</p>
            )}
            {catalogue.isError && (
              <p className="notice">
                Catalogue discovery is unavailable. Saved market descriptors still support direct
                chain recovery.
              </p>
            )}
          </section>
        </>
      )}
      <p className="direct-footer">
        <a href={directHref()} onClick={(event) => followDirect(event)}>
          Open wallet
        </a>{' '}
        · <a href="/index.html#wallet">Existing balance and withdrawals</a>
      </p>
    </section>
  );
}
