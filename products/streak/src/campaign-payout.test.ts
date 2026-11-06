import assert from 'node:assert/strict';
import * as ccc from '@ckb-ccc/core';
import { newCampaign, type Campaign } from './modules/campaigns/domain';
import { campaignEvidenceCsv, campaignEvidenceExport } from './modules/campaigns/evidence';
import { validateCampaignAddress, verifyCampaignPayout } from './modules/campaigns/payout-proof';

const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const now = Date.parse('2026-11-05T10:00:00Z');
const lock = (n: number) =>
  ccc.Script.from({ codeHash: H(9), hashType: 'type', args: `0x${String(n).padStart(40, '0')}` });
const header = (number: number, hash = H(number)) =>
  ccc.ClientBlockHeader.from({
    compactTarget: 0,
    dao: { c: 0, ar: 0, s: 0, u: 0 },
    epoch: [0, 0, 1],
    extraHash: H(0),
    hash,
    nonce: 0,
    number,
    parentHash: H(0),
    proposalsHash: H(0),
    timestamp: now,
    transactionsRoot: H(0),
    version: 0,
  });

class ProofClient extends ccc.ClientPublicMainnet {
  tip = header(124);
  canonical = header(100);
  paidHeader = header(100);
  parent = ccc.Transaction.from({
    outputs: [{ capacity: 200_00000000n, lock: lock(1) }],
    outputsData: ['0x'],
  });
  tx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: this.parent.hash(), index: 0 }, since: 0 }],
    outputs: [{ capacity: 100_00000000n, lock: lock(2) }],
    outputsData: ['0x'],
  });
  status: ccc.TransactionStatus = 'committed';
  override getTipHeader = async () => this.tip;
  override getHeaderByHashNoCache = async () => this.paidHeader;
  override getHeaderByNumberNoCache = async () => this.canonical;
  override getTransactionNoCache = async () =>
    ccc.ClientTransactionResponse.from({
      transaction: this.tx,
      status: this.status,
      blockHash: H(100),
    });
  override async getTransaction() {
    return ccc.ClientTransactionResponse.from({ transaction: this.parent, status: 'committed' });
  }
}

async function main() {
  const client = new ProofClient({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const treasury = ccc.Address.fromScript(lock(1), client).toString();
  const recipient = ccc.Address.fromScript(lock(2), client).toString();
  const c: Campaign = newCampaign(
    'proof-test',
    { id: 'admin', name: 'Admin', wallet: 'synthetic', ownerHash: H(1) },
    {
      name: 'Synthetic prize',
      description: '',
      kind: 'predictions',
      registrationClosesAt: new Date(now - 1000).toISOString(),
      fiveRoundId: null,
      fixtureIds: [],
      prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '25' }],
      rehearsal: false,
    },
    now - 10000,
  );
  c.state = 'finished';
  c.scoreStatus = 'final';
  c.finalAt = new Date(now - 1000).toISOString();
  c.entries = [
    {
      accountId: 'winner',
      publicId: 'winner-public',
      ownerHash: H(2),
      wallet: 'synthetic-private',
      name: '=SUM(1,2)',
      joinedAt: new Date(now - 10000).toISOString(),
      points: 3,
      participated: true,
      qualifyingEntries: 1,
      tieBreakAt: null,
      tieBreakOrder: '',
      calls: [],
      evidence: [],
      five: null,
      receivingAddress: recipient,
    },
  ];
  c.awards = [
    {
      place: 1,
      publicId: 'winner-public',
      name: c.entries[0].name,
      amountShannons: '10000000000',
      usdReference: '25',
      status: 'ready',
      transactionHash: null,
      receivingAddress: recipient,
    },
  ];
  const verify = () =>
    verifyCampaignPayout(c, 'winner-public', client.tx.hash(), 0, treasury, client);
  const proof = await verify();
  assert.equal(proof.address, recipient);
  assert.equal(proof.amountShannons, '10000000000');
  assert.equal(proof.blockNumber, '100');
  client.tip = header(122);
  await assert.rejects(verify, /24 mainnet confirmations/);
  client.tip = header(124);
  client.canonical = header(100, H(200));
  await assert.rejects(verify, /payment block changed/);
  client.canonical = header(100);
  client.status = 'pending';
  await assert.rejects(verify, /not confirmed/);
  client.status = 'committed';
  client.tx.outputs[0].capacity += 1n;
  await assert.rejects(verify, /exact CKB prize/);
  client.tx.outputs[0].capacity -= 1n;
  client.tx.outputs[0].lock = lock(3);
  await assert.rejects(verify, /receiving address/);
  client.tx.outputs[0].lock = lock(2);
  client.parent.outputs[0].lock = lock(3);
  await assert.rejects(verify, /configured campaign rewards wallet/);
  client.parent.outputs[0].lock = lock(1);
  c.finalAt = new Date(now + 1).toISOString();
  await assert.rejects(verify, /predates/);
  c.finalAt = new Date(now - 1000).toISOString();
  c.draft.rehearsal = true;
  await assert.rejects(verify, /Finalize verified results/);
  c.draft.rehearsal = false;
  c.scoreStatus = 'review-required';
  await assert.rejects(verify, /Finalize verified results/);
  c.scoreStatus = 'final';
  assert.equal(await validateCampaignAddress(recipient), recipient);
  await assert.rejects(() => validateCampaignAddress(recipient, '6000000000'), /too small/);
  client.paidHeader = header(100, H(101));
  await assert.rejects(verify, /block evidence disagree/);
  client.paidHeader = header(100);
  await assert.rejects(
    () =>
      validateCampaignAddress(
        ccc.Address.fromScript(lock(2), new ccc.ClientPublicTestnet()).toString(),
      ),
    /mainnet CKB/,
  );
  const exported = campaignEvidenceExport(c);
  assert.equal(exported.metrics.includedInCommunityEvidence, true);
  assert.equal(JSON.stringify(exported).includes('synthetic-private'), false);
  assert.equal(JSON.stringify(exported).includes('accountId'), false);
  assert.match(campaignEvidenceCsv(c), /'\=SUM\(1,2\)/);
  console.log(
    'Campaign payout verification and evidence export: 16 checks passed (synthetic, no network or payments).',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
