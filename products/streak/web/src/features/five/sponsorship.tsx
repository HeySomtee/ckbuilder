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
  const [id] = useState(
    () => round.ownSponsorships.find((s) => s.funding === 'awaiting')?.id ?? crypto.randomUUID(),
  );
  const existing = round.ownSponsorships.find((s) => s.id === id);
  const ownBid = BigInt(round.auction?.ownBidShannons ?? round.auction?.ownShannons ?? '0');
  const highestBid = BigInt(
    round.auction?.leadingBidShannons ?? round.auction?.leadingShannons ?? '0',
  );
  const contributionMinimum = BigInt(round.terms.minimumShannons);
  const toLead = highestBid - ownBid + 1n;
  const minimum = auction && toLead > contributionMinimum ? toLead : contributionMinimum;
  const [value, setValue] = useState(
    existing
      ? money(existing.amountShannons).replaceAll(',', '')
      : money((((minimum + 99_999_999n) / 100_000_000n) * 100_000_000n).toString()).replaceAll(
          ',',
          '',
        ),
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
    tag: string;
    wallet: NonNullable<ReturnType<typeof getWalletState>['connection']>;
  } | null>(null);
  const signed = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  let entered: bigint | null = null;
  try {
    entered = BigInt(shannons(value));
  } catch {
    /* Keep incomplete typing editable. */
  }
  const belowMinimum = entered === null || entered < minimum;
  async function prepare() {
    setError('');
    setStage(auction ? 'Preparing your bid' : 'Preparing your contribution');
    try {
      if (belowMinimum)
        throw Error(
          auction
            ? 'Increase your top-up so your combined bid exceeds the highest bid.'
            : 'Enter at least the minimum contribution.',
        );
      const amountShannons = shannons(value);
      if (
        editing &&
        prepared &&
        !signed.current &&
        existing?.amountShannons === amountShannons &&
        existing.tag === prepared.tag
      ) {
        setEditing(false);
        return;
      }
      const revising = !!existing && (existing.amountShannons !== amountShannons || editing);
      const data = revising
        ? await actFive({
            action: 'revise-sponsor',
            id: round.id,
            sponsorId: id,
            amountShannons,
            expectedTag: prepared?.tag ?? existing!.tag,
          })
        : existing
          ? null
          : await actFive({
              action: 'sponsor',
              id: round.id,
              sponsorId: id,
              amountShannons,
              display: named ? 'named' : 'anonymous',
              name,
              logo,
              link,
              introduction,
              description,
              custodyAccepted: accepted,
            });
      const intent = data?.detail?.ownSponsorships.find((s) => s.id === id) ?? existing;
      if (!intent || !intent.destination.startsWith('ckt1') || !/^0x[0-9a-f]{64}$/.test(intent.tag))
        throw Error('Unable to verify the rewards destination.');
      if (intent.funding !== 'awaiting' || intent.amountShannons !== amountShannons)
        throw Error(
          'This payment changed or is already accepted. Check its status before adding a top-up.',
        );
      if (revising) {
        // Only a confirmed server amendment can invalidate and release the previous local signature.
        signed.current = null;
        setPrepared(null);
      }
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
      setPrepared({ tx, fee: fee.toString(), wallet, tag: intent.tag });
      setEditing(false);
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
      {!prepared || editing ? (
        <>
          <label>
            {auction ? 'Add to your bid (tCKB)' : 'Contribution (tCKB)'}
            <input
              inputMode="decimal"
              value={value}
              disabled={!!stage}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <small>Minimum contribution {money(round.terms.minimumShannons)} tCKB</small>
          {auction && (
            <small>
              Your bid: {money(ownBid.toString())} tCKB. Highest bid: {money(highestBid.toString())}{' '}
              tCKB, including payments confirming. Your new total must be higher. Minimum next
              top-up: {money(minimum.toString())} tCKB.
            </small>
          )}
          {auction && entered !== null && (
            <small>Your total after this top-up: {money((ownBid + entered).toString())} tCKB</small>
          )}
          {belowMinimum && (
            <p className="five-message" role="status">
              {auction
                ? 'Increase the amount to beat the highest bid and meet the minimum contribution.'
                : 'Enter at least the minimum contribution.'}
            </p>
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
            disabled={!accepted || !!stage || belowMinimum}
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
          {editing && prepared && (
            <button
              className="btn quiet"
              disabled={!!stage}
              onClick={() => {
                setEditing(false);
                setValue(money(prepared.tx.outputs[0].capacity.toString()).replaceAll(',', ''));
              }}
            >
              Back to saved payment
            </button>
          )}
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
          <button
            className="btn quiet"
            disabled={!!stage}
            onClick={() => {
              setEditing(true);
              setError('');
            }}
          >
            Change amount
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
