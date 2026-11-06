import assert from 'node:assert/strict';
import test from 'node:test';
import { SlipSource } from './src/features/predictions/slip-source.ts';

test('A mixed slip retains competition return paths after adding regular predictions', () => {
  const source = new SlipSource();
  assert.equal(source.campaign('alice:1', ['global']), null);
  source.selected('alice:1', 'weekend', 'weekend-1', ['global', 'weekend-1']);
  assert.equal(source.campaign('alice:1', ['global', 'weekend-1']), 'weekend');
  source.selected('alice:1', 'midweek', 'midweek-1', ['global', 'weekend-1', 'midweek-1']);
  assert.equal(source.campaign('alice:1', ['global', 'weekend-1', 'midweek-1']), 'midweek');
  source.selected('alice:1', null, 'global', ['global', 'weekend-1', 'midweek-1']);
  assert.equal(source.campaign('alice:1', ['global', 'weekend-1', 'midweek-1']), 'midweek');
  assert.equal(source.campaign('alice:1', ['global', 'weekend-1']), 'weekend');
});

test('Removing or paying all originating picks stops a stale competition return', () => {
  const source = new SlipSource();
  source.selected('alice:1', 'weekend', 'first', ['global', 'first']);
  source.selected('alice:1', 'weekend', 'second', ['global', 'first', 'second']);
  assert.equal(source.campaign('alice:1', ['global', 'first']), 'weekend');
  assert.equal(source.campaign('alice:1', ['global']), null);
  assert.equal(source.campaign('alice:1', []), null);
});

test('Navigation metadata never follows a different account or wallet revision', () => {
  const source = new SlipSource();
  source.selected('alice:1', 'weekend', 'first', ['first']);
  assert.equal(source.campaign('bob:1', ['first']), null);
  assert.equal(source.campaign('alice:2', ['first']), null);
  source.clear();
  assert.equal(source.campaign('alice:1', ['first']), null);
});

test('Only supported competition identifiers can become a return destination', () => {
  const source = new SlipSource();
  source.selected('alice:1', 'weekend', 'first', ['first']);
  source.selected('alice:1', 'weekend&view=account', 'first', ['first']);
  assert.equal(source.campaign('alice:1', ['first']), 'weekend');
  source.clear();
  source.selected('alice:1', 'weekend&view=account', 'first', ['first']);
  assert.equal(source.campaign('alice:1', ['first']), null);
});

test('Restored and empty slips use the active competition only when there is no valid pick source', () => {
  const source = new SlipSource();
  assert.equal(source.campaign('alice:1', ['restored'], 'weekend'), 'weekend');
  assert.equal(source.campaign('alice:1', [], 'weekend'), 'weekend');
  assert.equal(source.campaign('alice:1', ['restored'], null), null);
  assert.equal(source.campaign('alice:1', ['restored'], 'weekend&view=account'), null);
  source.selected('alice:1', 'midweek', 'selected', ['selected']);
  assert.equal(source.campaign('alice:1', ['selected'], 'weekend'), 'midweek');
  assert.equal(source.campaign('bob:2', ['selected'], 'weekend'), 'weekend');
});

test('Verified owner whitelist restores competition navigation after reload and rejects stale hints', () => {
  const source = new SlipSource();
  assert.equal(source.campaign('alice:1', ['restored'], null, ['weekend']), 'weekend');
  source.selected('alice:1', 'old-competition', 'restored', ['restored']);
  assert.equal(source.campaign('alice:1', ['restored'], null, ['weekend']), 'weekend');
  assert.equal(source.campaign('alice:1', ['restored'], null, []), null);
  assert.equal(source.campaign('alice:1', ['restored'], null, ['not?a=campaign']), null);
});

test('Removing a campaign line prunes its preference while preserving other mixed picks', () => {
  const source = new SlipSource();
  source.selected('alice:1', 'weekend', 'one', ['one']);
  source.selected('alice:1', 'midweek', 'two', ['one', 'two']);
  source.selected('alice:1', null, 'regular', ['one', 'regular']);
  assert.equal(source.campaign('alice:1', ['one', 'regular']), 'weekend');
  source.selected('bob:2', null, 'regular', ['one', 'regular']);
  assert.equal(source.campaign('bob:2', ['one', 'regular']), null);
});
