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
      lineIds: ['one', 'two'],
      alreadyCountedLineIds: ['one'],
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
  assert.deepEqual(labels[0].alreadyCountedLineIds, ['one']);
  assert.deepEqual(labels[1].alreadyCountedLineIds, []);
  assert.deepEqual(slipCampaignLabels([], [campaign]), []);
  assert.deepEqual(slipCampaignLabels(picks, []), []);
});
