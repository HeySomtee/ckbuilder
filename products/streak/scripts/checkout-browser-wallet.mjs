/* Disposable EVM signer for the real application checkout journey. */
import { ccc } from '@ckb-ccc/core';
import { Eip6963 } from '@ckb-ccc/eip6963';
import { Wallet, getBytes, toUtf8String } from 'ethers';
import { attachBatchRpc, batchOwnerKey } from './batch-browser-fixture.mjs';

export async function connect(element) {
  const wallet = new Wallet(batchOwnerKey);
  const events = new Map();
  const provider = {
    async request({ method, params }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [wallet.address];
      if (method !== 'personal_sign') throw Error('Unexpected synthetic wallet request');
      if (toUtf8String(params[0]).startsWith('CKB transaction:')) await window.checkoutSigning();
      return wallet.signMessage(getBytes(params[0]));
    },
    on(event, callback) { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(callback); },
    removeListener(event, callback) { events.get(event)?.delete(callback); },
  };
  const client = attachBatchRpc(new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] }), window.checkoutRpc);
  const signer = new Eip6963.Signer(client, provider);
  element.onClose(() => void element.updateSigner({ name: 'Synthetic EVM wallet' }, { name: 'Ethereum', signer }));
}
