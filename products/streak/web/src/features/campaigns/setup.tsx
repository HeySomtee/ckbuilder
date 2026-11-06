import { useState } from 'react';
import { Icon } from '../../components/icon';
import { Select } from '../../components/select';
import { Notice } from '../../components/notice';
import { CellLoader } from '../../components/cell-loader';
import type { CampaignDraftInput, CampaignOptions } from './api';
import {
  Badge,
  ckb,
  dateTime,
  localDateInput,
  plainCkb,
  Plus,
  shannons,
  Trophy,
} from './presentation';

type PrizeInput = { id: string; amount: string; reference: string };
type Step = 'basics' | 'fixtures' | 'prizes' | 'review';
export function CampaignSetup({
  initial,
  options,
  pending,
  error,
  onSave,
  onPrepareGameweek,
  onCancel,
}: {
  initial?: CampaignDraftInput;
  options: CampaignOptions;
  pending: boolean;
  error: string;
  onSave: (draft: CampaignDraftInput, publish: boolean) => Promise<void>;
  onPrepareGameweek: (event: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('basics');
  const [kind, setKind] = useState<CampaignDraftInput['kind']>(initial?.kind ?? 'predictions');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [registration, setRegistration] = useState(
    initial ? localDateInput(initial.registrationClosesAt) : '',
  );
  const [fiveRoundId, setFiveRoundId] = useState(initial?.fiveRoundId ?? '');
  const [fixtureIds, setFixtureIds] = useState(initial?.fixtureIds ?? []);
  const [rehearsal, setRehearsal] = useState(initial?.rehearsal ?? false);
  const [prizes, setPrizes] = useState<PrizeInput[]>(
    initial?.prizes.map((p) => ({
      id: String(p.place),
      amount: plainCkb(p.amountShannons),
      reference: p.usdReference,
    })) ?? [],
  );
  const [search, setSearch] = useState(''),
    [league, setLeague] = useState('all'),
    [selectedOnly, setSelectedOnly] = useState(false);
  const [validation, setValidation] = useState('');
  const five = kind === 'five';
  const selectedWeek = options.gameweeks.find((w) => w.id === fiveRoundId);
  const total = prizes.reduce((sum, p) => sum + BigInt(shannons(p.amount) ?? '0'), 0n);
  const leagues = [...new Set(options.fixtures.map((f) => f.league))];
  const shown = options.fixtures.filter(
    (f) =>
      (league === 'all' || f.league === league) &&
      (!selectedOnly || fixtureIds.includes(f.fixtureId)) &&
      `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (id: string) =>
    setFixtureIds((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
  const changePrize = (id: string, field: 'amount' | 'reference', value: string) =>
    setPrizes((rows) => rows.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const readDraft = (publish: boolean): CampaignDraftInput | null => {
    const registrationDate = new Date(registration);
    if (!name.trim()) {
      setValidation('Give the competition a name.');
      setStep('basics');
      return null;
    }
    if ((publish || registration !== '') && !Number.isFinite(registrationDate.getTime())) {
      setValidation('Choose when registration closes.');
      setStep('basics');
      return null;
    }
    if (publish && (five ? !selectedWeek : fixtureIds.length === 0)) {
      setValidation(five ? 'Choose a gameweek.' : 'Select at least one fixture.');
      setStep('fixtures');
      return null;
    }
    if (publish && five && selectedWeek?.state === 'available') {
      setValidation('Prepare this gameweek before publishing so players can save their squads.');
      setStep('fixtures');
      return null;
    }
    if (
      (publish && !prizes.length) ||
      prizes.some(
        (p) =>
          !shannons(p.amount) ||
          BigInt(shannons(p.amount)!) < (publish ? 6100000000n : 1n) ||
          (p.reference !== '' && !/^\d{1,7}(?:\.\d{1,2})?$/.test(p.reference)),
      )
    ) {
      setValidation(
        publish
          ? 'Set at least 61 CKB for each prize. Optional dollar references can have two decimal places.'
          : 'Enter a positive amount for each prize, or remove unfinished places before saving. Dollar references can have two decimal places.',
      );
      setStep('prizes');
      return null;
    }
    setValidation('');
    return {
      name: name.trim(),
      description: description.trim(),
      kind,
      registrationClosesAt: registration ? registrationDate.toISOString() : '',
      fiveRoundId: five && fiveRoundId ? fiveRoundId : null,
      fixtureIds: five ? [] : fixtureIds,
      prizes: prizes.map((p, index) => ({
        place: index + 1,
        amountShannons: shannons(p.amount)!,
        usdReference: p.reference,
      })),
      rehearsal,
    };
  };
  const save = async (publish: boolean) => {
    const draft = readDraft(publish);
    if (draft) await onSave(draft, publish);
  };
  const steps: [Step, string][] = [
    ['basics', 'The invitation'],
    ['fixtures', five ? 'Gameweek' : 'Fixtures'],
    ['prizes', 'Prizes'],
    ['review', 'Review'],
  ];
  return (
    <div className="campaign-studio">
      <div className="campaign-studio-heading">
        <span className="campaign-eyebrow">COMPETITION STUDIO</span>
        <Badge>Draft</Badge>
      </div>
      <nav className="campaign-steps" aria-label="Competition setup sections">
        {steps.map(([id, text], index) => (
          <button
            key={id}
            type="button"
            aria-current={step === id ? 'step' : undefined}
            onClick={() => setStep(id)}
            disabled={pending}
          >
            <span>{index + 1}</span>
            {text}
          </button>
        ))}
      </nav>
      {(validation || error) && (
        <Notice tone="attention" title="Check these details">
          {validation || error}
        </Notice>
      )}
      <div className="campaign-editor-grid">
        <div className="campaign-editor">
          {step === 'basics' && (
            <section aria-labelledby="campaign-setup-heading">
              <div className="campaign-section-intro">
                <span className="campaign-eyebrow">01 / THE INVITATION</span>
                <h2 id="campaign-setup-heading">Give them something to play for.</h2>
                <p>A name, a short invitation and a reason to join.</p>
              </div>
              <div className="campaign-kind-picker">
                {(['predictions', 'five'] as const).map((choice) => (
                  <button
                    type="button"
                    key={choice}
                    aria-pressed={kind === choice}
                    disabled={!!initial || pending}
                    onClick={() => setKind(choice)}
                  >
                    <Icon name={choice === 'five' ? 'five' : 'markets'} />
                    <span>
                      <strong>{choice === 'five' ? 'Streak Five' : 'Predictions'}</strong>
                      <small>
                        {choice === 'five' ? 'Choose a gameweek' : 'Curate a fixture list'}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="campaign-invitation">
                <span className="campaign-eyebrow">
                  {five ? 'STREAK FIVE' : 'PREDICTION COMPETITION'}
                </span>
                <label htmlFor="campaign-name">Competition name</label>
                <input
                  id="campaign-name"
                  className="campaign-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Give your competition a name"
                  disabled={pending}
                />
                <label htmlFor="campaign-description">
                  Your invitation <small>Optional</small>
                </label>
                <textarea
                  id="campaign-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={4000}
                  rows={3}
                  placeholder="A weekend of bold calls. A place on the podium. Your move."
                  disabled={pending}
                />
                <div className="campaign-invitation-footer">
                  <span>
                    <Icon name="shield" /> Public leaderboard
                  </span>
                  <span>Free registration</span>
                  <span>{rehearsal ? 'Rehearsal awards' : 'Mainnet CKB prizes'}</span>
                </div>
              </div>
              <div className="campaign-deadline-field">
                <div>
                  <h3>Registration closes</h3>
                  <p>Displayed in your local time.</p>
                </div>
                <label>
                  <span className="sr-only">Registration deadline</span>
                  <input
                    type="datetime-local"
                    value={registration}
                    onChange={(e) => setRegistration(e.target.value)}
                    disabled={pending}
                  />
                </label>
              </div>
              <label className="campaign-rehearsal">
                <input
                  type="checkbox"
                  checked={rehearsal}
                  onChange={(e) => setRehearsal(e.target.checked)}
                  disabled={pending}
                />
                <span>
                  <strong>Rehearsal competition</strong>
                  <small>Clearly labelled and excluded from community campaign statistics.</small>
                </span>
              </label>
              <div className="campaign-editor-footer">
                <span>Registration immediately creates a ranked entry.</span>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => setStep('fixtures')}
                  disabled={pending}
                >
                  Choose {five ? 'gameweek' : 'fixtures'} <Icon name="arrow" />
                </button>
              </div>
            </section>
          )}
          {step === 'fixtures' && (
            <section aria-labelledby="campaign-fixtures-heading">
              <div className="campaign-section-intro">
                <span className="campaign-eyebrow">
                  02 / {five ? 'THE GAMEWEEK' : 'THE FIXTURE LIST'}
                </span>
                <h2 id="campaign-fixtures-heading">
                  {five ? 'One gameweek. Their best five.' : 'Pick the matches. Set the challenge.'}
                </h2>
                <p>
                  {five
                    ? 'Players save their team through the existing Streak Five game.'
                    : 'Choose the eligible matches that count. Players use the usual prediction slip.'}
                </p>
              </div>
              {five ? (
                <>
                  <div className="campaign-gameweek-card">
                    <Icon name="activity" />
                    <div>
                      <label htmlFor="campaign-gameweek">Premier League gameweek</label>
                      <Select
                        id="campaign-gameweek"
                        value={fiveRoundId}
                        onChange={(id) => {
                          setFiveRoundId(id);
                          const week = options.gameweeks.find((w) => w.id === id);
                          if (week && !registration) setRegistration(localDateInput(week.lockAt));
                        }}
                        options={options.gameweeks.map((w) => ({
                          value: w.id,
                          label: `${w.name} · ${dateTime(w.lockAt)}`,
                        }))}
                        placeholder="Choose a gameweek"
                        disabled={pending}
                      />
                      {selectedWeek && (
                        <p>
                          Picks close {dateTime(selectedWeek.lockAt)}. The official deadline cannot
                          be overridden here.
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedWeek?.state === 'available' && (
                    <Notice
                      title="Open this gameweek for squad selection"
                      actions={
                        <button
                          type="button"
                          className="btn primary"
                          disabled={pending || selectedWeek.event === undefined}
                          onClick={() => {
                            setValidation('');
                            if (selectedWeek.event !== undefined)
                              void onPrepareGameweek(selectedWeek.event);
                          }}
                        >
                          {pending && <CellLoader />} Prepare gameweek
                        </button>
                      }
                    >
                      Prepare this gameweek to open squad selection. Player pool and prices are
                      fixed when prepared.
                    </Notice>
                  )}
                  {!options.gameweeks.length && (
                    <Notice title="No eligible gameweek is available">
                      Refresh the game data before creating this competition.
                    </Notice>
                  )}
                  <div className="campaign-flow">
                    <span>Join competition</span>
                    <Icon name="arrow" />
                    <span>Save your Five squad</span>
                    <Icon name="arrow" />
                    <span>Follow your points</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="campaign-filter-toolbar">
                    <label className="campaign-search">
                      <Icon name="search" />
                      <span className="sr-only">Search fixtures</span>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search a club or league"
                      />
                    </label>
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setFixtureIds((ids) => [
                          ...new Set([...ids, ...shown.map((f) => f.fixtureId)]),
                        ])
                      }
                      disabled={pending || !shown.length}
                    >
                      <Plus /> Select visible
                    </button>
                    <button
                      className="btn"
                      type="button"
                      aria-pressed={selectedOnly}
                      onClick={() => setSelectedOnly(!selectedOnly)}
                    >
                      Selected {fixtureIds.length}
                    </button>
                  </div>
                  <div className="campaign-league-chips" aria-label="Filter fixtures by league">
                    {['all', ...leagues].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={league === value}
                        onClick={() => setLeague(value)}
                      >
                        {value === 'all' ? 'All leagues' : value}
                      </button>
                    ))}
                  </div>
                  <div className="campaign-fixture-picker">
                    {shown.map((f) => (
                      <button
                        type="button"
                        key={f.fixtureId}
                        className="campaign-fixture-choice"
                        aria-pressed={fixtureIds.includes(f.fixtureId)}
                        onClick={() => toggle(f.fixtureId)}
                        disabled={pending}
                      >
                        <span className="campaign-fixture-choice-top">
                          <small>{f.league}</small>
                          <span className="campaign-choice-mark">
                            {fixtureIds.includes(f.fixtureId) ? <Icon name="shield" /> : <Plus />}
                          </span>
                        </span>
                        <strong>{f.home}</strong>
                        <strong>{f.away}</strong>
                        <span className="campaign-fixture-choice-footer">
                          <span>{dateTime(f.kickoffAt)}</span>
                          <span>
                            {f.occupied === null
                              ? 'Capacity not checked'
                              : `${f.occupied}/${f.capacity} filled`}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {!shown.length && (
                    <div className="campaign-empty">
                      <Icon name="search" />
                      <h3>
                        {options.fixtures.length
                          ? 'No matches in this view.'
                          : 'No eligible fixtures are available.'}
                      </h3>
                      <p>
                        {options.fixtures.length
                          ? 'Try another club, league or selection filter.'
                          : 'Try refreshing the fixture list. No sample matches are substituted.'}
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="campaign-editor-footer">
                <span>
                  {five
                    ? 'One saved team, the same player points.'
                    : `${fixtureIds.length} fixtures selected. Registration does not reserve market space.`}
                </span>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => setStep('prizes')}
                  disabled={pending}
                >
                  Set the prizes <Icon name="arrow" />
                </button>
              </div>
            </section>
          )}
          {step === 'prizes' && (
            <section aria-labelledby="campaign-prizes-heading">
              <div className="campaign-section-intro">
                <span className="campaign-eyebrow">03 / THE PRIZES</span>
                <h2 id="campaign-prizes-heading">Your podium. Your prize pool.</h2>
                <p>
                  Set the exact CKB reward for each winning place. Dollar values are optional
                  references.
                </p>
              </div>
              <p id="campaign-prize-minimum" className="campaign-small">
                Minimum 61 CKB per winning place. Some receiving addresses may require more
                capacity.
              </p>
              <div className="campaign-prize-shortcuts">
                <span>Quick start</span>
                <button
                  className="btn"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setPrizes(
                      ['25', '15', '10'].map((reference) => ({
                        id: crypto.randomUUID(),
                        reference,
                        amount: '',
                      })),
                    )
                  }
                >
                  <Trophy /> Three-place podium
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setPrizes(
                      Array.from({ length: 5 }, () => ({
                        id: crypto.randomUUID(),
                        reference: '10',
                        amount: '',
                      })),
                    )
                  }
                >
                  Five equal awards
                </button>
              </div>
              <div className="campaign-prize-editor">
                {prizes.map((p, index) => (
                  <div className="campaign-prize-row" key={p.id}>
                    <strong className="campaign-place">#{index + 1}</strong>
                    <label>
                      <span className="sr-only">Place {index + 1} reward in CKB</span>
                      <input
                        aria-label={`Place ${index + 1} reward in CKB`}
                        aria-describedby="campaign-prize-minimum"
                        aria-invalid={
                          p.amount !== '' &&
                          (!shannons(p.amount) || BigInt(shannons(p.amount)!) < 6100000000n)
                        }
                        inputMode="decimal"
                        value={p.amount}
                        onChange={(e) => changePrize(p.id, 'amount', e.target.value)}
                        placeholder="CKB amount"
                        disabled={pending}
                      />
                      <small aria-hidden="true">CKB</small>
                    </label>
                    <label className="campaign-reference">
                      <span aria-hidden="true">$</span>
                      <span className="sr-only">Place {index + 1} dollar reference, optional</span>
                      <input
                        aria-label={`Place ${index + 1} dollar reference, optional`}
                        inputMode="decimal"
                        value={p.reference}
                        onChange={(e) => changePrize(p.id, 'reference', e.target.value)}
                        placeholder="Optional"
                        disabled={pending}
                      />
                    </label>
                    <button
                      type="button"
                      className="campaign-icon-button"
                      aria-label={`Remove prize place ${index + 1}`}
                      onClick={() => setPrizes((rows) => rows.filter((r) => r.id !== p.id))}
                      disabled={pending}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="btn campaign-add-place"
                type="button"
                onClick={() =>
                  setPrizes((rows) => [
                    ...rows,
                    { id: crypto.randomUUID(), amount: '', reference: '' },
                  ])
                }
                disabled={pending}
              >
                <Plus /> Add a winning place
              </button>
              <div className="campaign-pool-total">
                <span>
                  Competition prize pool<small>Network fees are additional.</small>
                </span>
                <strong>
                  {ckb(total.toString())}
                  <small>CKB</small>
                </strong>
              </div>
              <Notice
                title={rehearsal ? 'Rehearsal awards only' : 'You approve the mainnet payouts'}
              >
                {rehearsal
                  ? 'These awards are test records. No mainnet rewards are paid and no payout addresses are collected.'
                  : 'These prizes use your dedicated organizer wallet. Publishing a reward does not fund it or move CKB automatically.'}
              </Notice>
              <div className="campaign-editor-footer">
                <span>Exact CKB amounts are fixed when published.</span>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => setStep('review')}
                  disabled={pending}
                >
                  Review competition <Icon name="arrow" />
                </button>
              </div>
            </section>
          )}
          {step === 'review' && (
            <section aria-labelledby="campaign-review-heading">
              <div className="campaign-section-intro">
                <span className="campaign-eyebrow">04 / READY FOR A LOOK</span>
                <h2 id="campaign-review-heading">Give the final details a look.</h2>
                <p>Published terms are fixed, so players can join with confidence.</p>
              </div>
              <div className="campaign-invitation campaign-review-card">
                <span className="campaign-eyebrow">
                  {five ? 'STREAK FIVE' : 'MATCH PREDICTIONS'}
                </span>
                <h3>{name || 'Your competition'}</h3>
                <p>{description}</p>
                <div className="campaign-prize-tiles">
                  {prizes.map((p, index) => (
                    <div key={p.id}>
                      <small>Place {index + 1}</small>
                      <strong>{shannons(p.amount) ? ckb(shannons(p.amount)!) : 'Not set'}</strong>
                      <small>CKB{p.reference ? ` · $${p.reference} reference` : ''}</small>
                    </div>
                  ))}
                </div>
              </div>
              <dl className="campaign-review-details">
                <div>
                  <dt>{five ? 'Gameweek' : 'Fixtures'}</dt>
                  <dd>{five ? (selectedWeek?.name ?? 'Not selected') : fixtureIds.length}</dd>
                </div>
                <div>
                  <dt>Registration closes</dt>
                  <dd>{registration ? dateTime(registration) : 'Not set'}</dd>
                </div>
                {five && selectedWeek && (
                  <div>
                    <dt>Squad deadline</dt>
                    <dd>{dateTime(selectedWeek.lockAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>Mode</dt>
                  <dd>
                    {rehearsal
                      ? 'Rehearsal, excluded from community statistics'
                      : 'Community competition'}
                  </dd>
                </div>
              </dl>
              <Notice
                title={
                  five
                    ? 'The same Five team and player points'
                    : 'The same prediction slip and payment journey'
                }
              >
                {five
                  ? 'Players use the existing squad editor. Earlier final squad saves break a points tie.'
                  : 'Only the first qualifying paid prediction per fixture counts. Correct calls earn 3 points; wrong or missed calls earn 0. Stake size does not affect competition points. Earlier confirmed final qualifying prediction wins; ties in one block follow transaction/output order.'}
              </Notice>
              <p className="campaign-small">
                Every registration creates a ranked entry. Non-participants stay at the bottom.
                Prizes require separately funded mainnet payouts from the organizer.
              </p>
              <div className="campaign-editor-footer">
                <button
                  className="btn"
                  type="button"
                  disabled={pending}
                  onClick={() => void save(false)}
                >
                  {pending && <CellLoader />} Save draft
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={pending}
                  onClick={() => void save(true)}
                >
                  {pending ? <CellLoader /> : <Icon name="arrow" />} Publish competition
                </button>
              </div>
            </section>
          )}
        </div>
        <aside className="campaign-setup-summary">
          <span className="campaign-eyebrow">AT A GLANCE</span>
          <Trophy />
          <h3>{name || 'Your competition'}</h3>
          <p>{five ? 'Streak Five' : 'Match predictions'}</p>
          <strong className="campaign-total">
            {ckb(total.toString())}
            <small>CKB prize pool</small>
          </strong>
          <dl>
            <div>
              <dt>Winning places</dt>
              <dd>{prizes.length}</dd>
            </div>
            <div>
              <dt>{five ? 'Gameweek' : 'Selected fixtures'}</dt>
              <dd>{five ? (selectedWeek?.name ?? 'Choose one') : fixtureIds.length}</dd>
            </div>
            <div>
              <dt>Leaderboard</dt>
              <dd>Public</dd>
            </div>
            <div>
              <dt>Payouts</dt>
              <dd>{rehearsal ? 'Disabled for rehearsal' : 'You approve'}</dd>
            </div>
          </dl>
          <button className="btn" type="button" onClick={() => void save(false)} disabled={pending}>
            {pending && <CellLoader />} Save draft
          </button>
          <button
            className="btn campaign-quiet"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            Back to competitions
          </button>
        </aside>
      </div>
    </div>
  );
}
