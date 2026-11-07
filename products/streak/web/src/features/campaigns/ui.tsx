import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import { Notice } from '../../components/notice';
import { useNow } from '../../lib/use-now';
import type { Account } from '../account/api';
import type { Market } from '../markets/api';
import type { Outcome, Pick } from '../predictions/draft';
import { getPublicMarket } from '../predictions/api';
import {
  actCampaign,
  loadCampaignOptions,
  loadCampaigns,
  prepareCampaignGameweek,
  uploadCampaignArtwork,
} from './api';
import type {
  CampaignAction,
  CampaignAward,
  CampaignDraftInput,
  CampaignFixture,
  CampaignPage,
  CampaignDetail,
} from './api';
import { ArtworkEditor } from './artwork';
import type { ArtworkApplied, ArtworkChanges } from './artwork';
import { CampaignList, CampaignPlay } from './play';
import { CampaignSetup } from './setup';
import { CampaignAdmin, DeleteCampaign } from './admin';
import { FiveEntryName } from './five-entry-name';
import { CampaignJoinDialog } from './join-dialog';
import { ToastViewport } from './toasts';
import type { CampaignToast } from './toasts';
import { Busy, ckb, Dialog } from './presentation';
import './campaigns.css';

export interface CampaignsProps {
  account: Account | null;
  accountReady: boolean;
  onSignIn: () => void;
  signInPending: boolean;
  onPick: (market: Market, outcome: Outcome, campaignId: string) => void;
  selectedPicks: readonly Pick[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenFive: (roundId: string) => void;
  onOpenMarket: (marketId: string) => void;
  onOpenSlip: () => void;
  initialAdmin?: boolean;
}
export function Campaigns({
  account,
  accountReady,
  onSignIn,
  signInPending,
  onPick,
  selectedPicks,
  selectedId,
  onSelect,
  onOpenFive,
  onOpenMarket,
  onOpenSlip,
  initialAdmin = false,
}: CampaignsProps) {
  const queryClient = useQueryClient();
  const scope = account?.id ?? 'guest';
  const listKey = ['private', 'campaigns', scope, 'list'] as const;
  const [offset, setOffset] = useState(0),
    [adminView, setAdminView] = useState(initialAdmin);
  const [adminTab, setAdminTab] = useState<'monitor' | 'evidence'>('monitor');
  const [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false);
  const [savedDraft, setSavedDraft] = useState<CampaignDetail | null>(null);
  const [artworkPending, setArtworkPending] = useState(false);
  const artworkController = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNoticeState] = useState<{
    message: string;
    targetId: string | null;
    scope: string;
  } | null>(null);
  function setNotice(message: string, targetId = selectedId) {
    setNoticeState(message ? { message, targetId, scope } : null);
  }
  const [deleting, setDeleting] = useState(false),
    [joining, setJoining] = useState(false),
    [finalizing, setFinalizing] = useState(false),
    [addressOpen, setAddressOpen] = useState(false);
  const [address, setAddress] = useState(''),
    [addressConfirmed, setAddressConfirmed] = useState(false);
  const [payout, setPayout] = useState<CampaignAward | null>(null),
    [paymentHash, setPaymentHash] = useState(''),
    [paymentIndex, setPaymentIndex] = useState('');
  const [pickPending, setPickPending] = useState<string | null>(null);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const contextKey = `${scope}:${selectedId ?? ''}`;
  const context = useRef({ key: contextKey, epoch: 0 });
  if (context.current.key !== contextKey)
    context.current = { key: contextKey, epoch: context.current.epoch + 1 };
  const epoch = context.current.epoch;
  const active = useRef(true),
    currentId = useRef(selectedId);
  currentId.current = selectedId;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setOffset(0);
    setCreating(false);
    setEditing(false);
    setDeleting(false);
    setJoining(false);
    setFinalizing(false);
    setAddressOpen(false);
    setPayout(null);
    setError('');
    setSavedDraft(null);
    setArtworkPending(false);
    saving.current = false;
    artworkController.current?.abort();
    artworkController.current = null;
    setNoticeState((previous) =>
      previous?.targetId === selectedId && previous.scope === scope ? previous : null,
    );
  }, [selectedId, scope]);
  useEffect(() => () => artworkController.current?.abort(), []);
  const queryKey = selectedId
    ? ['private', 'campaigns', scope, 'detail', selectedId, offset]
    : listKey;
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const result = await loadCampaigns(selectedId, signal, offset);
      if (result.viewerId !== (account?.id ?? null))
        throw new Error('Your sign-in changed. Refresh before continuing.');
      return result;
    },
    enabled: accountReady,
    staleTime: 15000,
    refetchInterval: (q) =>
      q.state.data?.detail && ['open', 'live', 'finalizing'].includes(q.state.data.detail.state)
        ? 30000
        : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const sessionChanged =
    query.error?.message === 'Your sign-in changed. Refresh before continuing.';
  const page =
      !sessionChanged && query.data?.viewerId === (account?.id ?? null) ? query.data : undefined,
    detail = page?.detail ?? null;
  const admin = page?.admin === true && !!account && page.viewerId === account.id;
  const showEditor = admin && (creating || (editing && detail?.state === 'draft'));
  const options = useQuery({
    queryKey: ['private', 'campaigns', scope, 'options'],
    queryFn: ({ signal }) => loadCampaignOptions(signal),
    enabled: accountReady && showEditor,
    staleTime: 30000,
    retry: 1,
  });
  const mutation = useMutation({ mutationFn: (action: CampaignAction) => actCampaign(action) });
  const preparation = useMutation({ mutationFn: prepareCampaignGameweek });
  const localNow = useNow(!!detail && ['open', 'live'].includes(detail.state));
  const now = localNow + (page ? Date.parse(page.now) - query.dataUpdatedAt : 0);
  const pending = mutation.isPending || preparation.isPending || artworkPending;
  async function prepareGameweek(event: number) {
    if (pending || !admin) return;
    setError('');
    try {
      const result = await preparation.mutateAsync(event);
      if (!active.current) return;
      const optionsKey = ['private', 'campaigns', scope, 'options'];
      queryClient.setQueryData(optionsKey, result);
      await queryClient.invalidateQueries({ queryKey: optionsKey });
    } catch (failure) {
      if (active.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The gameweek could not be prepared. Please try again.',
        );
    }
  }
  async function mutate(action: CampaignAction): Promise<CampaignPage | null> {
    if (pending || !account) return null;
    setError('');
    setNotice('');
    try {
      const result = await mutation.mutateAsync(action);
      if (
        !active.current ||
        activeScope.current !== scope ||
        currentId.current !== selectedId ||
        context.current.epoch !== epoch
      )
        return null;
      if (result.viewerId !== account.id)
        throw Error('Your sign-in changed. Refresh before continuing.');
      queryClient.setQueryData(listKey, { ...result, detail: null });
      if (result.detail)
        queryClient.setQueryData(
          ['private', 'campaigns', scope, 'detail', result.detail.id, 0],
          result,
        );
      await queryClient.invalidateQueries({ queryKey: ['private', 'campaigns', scope] });
      if (
        !active.current ||
        activeScope.current !== scope ||
        currentId.current !== selectedId ||
        context.current.epoch !== epoch
      )
        return null;
      return result;
    } catch (failure) {
      if (
        active.current &&
        activeScope.current === scope &&
        currentId.current === selectedId &&
        context.current.epoch === epoch
      )
        setError(
          failure instanceof Error
            ? failure.message
            : 'The update could not be saved. Please try again.',
        );
      return null;
    }
  }
  const operationCurrent = () =>
    active.current &&
    activeScope.current === scope &&
    currentId.current === selectedId &&
    context.current.epoch === epoch;
  async function applyArtwork(
    saved: CampaignDetail,
    changes: ArtworkChanges,
    onApplied: ArtworkApplied,
  ) {
    let current = saved;
    for (const slot of ['icon', 'banner'] as const) {
      if (!operationCurrent()) return null;
      const file = changes[slot];
      if (file === undefined) continue;
      if (file === null && !current.artwork?.[slot]) {
        onApplied(slot);
        continue;
      }
      const controller = new AbortController();
      artworkController.current = controller;
      const result =
        file === null
          ? await actCampaign({
              action: 'remove-artwork',
              id: current.id,
              slot,
              revision: current.revision,
              expectedAccountId: scope,
            })
          : await uploadCampaignArtwork(
              current.id,
              slot,
              current.revision,
              file,
              scope,
              controller.signal,
            );
      if (!operationCurrent()) return null;
      if (result.viewerId !== account?.id || result.detail?.id !== current.id)
        throw new Error('Your sign-in or competition changed. Refresh before continuing.');
      current = result.detail;
      queryClient.setQueryData(listKey, { ...result, detail: null });
      queryClient.setQueryData(['private', 'campaigns', scope, 'detail', current.id, 0], result);
      if (creating) setSavedDraft(current);
      onApplied(slot);
    }
    return current;
  }
  async function save(
    draft: CampaignDraftInput,
    publish: boolean,
    changes: ArtworkChanges,
    onApplied: ArtworkApplied,
  ) {
    if (pending || saving.current || !admin) return;
    saving.current = true;
    setArtworkPending(true);
    try {
      let target = creating ? savedDraft : detail;
      if (creating && savedDraft) {
        const latest = await loadCampaigns(savedDraft.id);
        if (!operationCurrent()) return;
        if (latest.viewerId !== account?.id || latest.detail?.id !== savedDraft.id)
          throw new Error('Your saved draft could not be loaded. Refresh before continuing.');
        target = latest.detail;
      }
      const result = await mutate(
        target
          ? { action: 'update', id: target.id, revision: target.revision, draft }
          : { action: 'create', draft },
      );
      if (!result?.detail || !operationCurrent()) return;
      if (creating) setSavedDraft(result.detail);
      const saved = await applyArtwork(result.detail, changes, onApplied);
      if (!saved || !operationCurrent()) return;
      if (publish) {
        const published = await mutate({
          action: 'publish',
          id: saved.id,
          revision: saved.revision,
        });
        if (!published || !operationCurrent()) return;
      }
      setCreating(false);
      setEditing(false);
      setSavedDraft(null);
      setAdminView(!publish);
      onSelect(saved.id);
      setNotice(publish ? 'Your competition is published.' : 'Competition draft saved.', saved.id);
    } catch (failure) {
      if (operationCurrent())
        setError(
          `Your draft is saved. ${failure instanceof Error ? failure.message : 'The artwork could not be saved.'} Retry to finish with the same draft.`,
        );
    } finally {
      if (operationCurrent()) {
        saving.current = false;
        setArtworkPending(false);
      }
    }
  }
  async function saveArtwork(changes: ArtworkChanges, onApplied: ArtworkApplied): Promise<boolean> {
    if (pending || saving.current || !detail || !admin || detail.state === 'deleted') return false;
    saving.current = true;
    setArtworkPending(true);
    setError('');
    setNotice('');
    try {
      const saved = await applyArtwork(detail, changes, onApplied);
      if (!saved || !operationCurrent()) return false;
      setNotice('Competition artwork saved.');
      return true;
    } catch (failure) {
      if (operationCurrent())
        setError(
          failure instanceof Error
            ? failure.message
            : 'Your artwork could not be saved. Please try again.',
        );
      return false;
    } finally {
      if (operationCurrent()) {
        saving.current = false;
        setArtworkPending(false);
        void queryClient.invalidateQueries({ queryKey: ['private', 'campaigns', scope] });
      }
    }
  }
  async function pick(fixture: CampaignFixture, outcome: Outcome) {
    if (!detail || pickPending) return;
    if (!account) {
      onSignIn();
      return;
    }
    if (!detail.own) {
      setJoining(true);
      return;
    }
    setError('');
    setPickPending(fixture.fixtureId);
    const targetId = detail.id;
    try {
      const market = await queryClient.fetchQuery({
        queryKey: ['public-market', fixture.marketId],
        queryFn: ({ signal }) => getPublicMarket(fixture.marketId, signal),
        staleTime: 5000,
      });
      if (!active.current || activeScope.current !== scope || currentId.current !== targetId)
        return;
      if (
        market.market.matchId !== fixture.fixtureId ||
        !market.accepting ||
        !market.market.available ||
        Date.now() >= Date.parse(market.terms.closesAt)
      )
        throw Error(
          'This match is not accepting a new prediction right now. Your other picks are safe.',
        );
      onPick(market.market, outcome, targetId);
    } catch (failure) {
      if (active.current && activeScope.current === scope && currentId.current === targetId)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The match could not be opened. Please try again.',
        );
    } finally {
      if (active.current && activeScope.current === scope) setPickPending(null);
    }
  }
  if (!accountReady || (!page && query.isPending))
    return (
      <section className="campaign-page">
        <Busy />
      </section>
    );
  if (!page)
    return (
      <section className="campaign-page">
        <Notice
          title="Competitions could not be loaded"
          tone="attention"
          actions={
            <button
              type="button"
              className="btn"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching && <CellLoader />} Retry competitions
            </button>
          }
        >
          {query.error?.message ?? 'Please try again.'}
        </Notice>
      </section>
    );
  const ownAward = detail?.awards.find(
    (award) => award.publicId !== null && award.publicId === detail.own?.publicId,
  );
  const toasts: CampaignToast[] = [];
  if (error && !showEditor)
    toasts.push({
      id: `error:${error}`,
      title: 'This action needs attention',
      description: error,
      tone: 'attention',
    });
  if (notice?.targetId === selectedId && notice.scope === scope)
    toasts.push({ id: `success:${notice.message}`, title: notice.message });
  if (query.isError)
    toasts.push({
      id: `refresh:${selectedId ?? 'list'}`,
      title: 'Showing your last loaded view',
      description: 'The latest update could not be loaded. Your entries are preserved.',
      tone: 'attention',
      action: (
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching && <CellLoader />}Retry
        </button>
      ),
    });
  if (detail && !showEditor && !adminView) {
    if (detail.notice)
      toasts.push({
        id: `${detail.id}:scores:${detail.scoreStatus}:${detail.notice}`,
        title:
          detail.scoreStatus === 'unavailable' || detail.scoreStatus === 'review-required'
            ? 'Scores are being checked'
            : 'Competition update',
        description: detail.notice,
        tone:
          detail.scoreStatus === 'unavailable' || detail.scoreStatus === 'review-required'
            ? 'attention'
            : 'info',
      });
    if (detail.rehearsal)
      toasts.push({
        id: `${detail.id}:rehearsal`,
        title: 'Rehearsal competition',
        description: 'Test awards only. No mainnet payout or payout address is required.',
      });
    if (detail.state === 'deleted')
      toasts.push({
        id: `${detail.id}:archived`,
        title: 'Competition archived',
        description: 'Registration is closed. Existing results and prizes remain available.',
      });
  }
  return (
    <section className="campaign-page">
      <div className="campaign-route-controls">
        {(selectedId || creating) && (
          <button
            type="button"
            className="btn campaign-quiet"
            onClick={() => {
              setCreating(false);
              onSelect(null);
            }}
            disabled={pending}
          >
            Back to competitions
          </button>
        )}
        {admin && !showEditor && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAdminView(!adminView);
              setError('');
            }}
          >
            {adminView ? 'Player view' : 'Manage competitions'}{' '}
            <Icon name={adminView ? 'account' : 'shield'} />
          </button>
        )}
      </div>
      {showEditor ? (
        options.data ? (
          <CampaignSetup
            key={`${scope}:${creating ? 'new' : detail?.id}`}
            initial={creating ? savedDraft?.draft : detail?.draft}
            artwork={creating ? savedDraft?.artwork : detail?.artwork}
            options={options.data}
            pending={pending}
            error={error}
            onSave={save}
            onPrepareGameweek={prepareGameweek}
            onCancel={() => {
              setCreating(false);
              setEditing(false);
              setSavedDraft(null);
            }}
          />
        ) : options.isError || !options.isPending ? (
          <Notice
            title="Fixture and gameweek options could not be loaded"
            tone="attention"
            actions={
              <button
                className="btn"
                type="button"
                onClick={() => void options.refetch()}
                disabled={options.isFetching}
              >
                Retry options
              </button>
            }
          >
            {options.error?.message ?? 'Please refresh the available options.'}
          </Notice>
        ) : (
          <Busy text="Loading fixtures and gameweeks" />
        )
      ) : !selectedId ? (
        <CampaignList
          campaigns={page.campaigns}
          admin={admin}
          onSelect={onSelect}
          onCreate={() => {
            setCreating(true);
            setSavedDraft(null);
            setAdminView(true);
            setError('');
          }}
        />
      ) : !detail ? (
        <Notice title="This competition is not available">
          It may have been removed, or you may not have access to it.
        </Notice>
      ) : admin && adminView ? (
        <>
          <div className="campaign-admin-toolbar">
            <nav className="campaign-tabs" aria-label="Competition administration">
              <button
                type="button"
                aria-pressed={adminTab === 'monitor'}
                onClick={() => setAdminTab('monitor')}
              >
                Manage
              </button>
              <button
                type="button"
                aria-pressed={adminTab === 'evidence'}
                onClick={() => setAdminTab('evidence')}
              >
                Evidence
              </button>
              {detail.state === 'draft' && (
                <button type="button" onClick={() => setEditing(true)}>
                  Set up
                </button>
              )}
            </nav>
            {detail.state !== 'deleted' && (
              <button
                type="button"
                className="btn campaign-delete-outline"
                onClick={() => {
                  setError('');
                  setDeleting(true);
                }}
              >
                Delete competition
              </button>
            )}
          </div>
          <CampaignAdmin
            detail={detail}
            tab={adminTab}
            pending={pending || query.isFetching}
            artwork={
              adminTab === 'monitor' && detail.state !== 'deleted' ? (
                <ArtworkEditor
                  key={`${scope}:${detail.id}`}
                  campaign={detail}
                  pending={pending}
                  onSave={saveArtwork}
                  onError={setError}
                />
              ) : undefined
            }
            onEdit={() => setEditing(true)}
            onFinalize={() => {
              setError('');
              setFinalizing(true);
            }}
            onRefresh={() => void query.refetch()}
            onRecordPayout={(award) => {
              setError('');
              setPaymentHash(award.transactionHash ?? '');
              setPaymentIndex('');
              setPayout(award);
            }}
          />
        </>
      ) : detail.state === 'deleted' && !detail.awards.length ? (
        <div className="campaign-empty">
          <Icon name="shield" />
          <h1>This competition has closed.</h1>
          <p>Existing predictions, squads and payment recovery are preserved.</p>
        </div>
      ) : detail.state === 'draft' ? (
        <Notice title="This competition is still a draft">
          {admin ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setAdminView(true);
                setEditing(true);
              }}
            >
              Continue setup
            </button>
          ) : (
            'It will be available when the organizer publishes it.'
          )}
        </Notice>
      ) : (
        <CampaignPlay
          key={detail.id}
          detail={detail}
          authenticated={!!account}
          now={now}
          pending={pending}
          pickPending={pickPending}
          selectedPicks={selectedPicks}
          refreshing={query.isFetching}
          onJoin={() => {
            setError('');
            setJoining(true);
          }}
          onSignIn={onSignIn}
          signInPending={signInPending}
          onPick={(fixture, outcome) => void pick(fixture, outcome)}
          onOpenFive={onOpenFive}
          onOpenMarket={onOpenMarket}
          onOpenSlip={onOpenSlip}
          onAddress={() => {
            setAddress(ownAward?.receivingAddress ?? '');
            setAddressConfirmed(false);
            setError('');
            setAddressOpen(true);
          }}
          onPage={setOffset}
        />
      )}
      {joining && detail && (
        <CampaignJoinDialog detail={detail} onClose={() => setJoining(false)} pending={pending}>
          {detail.kind === 'five' && account ? (
            <FiveEntryName
              key={`${account.id}:${detail.id}`}
              accountId={account.id}
              pending={pending}
              disabled={!detail.termsHash}
              onJoin={async () => {
                if (!detail.termsHash) return;
                const result = await mutate({
                  action: 'join',
                  id: detail.id,
                  termsHash: detail.termsHash,
                });
                if (result) {
                  setJoining(false);
                  setNotice('You are registered. Your place is now on the table.');
                }
              }}
            />
          ) : (
            <button
              className="btn primary"
              type="button"
              disabled={pending || !detail.termsHash}
              onClick={() => {
                if (detail.termsHash)
                  void mutate({ action: 'join', id: detail.id, termsHash: detail.termsHash }).then(
                    (result) => {
                      if (result) {
                        setJoining(false);
                        setNotice('You are registered. Your place is now on the table.');
                      }
                    },
                  );
              }}
            >
              {pending && <CellLoader />} Agree & join competition
            </button>
          )}
        </CampaignJoinDialog>
      )}
      {deleting && detail && admin && (
        <DeleteCampaign
          detail={detail}
          pending={pending}
          onClose={() => setDeleting(false)}
          onDelete={async (target) => {
            const result = await mutate({ action: 'delete', ...target });
            if (result) {
              setDeleting(false);
              setNotice(
                'Competition archived. Existing entries and obligations are preserved.',
                null,
              );
              onSelect(null);
            }
          }}
        />
      )}
      {finalizing && detail && admin && (
        <Dialog title="Finalize competition" onClose={() => setFinalizing(false)} pending={pending}>
          <p>
            Lock the verified standings and allocate the published prizes. Payment is a separate
            step.
          </p>
          <p>
            Current score status: <strong>{detail.scoreStatus}</strong>.
          </p>
          {detail.scoreStatus !== 'final' && (
            <Notice title="Final source results are still required">
              Refresh the competition after all results are verified. Provisional scores cannot
              create final awards.
            </Notice>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={pending || detail.scoreStatus !== 'final'}
            onClick={() =>
              void mutate({ action: 'finalize', id: detail.id, revision: detail.revision }).then(
                (result) => {
                  if (result) {
                    setFinalizing(false);
                    setNotice('Final standings and awards are saved.');
                  }
                },
              )
            }
          >
            {pending && <CellLoader />} Finalize verified standings
          </button>
        </Dialog>
      )}
      {addressOpen && detail && ownAward && !detail.rehearsal && (
        <Dialog
          title="Your prize receiving address"
          onClose={() => setAddressOpen(false)}
          pending={pending}
        >
          <p>
            Your award is <strong>{ckb(ownAward.amountShannons)} CKB</strong>, paid on mainnet by
            the organizer.
          </p>
          <label className="campaign-field" htmlFor="campaign-prize-address">
            Mainnet CKB receiving address
            <input
              id="campaign-prize-address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressConfirmed(false);
              }}
              placeholder="ckb1..."
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              readOnly={!!ownAward.receivingAddress}
            />
          </label>
          {!ownAward.receivingAddress && (
            <label className="campaign-rehearsal">
              <input
                type="checkbox"
                checked={addressConfirmed}
                onChange={(e) => setAddressConfirmed(e.target.checked)}
                disabled={pending}
              />
              <span>I have checked this mainnet address</span>
            </label>
          )}
          <p className="campaign-small">
            This address cannot be changed after confirmation. Check it carefully. Saving an address
            does not send funds or mark the prize paid.
          </p>
          {!ownAward.receivingAddress && (
            <button
              type="button"
              className="btn primary"
              disabled={pending || !addressConfirmed || !/^ckb1[a-z0-9]{30,}$/.test(address.trim())}
              onClick={() =>
                void mutate({
                  action: 'payout-address',
                  id: detail.id,
                  address: address.trim(),
                }).then((result) => {
                  if (result) {
                    setAddressOpen(false);
                    setNotice('Receiving address saved for organizer review.');
                  }
                })
              }
            >
              {pending && <CellLoader />} Save receiving address
            </button>
          )}
        </Dialog>
      )}
      {payout && detail && admin && !detail.rehearsal && (
        <Dialog title="Verify prize payment" onClose={() => setPayout(null)} pending={pending}>
          <p>
            First send <strong>{ckb(payout.amountShannons)} CKB</strong> to{' '}
            {payout.name ?? 'the winner'} from your configured organizer wallet. Then add the
            transaction details here.
          </p>
          <p className="campaign-payout-address">{payout.receivingAddress}</p>
          <label className="campaign-field" htmlFor="campaign-payment-hash">
            Mainnet transaction hash
            <input
              id="campaign-payment-hash"
              value={paymentHash}
              onChange={(e) => setPaymentHash(e.target.value)}
              placeholder="0x..."
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          </label>
          <label className="campaign-field" htmlFor="campaign-payment-index">
            Recipient output index
            <input
              id="campaign-payment-index"
              value={paymentIndex}
              onChange={(e) => setPaymentIndex(e.target.value)}
              placeholder="0"
              inputMode="numeric"
              disabled={pending}
            />
          </label>
          <p className="campaign-small">
            The first output is index 0. Streak checks the recipient, exact amount, organizer wallet
            and 24 confirmations. This action does not send funds.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={
              pending ||
              !payout.publicId ||
              detail.scoreStatus === 'review-required' ||
              !/^0x[a-fA-F0-9]{64}$/.test(paymentHash.trim()) ||
              !/^(0|[1-9]\d*)$/.test(paymentIndex) ||
              !Number.isSafeInteger(Number(paymentIndex))
            }
            onClick={() => {
              if (payout.publicId)
                void mutate({
                  action: 'record-payout',
                  id: detail.id,
                  publicId: payout.publicId,
                  transactionHash: paymentHash.trim().toLowerCase(),
                  outputIndex: Number(paymentIndex),
                }).then((result) => {
                  if (result) {
                    setPayout(null);
                    setNotice('Payment verified on mainnet. The prize record is updated.');
                  }
                });
            }}
          >
            {pending && <CellLoader />} Verify payment proof
          </button>
        </Dialog>
      )}
      <ToastViewport items={toasts} />
    </section>
  );
}
export default Campaigns;
