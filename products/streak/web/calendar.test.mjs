import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey, dayLabel, moveDay, monthDays, parseDay } from './src/features/markets/calendar.ts';

test('Calendar rejects invalid dates and moves one local day over month/year/leap boundaries', () => {
  assert.equal(parseDay('2026-02-29'), null);
  assert.equal(parseDay('2026-13-01'), null);
  assert.equal(parseDay('not-a-date'), null);
  assert.equal(dayKey(moveDay(parseDay('2028-02-28'), 1)), '2028-02-29');
  assert.equal(dayKey(moveDay(parseDay('2026-12-31'), 1)), '2027-01-01');
  assert.equal(dayKey(moveDay(parseDay('2027-01-01'), -1)), '2026-12-31');
  const days = monthDays(parseDay('2026-10-01'));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(dayKey(days[0]), '2026-09-28');
  assert.equal(days.filter((day) => day.getMonth() === 9).length, 31);
});
test('Relative labels and local-day query boundaries survive daylight saving transitions', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const spring = parseDay('2026-03-08');
    assert.equal((moveDay(spring, 1) - spring) / 3600000, 23);
    const autumn = parseDay('2026-11-01');
    assert.equal((moveDay(autumn, 1) - autumn) / 3600000, 25);
    assert.equal(dayLabel(spring, spring), 'Today');
    assert.equal(dayLabel(moveDay(spring, 1), spring), 'Tomorrow');
    assert.equal(dayLabel(moveDay(spring, -1), spring), 'Yesterday');
  } finally {
    if (previous) process.env.TZ = previous;
    else delete process.env.TZ;
  }
});
