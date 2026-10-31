/* Isolated browser fixture. The application never imports this module. */
import { ccc } from '@ckb-ccc/core';
import { Eip6963 } from '@ckb-ccc/eip6963';
import { UtxoGlobal } from '@ckb-ccc/utxo-global';
import { Wallet, getBytes } from 'ethers';

export async function connectNative(element, keyByte) {
  const client = new ccc.ClientPublicTestnet();
  client.getBalanceSingle = async () => 1234_00000000n;
  const account = new ccc.SignerCkbPrivateKey(client, `0x${keyByte.repeat(32)}`);
  const address = await account.getRecommendedAddress();
  const publicKey = await account.getIdentity();
  const events = new Map();
  const calls = [];
  const provider = {
    getNetwork: async () => { calls.push('getNetwork'); return 'nervos_testnet'; },
    isConnected: async () => { calls.push('isConnected'); return true; },
    getAccount: async () => { calls.push('getAccount'); return [address]; },
    getPublicKey: async () => [{ address, publicKey }],
    signMessage: async (message) => { calls.push('signMessage'); return account.signMessageRaw(message); },
    connect: async () => { throw Error('Already authorized native wallet must not request access'); },
    switchNetwork: async () => { throw Error('Must not switch network automatically'); },
    on: (name, listener) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener); },
    removeListener: (name, listener) => events.get(name)?.delete(listener),
  };
  window.utxoGlobal = { ckbSigner: provider };
  window.syntheticNative = { address, publicKey, calls };
  const { signer } = UtxoGlobal.getUtxoGlobalSigners(client).find(row => row.name === 'CKB');
  element.onClose(() => void element.updateSigner({ name: 'UTXO Global Wallet' }, { name: 'CKB', signer }));
}

export async function connectEvm(element, options = {}) {
  // Public, unfunded test identities. Never substitute an application key.
  let wallet = new Wallet(`0x${(options.other ? (options.otherKeyByte ?? '22') : (options.keyByte ?? '11')).repeat(32)}`);
  let connected = true;
  let accessGranted = !options.requireAccess;
  let mode = options.mode ?? 'accept';
  let release;
  const events = new Map();
  const calls = [];
  const provider = {
    async request({ method, params }) {
      calls.push(method);
      if (method === 'wallet_revokePermissions') {
        if (options.noRevoke) throw Object.assign(Error('Unsupported method'), { code: 4200 });
        if (options.holdRevoke) await new Promise(done => { window.releaseSyntheticRevoke = done; });
        connected = false;
        accessGranted = false;
        [...(events.get('accountsChanged') ?? [])].forEach(callback => callback([]));
        return null;
      }
      if (method === 'wallet_requestPermissions') {
        if (options.noPermissions) throw Object.assign(Error('Unsupported method'), { code: -32601 });
        if (options.rejectPermissions) throw Object.assign(Error('Account selection cancelled.'), { code: 4001 });
        if (options.selectOther) wallet = new Wallet(`0x${(options.otherKeyByte ?? '22').repeat(32)}`);
        connected = true;
        return [{ parentCapability: 'eth_accounts' }];
      }
      if (method === 'eth_requestAccounts') {
        if (mode === 'reject-access') throw Error('Synthetic wallet access declined.');
        if (mode === 'change-access') wallet = new Wallet(`0x${'44'.repeat(32)}`);
        accessGranted = true;
      }
      if (method === 'eth_accounts' || method === 'eth_requestAccounts')
        return connected ? [wallet.address] : [];
      if (method !== 'personal_sign') throw Error(`Unexpected synthetic wallet request: ${method}`);
      if (!accessGranted) throw Error('No connected wallet');
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
    evmAddress: wallet.address,
    reselect: async (nextElement) => {
      options.selectOther = true;
      await signer.connect();
      nextElement.onClose(() => void nextElement.updateSigner(
        { name: options.walletName ?? 'MetaMask' }, { name: 'Ethereum', signer }));
    },
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
        { name: options.walletName ?? 'MetaMask' },
        { name: 'Ethereum', signer },
      ),
  );
}
