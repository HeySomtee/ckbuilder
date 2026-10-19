import assert from 'node:assert/strict';
import { catalogueStatusMatches } from './modules/predictions/catalogue';

const now = Date.now();
for (const status of ['final', 'cancelled']) {
  const fixture = { status, kickoff: new Date(now - 1000).toISOString() };
  assert.equal(catalogueStatusMatches(fixture, 'resolved', now), true);
  assert.equal(catalogueStatusMatches(fixture, 'open', now), false);
  assert.equal(catalogueStatusMatches(fixture, 'closed', now), false);
}
assert.equal(
  catalogueStatusMatches(
    { status: 'scheduled', kickoff: new Date(now + 1000).toISOString() },
    'open',
    now,
  ),
  true,
);
for (const status of ['live', 'suspended', 'postponed', 'scheduled']) {
  assert.equal(
    catalogueStatusMatches({ status, kickoff: new Date(now).toISOString() }, 'closed', now),
    true,
  );
}
console.log(
  'PASS Season fixture lifecycle filters remain independent of legacy ledger settlement.',
);
