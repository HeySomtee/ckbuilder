import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, additionError, score } from './rules.mjs';

const squad = [
  { id: 1, position: 'GK', teamId: 1, cost: 50 },
  { id: 2, position: 'DEF', teamId: 1, cost: 50 },
  { id: 3, position: 'MID', teamId: 2, cost: 90 },
  { id: 4, position: 'MID', teamId: 3, cost: 90 },
  { id: 5, position: 'FWD', teamId: 4, cost: 120 },
];
const stats = {
  complete: true,
  minutes: 90,
  goals: 0,
  assists: 0,
  conceded: 0,
  saves: 0,
  penaltySaves: 0,
  yellow: 0,
  red: 0,
  ownGoals: 0,
  penaltyMisses: 0,
};
test('accepts exact budget and valid formation; rejects overspend, duplicates, excess positions and missing captain', () => {
  assert.equal(validate(squad, 3), null);
  assert.match(
    validate(
      squad.map((p) => (p.id === 5 ? { ...p, cost: 121 } : p)),
      3,
    ),
    /40 credits/,
  );
  assert.match(validate([...squad.slice(0, 4), squad[0]], 3), /once/);
  assert.match(
    validate(
      squad.map((p) => (p.id === 5 ? { ...p, position: 'GK' } : p)),
      3,
    ),
    /slots are full/,
  );
  assert.match(validate(squad, 99), /captain/);
  assert.match(
    validate(
      squad.map((p) => (p.id === 5 ? { ...p, position: 'XX' } : p)),
      3,
    ),
    /positions/,
  );
});
test('partial picks obey budget and club constraints', () => {
  assert.equal(additionError([], squad[0]), null);
  assert.match(additionError(squad.slice(0, 2), { ...squad[2], teamId: 1 }), /two players/);
  assert.match(additionError([squad[0]], squad[0]), /once/);
});
test('missing and incomplete events remain pending, confirmed non-appearance is zero', () => {
  assert.equal(score('FWD', null).pending, true);
  assert.equal(score('FWD', { ...stats, complete: false }).pending, true);
  assert.equal(score('FWD', { complete: true }).pending, true);
  assert.equal(score('MID', { ...stats, minutes: 0 }).total, 0);
});
test('appearance, positional scoring, goalkeeper events and captain penalties reconcile', () => {
  assert.equal(score('FWD', { ...stats, goals: 1, assists: 1 }).total, 9);
  assert.equal(score('MID', { ...stats, goals: 1, assists: 1 }, true).total, 22);
  assert.equal(score('DEF', { ...stats, minutes: 59 }).total, 1);
  assert.equal(score('GK', { ...stats, saves: 7, penaltySaves: 1 }).total, 13);
  const negative = score('DEF', { ...stats, conceded: 4, red: 1, ownGoals: 1 }, true);
  assert.equal(negative.total, -10);
  assert.equal(
    negative.lines.reduce((n, l) => n + l.points, 0),
    negative.total,
  );
});
