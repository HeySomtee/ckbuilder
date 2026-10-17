import type { PoolConfig } from 'pg';

export function postgresConfig(raw: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid DATABASE_URL (value omitted).');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Parse the host, never search the password/path for "localhost". Explicit TLS
  // settings must not be overridden by pg-connection-string query parameters.
  for (const key of [...url.searchParams.keys()]) {
    if (/^ssl/i.test(key) || key === 'channel_binding' || key === 'uselibpqcompat')
      url.searchParams.delete(key);
    else if (['host', 'hostaddr', 'port', 'user', 'password', 'dbname', 'database'].includes(key))
      throw new Error('Connection-target query overrides are not supported.');
  }
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: true } };
}
