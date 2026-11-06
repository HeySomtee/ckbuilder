import { amountCents, defaultDraft, dollars, totalCents } from './config.mjs';

/** Read-only synthetic design evidence. Never a source of financial or usage truth. */
export function renderEvidence({ icon, kind, config }) {
  const five = kind === 'five';
  const marks = typeof icon === 'function' ? icon : () => '';
  const settings = config ?? defaultDraft(kind);
  const budget = `$${dollars(totalCents(settings))}`;
  const awardIndex = settings.prizes.length > 1 ? 1 : 0;
  const awardAmount = amountCents(settings.prizes[awardIndex]?.amount) ?? 0;
  const awardRecord = [
    `sample-award-${String(awardIndex + 1).padStart(2, '0')}`,
    `Campaign prize · place ${awardIndex + 1}`,
    'CKB mainnet',
    `$${dollars(awardAmount)} equivalent`,
    'Not sent',
  ];
  const metrics = five
    ? [
        ['Valid locked teams', '22', '22 of 24 registered entrants'],
        ['Saved players', '110', '5 per team; repeated players count'],
        ['On-chain entry payments', '0', 'Five entry is free and off-chain'],
        ['Campaign prize budget', budget, 'Mainnet awards; $0 paid in this sample'],
      ]
    : [
        ['Confirmed payments', '56', 'Distinct testnet transaction hashes'],
        ['Admitted predictions', '84', 'A payment can include several picks'],
        ['Participating wallets', '22', 'Distinct locks, not verified humans'],
        ['Stake committed', '20,600', 'tCKB principal; excludes storage / fees'],
      ];
  const events = five
    ? [
        ['sample-save-022', 'Final squad saved', 'Application', '5 players + captain', 'Accepted'],
        ['sample-score-r08', 'Gameweek score update', 'FPL / Streak', 'Revision 8', 'Final'],
        awardRecord,
      ]
    : [
        ['sample-tx-056', 'Prediction payment', 'CKB testnet', '3 picks · 600 tCKB', 'Confirmed'],
        ['sample-tx-055', 'Prediction payment', 'CKB testnet', '1 pick · 200 tCKB', 'Confirmed'],
        awardRecord,
      ];
  const funnel = [
    ['Competition visitors', 320, '100%'],
    ['Signed in', 64, '20%'],
    ['Registered', 24, '7.5%'],
    [five ? 'Valid team saved' : 'Admitted a prediction', 22, '6.9%'],
  ];
  return `<div class="evidence-layout">
    <section class="evidence-heading">
      <div><p class="eyebrow">CAMPAIGN EVIDENCE</p><h2>A story backed by records.</h2><p>From first visit to real participation, with the proof kept alongside it.</p></div>
      <button class="btn btn--primary" data-action="evidence-export">${marks('download')} Export sample evidence</button>
    </section>
    <div class="evidence-scope" role="note"><span class="badge badge--amber">Sample data</span><span>20–24 Nov 2026 · WAT</span><span>Community only · operator tests excluded</span><strong>Design preview, not grant evidence</strong></div>
    <section class="evidence-metrics" aria-label="Illustrative campaign metrics">${metrics
      .map(
        ([label, value, detail]) =>
          `<article><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`,
      )
      .join('')}</section>
    <div class="evidence-columns">
      <section class="panel evidence-story">
        <div class="evidence-icon">${marks('shield')}</div><p class="eyebrow">PARTICIPATION, CLEARLY DEFINED</p>
        <h2>${five ? '22 teams made the deadline.' : '22 wallets. 84 predictions. 56 payments.'}</h2>
        <p>${five ? '24 accounts registered and 22 saved a valid team. Team selection and scoring are application records; the separate mainnet prize transfer provides payment proof.' : 'Community players used the existing prediction flow. Several picks can share one payment, so the transaction count and prediction count are kept separate.'}</p>
        <div class="evidence-activation"><strong>22 / 24</strong><span><b>91.7% participation</b><small>Active entrants divided by registrations</small></span></div>
        <p class="evidence-footnote">Illustrative numbers only. Reward-driven participation is not proof of organic retention or unique people.</p>
      </section>
      <section class="panel evidence-funnel">
        <div class="section-heading"><div><p class="eyebrow">THE JOURNEY TO PLAY</p><h2>Where visitors become players.</h2></div><span class="badge">PostHog · planned</span></div>
        <ol>${funnel
          .map(
            ([label, count, percentage]) =>
              `<li><div><span>${label}</span><strong>${count} <small>${percentage}</small></strong></div><div class="evidence-bar" aria-hidden="true"><i></i></div></li>`,
          )
          .join('')}</ol>
        <p class="evidence-footnote">Illustrative funnel · 7-day conversion window. Percentages are measured from the first step. Analytics may miss opt-outs and blocked requests.</p>
      </section>
    </div>
    <section class="panel evidence-records">
      <div class="section-heading"><div><p class="eyebrow">FOLLOW THE EVIDENCE</p><h2>${five ? 'Saved teams, scores and awards.' : 'Every payment has a trace.'}</h2><p>${five ? 'Application events and blockchain payments stay clearly separated.' : 'The production export will include explorer links and canonical block evidence.'}</p></div><span class="badge">Illustrative records</span></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Record</th><th scope="col">Action</th><th scope="col">Source</th><th scope="col">Detail</th><th scope="col">State</th></tr></thead><tbody>${events
        .map(
          ([id, action, source, detail, status]) =>
            `<tr><td class="mono">${id}</td><td>${action}</td><td>${source}</td><td>${detail}</td><td><span class="badge ${status === 'Not sent' ? 'badge--amber' : 'badge--mint'}">${status}</span></td></tr>`,
        )
        .join('')}</tbody></table></div>
      <p class="evidence-footnote">Sample IDs are not transaction hashes. No funds have moved. Production evidence will include network, hash, block, timestamp, verification state and last checked time.</p>
    </section>
    <details class="panel evidence-setup"><summary><span><strong>Prepare your PostHog project</strong><small>One project now. Tracking enabled only after integration.</small></span>${marks('chevron')}</summary><ol><li>Create or rename a project to <strong>Streak Production</strong> and choose its hosting region.</li><li>Select JavaScript / React. Keep the project token and regional API host ready; never use a personal API key in browser code.</li><li>Start with explicit events. Leave broad autocapture, automatic pageviews, session replay and automatic error capture off.</li><li>We will connect sanitized participation events and check payloads before enabling production collection.</li></ol><p><a href="https://posthog.com/docs/settings/projects" target="_blank" rel="noopener noreferrer">PostHog project setup ${marks('arrow')}</a></p></details>
  </div>`;
}
