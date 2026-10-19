import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityState,
  isHistory,
  isCollected,
  returnParts,
  pendingClaim,
  collectionLabel,
} from './src/features/direct/activity-model.ts';

const descriptor = { type: { codeHash: 'code', args: 'market' }, creationTxHash: 'creation' };
const position = {
  status: 'accepted',
  outcome: 0,
  principalShannons: '10000000000',
  storageShannons: '32100000000',
  entitlementShannons: null,
  outPoint: { txHash: 'position', index: 1 },
};
test('activity separates payment admission, football progress and contract settlement', () => {
  const open = { phase: 'open' };
  assert.equal(activityState(position, open, 'scheduled', 200, 100), 'upcoming');
  assert.equal(activityState(position, open, 'live', 50, 100), 'live');
  assert.equal(activityState(position, open, 'final', 50, 100), 'settling');
  assert.equal(
    activityState({ ...position, status: 'pending-validation' }, open, 'live'),
    'verifying',
  );
  assert.equal(activityState({ ...position, status: 'refund-required' }, open), 'refund-pending');
  assert.equal(activityState(position, { phase: 'unknown' }, 'final'), 'unknown');
  assert.equal(isHistory(position), false);
});
test('outcomes use verified settlement, not the amount or football score', () => {
  const claim = { ...position, status: 'claimable', entitlementShannons: '42100000000' };
  assert.equal(activityState(claim, { phase: 'settled' }, 'final'), 'settled');
  assert.equal(
    activityState(claim, { phase: 'settled', settlement: { outcome: 0, emptyWinner: false } }),
    'won',
  );
  assert.equal(
    activityState(claim, { phase: 'settled', settlement: { outcome: 1, emptyWinner: false } }),
    'lost',
  );
  assert.equal(
    activityState(claim, { phase: 'settled', settlement: { outcome: 1, emptyWinner: true } }),
    'refund',
  );
  assert.equal(
    activityState(claim, { phase: 'voided', settlement: { outcome: null, emptyWinner: false } }),
    'refund',
  );
  assert.equal(isHistory(claim), true);
  assert.equal(isCollected(claim), false);
  assert.equal(activityState({ ...claim, status: 'refunded' }, { phase: 'open' }), 'refund');
});
test('returns include storage once, with no false losing profit', () => {
  assert.deepEqual(returnParts({ ...position, entitlementShannons: '42100000000' }), {
    total: 42100000000n,
    storage: 32100000000n,
    prediction: 10000000000n,
  });
  assert.deepEqual(returnParts({ ...position, entitlementShannons: '32100000000' }), {
    total: 32100000000n,
    storage: 32100000000n,
    prediction: 0n,
  });
  assert.equal(returnParts(position), null);
  assert.equal(returnParts({ ...position, entitlementShannons: '1' }), null);
  assert.equal(collectionLabel('lost'), 'Collect storage');
  assert.equal(collectionLabel('refund'), 'Collect refund');
});
test('uncertain and rejected saved claims block duplicates until proved resolved', () => {
  const record = { kind: 'claim', descriptor, inputs: [position.outPoint] };
  for (const status of ['signed', 'submitted', 'unknown', 'committed', 'rejected', 'conflict']) {
    const saved = { ...record, status };
    assert.equal(pendingClaim(position, descriptor, [saved]), saved);
  }
  assert.equal(pendingClaim(position, descriptor, [{ ...record, status: 'resolved' }]), undefined);
  assert.equal(
    pendingClaim(position, { ...descriptor, type: { ...descriptor.type, args: 'other' } }, [
      { ...record, status: 'unknown' },
    ]),
    undefined,
  );
  assert.equal(
    pendingClaim({ ...position, status: 'claimed' }, descriptor, [
      { ...record, status: 'committed' },
    ]),
    undefined,
  );
});
