import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import { Notice } from '../../components/notice';
import {
  assertWalletAccount,
  chooseWallet,
  disconnectWallet,
  getWalletState,
} from '../../lib/wallet';
import { directHref, followDirect } from '../../lib/direct-route';
import { useNow } from '../../lib/use-now';
import { displayShannons } from '../predictions/draft';
import { connectTelegram, disconnectTelegram, getAccount } from './api';
import type { Account, TelegramLink } from './api';
import { shortWalletAddress } from './data';
import { useWalletBalance } from './wallet-balance';
import './wallet.css';

interface WalletProps {
  account: Account | null;
  accountReady: boolean;
}
function CopyAddress({ address, compact = false }: { address: string; compact?: boolean }) {
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    setNotice('');
  }, [address]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setNotice('Copied');
    } catch {
      setNotice('Copy unavailable');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 3_000);
  }
  return (
    <span className={`wallet-address-copy${compact ? ' is-compact' : ''}`}>
      <button
        type="button"
        title={address}
        aria-label="Copy wallet address"
        onClick={() => void copy()}
      >
        <span>{shortWalletAddress(address)}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M12 4V3H3v9h1" />
        </svg>
      </button>
      <span className="wallet-copy-status" role="status">
        {notice}
      </span>
    </span>
  );
}
function capacityLabel(value: bigint | undefined, failed: boolean, connected: boolean) {
  return failed
    ? 'Balance unavailable'
    : value !== undefined
      ? `${displayShannons(value)} tCKB`
      : connected
        ? 'Checking balance...'
        : 'Reconnect to view';
}

/** Compact, reusable navigation summary. It never connects a wallet by itself. */
export function WalletSummary({ account, accountReady }: WalletProps) {
  const { connection, balance, address } = useWalletBalance(account, accountReady);
  const balancePending = balance.isFetching && balance.data === undefined;
  const reconnect = useMutation({
    mutationFn: async () => {
      await chooseWallet();
      const selected = getWalletState().connection;
      if (selected && account) await assertWalletAccount(selected, account.walletAddress);
    },
    retry: false,
  });
  if (!address) return null;
  return (
    <div className="wallet-nav-summary" aria-label="Wallet summary">
      {connection ? (
        <a
          href={directHref()}
          onClick={(event) => followDirect(event)}
          aria-label="Open My Account"
        >
          {balancePending ? <CellLoader variant="orbit" /> : <Icon name="wallet" />}
          <span>{capacityLabel(balance.data, balance.isError, true)}</span>
        </a>
      ) : (
        <button
          className="wallet-nav-reconnect"
          disabled={reconnect.isPending || !accountReady}
          aria-busy={reconnect.isPending}
          onClick={() => reconnect.mutate()}
        >
          {reconnect.isPending ? <CellLoader variant="orbit" /> : <Icon name="wallet" />}
          {reconnect.isPending ? 'Connecting...' : 'Reconnect wallet'}
        </button>
      )}
      <CopyAddress address={address} compact />
      {reconnect.error && (
        <Notice tone="attention" title="Wallet connection needs attention">
          {reconnect.error.message}
        </Notice>
      )}
    </div>
  );
}

function TelegramPanel({
  account,
  onSignIn,
  signInPending,
}: {
  account: Account | null;
  onSignIn: () => void;
  signInPending: boolean;
}) {
  const cache = useQueryClient(),
    [link, setLink] = useState<TelegramLink | null>(null);
  const now = useNow(!!link),
    expired = !!link && now >= link.expiresAt;
  const connect = useMutation({ mutationFn: connectTelegram, retry: false, onSuccess: setLink });
  const unlink = useMutation({
    mutationFn: disconnectTelegram,
    retry: false,
    onSuccess: (updated) => {
      setLink(null);
      if (cache.getQueryData<Account | null>(['account'])?.id === account?.id)
        cache.setQueryData(['account'], updated);
    },
  });
  const confirmation = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => getAccount(signal),
    enabled: !!account && !!link && !expired && !account.telegramConnected,
    refetchInterval: link && !expired && !account?.telegramConnected ? 5_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (account?.telegramConnected) setLink(null);
  }, [account?.telegramConnected]);
  const error = connect.error ?? unlink.error ?? (link ? confirmation.error : null);
  return (
    <section className="wallet-telegram" aria-label="Telegram connection">
      <div className="wallet-section-title">
        <span className="wallet-telegram-symbol" aria-hidden="true">
          ↗
        </span>
        <div>
          <h2>Telegram</h2>
          <p>Keep your Streak account connected.</p>
        </div>
      </div>
      <div className="wallet-telegram-actions">
        {account?.telegramConnected ? (
          <>
            <p className="wallet-connected">
              Connected{account.telegramUsername ? ` as @${account.telegramUsername}` : ''}
            </p>
            <button
              className="quiet"
              disabled={unlink.isPending}
              aria-busy={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              {unlink.isPending && <CellLoader variant="orbit" />}
              {unlink.isPending ? 'Disconnecting...' : 'Disconnect Telegram'}
            </button>
          </>
        ) : !account ? (
          <button
            className="quiet"
            disabled={signInPending}
            aria-busy={signInPending}
            onClick={onSignIn}
          >
            {signInPending && <CellLoader variant="orbit" />}
            Sign in to connect Telegram
          </button>
        ) : !account.telegramAvailable ? (
          <p className="wallet-caption">Telegram connection is not available yet.</p>
        ) : link && !expired ? (
          <>
            <a className="wallet-primary" href={link.url} target="_blank" rel="noreferrer">
              Open Telegram
            </a>
            <p className="wallet-caption">
              Tap Start in Telegram, then return here. This link expires in{' '}
              {Math.max(1, Math.ceil((link.expiresAt - now) / 60_000))} min.
            </p>
            <button
              className="quiet"
              disabled={confirmation.isFetching}
              aria-busy={confirmation.isFetching}
              onClick={() => void confirmation.refetch()}
            >
              {confirmation.isFetching && <CellLoader variant="orbit" />}
              Check connection
            </button>
          </>
        ) : (
          <>
            {expired && (
              <p className="wallet-caption">That link expired. Create a fresh one to continue.</p>
            )}
            <button
              className="wallet-primary"
              disabled={connect.isPending}
              aria-busy={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending && <CellLoader variant="orbit" />}
              {connect.isPending ? 'Preparing link...' : 'Connect Telegram'}
            </button>
          </>
        )}
        {error && (
          <p className="wallet-error" role="alert">
            {error.message}
          </p>
        )}
      </div>
    </section>
  );
}

export interface WalletOverviewProps extends WalletProps {
  onSignIn: () => void;
  signInPending?: boolean;
  onActivity: () => void;
  onRecovery: () => void;
  busy?: boolean;
}
export function WalletOverview({
  account,
  accountReady,
  onSignIn,
  signInPending = false,
  onActivity,
  onRecovery,
  busy = false,
}: WalletOverviewProps) {
  const { wallet, connection, balance, address } = useWalletBalance(account, accountReady);
  const balancePending = balance.isFetching && balance.data === undefined;
  const connect = useMutation({
    mutationFn: async () => {
      await chooseWallet();
      const selected = getWalletState().connection;
      if (account && selected) {
        try {
          await assertWalletAccount(selected, account.walletAddress);
        } catch (error) {
          disconnectWallet('Connect the wallet used to sign in.', selected);
          throw error;
        }
      }
    },
    retry: false,
  });
  return (
    <section className="wallet-overview" aria-label="My Account overview">
      <header className="wallet-page-heading">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>My Account</h1>
          <p>Your wallet, connections and preferences.</p>
        </div>
        <span className="wallet-network">CKB testnet</span>
      </header>
      <div className="glass wallet-account-panel">
        <section className="wallet-funds" aria-label="Wallet balance and connection">
          <div className="wallet-account-top">
            <span>
              <Icon name="wallet" />
              {connection ? 'Connected wallet' : 'Your wallet'}
            </span>
            {connection && (
              <button
                className="quiet wallet-disconnect"
                disabled={busy}
                onClick={() => disconnectWallet()}
              >
                Disconnect wallet
              </button>
            )}
          </div>
          <div className="wallet-balance-row">
            <div>
              <h2 className="wallet-balance-label">Available balance</h2>
              <strong className="wallet-capacity" role="status" aria-busy={balancePending}>
                {balancePending && <CellLoader variant="wave" />}
                <span>{capacityLabel(balance.data, balance.isError, !!connection)}</span>
              </strong>
              <p className="wallet-caption">Spendable CKB. Test tokens have no monetary value.</p>
            </div>
            {address && (
              <div className="wallet-identity">
                <span>YOUR ADDRESS</span>
                <CopyAddress address={address} />
              </div>
            )}
          </div>
          <div className="wallet-action-row">
            <a
              className={connection ? 'wallet-primary' : 'quiet'}
              href="https://faucet.nervos.org/"
              target="_blank"
              rel="noreferrer"
            >
              Get testnet CKB <Icon name="arrow" />
            </a>
            {connection ? (
              <>
                <button
                  className="quiet"
                  disabled={busy || balance.isFetching}
                  aria-busy={balance.isFetching}
                  onClick={() => void balance.refetch()}
                >
                  {balance.isFetching && <CellLoader variant="orbit" />}
                  {balance.isFetching ? 'Refreshing...' : 'Refresh balance'}
                </button>
              </>
            ) : (
              <button
                className="wallet-primary"
                disabled={busy || connect.isPending || !accountReady}
                aria-busy={connect.isPending}
                onClick={() => connect.mutate()}
              >
                {connect.isPending && <CellLoader variant="orbit" />}
                {connect.isPending ? 'Connecting...' : 'Connect testnet wallet'}
              </button>
            )}
          </div>
          {!connection && account && (
            <p className="wallet-caption">
              Your sign-in is active. Reconnect this tab to approve predictions.
            </p>
          )}
          {wallet.notice && (
            <p className="wallet-caption" role="status">
              {wallet.notice}
            </p>
          )}
          {(connect.error ?? balance.error) && (
            <p className="wallet-error" role="alert">
              {(connect.error ?? balance.error)?.message}
            </p>
          )}
        </section>
        <TelegramPanel
          key={account?.id ?? 'guest'}
          account={account}
          onSignIn={onSignIn}
          signInPending={signInPending}
        />
        <div className="wallet-shortcuts">
          <button onClick={onActivity}>
            <Icon name="activity" />
            <span>
              <strong>Your predictions</strong>
              <small>Results, payouts and refunds</small>
            </span>
            <Icon name="arrow" />
          </button>
          <button onClick={onRecovery}>
            <Icon name="shield" />
            <span>
              <strong>Transaction recovery</strong>
              <small>Resume a saved transaction</small>
            </span>
            <Icon name="arrow" />
          </button>
        </div>
      </div>
      <p className="wallet-security-note">
        <Icon name="shield" />
        Your wallet approves each payment. Streak never asks for your seed phrase.
      </p>
    </section>
  );
}
