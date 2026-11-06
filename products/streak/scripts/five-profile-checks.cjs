const assert = require('node:assert/strict');
const { PgFiveProfiles } = require('../dist/modules/five/profile');

module.exports = async function profileChecks(pool) {
  const instances = Array.from({ length: 8 }, () => new PgFiveProfiles(pool));
  assert.deepEqual(
    await Promise.all(instances.map((p) => p.get('profile-one'))),
    Array(8).fill(null),
    'concurrent first reads serialize profile schema creation',
  );
  const profiles = instances[0];
  await assert.rejects(profiles.save('profile-one', 'Bad\u202eName'), /3 to 24/);
  const original = await profiles.save('profile-one', '  Cafe\u0301\u00a0  United ');
  assert.equal(original.displayName, 'Café United');
  const version = async () =>
    (await pool.query("SELECT xmin::text FROM streak_five_profiles WHERE account_id='profile-one'"))
      .rows[0].xmin;
  const before = await version();
  assert.deepEqual(await instances[1].save('profile-one', 'Café United'), original);
  assert.equal(await version(), before, 'unchanged normalized profile creates no database write');
  assert.deepEqual(
    await new PgFiveProfiles(pool).get('profile-one'),
    original,
    'identity survives adapter restart',
  );
  await Promise.all(
    ['Home Heroes', 'Away Heroes', 'Draw Heroes'].map((name, i) =>
      instances[i].save('profile-one', name),
    ),
  );
  assert.ok(
    ['Home Heroes', 'Away Heroes', 'Draw Heroes'].includes(
      (await profiles.get('profile-one')).displayName,
    ),
  );
  await profiles.save('profile-two', 'Other Manager');
  const selected = await profiles.getMany(['profile-two', 'profile-two', 'absent']);
  assert.equal(selected.size, 1);
  assert.equal(selected.get('profile-two').displayName, 'Other Manager');
  assert.equal(await profiles.get('absent'), null);
  await assert.rejects(profiles.getMany(Array(1001).fill('profile-one')), /Too many/);
  await assert.rejects(new PgFiveProfiles(pool, true).get('profile-one'), /scope/);
  console.log(
    'Five PostgreSQL profiles passed: concurrent schema boot, persistent/atomic names, normalization, unchanged-write suppression and bounded scoped reads.',
  );
};
