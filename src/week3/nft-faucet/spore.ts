/**
 * Spore (NFT) helpers for the week-3 faucet.
 *
 * A "Spore" is the canonical CKB Digital Object (DOB / NFT) primitive — a
 * cell whose Type Script is the Spore protocol script and whose data is a
 * Molecule-packed `(contentType, content, clusterId?)` tuple. Each Spore has
 * a unique `args` derived from `hashTypeId(firstInput, outputIndex)`, so the
 * sporeId is deterministic from the funding cell that minted it.
 *
 * Source: https://github.com/ckb-devrel/ccc/tree/master/packages/spore
 */

import { ccc } from "@ckb-ccc/core";
import { createSpore, findSpores } from "@ckb-ccc/spore";
import { getClient, getSigner } from "../../week2/wallet/client";
import { lockFromAddress } from "../../week2/wallet/wallet";

/**
 * One minted NFT, as returned to the UI.
 * `content` is a UTF-8 string when the contentType starts with `text/` or
 * `image/svg+xml`, otherwise it's a 0x-hex blob.
 */
export interface NftView {
  id: string;
  contentType: string;
  content: string;
  isText: boolean;
  outPoint: { txHash: string; index: string };
  capacity: string; // shannons, decimal string
}

/** Mint an NFT to `toAddress` from the faucet wallet (week-2 key file). */
export async function mintNft(
  toAddress: string,
  payload: { contentType: string; content: Uint8Array | string },
): Promise<{ txHash: string; sporeId: string }> {
  const signer = getSigner();
  const toLock = await lockFromAddress(toAddress);

  const content =
    typeof payload.content === "string"
      ? new TextEncoder().encode(payload.content)
      : payload.content;

  const { tx, id } = await createSpore({
    signer,
    data: { contentType: payload.contentType, content },
    to: toLock,
  });

  await tx.completeFeeBy(signer, 1000n);
  const txHash = await signer.sendTransaction(tx);

  return { txHash, sporeId: id };
}

/** List Spores currently held by `address`. */
export async function listNfts(
  address: string,
  limit = 50,
): Promise<NftView[]> {
  const client = getClient();
  const lock = await lockFromAddress(address);

  const out: NftView[] = [];
  for await (const found of findSpores({ client, lock, limit, order: "desc" })) {
    const { spore, sporeData } = found;
    const ct = sporeData.contentType;
    const bytes = ccc.bytesFrom(sporeData.content);
    const isText =
      ct.startsWith("text/") ||
      ct === "image/svg+xml" ||
      ct === "application/json";

    out.push({
      // The sporeId is the type script's args.
      id: spore.cellOutput.type!.args,
      contentType: ct,
      content: isText ? new TextDecoder().decode(bytes) : ccc.hexFrom(bytes),
      isText,
      outPoint: {
        txHash: spore.outPoint.txHash,
        index: spore.outPoint.index.toString(),
      },
      capacity: spore.cellOutput.capacity.toString(),
    });
  }
  return out;
}
