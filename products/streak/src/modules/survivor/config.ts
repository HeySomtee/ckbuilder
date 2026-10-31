/** Shared rewards/UTXO reservation tables must live in the same database/schema. */
export function sharedPrizeDatabase(env: NodeJS.ProcessEnv): boolean {
  const survivor = env.STREAK_SURVIVOR_DATABASE_URL ?? env.DATABASE_URL;
  const rewards =
    env.STREAK_FIVE_DATABASE_URL ?? env.STREAK_SURVIVOR_DATABASE_URL ?? env.DATABASE_URL;
  if (!survivor || !rewards) return false;
  const identity = (value: string) => {
    const u = new URL(value);
    return `${u.username}@${u.hostname}:${u.port || '5432'}${u.pathname}?options=${u.searchParams.get('options') ?? ''}`;
  };
  try {
    return identity(survivor) === identity(rewards);
  } catch {
    return false;
  }
}
