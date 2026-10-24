import { createHash } from 'node:crypto';
import { ccc } from '@ckb-ccc/core';
import { amount, FiveError, https, identifier, text, type Sponsor } from './domain';
import type { Actor } from './service';
import type { FiveStorage } from './storage';
import { auctionCutoff, closeAuction, isAuction } from './auction';

export const CONFIRMATIONS = 24;
export function marker(round: string, id: string) {
  return `0x${createHash('sha256').update(`streak-five-testnet:${round}:${id}`).digest('hex')}`;
}
/** Read-only chain access and signed owner delivery. This class never has a signing key. */
export class FiveFunding {
  private readonly cursors = new Map<string, number>();
  constructor(
    readonly store: FiveStorage,
    readonly client: ccc.Client,
    readonly address: string,
  ) {
    if (client.addressPrefix !== 'ckt' || !address.startsWith('ckt1'))
      throw Error('Five funding is testnet only');
  }
  async intent(actor: NonNullable<Actor>, roundId: string, b: Record<string, unknown>) {
    const source = (await ccc.Address.fromString(actor.wallet, this.client)).script;
    if (source.eq((await ccc.Address.fromString(this.address, this.client)).script))
      throw new FiveError(
        'Sponsor from a personal wallet. The rewards wallet cannot sponsor its own pool.',
      );
    const id = identifier(b.sponsorId),
      value = amount(b.amountShannons);
    const named = b.display === 'named';
    if (!['anonymous', 'named'].includes(String(b.display)))
      throw new FiveError('Choose public or anonymous recognition.');
    const name = named ? text(b.name, 64) : '',
      logo = named ? https(b.logo) : '',
      link = named ? https(b.link) : '';
    if (named && !name) throw new FiveError('Add a public sponsor name, or choose anonymous.');
    if (b.custodyAccepted !== true)
      throw new FiveError('Review and accept testnet rewards-wallet custody.');
    await this.store.change(roundId, (r, now) => {
      const old = r.sponsors.find((s) => s.id === id);
      if (old) {
        if (
          old.accountId !== actor.id ||
          old.amountShannons !== value ||
          old.name !== name ||
          old.logo !== logo ||
          old.link !== link ||
          old.display !== b.display
        )
          throw new FiveError('This contribution already has different details.', 409);
        return;
      }
      if (r.state !== 'open' || now >= Date.parse(r.terms.lockAt) || !r.terms.sponsorship)
        throw new FiveError('Sponsorship is closed for this gameweek.', 409);
      if (BigInt(value) < BigInt(r.terms.minimumShannons))
        throw new FiveError('This contribution is below the gameweek minimum.');
      if (
        r.sponsors.length >= 200 ||
        r.sponsors.filter((s) => s.accountId === actor.id && s.funding === 'awaiting').length >= 3
      )
        throw new FiveError('Finish an existing contribution before starting another.', 409);
      r.sponsors.push({
        id,
        accountId: actor.id,
        wallet: actor.wallet,
        amountShannons: value,
        display: named ? 'named' : 'anonymous',
        name,
        logo,
        link,
        moderation: 'pending',
        createdAt: new Date(now).toISOString(),
        funding: 'awaiting',
        destination: this.address,
        tag: marker(roundId, id),
      });
    });
  }
  async validate(s: Sponsor, bytes: string): Promise<ccc.Transaction> {
    if (!/^0x[0-9a-f]+$/i.test(bytes) || bytes.length > 200_002)
      throw new FiveError('Invalid signed contribution.');
    let tx: ccc.Transaction;
    try {
      tx = ccc.Transaction.fromBytes(bytes);
    } catch {
      throw new FiveError('Invalid signed contribution.');
    }
    const owner = (await ccc.Address.fromString(s.wallet, this.client)).script;
    const target = (await ccc.Address.fromString(s.destination!, this.client)).script;
    if (
      tx.inputs.length < 1 ||
      tx.inputs.length > 32 ||
      tx.outputs.length < 1 ||
      tx.outputs.length > 2 ||
      tx.outputsData.length !== tx.outputs.length ||
      tx.witnesses.length < tx.inputs.length
    )
      throw new FiveError('Unexpected contribution transaction shape.');
    const first = tx.outputs[0];
    if (
      first.type ||
      !first.lock.eq(target) ||
      first.capacity !== BigInt(s.amountShannons) ||
      tx.outputsData[0] !== s.tag
    )
      throw new FiveError('The payment does not match the reviewed contribution.');
    if (first.capacity < BigInt(first.occupiedSize + 32) * 100_000_000n)
      throw new FiveError('Contribution is below cell capacity.');
    if (
      tx.outputs[1] &&
      (tx.outputs[1].type || !tx.outputs[1].lock.eq(owner) || tx.outputsData[1] !== '0x')
    )
      throw new FiveError('Change must return to your signed-in wallet.');
    const seen = new Set<string>();
    let total = 0n;
    for (const input of tx.inputs) {
      const key = `${input.previousOutput.txHash}:${input.previousOutput.index}`;
      if (seen.has(key) || input.since !== 0n)
        throw new FiveError('Unexpected contribution input.');
      seen.add(key);
      const cell = await this.client.getCellLiveNoCache(input.previousOutput, true, true);
      if (
        !cell ||
        cell.cellOutput.type ||
        cell.outputData !== '0x' ||
        !cell.cellOutput.lock.eq(owner)
      )
        throw new FiveError('Payment inputs changed. Review your wallet again.', 409);
      total += cell.cellOutput.capacity;
    }
    const fee = total - tx.outputs.reduce((sum, o) => sum + o.capacity, 0n);
    if (fee < 0n || fee > 10_000_000n)
      throw new FiveError('The network fee is outside the contribution limit.');
    await this.client.sendTransactionDry(tx, 'passthrough');
    return tx;
  }
  async submit(actor: NonNullable<Actor>, roundId: string, b: Record<string, unknown>) {
    const id = identifier(b.sponsorId),
      r = await this.store.load(roundId);
    const s = r?.sponsors.find(
      (s) => s.id === id && s.accountId === actor.id && s.wallet === actor.wallet,
    );
    if (!s) throw new FiveError('Contribution not found.', 404);
    // A persisted signature is the only transaction ever retried for this intent.
    const bytes = text(b.signedBytes, 200_002);
    if (s.signedBytes) {
      if (s.signedBytes !== bytes)
        throw new FiveError(
          'A signed payment is already saved. Check its existing transaction instead.',
          409,
        );
      return;
    }
    const tx = await this.validate(s, bytes);
    await this.store.change(
      roundId,
      (current, now) => {
        const intent = current.sponsors.find((s) => s.id === id)!;
        if (intent.signedBytes) {
          if (intent.transactionHash !== tx.hash())
            throw new FiveError(
              'A different signed payment is already saved. Check its status.',
              409,
            );
          return;
        }
        if (current.state !== 'open' || now >= Date.parse(current.terms.lockAt))
          throw new FiveError(
            'The sponsorship deadline has passed. This payment was not submitted.',
            409,
          );
        const reserved = current.sponsors
          .filter((s) => s.funding === 'submitted' || s.funding === 'confirmed')
          .reduce((total, s) => total + BigInt(s.amountShannons), BigInt(intent.amountShannons));
        if (reserved > 999_999_999_999_999_999n)
          throw new FiveError('This gameweek has reached its contribution capacity.', 409);
        intent.signedBytes = ccc.hexFrom(tx.toBytes());
        intent.transactionHash = tx.hash();
        intent.funding = 'submitted';
        if (isAuction(current))
          intent.submittedSequence =
            Math.max(0, ...current.sponsors.map((s) => s.submittedSequence ?? 0)) + 1;
      },
      {
        intent: `${roundId}:${id}`,
        outpoints: tx.inputs.map((i) => `${i.previousOutput.txHash}:${i.previousOutput.index}`),
      },
    );
    // The separate worker broadcasts only after this database commit.
  }
  async reconcile(roundId: string) {
    const r = await this.store.load(roundId);
    if (!r) return;
    const pending = r.sponsors.filter((s) => s.signedBytes && s.funding === 'submitted');
    const offset = (this.cursors.get(roundId) ?? 0) % Math.max(pending.length, 1);
    const batch = [...pending.slice(offset), ...pending.slice(0, offset)].slice(0, 5);
    this.cursors.set(roundId, offset + batch.length);
    for (const s of batch) {
      try {
        const tx = ccc.Transaction.fromBytes(s.signedBytes!),
          hash = tx.hash();
        if (hash !== s.transactionHash) throw Error('Stored Five contribution hash mismatch');
        // Certify unknown/pending status only after the observed chain has crossed
        // the cutoff, not just because the database wall clock has advanced.
        const afterCutoff =
          isAuction(r) &&
          !r.auction &&
          Number((await this.client.getTipHeader()).timestamp) >= auctionCutoff(r);
        const response = await this.client.getTransactionNoCache(hash);
        if (response?.status === 'committed') {
          if (
            response.transaction.hash() !== hash ||
            !response.blockHash ||
            response.blockNumber === undefined
          )
            continue;
          const canonical = await this.client.getHeaderByNumberNoCache(response.blockNumber),
            tip = await this.client.getTipHeader();
          if (canonical?.hash !== response.blockHash) continue;
          if (tip.number - response.blockNumber + 1n < BigInt(CONFIRMATIONS)) {
            await this.markAuctionChecked(roundId, s.id, afterCutoff);
            continue;
          }
          const confirmationHeader = isAuction(r)
            ? await this.client.getHeaderByNumberNoCache(
                response.blockNumber + BigInt(CONFIRMATIONS - 1),
              )
            : null;
          if (isAuction(r) && !confirmationHeader) continue;
          await this.store.change(roundId, (current) => {
            const intent = current.sponsors.find((item) => item.id === s.id);
            if (!intent || intent.transactionHash !== hash)
              throw Error('Contribution changed during confirmation');
            intent.funding = 'confirmed';
            intent.outpoint = `${hash}:0`;
            if (confirmationHeader)
              intent.confirmedAt = new Date(Number(confirmationHeader.timestamp)).toISOString();
          });
        } else if (!response || ['unknown', 'rejected'].includes(response.status)) {
          await this.markAuctionChecked(roundId, s.id, afterCutoff);
          // Re-broadcast the exact saved signature. Unknown/conflicting spends stay recoverable.
          let live = true;
          for (const input of tx.inputs)
            if (!(await this.client.getCellLiveNoCache(input.previousOutput, false, true))) {
              live = false;
              break;
            }
          if (live) await this.client.sendTransactionNoCache(tx, 'passthrough');
        }
        await this.markAuctionChecked(roundId, s.id, afterCutoff);
      } catch {
        console.warn('[five-rewards] contribution check pending; exact signature retained');
      }
    }
  }
  private async markAuctionChecked(roundId: string, sponsorId: string, afterCutoff: boolean) {
    if (!afterCutoff) return;
    const round = await this.store.load(roundId);
    if (!round || !isAuction(round) || round.auction) return;
    const sponsor = round.sponsors.find((s) => s.id === sponsorId);
    if (
      sponsor?.funding !== 'submitted' ||
      Date.parse(sponsor.auctionCheckedAt ?? '') >= auctionCutoff(round) ||
      (await this.store.clock()) < auctionCutoff(round)
    )
      return;
    await this.store.change(roundId, (current, now) => {
      const item = current.sponsors.find((s) => s.id === sponsorId);
      if (item?.funding === 'submitted') item.auctionCheckedAt = new Date(now).toISOString();
    });
  }
  async resolveConflict(actor: NonNullable<Actor>, roundId: string, b: Record<string, unknown>) {
    const id = identifier(b.sponsorId),
      hash = text(b.conflictingHash, 66);
    if (!/^0x[0-9a-f]{64}$/i.test(hash))
      throw new FiveError('Enter a valid conflicting transaction hash.');
    const r = await this.store.load(roundId),
      s = r?.sponsors.find((s) => s.id === id && s.accountId === actor.id);
    if (!s?.signedBytes || s.funding === 'confirmed' || hash === s.transactionHash)
      throw new FiveError('This contribution cannot be resolved as a conflict.');
    const conflict = await this.client.getTransactionNoCache(hash);
    if (
      conflict?.status !== 'committed' ||
      !conflict.blockHash ||
      conflict.blockNumber === undefined ||
      conflict.transaction.hash() !== hash
    )
      throw new FiveError('The conflicting transaction is not confirmed yet.', 409);
    const block = await this.client.getHeaderByNumberNoCache(conflict.blockNumber),
      tip = await this.client.getTipHeader();
    if (
      block?.hash !== conflict.blockHash ||
      tip.number - conflict.blockNumber + 1n < BigInt(CONFIRMATIONS)
    )
      throw new FiveError('Wait for more confirmations before resolving this conflict.', 409);
    const original = ccc.Transaction.fromBytes(s.signedBytes);
    if (
      !conflict.transaction.inputs.some((a) =>
        original.inputs.some((b) => a.previousOutput.eq(b.previousOutput)),
      )
    )
      throw new FiveError('This transaction does not spend a reserved contribution input.');
    const prior = await this.client.getTransactionNoCache(s.transactionHash!);
    if (prior?.status === 'committed')
      throw new FiveError('The contribution is already committed. Refresh its status.', 409);
    await this.store.change(roundId, (current) => {
      const item = current.sponsors.find((i) => i.id === id)!;
      if (item.funding === 'confirmed')
        throw new FiveError('The contribution has already confirmed.', 409);
      item.funding = 'conflicted';
      item.conflictingHash = hash;
    });
  }
  async settleAuction(roundId: string) {
    const round = await this.store.load(roundId);
    if (!round || !isAuction(round) || round.auction || round.state !== 'open') return;
    const now = await this.store.clock();
    if (
      now < Date.parse(round.terms.lockAt) ||
      (now < auctionCutoff(round) && round.sponsors.some((s) => s.funding === 'submitted'))
    )
      return;
    if (round.sponsors.some((s) => s.funding === 'submitted')) {
      if (
        round.sponsors.some(
          (s) =>
            s.funding === 'submitted' &&
            !(Date.parse(s.auctionCheckedAt ?? '') >= auctionCutoff(round)),
        )
      )
        return;
      if (Number((await this.client.getTipHeader()).timestamp) < auctionCutoff(round)) return;
    }
    await this.verifyConfirmed(roundId);
    await this.store.change(roundId, (current, time) => {
      if (current.revision !== round.revision)
        throw new FiveError('Auction changed during verification. Settlement will retry.', 409);
      closeAuction(current, time);
    });
  }
  async verifyConfirmed(roundId: string) {
    const r = await this.store.load(roundId);
    for (const s of r?.sponsors.filter((s) => s.funding === 'confirmed') ?? []) {
      if (!s.transactionHash) throw Error('Confirmed contribution has no transaction');
      const response = await this.client.getTransactionNoCache(s.transactionHash);
      if (
        response?.status !== 'committed' ||
        !response.blockHash ||
        response.blockNumber === undefined ||
        response.transaction.hash() !== s.transactionHash
      )
        throw new FiveError(
          'A contribution is being rechecked. Finalization and rewards remain paused.',
          503,
        );
      const block = await this.client.getHeaderByNumberNoCache(response.blockNumber),
        tip = await this.client.getTipHeader();
      if (
        block?.hash !== response.blockHash ||
        tip.number - response.blockNumber + 1n < BigInt(CONFIRMATIONS)
      )
        throw new FiveError('A contribution needs more confirmations.', 503);
      if (r && isAuction(r)) {
        const confirmation = await this.client.getHeaderByNumberNoCache(
          response.blockNumber + BigInt(CONFIRMATIONS - 1),
        );
        if (
          !confirmation ||
          new Date(Number(confirmation.timestamp)).toISOString() !== s.confirmedAt
        )
          throw new FiveError(
            'Bid confirmation evidence changed. Auction delivery is paused for reconciliation.',
            503,
          );
      }
    }
  }
}
