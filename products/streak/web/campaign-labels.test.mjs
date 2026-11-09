import assert from 'node:assert/strict';
import test from 'node:test';
import { slipCampaignLabels } from './src/features/predictions/campaign-labels.ts';

const picks = [
  { lineId: 'one', matchId: 'fixture-one' },
  { lineId: 'two', matchId: 'fixture-two' },
  { lineId: 'regular', matchId: 'unlisted' },
];
const campaign = {
  id: 'weekend',
  name: 'Weekend challenge',
  joined: true,
  kind: 'predictions',
  state: 'live',
  joinedFixtureIds: ['fixture-one', 'fixture-two'],
  qualifyingFixtureIds: ['fixture-one'],
};

test('Mixed-slip labels use verified registration and exact fixture membership', () => {
  assert.deepEqual(slipCampaignLabels(picks, [campaign]), [
    {
      id: 'weekend',
      name: 'Weekend challenge',
      lineIds: ['two'],
      alreadyCountedLineIds: [],
    },
  ]);
  for (const override of [
    { joined: false },
    { kind: 'five' },
    { state: 'deleted' },
    { state: 'finished' },
    { state: 'draft' },
    { joinedFixtureIds: [] },
  ])
    assert.deepEqual(slipCampaignLabels(picks, [{ ...campaign, ...override }]), []);
});

test('Already-counted status stays separate for each competition and clears with the picks', () => {
  const second = { ...campaign, id: 'cup', qualifyingFixtureIds: [] };
  const labels = slipCampaignLabels(picks, [campaign, second]);
  assert.deepEqual(labels[0].lineIds, ['two']);
  assert.deepEqual(labels[1].alreadyCountedLineIds, []);
  assert.deepEqual(slipCampaignLabels([], [campaign]), []);
  assert.deepEqual(slipCampaignLabels(picks, []), []);
});

test('Explicit choices are account-bound, regular stays regular and used entries lose labels', () => {
  const explicit = {
    ...campaign,
    predictionEntryPolicy: 'explicit-entry-v3',
    qualifyingFixtureIds: [],
  };
  assert.deepEqual(slipCampaignLabels(picks, [explicit], 'alice'), []);
  const chosen = [{ ...picks[0], competition: { accountId: 'alice', ids: ['weekend', 'cup'] } }];
  assert.equal(
    slipCampaignLabels(chosen, [explicit, { ...explicit, id: 'cup' }], 'alice').length,
    2,
  );
  assert.deepEqual(slipCampaignLabels(chosen, [explicit], 'bob'), []);
  assert.deepEqual(
    slipCampaignLabels(chosen, [{ ...explicit, qualifyingFixtureIds: ['fixture-one'] }], 'alice'),
    [],
  );
});
