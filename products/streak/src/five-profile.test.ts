import assert from 'node:assert/strict';
import { FiveError, newRound, parseTerms, saveEntry, type Round } from './modules/five/domain';
import { FiveService } from './modules/five/service';
import { parseFiveName } from './modules/five/profile';
import { MemoryFiveProfiles } from './test-support/five-profiles';
import type { FiveStorage } from './modules/five/storage';
import { CampaignService } from './modules/campaigns/service';
import type { CampaignStorage } from './modules/campaigns/storage';
import {
  newCampaign,
  parseDraft,
  publishCampaign,
  type Campaign,
} from './modules/campaigns/domain';

class RoundStore implements FiveStorage {
  now = Date.now();
  rows = new Map<string, Round>();
  async clock() {
    return this.now;
  }
  async list() {
    return [...this.rows.values()].map((r) => ({
      id: r.id,
      state: r.state,
      createdAt: r.createdAt,
      name: r.terms.name,
      lockAt: r.terms.lockAt,
    }));
  }
  async load(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id: string, _creator: string, build: (now: number) => Round) {
    const r = build(this.now);
    this.rows.set(id, structuredClone(r));
    return r;
  }
  async change(id: string, mutate: (round: Round, now: number) => void) {
    const r = await this.load(id);
    assert.ok(r);
    mutate(r, this.now);
    r.revision++;
    this.rows.set(id, structuredClone(r));
    return r;
  }
}
class CampaignStore implements CampaignStorage {
  rows = new Map<string, Campaign>();
  now = Date.now();
  async clock() {
    return this.now;
  }
  async list() {
    return structuredClone([...this.rows.values()]);
  }
  async load(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id: string, _creator: string, build: (now: number) => Campaign) {
    const c = build(this.now);
    this.rows.set(id, structuredClone(c));
    return c;
  }
  async change(id: string, mutate: (campaign: Campaign, now: number) => void) {
    const c = await this.load(id);
    assert.ok(c);
    mutate(c, this.now);
    c.revision++;
    this.rows.set(id, structuredClone(c));
    return c;
  }
}
async function main() {
  assert.equal(parseFiveName('  Cafe\u0301\u00a0  United  '), 'Café United');
  for (const name of [
    'Club 123',
    'Ọlá XI',
    '東京ユナイテッド',
    "O'Neil XI",
    'Musa’s 5',
    'Name_11',
    'Name-11',
    'Á'.repeat(24),
  ])
    assert.equal(parseFiveName(name), name);
  for (const name of [
    '',
    'ab',
    'a'.repeat(25),
    '<script>bad</script>',
    'Captain\nName',
    'Team\t11',
    'A\u202eBad',
    'Name\u200bHidden',
    '🏆 Winner',
    'Name!',
    '-Name',
    'Name-',
    '\u0301Name',
  ])
    assert.throws(() => parseFiveName(name), FiveError);
  const store = new RoundStore(),
    profiles = new MemoryFiveProfiles();
  const user = { id: 'manager-a', name: 'Login Name', wallet: `ckt1${'a'.repeat(80)}` };
  const other = { id: 'manager-b', name: 'Player', wallet: `ckt1${'b'.repeat(80)}` };
  const terms = parseTerms({
    name: 'Synthetic profiles',
    lockAt: new Date(store.now + 600_000).toISOString(),
    finalizeAfter: new Date(store.now + 7_200_000).toISOString(),
    limit: 10,
    qualifyingBps: 500,
    sponsorship: false,
    minimumShannons: '10000000000',
    source: 'Synthetic unit profile coverage',
    players: ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      teamId: `t${i}`,
      team: `Club ${i}`,
      position,
      cost: 80,
      fixtureId: `f${i}`,
    })),
  });
  const round = newRound('round', 'admin', terms, store.now);
  round.state = 'open';
  saveEntry(
    round,
    other,
    terms.players.map((p) => p.id),
    'p2',
    round.termsHash,
    store.now,
  );
  store.rows.set(round.id, round);
  const service = new FiveService(store, [], undefined, undefined, undefined, false, profiles);
  const action = {
    action: 'enter',
    id: round.id,
    players: terms.players.map((p) => p.id),
    captain: 'p2',
    termsHash: round.termsHash,
    name: 'Forged Name',
  };
  await assert.rejects(service.saveProfile(null, 'Public Name'), /Sign in/);
  await assert.rejects(service.action(user, action), /Choose your FPL name/);
  await assert.rejects(new FiveService(store, []).action(user, action), /temporarily unavailable/);
  assert.equal(
    (await service.read(other)).detail!.entries.length,
    1,
    'old entries remain readable without an FPL profile',
  );
  await service.saveProfile(user, 'Sunday Managers');
  await service.action(user, action);
  const saved = structuredClone(
    (await store.load(round.id))!.entries.find((e) => e.accountId === user.id)!,
  );
  assert.equal(
    saved.name,
    'Sunday Managers',
    'stored profile overrides username and untrusted request name',
  );
  const before = await service.read(null);
  assert.equal(before.detail!.entries[0].players, undefined);
  assert.equal(before.detail!.entries[1].players, undefined);
  assert.equal(before.profile, null);
  const privateValues = [user.wallet, other.wallet, user.id, other.id];
  for (const value of privateValues) assert.equal(JSON.stringify(before).includes(value), false);
  assert.notEqual(before.detail!.entries[0].walletLabel, before.detail!.entries[1].walletLabel);
  store.now += 1000;
  await service.saveProfile(user, 'Renamed Managers');
  await service.saveProfile(other, 'Old Squad New Name');
  const renamed = await service.read(user);
  assert.equal(
    renamed.detail!.entries.find((e) => e.id === saved.publicId)!.name,
    'Renamed Managers',
  );
  assert.deepEqual(
    (await store.load(round.id))!.entries.find((e) => e.accountId === user.id),
    saved,
    'profile edits never rewrite entry snapshots or savedAt',
  );
  assert.equal(
    renamed.detail!.entries[0].players,
    undefined,
    'name projection cannot reveal another unlocked squad',
  );
  await service.action(user, { ...action, players: [...action.players].reverse() });
  const retried = (await store.load(round.id))!.entries.find((e) => e.accountId === user.id)!;
  assert.equal(
    retried.savedAt,
    saved.savedAt,
    'same squad with a new name or order cannot reset the tie timestamp',
  );
  store.now += 600_000;
  await service.saveProfile(user, 'After Deadline');
  const locked = await service.read(null);
  assert.equal(
    locked.detail!.standings.find((e) => e.id === saved.publicId)!.name,
    'After Deadline',
  );
  assert.equal(locked.detail!.entries.find((e) => e.id === saved.publicId)!.players!.length, 5);
  assert.equal(locked.detail!.standings.find((e) => e.id === saved.publicId)!.pending, true);
  assert.equal(
    (await store.load(round.id))!.entries.find((e) => e.accountId === user.id)!.savedAt,
    saved.savedAt,
  );

  const campaignStore = new CampaignStore();
  const actor = { ...user, ownerHash: `0x${'ab'.repeat(32)}` };
  const close = new Date(campaignStore.now + 60_000).toISOString();
  const options = {
    fixtures: [],
    gameweeks: [{ id: 'round', name: 'Synthetic Five', lockAt: close, state: 'open' }],
  };
  const draft = parseDraft({
    kind: 'five',
    name: 'Named Managers',
    description: 'Synthetic named registration',
    registrationClosesAt: close,
    fixtureIds: [],
    fiveRoundId: 'round',
    prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '10' }],
    rehearsal: true,
  });
  const campaign = newCampaign('campaign', actor, draft, campaignStore.now);
  publishCampaign(campaign, options, campaignStore.now);
  campaignStore.rows.set(campaign.id, campaign);
  const sources = {
    options: async () => options,
    observe: async () => {
      throw Error('No observation needed');
    },
  };
  const campaigns = new CampaignService(campaignStore, [], sources, (who) =>
    service.requireProfile(who),
  );
  const join = { id: campaign.id, action: 'join', termsHash: campaign.termsHash };
  await assert.rejects(
    new CampaignService(campaignStore, [], sources).act(join, actor),
    /temporarily unavailable/,
  );
  const nameless = {
    id: 'manager-c',
    name: 'Untrusted',
    wallet: 'synthetic-other',
    ownerHash: `0x${'cd'.repeat(32)}`,
  };
  await assert.rejects(campaigns.act(join, nameless), /Choose your FPL name/);
  await campaigns.act(join, actor);
  assert.equal((await campaignStore.load(campaign.id))!.entries[0].name, 'After Deadline');
  const existing = (await campaignStore.load(campaign.id))!.entries[0];
  await new CampaignService(campaignStore, [], sources).act(join, actor);
  assert.deepEqual(
    (await campaignStore.load(campaign.id))!.entries[0],
    existing,
    'existing registration retry does not require or rewrite the profile',
  );
  console.log(
    'Five profiles passed: normalization, required identity, public short labels, pre-lock privacy, immutable snapshots/tie timestamps, locked names and Five registration gates.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
