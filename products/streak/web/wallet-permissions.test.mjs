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

test('Optional account picker tolerates a mobile bridge method whitelist error', async () => {
  const message = 'rpc method is not whitelisted';
  for (const error of [
    new Error(message),
    message,
    { message },
    { code: -32603, message },
    { code: '-32001', message },
    { code: -32000, message: 'RPC method is not whitelisted.' },
    { code: '-32601', message: 'Method unavailable' },
    { code: '4200', message: 'Method unavailable' },
    { code: -32603, data: { originalError: { message } } },
  ]) {
    const calls = [];
    const signer = {
      type: 'EVM',
      provider: {
        request: async (args) => {
          calls.push(args);
          throw error;
        },
      },
    };
    await selectWalletAccount(signer);
    assert.deepEqual(calls, [
      { method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] },
    ]);
  }
});

test('Whitelist compatibility never swallows rejection, authorization or unrelated failures', async () => {
  const message = 'rpc method is not whitelisted';
  const failures = [
    new Error('User rejected the request.'),
    new Error('Network request failed'),
    { code: -32603, message: 'Internal error' },
    { code: -32000, message: 'Request failed' },
    { code: 4200, message: 'User rejected the request.' },
    { code: -32601, message, cause: new Error('Access denied') },
    { code: 4200, message, cause: new Error('The request is already pending.') },
    { code: -32601, message, cause: new Error('Wallet disconnected.') },
    { message: 'Account is not whitelisted' },
    { message: 'rpc method is not whitelisted because the user rejected access' },
  ];
  for (const code of [4001, 4100, 4900, 4901, -32002, -32602, '4001', '4100', 'BAD_REQUEST']) {
    failures.push(
      { code, message },
      { code: -32603, message, data: { originalError: { code } } },
      { code: 4200, message, cause: { error: { code } } },
    );
  }
  for (const error of failures) {
    let calls = 0;
    const signer = {
      type: 'EVM',
      provider: {
        request: async () => {
          calls++;
          throw error;
        },
      },
    };
    await assert.rejects(selectWalletAccount(signer), (value) => value === error);
    assert.equal(calls, 1, 'A failed permission request must not trigger an automatic retry.');
  }
});
