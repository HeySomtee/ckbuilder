import { randomUUID } from 'node:crypto';
import type { CampaignOptions, CampaignPage } from '../../../shared/campaign-wire';
import {
  CampaignError,
  assertRevision,
  deleteCampaign,
  editCampaign,
  finalizeCampaign,
  identifier,
  joinCampaign,
  newCampaign,
  object,
  parseDraft,
  project,
  publishCampaign,
  reconcileCampaign,
  recordPayout,
  saveReceivingAddress,
  summary,
  type Actor,
  type Campaign,
  type CampaignActor,
  type CampaignSources,
  type PayoutProof,
} from './domain';
import type { CampaignStorage } from './storage';

export class CampaignService {
  constructor(
    private readonly store: CampaignStorage,
    private readonly admins: readonly string[],
    private readonly sources: CampaignSources,
    private readonly fiveProfileName?: (actor: Actor) => Promise<string>,
  ) {}
  isAdmin(actor: CampaignActor): boolean {
    return !!actor && (this.admins.includes(actor.id) || this.admins.includes(actor.wallet));
  }
  private signedIn(actor: CampaignActor): Actor {
    if (!actor) throw new CampaignError('Sign in with your wallet to continue.', 403);
    return actor;
  }
  private admin(actor: CampaignActor): Actor {
    const user = this.signedIn(actor);
    if (!this.isAdmin(user)) throw new CampaignError('Administrator access is required.', 403);
    return user;
  }
  private visible(c: Campaign, actor: CampaignActor): boolean {
    if (this.isAdmin(actor)) return true;
    if (c.state === 'draft') return false;
    return !c.deletedAt || c.entries.some((e) => e.accountId === actor?.id);
  }
  async list(actor: CampaignActor): Promise<CampaignPage> {
    const [records, now] = await Promise.all([this.store.list(), this.store.clock()]);
    return {
      admin: this.isAdmin(actor),
      viewerId: actor?.id ?? null,
      now: new Date(now).toISOString(),
      campaigns: records.filter((c) => this.visible(c, actor)).map((c) => summary(c, actor, now)),
      detail: null,
    };
  }
  async get(id: string, actor: CampaignActor, offset = 0, limit = 100): Promise<CampaignPage> {
    identifier(id);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new CampaignError('Invalid leaderboard page.');
    const [page, c] = await Promise.all([this.list(actor), this.store.load(id)]);
    if (!c || !this.visible(c, actor)) throw new CampaignError('Competition not found.', 404);
    page.detail = project(c, actor, page.admin, Date.parse(page.now), offset, limit);
    return page;
  }
  async options(actor: CampaignActor): Promise<CampaignOptions> {
    this.admin(actor);
    return this.sources.options();
  }
  async loadForAdmin(id: string, actor: CampaignActor): Promise<Campaign> {
    this.admin(actor);
    const c = await this.store.load(identifier(id));
    if (!c) throw new CampaignError('Competition not found.', 404);
    return c;
  }
  async act(raw: unknown, actor: CampaignActor): Promise<CampaignPage> {
    const b = object(raw),
      user = this.signedIn(actor);
    let id = typeof b.id === 'string' ? identifier(b.id) : '';
    const action = b.action;
    if (action === 'create') {
      this.admin(user);
      id = id || `campaign-${randomUUID()}`;
      const draft = parseDraft(b.draft);
      await this.store.create(id, user.id, (now) => newCampaign(id, user, draft, now));
    } else if (action === 'update') {
      this.admin(user);
      const draft = parseDraft(b.draft);
      await this.store.change(identifier(id), (c) => editCampaign(c, draft, b.revision), {
        actorId: user.id,
        action,
      });
    } else if (action === 'publish') {
      this.admin(user);
      const options = await this.sources.options();
      await this.store.change(
        identifier(id),
        (c, now) => {
          assertRevision(c, b.revision);
          publishCampaign(c, options, now);
        },
        { actorId: user.id, action },
      );
    } else if (action === 'join') {
      const current = await this.store.load(identifier(id));
      if (!current) throw new CampaignError('Competition not found.', 404);
      // Published game kind is immutable. A request racing draft edits/publication
      // must not enter a Five competition using a previously read prediction kind.
      if (current.state !== 'published' || current.deletedAt)
        throw new CampaignError('Registration has closed for this competition.', 409);
      let entrant = user;
      if (
        current.draft.kind === 'five' &&
        !current.entries.some((entry) => entry.accountId === user.id)
      ) {
        if (!this.fiveProfileName)
          throw new CampaignError('FPL names are temporarily unavailable. Please retry.', 503);
        entrant = { ...user, name: await this.fiveProfileName(user) };
      }
      await this.store.change(
        identifier(id),
        (c, now) => joinCampaign(c, entrant, b.termsHash, now),
        {
          actorId: user.id,
          action,
        },
      );
    } else if (action === 'delete') {
      this.admin(user);
      await this.store.change(
        identifier(id),
        (c, now) => deleteCampaign(c, user, b.revision, b.confirmName, now),
        { actorId: user.id, action },
      );
    } else if (action === 'refresh') {
      const c = await this.store.load(identifier(id));
      if (!c || !this.visible(c, user)) throw new CampaignError('Competition not found.', 404);
      if (!this.isAdmin(user) && !c.entries.some((e) => e.accountId === user.id))
        throw new CampaignError('Join this competition before refreshing its entries.', 403);
      await this.reconcile(id);
    } else if (action === 'finalize') {
      this.admin(user);
      const current = await this.store.load(identifier(id));
      if (!current) throw new CampaignError('Competition not found.', 404);
      assertRevision(current, b.revision);
      const evidence = await this.sources.observe(current);
      await this.store.change(
        id,
        (c, now) => {
          assertRevision(c, b.revision);
          reconcileCampaign(c, evidence, now);
          finalizeCampaign(c, now);
        },
        { actorId: user.id, action },
      );
    } else if (action === 'payout-address') {
      if (!this.sources.validateReceivingAddress)
        throw new CampaignError('Mainnet payout address verification is not configured.', 503);
      if (typeof b.address !== 'string' || b.address.length > 250)
        throw new CampaignError('Enter a valid mainnet CKB receiving address.');
      const current = await this.store.load(identifier(id));
      if (!current) throw new CampaignError('Competition not found.', 404);
      const entry = current.entries.find((e) => e.accountId === user.id);
      const award = current.awards.find((a) => a.publicId === entry?.publicId);
      if (!award || current.state !== 'finished')
        throw new CampaignError('A finalized winning place is required.', 409);
      const address = await this.sources.validateReceivingAddress(b.address, award.amountShannons);
      await this.store.change(identifier(id), (c) => saveReceivingAddress(c, user, address), {
        actorId: user.id,
        action,
      });
    } else throw new CampaignError('Unknown competition action.');
    return this.get(id, user);
  }
  /** Source readers verify canonical records outside the write lock; stale projections cannot replace newer writes. */
  async reconcile(id: string): Promise<Campaign> {
    const current = await this.store.load(identifier(id));
    if (!current) throw new CampaignError('Competition not found.', 404);
    if (current.state === 'draft') return current;
    const evidence = await this.sources.observe(current);
    return this.store.change(
      id,
      (c, now) => {
        assertRevision(c, current.revision);
        reconcileCampaign(c, evidence, now);
      },
      { actorId: 'system', action: 'reconcile' },
    );
  }
  /** Only invoke after the server's independent mainnet verifier has checked exact treasury-funded outputs. */
  async recordPayout(
    id: string,
    publicId: string,
    proof: PayoutProof,
    actor: CampaignActor,
  ): Promise<CampaignPage> {
    const user = this.admin(actor);
    identifier(id);
    identifier(publicId);
    await this.store.change(
      id,
      (c) => recordPayout(c, publicId, proof),
      { actorId: user.id, action: 'payout-confirmed' },
      { publicId, transactionHash: proof.transactionHash, outputIndex: proof.outputIndex },
    );
    return this.get(id, user);
  }
}
