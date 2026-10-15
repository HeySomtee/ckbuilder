import { ccc } from '@ckb-ccc/core';

export async function canonicalWalletAddress(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || value.length > 256) return null;
  try {
    const address = await ccc.Address.fromString(value.trim(), new ccc.ClientPublicTestnet());
    return address.prefix === 'ckt' ? address.toString() : null;
  } catch {
    return null;
  }
}

export function signatureFrom(value: unknown): ccc.Signature | null {
  if (!value || typeof value !== 'object') return null;
  if (
    !('signature' in value) ||
    typeof value.signature !== 'string' ||
    value.signature.length > 16_384 ||
    !('identity' in value) ||
    typeof value.identity !== 'string' ||
    !value.identity ||
    value.identity.length > 1024 ||
    !('signType' in value) ||
    typeof value.signType !== 'string'
  )
    return null;
  const signType = Object.values(ccc.SignerSignType).find((type) => type === value.signType);
  if (!signType || signType === ccc.SignerSignType.Unknown || signType === ccc.SignerSignType.JoyId)
    return null;
  return new ccc.Signature(value.signature, value.identity, signType);
}

/** Only deterministic lock derivation. No indexer, address lookup or RPC fallback. */
export async function walletAddressMatches(
  address: string,
  proof: ccc.Signature,
): Promise<boolean> {
  try {
    const client = new ccc.ClientPublicTestnet();
    const supplied = await ccc.Address.fromString(address, client);
    if (supplied.prefix !== 'ckt') return false;
    let candidates: ccc.Address[];
    switch (proof.signType) {
      case ccc.SignerSignType.CkbSecp256k1:
        candidates = [
          await new ccc.SignerCkbPublicKey(client, proof.identity).getAddressObjSecp256k1(),
        ];
        break;
      case ccc.SignerSignType.EvmPersonal:
        if (!/^0x[a-fA-F0-9]{40}$/.test(proof.identity)) return false;
        candidates = await new ccc.SignerEvmAddressReadonly(
          client,
          proof.identity,
        ).getAddressObjs();
        break;
      case ccc.SignerSignType.BtcEcdsa:
        candidates = await new ccc.SignerBtcPublicKeyReadonly(
          client,
          '',
          proof.identity,
        ).getAddressObjs();
        break;
      case ccc.SignerSignType.NostrEvent:
        candidates = await new ccc.SignerNostrPublicKeyReadonly(
          client,
          proof.identity,
        ).getAddressObjs();
        break;
      case ccc.SignerSignType.DogeEcdsa:
        candidates = await new ccc.SignerDogeAddressReadonly(
          client,
          proof.identity,
        ).getAddressObjs();
        break;
      default:
        return false;
    }
    return candidates.some((candidate) => candidate.script.eq(supplied.script));
  } catch {
    return false;
  }
}
