import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAccount,
  parseTelegramLink,
  shortWalletAddress,
  displayWalletBalance,
} from './src/features/account/data.ts';

const user = {
  id: 'owner',
  username: 'streakfan',
  walletAddress: 'ckt1test',
  telegramConnected: false,
};
test('Wallet balance displays two decimals rounded down without floating point', () => {
  assert.equal(displayWalletBalance(0n), '0.00');
  assert.equal(displayWalletBalance(999_999n), '0.00');
  assert.equal(displayWalletBalance(123_499_999_999n), '1,234.99');
  assert.equal(displayWalletBalance(123_400_000_001n), '1,234.00');
  assert.equal(displayWalletBalance(900719925474099199999999n), '9,007,199,254,740,991.99');
});
test('Account Telegram state is explicit and malformed status cannot enable connection', () => {
  assert.deepEqual(parseAccount({ user }), {
    ...user,
    telegramUsername: null,
    telegramAvailable: false,
  });
  assert.equal(
    parseAccount({ user: { ...user, telegramAvailable: true } }).telegramAvailable,
    true,
  );
  assert.equal(
    parseAccount({ user: { ...user, telegramUsername: 'old_name' } }).telegramUsername,
    null,
  );
  assert.equal(
    parseAccount({ user: { ...user, telegramConnected: true, telegramUsername: 'valid_name' } })
      .telegramUsername,
    'valid_name',
  );
  for (const patch of [
    { telegramConnected: 'true' },
    { telegramAvailable: 1 },
    { telegramUsername: '<img>' },
    { walletAddress: '' },
  ])
    assert.throws(() => parseAccount({ user: { ...user, ...patch } }));
});
test('Telegram links accept only fresh HTTPS bot deep links without alternate destinations', () => {
  const now = Date.now(),
    expiresAt = new Date(now + 900_000).toISOString();
  const url = 'https://t.me/StreakTestBot?start=link_abcdefghijkLMNOP12345678';
  assert.deepEqual(parseTelegramLink({ url, expiresAt }, now), { url, expiresAt: now + 900_000 });
  for (const bad of [
    'https://t.me.attacker.example/BotName?start=link_abcdefghijklmnop',
    url.replace('https:', 'http:'),
    url.replace('t.me/', 'user@t.me/'),
    url + '&next=https://example.com',
    url + '#redirect',
    url.replace('link_', 'other_'),
  ])
    assert.throws(() => parseTelegramLink({ url: bad, expiresAt }, now));
  assert.throws(() => parseTelegramLink({ url, expiresAt: new Date(now).toISOString() }, now));
  assert.throws(() =>
    parseTelegramLink({ url, expiresAt: new Date(now + 3_600_000).toISOString() }, now),
  );
  assert.throws(() => parseTelegramLink({ url, expiresAt: 'tomorrow' }, now));
});
test('Compact addresses retain recognizable ends without modifying the full copy source', () => {
  const address = 'ckt1' + 'a'.repeat(80) + '1234567';
  assert.equal(shortWalletAddress(address), 'ckt1aaaaa...1234567');
  assert.equal(shortWalletAddress('ckt1short'), 'ckt1short');
});
