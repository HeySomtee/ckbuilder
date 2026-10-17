import assert from 'assert/strict';
import { telegramAvailable } from './modules/identity/integration-config';
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
  const telegram = {
    TELEGRAM_BOT_TOKEN: 'synthetic-test-token',
    TELEGRAM_BOT_USERNAME: 'synthetic_test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'synthetic-secret',
    APP_PUBLIC_URL: 'https://streak.example',
  };
  assert.equal(telegramAvailable({}, false), false);
  assert.equal(
    telegramAvailable(telegram, false),
    false,
    'credentials alone do not prove a receiving bot',
  );
  assert.equal(
    telegramAvailable({ ...telegram, APP_PUBLIC_URL: 'http://127.0.0.1:4100' }, true),
    false,
    'local address is not a public Telegram receiver',
  );
  assert.equal(telegramAvailable({ ...telegram, TELEGRAM_WEBHOOK_SECRET: '' }, true), false);
  assert.equal(
    telegramAvailable({ ...telegram, TELEGRAM_WEBHOOK_SECRET: 'invalid/path' }, true),
    false,
  );
  assert.equal(
    telegramAvailable({ ...telegram, APP_PUBLIC_URL: 'https://streak.example?query=value' }, true),
    false,
  );
  assert.equal(telegramAvailable(telegram, true), true);
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

    const { server, configureTelegramWebhook } = await import('./server');
    let webhookRequests = 0;
    const acceptWebhook: typeof fetch = async (input, init) => {
      webhookRequests++;
      assert.equal(
        String(input),
        `https://api.telegram.org/bot${telegram.TELEGRAM_BOT_TOKEN}/setWebhook`,
      );
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        url: `https://streak.example/api/integrations/telegram/webhook/${telegram.TELEGRAM_WEBHOOK_SECRET}`,
      });
      assert.ok(init?.signal);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    assert.equal(
      await configureTelegramWebhook({ environment: {}, request: acceptWebhook }),
      false,
    );
    assert.equal(
      await configureTelegramWebhook({
        environment: { ...telegram, APP_PUBLIC_URL: 'http://127.0.0.1' },
        request: acceptWebhook,
      }),
      false,
    );
    assert.equal(webhookRequests, 0, 'invalid webhook settings never contact Telegram');
    assert.equal(
      await configureTelegramWebhook({ environment: telegram, request: acceptWebhook }),
      true,
    );
    assert.equal(webhookRequests, 1);
    for (const [status, payload] of [
      [200, { ok: false }],
      [502, { ok: true }],
      [200, null],
    ] as const) {
      assert.equal(
        await configureTelegramWebhook({
          environment: telegram,
          request: async () => new Response(JSON.stringify(payload), { status }),
        }),
        false,
      );
    }
    assert.equal(
      await configureTelegramWebhook({
        environment: telegram,
        request: async () => {
          throw Error('Synthetic private transport detail');
        },
      }),
      false,
    );
    let finishOldSetup!: (response: Response) => void;
    const oldSetup = configureTelegramWebhook({
      environment: telegram,
      request: () =>
        new Promise((done) => {
          finishOldSetup = done;
        }),
    });
    assert.equal(await configureTelegramWebhook({ environment: {} }), false);
    finishOldSetup(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    assert.equal(await oldSetup, false, 'an earlier setup cannot overwrite a newer disabled state');
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
      const account = (await (await fetch(origin + '/api/me', { headers: { cookie } })).json()) as {
        user: { telegramAvailable: boolean };
      };
      assert.equal(
        account.user.telegramAvailable,
        false,
        'account exposes configuration availability without bot credentials',
      );
      const previousTelegram = Object.fromEntries(
        Object.keys(telegram).map((key) => [key, process.env[key]]),
      );
      try {
        Object.assign(process.env, telegram);
        assert.equal(await configureTelegramWebhook({ request: acceptWebhook }), true);
        const readyResponse = await fetch(origin + '/api/me', { headers: { cookie } });
        const readyAccount = (await readyResponse.json()) as {
          user: { telegramAvailable: boolean };
        };
        assert.equal(
          readyAccount.user.telegramAvailable,
          true,
          'the real account response uses the nested field consumed by Wallet',
        );
        assert.equal(JSON.stringify(readyAccount).includes(telegram.TELEGRAM_BOT_TOKEN!), false);
        // Exercise the real webhook against a stub transport. No Telegram network or messages.
        const originalFetch = global.fetch;
        const confirmations: string[] = [];
        global.fetch = async (input, init) => {
          const url = String(input);
          if (url === `https://api.telegram.org/bot${telegram.TELEGRAM_BOT_TOKEN}/sendMessage`) {
            const payload = JSON.parse(String(init?.body)) as { text: string; chat_id: string };
            assert.equal(payload.chat_id, 'synthetic-chat');
            confirmations.push(payload.text);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          assert.ok(url.startsWith(origin + '/'), 'No nonlocal test request is permitted');
          return originalFetch(input, init);
        };
        try {
          for (const username of [undefined, 'named_player']) {
            await (
              await import('./store')
            ).update((db) => {
              const user = db.users.find((user) => user.wallet.address === address);
              assert.ok(user);
              if (username) user.username = username;
              else delete user.username;
            });
            const linkResponse = await post('/api/integrations/telegram/connect', {}, { cookie });
            assert.equal(linkResponse.status, 200);
            const link = (await linkResponse.json()) as { url: string };
            const start = new URL(link.url).searchParams.get('start');
            assert.ok(start?.startsWith('link_'));
            const update = {
              message: {
                text: `/start ${start}`,
                chat: { id: 'synthetic-chat' },
                from: { username: 'telegram_person' },
              },
            };
            const prior = confirmations.length;
            assert.equal(
              (await post('/api/integrations/telegram/webhook/wrong-secret', update)).status,
              403,
            );
            assert.equal(confirmations.length, prior);
            assert.equal(
              (
                await post(
                  `/api/integrations/telegram/webhook/${telegram.TELEGRAM_WEBHOOK_SECRET}`,
                  update,
                )
              ).status,
              200,
            );
            assert.equal(confirmations.at(-1), 'Your Telegram account is now connected to Streak.');
            const linked = (await (
              await fetch(origin + '/api/me', { headers: { cookie } })
            ).json()) as { user: { telegramConnected: boolean } };
            assert.equal(linked.user.telegramConnected, true);
            await post(
              `/api/integrations/telegram/webhook/${telegram.TELEGRAM_WEBHOOK_SECRET}`,
              update,
            );
            assert.match(confirmations.at(-1)!, /invalid or expired/);
            assert.equal(confirmations.length, prior + 2, 'A token cannot link twice');
          }
        } finally {
          global.fetch = originalFetch;
        }
        const disconnected = await post('/api/integrations/telegram/disconnect', {}, { cookie });
        assert.equal(disconnected.status, 200);
        const disconnectedAccount = (await disconnected.json()) as {
          user: { telegramAvailable: boolean; telegramConnected: boolean };
        };
        assert.equal(
          disconnectedAccount.user.telegramAvailable,
          true,
          'disconnect preserves availability so the account can reconnect',
        );
        assert.equal(disconnectedAccount.user.telegramConnected, false);
      } finally {
        for (const [key, value] of Object.entries(previousTelegram)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await configureTelegramWebhook({ environment: {} });
      }
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
