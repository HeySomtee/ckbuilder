import { CellLoader } from '../../components/cell-loader';
import { useRef, useState } from 'react';
import { gamesDataMode } from '../../lib/games-data';
import type { ccc } from '@ckb-ccc/core';
import type { Account } from '../account/api';
import { assertWalletAccount, chooseWallet, getWalletState } from '../../lib/wallet';
import { actFive, money, shannons } from './api';
import type { FiveData, FiveRound } from './api';

export function Sponsorship({
  round,
  account,
  onData,
}: {
  round: FiveRound;
  account: Account;
  onData: (d: FiveData) => void;
}) {
  const auction = !!round.auction;
  const existing = round.ownSponsorships.find((s) => s.funding === 'awaiting');
  const [id] = useState(existing?.id ?? crypto.randomUUID());
  const [value, setValue] = useState(
    existing
      ? money(existing.amountShannons).replaceAll(',', '')
      : money(round.terms.minimumShannons).replaceAll(',', ''),
  );
  const [named, setNamed] = useState(false),
    [name, setName] = useState(''),
    [logo, setLogo] = useState(''),
    [link, setLink] = useState(''),
    [introduction, setIntroduction] = useState(''),
    [description, setDescription] = useState('');
  const [accepted, setAccepted] = useState(false),
    [stage, setStage] = useState(''),
    [error, setError] = useState('');
  const [prepared, setPrepared] = useState<{
    tx: ccc.Transaction;
    fee: string;
    wallet: NonNullable<ReturnType<typeof getWalletState>['connection']>;
  } | null>(null);
  const signed = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function prepare() {
    setError('');
    setStage(auction ? 'Preparing your bid' : 'Preparing your contribution');
    try {
      const data = existing
        ? null
        : await actFive({
            action: 'sponsor',
            id: round.id,
            sponsorId: id,
            amountShannons: shannons(value),
            display: named ? 'named' : 'anonymous',
            name,
            logo,
            link,
            introduction,
            description,
            custodyAccepted: accepted,
          });
      const intent = existing ?? data?.detail?.ownSponsorships.find((s) => s.id === id);
      if (!intent || !intent.destination.startsWith('ckt1') || !/^0x[0-9a-f]{64}$/.test(intent.tag))
        throw Error('Unable to verify the rewards destination.');
      if (data) onData(data);
      setStage('Connecting your wallet');
      const signer = await chooseWallet(),
        wallet = getWalletState().connection;
      if (!wallet) throw Error('Reconnect your wallet to continue.');
      await assertWalletAccount(wallet, account.walletAddress);
      const { ccc } = await import('@ckb-ccc/core');
      const destination = await ccc.Address.fromString(intent.destination, signer.client);
      const owner = await ccc.Address.fromString(account.walletAddress, signer.client);
      let tx = ccc.Transaction.from({
        outputs: [{ lock: destination.script, capacity: BigInt(intent.amountShannons) }],
        outputsData: [intent.tag],
      });
      setStage('Preparing wallet approval');
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000n);
      tx = await signer.prepareTransaction(tx);
      if (
        tx.outputs[0].capacity !== BigInt(intent.amountShannons) ||
        !tx.outputs[0].lock.eq(destination.script) ||
        tx.outputsData[0] !== intent.tag ||
        tx.outputs.length > 2 ||
        tx.outputs.some((o) => !!o.type) ||
        tx.outputs
          .slice(1)
          .some((o, i) => !o.lock.eq(owner.script) || tx.outputsData[i + 1] !== '0x')
      )
        throw Error('The prepared payment differs from your contribution.');
      let input = 0n;
      for (const i of tx.inputs) {
        const cell = await signer.client.getCellLiveNoCache(i.previousOutput, true, true);
        if (
          !cell ||
          !cell.cellOutput.lock.eq(owner.script) ||
          cell.cellOutput.type ||
          cell.outputData !== '0x'
        )
          throw Error('Wallet inputs changed. Prepare again.');
        input += cell.cellOutput.capacity;
      }
      const fee = input - tx.outputs.reduce((n, o) => n + o.capacity, 0n);
      if (fee < 0n || fee > 10_000_000n)
        throw Error('The network fee is outside the contribution limit.');
      await assertWalletAccount(wallet, account.walletAddress);
      setPrepared({ tx, fee: fee.toString(), wallet });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to prepare. Your contribution has not been sent.',
      );
    } finally {
      setStage('');
    }
  }
  async function submit() {
    if (!prepared) return;
    setError('');
    try {
      if (!signed.current) {
        setStage('Waiting for wallet approval');
        await assertWalletAccount(prepared.wallet, account.walletAddress);
        const tx = await prepared.wallet.signer.signTransaction(prepared.tx.clone());
        const { ccc } = await import('@ckb-ccc/core');
        if (tx.hash() !== prepared.tx.hash())
          throw Error('Your wallet changed the reviewed transaction. Prepare again.');
        signed.current = ccc.hexFrom(tx.toBytes());
      }
      setStage('Saving your signed contribution');
      const data = await actFive({
        action: 'fund',
        id: round.id,
        sponsorId: id,
        signedBytes: signed.current,
      });
      onData(data);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Delivery interrupted. Retry this same contribution; do not send a second payment.',
      );
    } finally {
      setStage('');
    }
  }
  if (saved)
    return (
      <div className="five-contribution-saved" role="status">
        <CellLoader variant="wave" />
        <h3>{auction ? 'Your bid is on its way.' : 'Your contribution is on its way.'}</h3>
        <p>You can close this panel and keep exploring. Follow confirmation in the Activity tab.</p>
      </div>
    );
  return (
    <div className="five-admin-form">
      <p className="five-sponsor-round">
        <strong>{round.terms.name}</strong> · {auction ? 'Bids' : 'Contributions'} close{' '}
        {new Date(round.terms.lockAt).toLocaleString()}
      </p>
      {gamesDataMode === 'test' && (
        <p className="five-message">
          Synthetic gameweek. This sends real testnet tCKB to the separate test rewards wallet. The
          admin may close bidding and apply dummy results immediately.
        </p>
      )}
      <p>
        {auction
          ? 'Win this gameweek’s sponsor spot. Your confirmed top-ups combine into one bid. Only the winning total funds the prize pool.'
          : 'Give this gameweek something extra. Every confirmed contribution goes into its fixed prize pool.'}
      </p>
      {!prepared ? (
        <>
          <label>
            {auction ? 'Add to your bid (tCKB)' : 'Contribution (tCKB)'}
            <input
              inputMode="decimal"
              value={value}
              disabled={!!existing || !!stage}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <small>Minimum {money(round.terms.minimumShannons)} tCKB</small>
          {auction && (
            <small>
              Your funded total: {money(round.auction!.ownShannons)} tCKB. Highest funded total
              wins; the earliest accepted total wins a tie.
            </small>
          )}
          {!existing && (
            <>
              <label className="five-checkbox">
                <input
                  type="checkbox"
                  checked={named}
                  disabled={!!stage}
                  onChange={(e) => setNamed(e.target.checked)}
                />
                Show a sponsor name
              </label>
              {named && (
                <>
                  <label>
                    Public name
                    <input
                      value={name}
                      maxLength={64}
                      disabled={!!stage}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    One-line introduction (optional)
                    <input
                      value={introduction}
                      maxLength={80}
                      disabled={!!stage}
                      onChange={(e) => setIntroduction(e.target.value)}
                      placeholder="What should players remember about you?"
                    />
                  </label>
                  <label>
                    About your product (optional)
                    <textarea
                      value={description}
                      maxLength={240}
                      rows={3}
                      disabled={!!stage}
                      onChange={(e) => setDescription(e.target.value.replace(/[\r\n]+/g, ' '))}
                      placeholder="Tell the players what you are building."
                    />
                    <small>{description.length} / 240 characters</small>
                  </label>
                  <label>
                    Logo URL (optional)
                    <input
                      type="url"
                      value={logo}
                      disabled={!!stage}
                      onChange={(e) => setLogo(e.target.value)}
                      placeholder="https://"
                    />
                  </label>
                  <label>
                    Website (optional)
                    <input
                      type="url"
                      value={link}
                      disabled={!!stage}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://"
                    />
                  </label>
                  <small>
                    {auction
                      ? 'Your branding appears only if you win and it passes review. A name and logo are optional.'
                      : 'Branding appears after review. Your funds count independently of logo approval.'}
                  </small>
                </>
              )}
            </>
          )}
          <div className="five-custody">
            <strong>
              {auction ? 'One winner. Other bids refunded.' : 'A community gift, held by Streak.'}
            </strong>
            <p>
              {auction
                ? 'Streak holds bids in its dedicated testnet rewards wallet. Bids close at the squad deadline, with 30 minutes for 24 chain confirmations. Late confirmations are refunded. Losing bids return automatically; the winning bid returns only if the round is cancelled or has no qualifying player. Streak pays refund fees; your original payment fee is not refunded. Unusually small balances stay saved until they can form a wallet cell. No cash value.'
                : 'This is a custodial testnet rewards wallet, separate from prediction pools. Contributions are non-refundable unless the round is cancelled or has no qualifying winner. Small reward balances accumulate until they can form a wallet cell. No cash value.'}
            </p>
            <label className="five-checkbox">
              <input
                type="checkbox"
                checked={accepted}
                disabled={!!stage}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I understand and agree
            </label>
          </div>
          <button
            className="btn primary"
            disabled={!accepted || !!stage}
            aria-busy={!!stage}
            onClick={() => void prepare()}
          >
            {stage ? (
              <>
                <CellLoader variant="orbit" />
                {stage}
              </>
            ) : auction ? (
              'Review bid'
            ) : (
              'Review contribution'
            )}
          </button>
        </>
      ) : (
        <>
          <div className="five-summary-row">
            <span>{auction ? 'Bid top-up' : 'Gameweek contribution'}</span>
            <strong>{money(prepared.tx.outputs[0].capacity.toString())} tCKB</strong>
          </div>
          <div className="five-summary-row">
            <span>Network fee</span>
            <strong>{money(prepared.fee)} tCKB</strong>
          </div>
          <p>
            Approval sends exactly this contribution to the dedicated rewards wallet. Your remaining
            change stays yours.
          </p>
          <button
            className="btn primary"
            disabled={!!stage}
            aria-busy={!!stage}
            onClick={() => void submit()}
          >
            {stage ? (
              <>
                <CellLoader variant="orbit" />
                {stage}
              </>
            ) : signed.current ? (
              'Retry saved contribution'
            ) : (
              'Approve in wallet'
            )}
          </button>
        </>
      )}
      {error && (
        <p className="five-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
