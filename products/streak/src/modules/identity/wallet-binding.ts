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
  if (!signType || signType === ccc.SignerSignType.Unknown) return null;
  if (signType === ccc.SignerSignType.JoyId) {
    try {
      const identity = JSON.parse(value.identity) as unknown;
      const signed = JSON.parse(value.signature) as unknown;
      if (
        !identity ||
        typeof identity !== 'object' ||
        !('keyType' in identity) ||
        identity.keyType !== 'main_key' ||
        !('publicKey' in identity) ||
        typeof identity.publicKey !== 'string' ||
        !/^[a-fA-F0-9]{128}$/.test(identity.publicKey) ||
        !signed ||
        typeof signed !== 'object' ||
        !('alg' in signed) ||
        signed.alg !== -7 ||
        !('message' in signed) ||
        typeof signed.message !== 'string' ||
        !('signature' in signed) ||
        typeof signed.signature !== 'string' ||
        Object.keys(signed).some((key) => !['alg', 'message', 'signature'].includes(key))
      )
        return null;
      // CCC spreads these fields into its verifier. Never allow supplied challenge,
      // key type or public key to override the server challenge and identity.
      return new ccc.Signature(
        JSON.stringify({
          signature: signed.signature,
          alg: -7,
          message: signed.message,
        }),
        JSON.stringify({ keyType: 'main_key', publicKey: identity.publicKey.toLowerCase() }),
        signType,
      );
    } catch {
      return null;
    }
  }
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
      case ccc.SignerSignType.JoyId: {
        const validated = signatureFrom(proof);
        if (!validated) return false;
        const identity = JSON.parse(validated.identity) as { publicKey: string };
        const known = await client.getKnownScript(ccc.KnownScript.JoyId);
        candidates = [
          await ccc.Address.fromScript(
            ccc.Script.from({
              codeHash: known.codeHash,
              hashType: known.hashType,
              args: `0x0001${ccc.hashCkb(`0x${identity.publicKey}`).slice(2, 42)}`,
            }),
            client,
          ),
        ];
        break;
      }
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
