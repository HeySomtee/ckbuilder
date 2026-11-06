import * as ccc from '@ckb-ccc/core';
import { CampaignError, type Campaign, type PayoutProof } from './domain';

const mainnet = new ccc.ClientPublicMainnet({ timeout: 10_000, maxConcurrent: 2, fallbacks: [] });
export const CAMPAIGN_PAYOUT_CONFIRMATIONS = 24n;

export async function validateCampaignAddress(
  address: string,
  amountShannons?: string,
): Promise<string> {
  try {
    const parsed = await ccc.Address.fromString(address.trim(), mainnet);
    if (parsed.prefix !== 'ckb') throw Error('Wrong network');
    if (
      amountShannons !== undefined &&
      BigInt(
        ccc.CellOutput.from({ capacity: BigInt(amountShannons), lock: parsed.script }).occupiedSize,
      ) *
        100_000_000n >
        BigInt(amountShannons)
    )
      throw new CampaignError(
        'This prize is too small for that receiving address’s cell. Use a compatible mainnet CKB address.',
      );
    return parsed.toString();
  } catch (error) {
    if (error instanceof CampaignError) throw error;
    throw new CampaignError('Enter a mainnet CKB receiving address beginning with ckb1.');
  }
}

/** Read-only verification. The API never receives the organizer's mainnet signing key. */
export async function verifyCampaignPayout(
  campaign: Campaign,
  publicId: string,
  transactionHash: unknown,
  outputIndex: unknown,
  rewardsAddress = process.env.STREAK_CAMPAIGNS_REWARDS_ADDRESS,
  client: ccc.Client = mainnet,
): Promise<PayoutProof> {
  if (client.addressPrefix !== 'ckb')
    throw new CampaignError('Campaign prizes require mainnet verification.', 503);
  if (!rewardsAddress)
    throw new CampaignError(
      'Configure the campaign mainnet rewards address before recording payments.',
      503,
    );
  if (
    typeof transactionHash !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(transactionHash) ||
    typeof outputIndex !== 'number' ||
    !Number.isSafeInteger(outputIndex) ||
    outputIndex < 0
  )
    throw new CampaignError('Enter the transaction hash and the recipient output index.');
  const award = campaign.awards.find((a) => a.publicId === publicId);
  const entry = campaign.entries.find((e) => e.publicId === publicId);
  if (
    campaign.draft.rehearsal ||
    campaign.state !== 'finished' ||
    campaign.scoreStatus !== 'final' ||
    !campaign.finalAt ||
    !award ||
    !entry?.receivingAddress
  )
    throw new CampaignError(
      'Finalize verified results and confirm this winner’s receiving address first.',
      409,
    );
  const [treasury, recipient, response, tip] = await Promise.all([
    ccc.Address.fromString(rewardsAddress, client),
    ccc.Address.fromString(entry.receivingAddress, client),
    client.getTransactionNoCache(transactionHash),
    client.getTipHeader(),
  ]);
  if (treasury.prefix !== 'ckb' || recipient.prefix !== 'ckb')
    throw new CampaignError('Both payout addresses must be on CKB mainnet.');
  if (
    !response ||
    response.status !== 'committed' ||
    !response.blockHash ||
    response.transaction.hash() !== transactionHash
  )
    throw new CampaignError('This payment is not confirmed on CKB mainnet yet.', 409);
  const header = await client.getHeaderByHashNoCache(response.blockHash);
  if (
    header &&
    (header.hash !== response.blockHash ||
      (response.blockNumber !== undefined && response.blockNumber !== header.number))
  )
    throw new CampaignError(
      'The payment and its block evidence disagree. Please retry verification.',
      409,
    );
  if (
    !header ||
    tip.number < header.number ||
    tip.number - header.number + 1n < CAMPAIGN_PAYOUT_CONFIRMATIONS
  )
    throw new CampaignError(
      'Wait for 24 mainnet confirmations, then verify this payment again.',
      409,
    );
  if (Number(header.timestamp) < Date.parse(campaign.finalAt))
    throw new CampaignError('The payment predates the final competition awards.', 409);
  const tx = response.transaction;
  const output = tx.outputs[outputIndex];
  if (
    !output ||
    output.type ||
    tx.outputsData[outputIndex] !== '0x' ||
    !output.lock.eq(recipient.script) ||
    output.capacity !== BigInt(award.amountShannons)
  )
    throw new CampaignError(
      'This output does not match the winner’s exact CKB prize and receiving address.',
      409,
    );
  if (!tx.inputs.length || tx.inputs.length > 256)
    throw new CampaignError('This payment exceeds the verification input limit.');
  // Exact source ownership prevents unrelated transfers being presented as organizer payouts.
  const parents = new Map<string, ccc.ClientTransactionResponse | undefined>();
  for (const input of tx.inputs) {
    if (!parents.has(input.previousOutput.txHash))
      parents.set(
        input.previousOutput.txHash,
        await client.getTransaction(input.previousOutput.txHash),
      );
    const parent = parents.get(input.previousOutput.txHash);
    const previous = parent?.transaction.outputs[Number(input.previousOutput.index)];
    if (
      !parent ||
      parent.status !== 'committed' ||
      parent.transaction.hash() !== input.previousOutput.txHash ||
      !previous ||
      previous.type ||
      parent.transaction.outputsData[Number(input.previousOutput.index)] !== '0x' ||
      !previous.lock.eq(treasury.script)
    )
      throw new CampaignError(
        'The payment must be funded by the configured campaign rewards wallet.',
        409,
      );
  }
  const canonical = await client.getHeaderByNumberNoCache(header.number);
  if (!canonical || canonical.hash !== header.hash)
    throw new CampaignError(
      'The payment block changed. Wait for the canonical payment to confirm.',
      409,
    );
  return {
    transactionHash,
    outputIndex,
    address: entry.receivingAddress,
    amountShannons: award.amountShannons,
    blockHash: header.hash,
    blockNumber: header.number.toString(),
    confirmedAt: new Date().toISOString(),
  };
}
