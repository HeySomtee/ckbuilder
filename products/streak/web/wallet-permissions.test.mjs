import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseWalletPermission, selectWalletAccount } from './src/lib/wallet-permissions.ts';

test('Disconnect targets only the selected injected provider account permission', async () => {
  const calls = [];
  const provider = {
    async request(args) {
      assert.equal(this, provider);
      calls.push(args);
    },
  };
  const signer = { type: 'EVM', provider };
  assert.equal(await releaseWalletPermission(signer), null);
  await selectWalletAccount(signer);
  assert.deepEqual(calls, [
    { method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] },
    { method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] },
  ]);
});
test('Account-selection fallback only tolerates explicitly unsupported methods', async () => {
  for (const code of [-32601, 4200, 4001, -32002]) {
    const error = Object.assign(new Error('Provider response'), { code });
    const signer = {
      type: 'EVM',
      provider: {
        request: async () => {
          throw error;
        },
      },
    };
    assert.match(
      await releaseWalletPermission(signer),
      /Disconnected from Streak.*kept its site permission/,
    );
    if (code === -32601 || code === 4200) await selectWalletAccount(signer);
    else await assert.rejects(selectWalletAccount(signer), (value) => value === error);
  }
});
test('Native and passkey signers use their own disconnect without EVM requests', async () => {
  for (const type of ['CKB', 'EVM']) {
    let disconnects = 0;
    const signer = {
      type,
      disconnect: async () => {
        disconnects++;
      },
    };
    await releaseWalletPermission(signer);
    await selectWalletAccount(signer);
    assert.equal(disconnects, 1);
  }
});
