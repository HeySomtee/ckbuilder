import { parseFiveName, type FiveProfile, type FiveProfiles } from '../modules/five/profile';

/** Explicit synthetic fixture. Production runtimes always inject PgFiveProfiles. */
export class MemoryFiveProfiles implements FiveProfiles {
  private readonly rows = new Map<string, FiveProfile>();
  constructor(actors: readonly { id: string; name: string }[] = []) {
    for (const actor of actors)
      this.rows.set(actor.id, {
        displayName: parseFiveName(actor.name),
        updatedAt: new Date(0).toISOString(),
      });
  }
  async get(id: string): Promise<FiveProfile | null> {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async getMany(ids: readonly string[]): Promise<Map<string, FiveProfile>> {
    return new Map(
      ids.flatMap((id) => {
        const profile = this.rows.get(id);
        return profile ? [[id, structuredClone(profile)] as const] : [];
      }),
    );
  }
  async save(id: string, raw: unknown): Promise<FiveProfile> {
    const displayName = parseFiveName(raw),
      previous = this.rows.get(id);
    const profile =
      previous?.displayName === displayName
        ? previous
        : { displayName, updatedAt: new Date().toISOString() };
    this.rows.set(id, profile);
    return structuredClone(profile);
  }
}
