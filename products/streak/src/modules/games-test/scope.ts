import type { Pool } from 'pg';
export const TEST_SCHEMA = 'streak_games_test';
export async function assertGameScope(pool: Pool, testing: boolean) {
  const row = await pool.query<{ schemas: string[] }>(
    'SELECT current_schemas(false)::text[] AS schemas',
  );
  const schemas = row.rows[0].schemas;
  if (
    !Array.isArray(schemas) ||
    (testing ? schemas.length !== 1 || schemas[0] !== TEST_SCHEMA : schemas.includes(TEST_SCHEMA))
  )
    throw Error('Game storage scope does not match the selected data mode');
}
export async function bindTestWallet(pool: Pool, address: string) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
  await assertGameScope(pool, true);
  await pool.query(
    'CREATE TABLE IF NOT EXISTS streak_test_identity (id integer PRIMARY KEY CHECK(id=1), address text NOT NULL)',
  );
  await pool.query(
    'INSERT INTO streak_test_identity(id,address) VALUES(1,$1) ON CONFLICT DO NOTHING',
    [address],
  );
  const row = await pool.query<{ address: string }>(
    'SELECT address FROM streak_test_identity WHERE id=1',
  );
  if (row.rows[0].address !== address)
    throw Error(
      'This test database belongs to another rewards wallet; preserve its recovery records',
    );
}
