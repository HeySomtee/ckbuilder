import { useRef, useState } from 'react';
import type { ccc } from '@ckb-ccc/core';
import { CellLoader } from '../../components/cell-loader';
import { assertWalletAccount, chooseWallet, getWalletState } from '../../lib/wallet';
import { actSurvivor, money, type Competition, type SurvivorData } from './api';
import type { Account } from '../account/api';

export function PrizeFunding({
  competition,
  account,
  onData,
}: {
  competition: Competition;
  account: Account;
  onData: (data: SurvivorData) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const signed = useRef<string | null>(null);
  const [review, setReview] = useState<{
    tx: ccc.Transaction;
    fee: string;
    sponsorId: string;
    wallet: NonNullable<ReturnType<typeof getWalletState>['connection']>;
  } | null>(null);
  async function prepare() {
    setStage('Preparing creator prize');
    setError('');
    try {
      const data = await actSurvivor({
        action: 'prepare-prize',
        id: competition.id,
        custodyAccepted: accepted,
      });
      const intent = data.detail?.prizeFunding;
      if (
        data.viewerId !== account.id ||
        data.detail?.id !== competition.id ||
        data.detail.termsHash !== competition.termsHash ||
        !intent ||
        intent.funding !== 'awaiting' ||
        intent.amountShannons !== competition.terms.prizeShannons ||
        !intent.destination.startsWith('ckt1') ||
        !/^0x[0-9a-f]{64}$/.test(intent.tag)
      )
        throw Error('The prize changed. Refresh the competition before funding.');
      onData(data);
      setStage('Connecting your wallet');
      const signer = await chooseWallet(),
        wallet = getWalletState().connection;
      if (!wallet) throw Error('Connect the creator wallet.');
      await assertWalletAccount(wallet, account.walletAddress);
      const { ccc } = await import('@ckb-ccc/core');
      const owner = (await ccc.Address.fromString(account.walletAddress, signer.client)).script;
      const target = (await ccc.Address.fromString(intent.destination, signer.client)).script;
      let tx = ccc.Transaction.from({
        outputs: [{ lock: target, capacity: BigInt(intent.amountShannons) }],
        outputsData: [intent.tag],
      });
      setStage('Preparing wallet approval');
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000n);
      tx = await signer.prepareTransaction(tx);
      if (
        tx.outputs.length < 1 ||
        tx.outputs.length > 2 ||
        tx.outputsData.length !== tx.outputs.length ||
        tx.outputs[0].capacity !== BigInt(intent.amountShannons) ||
        !tx.outputs[0].lock.eq(target) ||
        tx.outputsData[0] !== intent.tag ||
        tx.outputs.some((o) => !!o.type) ||
        tx.outputs.slice(1).some((o, i) => !o.lock.eq(owner) || tx.outputsData[i + 1] !== '0x')
      )
        throw Error('The wallet transaction differs from the reviewed prize.');
      let input = 0n;
      const seen = new Set<string>();
      for (const i of tx.inputs) {
        const key = i.previousOutput.toHex();
        const cell = await signer.client.getCellLiveNoCache(i.previousOutput, true, true);
        if (
          seen.has(key) ||
          i.since !== 0n ||
          !cell ||
          !cell.cellOutput.lock.eq(owner) ||
          cell.cellOutput.type ||
          cell.outputData !== '0x'
        )
          throw Error('Wallet inputs changed. Review the prize again.');
        seen.add(key);
        input += cell.cellOutput.capacity;
      }
      const fee = input - tx.outputs.reduce((total, o) => total + o.capacity, 0n);
      if (!tx.inputs.length || fee < 0n || fee > 10_000_000n)
        throw Error('Prize funding fee is outside the permitted limit.');
      await assertWalletAccount(wallet, account.walletAddress);
      setReview({ tx, wallet, sponsorId: intent.id, fee: fee.toString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to prepare the prize.');
    } finally {
      setStage('');
    }
  }
  async function submit() {
    if (!review) return;
    setError('');
    try {
      if (!signed.current) {
        setStage('Waiting for wallet approval');
        await assertWalletAccount(review.wallet, account.walletAddress);
        const tx = await review.wallet.signer.signTransaction(review.tx.clone());
        if (tx.hash() !== review.tx.hash()) throw Error('The wallet changed the reviewed prize.');
        const { ccc } = await import('@ckb-ccc/core');
        signed.current = ccc.hexFrom(tx.toBytes());
      }
      setStage('Saving your signed prize payment');
      const data = await actSurvivor({
        action: 'fund-prize',
        id: competition.id,
        sponsorId: review.sponsorId,
        signedBytes: signed.current,
      });
      onData(data);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delivery interrupted. Retry this saved payment.');
    } finally {
      setStage('');
    }
  }
  if (saved || competition.prizeFunding?.funding === 'submitted')
    return (
      <div role="status">
        <CellLoader variant="wave" />
        <h3>Prize payment saved</h3>
        <p>You can close this panel. The creator workspace updates after chain confirmation.</p>
      </div>
    );
  return (
    <div className="survivor-rulebook">
      <h3>Fund {money(competition.terms.prizeShannons)}</h3>
      <p>
        Streak holds this testnet prize in its dedicated rewards wallet. This is custodial funding,
        not a smart-contract escrow. Entries open only after 24 chain confirmations.
      </p>
      <p>
        Joint winners share equally. Any smallest-unit remainder returns to you. Cancellation or an
        unpublished draft missing its deadline returns the funded prize. Streak pays payout fees;
        your funding fee is not returned. Small rewards wait until they reach the wallet cell
        minimum.
      </p>
      {!review ? (
        <>
          <label className="survivor-custody-acceptance">
            <input
              type="checkbox"
              checked={accepted}
              disabled={!!stage}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I accept testnet rewards-wallet custody and the payout rules
          </label>
          <button
            className="survivor-primary"
            disabled={!accepted || !!stage}
            onClick={() => void prepare()}
          >
            {stage ? (
              <>
                <CellLoader variant="orbit" />
                {stage}
              </>
            ) : (
              'Review prize payment'
            )}
          </button>
        </>
      ) : (
        <>
          <p>
            Prize: <strong>{money(competition.terms.prizeShannons)}</strong>
            <br />
            Network fee: {money(review.fee)}
          </p>
          <button className="survivor-primary" disabled={!!stage} onClick={() => void submit()}>
            {stage ? (
              <>
                <CellLoader variant="orbit" />
                {stage}
              </>
            ) : signed.current ? (
              'Retry saved prize payment'
            ) : (
              'Approve in wallet'
            )}
          </button>
        </>
      )}
      {error && (
        <p className="survivor-notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
