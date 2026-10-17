import assert from 'node:assert/strict';
import test from 'node:test';
import { weekend } from './src/features/markets/weekend.ts';

test('Friday through Monday stay in one matchweek; Tuesday moves to the next', () => {
  for (const day of [16, 17, 18, 19]) {
    const dates = weekend(0, new Date(2026, 9, day, 12));
    assert.equal(dates.start.getDate(), 16);
    assert.equal(dates.end.getDate(), 20);
    assert.equal(dates.days[3].getDay(), 1);
  }
  assert.equal(weekend(0, new Date(2026, 9, 20)).start.getDate(), 23);
});
test('Calendar navigation handles year boundaries and local daylight saving', () => {
  assert.equal(weekend(1, new Date(2026, 11, 28)).start.getFullYear(), 2027);
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const dates = weekend(0, new Date(2026, 2, 7));
    assert.equal(dates.start.getHours(), 0);
    assert.equal(dates.end.getHours(), 0);
    assert.equal(dates.end.getDate(), 10);
    assert.equal((dates.end - dates.start) / 3600000, 95);
  } finally {
    if (previous) process.env.TZ = previous;
    else delete process.env.TZ;
  }
});
