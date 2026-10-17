/* Isolated browser fixture. The application never imports this module. */
import { ccc } from '@ckb-ccc/core';
import { Eip6963 } from '@ckb-ccc/eip6963';
import { Wallet, getBytes } from 'ethers';

export async function connectEvm(element, options = {}) {
  // Public, unfunded test identities. Never substitute an application key.
  let wallet = new Wallet(`0x${(options.other ? '22' : (options.keyByte ?? '11')).repeat(32)}`);
  let connected = true;
  let mode = options.mode ?? 'accept';
  let release;
  const events = new Map();
  const calls = [];
  const provider = {
    async request({ method, params }) {
      calls.push(method);
      if (method === 'eth_accounts' || method === 'eth_requestAccounts')
        return connected ? [wallet.address] : [];
      if (method !== 'personal_sign') throw Error(`Unexpected synthetic wallet request: ${method}`);
      if (mode === 'reject') throw Error('User rejected the synthetic sign-in request.');
      if (mode === 'hold')
        await new Promise((done) => {
          release = done;
        });
      return wallet.signMessage(getBytes(params[0]));
    },
    on(event, callback) {
      if (!events.has(event)) events.set(event, new Set());
      events.get(event).add(callback);
      return this;
    },
    removeListener(event, callback) {
      events.get(event)?.delete(callback);
      return this;
    },
  };
  const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  client.getBalanceSingle = async () => 1234_00000000n;
  const signer = new Eip6963.Signer(client, provider);
  const address = await signer.getRecommendedAddress();
  window.syntheticEvm = {
    calls,
    address,
    listenerCount: () => [...events.values()].reduce((sum, listeners) => sum + listeners.size, 0),
    accept: () => {
      mode = 'accept';
      release?.();
    },
    repeatAccount: () => {
      [...(events.get('accountsChanged') ?? [])].forEach((callback) => callback([wallet.address]));
    },
    replace: () => {
      wallet = new Wallet(`0x${'33'.repeat(32)}`);
      [...(events.get('accountsChanged') ?? [])].forEach((callback) => callback([wallet.address]));
    },
    disconnect: () => {
      connected = false;
      [...(events.get('disconnect') ?? [])].forEach((callback) => callback());
    },
  };
  element.onClose(
    () =>
      void element.updateSigner(
        { name: 'Synthetic EIP-1193 wallet' },
        { name: 'Ethereum', signer },
      ),
  );
}
