import assert from 'assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import type { AddressInfo } from 'net';
import type { IncomingMessage } from 'http';
import { ccc } from '@ckb-ccc/core';
import { FileAuthStorage, tokenHash, CHALLENGE_TTL_MS } from './modules/identity/storage';
import { postgresConfig } from './infrastructure/postgres-config';
import { signatureFrom, walletAddressMatches } from './modules/identity/wallet-binding';

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'streak-identity-'));
  process.env.STREAK_DB_FILE = join(directory, 'db.json');
  process.env.STREAK_SKIP_ENV_FILE = '1';
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_DB_URL',
    'API_SPORTS_KEY',
    'TELEGRAM_BOT_TOKEN',
  ])
    delete process.env[key];
  delete process.env.DATABASE_URL;
  const { mutationAllowed, sessionCookie } = await import('./modules/identity/http-policy');
  const file = join(directory, 'local-auth.json');
  let clock = 1000;
  try {
    const first = new FileAuthStorage(file, () => clock);
    await first.issue('address:attempt1', 'first');
    await first.issue('address:attempt2', 'second');
    await first.issue('audience:one', 'bound', 'https://first.example', clock + 100);
    assert.equal(await first.consume('audience:one', 'https://second.example'), null);
    assert.equal(await first.consume('audience:one', 'https://first.example'), 'bound');
    assert.equal(await first.consume('address:attempt1'), 'first');
    const race = await Promise.all(
      Array.from({ length: 12 }, () => first.consume('address:attempt2')),
    );
    assert.equal(race.filter(Boolean).length, 1);
    const hash = tokenHash('synthetic-token');
    await first.saveSession(hash, 'alice', 100);
    const restarted = new FileAuthStorage(file, () => clock);
    assert.equal(await restarted.session(hash), 'alice');
    assert.ok(!(await readFile(file, 'utf8')).includes('synthetic-token'));
    clock += 100;
    assert.equal(await restarted.session(hash), null, 'Expiry equality rejects');
    await restarted.saveSession(hash, 'alice', 100);
    await restarted.revoke(hash);
    assert.equal(await new FileAuthStorage(file, () => clock).session(hash), null);
    await restarted.issue('other:expired', 'expired');
    clock += CHALLENGE_TTL_MS;
    assert.equal(await restarted.consume('other:expired'), null);
    for (let i = 0; i < 5; i++) await restarted.issue(`limited:${i}`, 'message');
    await assert.rejects(restarted.issue('limited:6', 'message'), /Too many/);
    await writeFile(file, '{broken');
    await assert.rejects(new FileAuthStorage(file).session(hash));

    for (const [raw, username, password] of [
      ['postgres://db.example/test', 'localhost', 'synthetic'],
      ['postgres://evil.example/test', 'synthetic', '127.0.0.1'],
      [
        'postgres://localhost.evil.example/test?sslmode=no-verify&ssl=false',
        'synthetic',
        'synthetic',
      ],
    ]) {
      const url = new URL(raw);
      url.username = username;
      url.password = password;
      assert.deepEqual(postgresConfig(url.toString()).ssl, { rejectUnauthorized: true });
      assert.ok(!postgresConfig(url.toString()).connectionString?.includes('ssl='));
    }
    assert.equal(postgresConfig('postgres://u:p@127.0.0.1/test').ssl, false);
    assert.throws(() => postgresConfig('postgres://remote/test?host=localhost'));
    const request = (headers: IncomingMessage['headers']) => ({ headers }) as IncomingMessage;
    process.env.STREAK_PUBLIC_ORIGIN = 'https://streak.example';
    const req = request({
      host: 'spoof.example',
      origin: 'https://streak.example',
      'content-type': 'application/json',
    });
    assert.ok(mutationAllowed(req));
    assert.match(sessionCookie('test', req), /; Secure$/);
    assert.match(sessionCookie('', req), /Max-Age=0/);
    for (const origin of [undefined, 'null', 'https://evil.example'])
      assert.equal(mutationAllowed(request({ ...req.headers, origin })), false);
    assert.equal(mutationAllowed(request({ ...req.headers, 'content-type': 'text/plain' })), false);
    delete process.env.STREAK_PUBLIC_ORIGIN;

    const client = new ccc.ClientPublicTestnet();
    // Ephemeral synthetic keys, no funded account or RPC.
    const signer = new ccc.SignerCkbPrivateKey(
      client,
      ccc.hexFrom(require('crypto').randomBytes(32)),
    );
    const other = new ccc.SignerCkbPrivateKey(
      client,
      ccc.hexFrom(require('crypto').randomBytes(32)),
    );
    const address = await signer.getRecommendedAddress();
    const otherAddress = await other.getRecommendedAddress();
    const proof = await signer.signMessage('binding');
    assert.ok(signatureFrom(proof));
    assert.ok(await walletAddressMatches(address, proof));
    assert.equal(await walletAddressMatches(otherAddress, proof), false);
    assert.equal(
      await walletAddressMatches(address, new ccc.Signature('', '{}', ccc.SignerSignType.JoyId)),
      false,
    );
    const evm = '0x1111111111111111111111111111111111111111';
    for (const candidate of await new ccc.SignerEvmAddressReadonly(client, evm).getAddressObjs()) {
      assert.ok(
        await walletAddressMatches(
          candidate.toString(),
          new ccc.Signature('', evm, ccc.SignerSignType.EvmPersonal),
        ),
      );
      assert.equal(await walletAddressMatches(candidate.toString(), proof), false);
    }
    const btc = new ccc.Signature('', proof.identity, ccc.SignerSignType.BtcEcdsa);
    const btcAddress = (
      await new ccc.SignerBtcPublicKeyReadonly(client, '', proof.identity).getAddressObjs()
    )[0].toString();
    assert.ok(await walletAddressMatches(btcAddress, btc));
    assert.equal(await walletAddressMatches(otherAddress, btc), false);
    for (const candidate of [
      new ccc.SignerNostrPrivateKey(client, require('crypto').randomBytes(32)),
      new ccc.SignerDogePrivateKey(client, require('crypto').randomBytes(32)),
    ]) {
      const proof = await candidate.signMessage('binding');
      assert.ok(await ccc.Signer.verifyMessage('binding', proof));
      assert.ok(await walletAddressMatches(await candidate.getRecommendedAddress(), proof));
      assert.equal(await walletAddressMatches(otherAddress, proof), false);
    }

    const { server } = await import('./server');
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
      fetch(origin + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, ...extra },
        body: JSON.stringify(body),
      });
    try {
      const nonceResponse = await post('/api/auth/nonce', { address });
      assert.equal(nonceResponse.status, 200);
      const nonce = (await nonceResponse.json()) as { message: string; challengeId: string };
      assert.ok(nonce.message.includes(origin));
      const signed = await signer.signMessage(nonce.message);
      const responses = await Promise.all(
        [1, 2].map(() =>
          post('/api/auth/verify', { address, signature: signed, challengeId: nonce.challengeId }),
        ),
      );
      assert.deepEqual(responses.map((row) => row.status).sort(), [201, 400]);
      const cookie = responses
        .find((row) => row.status === 201)!
        .headers.get('set-cookie')!
        .split(';')[0];
      assert.equal((await fetch(origin + '/api/me', { headers: { cookie } })).status, 200);
      const wrongNonce = (await (
        await post('/api/auth/nonce', { address: otherAddress })
      ).json()) as typeof nonce;
      const wrongProof = await signer.signMessage(wrongNonce.message);
      assert.equal(
        (
          await post('/api/auth/verify', {
            address: otherAddress,
            signature: wrongProof,
            challengeId: wrongNonce.challengeId,
          })
        ).status,
        401,
      );
      assert.equal(
        (await post('/api/logout', {}, { cookie, origin: 'https://evil.example' })).status,
        403,
      );
      const storage = await (await import('./auth')).authStorage();
      const revoke = storage.revoke.bind(storage);
      storage.revoke = async () => {
        throw new Error('Synthetic storage outage');
      };
      const failedLogout = await post('/api/logout', {}, { cookie });
      assert.equal(failedLogout.status, 500);
      assert.equal(failedLogout.headers.get('set-cookie'), null);
      storage.revoke = revoke;
      assert.equal((await post('/api/logout', {}, { cookie })).status, 200);
      assert.equal((await fetch(origin + '/api/me', { headers: { cookie } })).status, 401);
      assert.equal(
        (await fetch(origin + '/api/me', { headers: { cookie: 'streak_sid=%ZZ' } })).status,
        401,
      );
      const evmSigner = require('ethers').Wallet.createRandom();
      const identity = evmSigner.address.toLowerCase();
      const permitted = await new ccc.SignerEvmAddressReadonly(client, identity).getAddressObjs();
      const competing = await Promise.all(
        permitted.slice(0, 2).map(async (candidate) => {
          const address = candidate.toString();
          const nonce = (await (await post('/api/auth/nonce', { address })).json()) as {
            message: string;
            challengeId: string;
          };
          return {
            address,
            challengeId: nonce.challengeId,
            signature: new ccc.Signature(
              await evmSigner.signMessage(nonce.message),
              identity,
              ccc.SignerSignType.EvmPersonal,
            ),
          };
        }),
      );
      assert.deepEqual(
        (await Promise.all(competing.map((body) => post('/api/auth/verify', body))))
          .map((response) => response.status)
          .sort(),
        [201, 409],
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
    console.log(
      'Identity passed: durable adapter reopen, expiry, revocation/outage, replay and conflicting-binding races, origin protection, verified-TLS configuration and real signed HTTP login.',
    );
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('streak-identity-'));
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
