import {
  players,
  slots,
  fixtures,
  board,
  budget,
  findPlayer,
  draftTotal,
  selectionError,
} from "./data.mjs";
import { icon, shirt } from "./icons.mjs";
import {
  ticketGenie,
  stopMotion,
  captureSurface,
  ensureSurface,
  reducedMotion,
  warmSurface,
} from "./motion.mjs";
import { dockMouth } from "./genie-geometry.mjs";

const storageKey = "streak-design-proposal-v1";
const sampleBalance = 5000;
const receiptStorage = 321;
const sampleNetworkFee = 0.005;
const money = (value) =>
  Number(value).toLocaleString("en-GB", { maximumFractionDigits: 3 });
const defaults = {
  draft: [null, null, null, null, null],
  captain: null,
  submitted: false,
  connected: false,
  slip: null,
  positions: [],
  claimed: false,
  refunded: false,
  joined: false,
  reduced: false,
};
let saved;
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "null");
} catch {}
const state = { ...structuredClone(defaults), ...saved };
if (
  !Array.isArray(state.draft) ||
  state.draft.length !== 5 ||
  state.draft.some(
    (id, i) => id !== null && findPlayer(id)?.role !== slots[i].role,
  ) ||
  draftTotal(state.draft) > budget ||
  new Set(state.draft.filter(Boolean)).size !==
    state.draft.filter(Boolean).length
) {
  state.draft = [...defaults.draft];
  state.submitted = false;
  state.captain = null;
}
if (!state.draft.includes(state.captain)) state.captain = null;
if (!Array.isArray(state.positions)) state.positions = [];
// Preserve drafts from the earlier single-prediction preview.
const savedPicks = Array.isArray(state.slip?.picks)
  ? state.slip.picks
  : state.slip?.fixture
    ? [state.slip]
    : [];
const validPicks = [
  ...new Map(
    savedPicks
      .filter(
        (pick) =>
          pick &&
          fixtures.some((f) => f.id === pick.fixture) &&
          [0, 1, 2].includes(pick.side),
      )
      .map((pick) => [
        pick.fixture,
        {
          fixture: pick.fixture,
          side: pick.side,
          amount:
            typeof pick.amount === "string" || typeof pick.amount === "number"
              ? pick.amount
              : 100,
        },
      ]),
  ).values(),
];
state.slip = validPicks.length
  ? { picks: validPicks, active: validPicks[0].fixture }
  : null;
const slipPicks = () => state.slip?.picks || [];
const slipTotals = () => {
  const picks = slipPicks();
  const principal = picks.reduce(
    (sum, pick) =>
      sum + (Number.isFinite(Number(pick.amount)) ? Number(pick.amount) : 0),
    0,
  );
  const storage = picks.length * receiptStorage;
  const fee = picks.length ? sampleNetworkFee : 0;
  return {
    count: picks.length,
    principal,
    storage,
    fee,
    total: principal + storage + fee,
  };
};
const outcomeLabel = (pick) => {
  const fixture = fixtures.find((f) => f.id === pick.fixture);
  return pick.side === 1
    ? "Draw"
    : `${pick.side === 0 ? fixture.home : fixture.away} to win`;
};
state.fiveTab = "team";
state.fiveScenario = "draft";
state.matchTab = "timeline";
state.feed = "live";
state.clubTab = "leaderboard";
state.marketFilter = "all";
state.activityTab = "positions";
document.documentElement.dataset.reduced = String(!!state.reduced);
const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog"),
  toastHost = document.querySelector("#toast"),
  dockHost = document.querySelector("#dock-host");
let modal = "",
  lastFocus = null,
  pickerIndex = 0,
  toastTimer,
  modalVersion = 0,
  previewEpoch = 0,
  connectIntent = null;
let windowTransition = 0;
let pendingWindowGeometry;
const windowGeometry = () =>
  [
    dialog.offsetWidth,
    dialog.offsetHeight,
    dialog.scrollTop,
    innerWidth,
    innerHeight,
    window.visualViewport?.width,
    window.visualViewport?.height,
    window.visualViewport?.offsetLeft,
    window.visualViewport?.offsetTop,
  ].join("|");
function cancelWindowTransition() {
  windowTransition++;
  pendingWindowGeometry = undefined;
  delete dialog.dataset.windowTransition;
  dialog.classList.remove("genie-preparing");
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const persist = () => {
  try {
    const {
      fiveTab,
      fiveScenario,
      matchTab,
      feed,
      clubTab,
      marketFilter,
      activityTab,
      ...data
    } = state;
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {}
};
const route = () => {
  const [name = "home", id] = location.hash.replace(/^#\/?/, "").split("/");
  return { name: name || "home", id };
};
const link = (to, label, cls = "") =>
  `<a class="${cls}" href="#/${to}">${label}</a>`;
const btn = (action, label, cls = "", extra = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const crest = (text, color) =>
  `<span class="crest" style="--club:${color}">${text}</span>`;
const title = (eyebrow, heading, desc, actions = "") =>
  `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1 tabindex="-1">${heading}</h1><p>${desc}</p></div>${actions ? `<div class="page-head-actions">${actions}</div>` : ""}</div>`;
const tabs = (items, current, action) =>
  `<div class="tabs" aria-label="Section views">${items.map(([id, label]) => `<button class="tab ${current === id ? "active" : ""}" aria-pressed="${current === id}" data-action="${action}" data-value="${id}">${label}</button>`).join("")}</div>`;
const bottomNote = () =>
  `<div class="bottom-note">${icon("shield")}Design preview. Sample fixtures, players, points and testnet balances. No live transactions.</div>`;
function notify(message) {
  clearTimeout(toastTimer);
  toastHost.innerHTML = `<div class="toast">${icon("check")}<span>${esc(message)}</span><button data-action="dismiss-toast" aria-label="Dismiss notification">${icon("close")}</button></div>`;
  toastTimer = setTimeout(() => toastHost.replaceChildren(), 6000);
}
toastHost.addEventListener("pointerenter", () => clearTimeout(toastTimer));
toastHost.addEventListener("focusin", () => clearTimeout(toastTimer));
for (const event of ["pointerleave", "focusout"])
  toastHost.addEventListener(event, () => {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastHost.replaceChildren(), 6000);
  });
const navItems = [
  ["home", "home", "Overview"],
  ["five", "five", "Streak Five"],
  ["markets", "markets", "Markets"],
  ["matchday", "live", "Matchday"],
  ["activity", "activity", "My activity"],
];
function shell(content) {
  const { name } = route();
  const labels = {
    home: "Overview",
    five: "Streak Five",
    markets: "Markets",
    market: "Market details",
    matchday: "Matchday",
    activity: "My activity",
    club: "Clubhouse",
    wallet: "Wallet",
    account: "Your account",
    welcome: "Welcome",
    review: "Design review",
  };
  const active = name === "market" ? "markets" : name;
  const nav = (id, ic, label) =>
    `<a href="#/${id}" class="nav-link ${active === id ? "active" : ""}" ${active === id ? 'aria-current="page"' : ""} aria-label="${label}">${icon(ic)}<span>${label}</span>${id === "five" ? '<span class="badge-new">NEW</span>' : ""}</a>`;
  return `<aside class="sidebar"><a href="#/home" class="brand"><img src="./mark.svg" alt=""/><span>streak<i>.</i></span></a><div class="eyebrow">Your touchline</div><nav aria-label="Main navigation">${navItems.map((n) => nav(...n)).join("")}</nav><div class="eyebrow">Around the game</div><nav aria-label="Community navigation">${nav("club", "club", "Clubhouse")}${nav("wallet", "wallet", "Wallet")}</nav><div class="sidebar-bottom"><div class="season-note">${icon("spark")}<div><strong>Here from the start.</strong><small>Founders Season · Preview 01</small></div></div><a href="#/account" class="user-mini"><span class="avatar">S</span><div><strong>Somtee</strong><small>Founding player</small></div>${icon("settings")}</a></div></aside><div class="shell"><header class="topbar"><a href="#/home" class="brand mobile-brand"><img src="./mark.svg" alt=""/><span>streak<i>.</i></span></a><div class="breadcrumb">Your touchline ${icon("chevron")}<strong>${labels[name] || "Overview"}</strong></div><div class="top-actions"><button class="search-button" data-action="search">${icon("search")}<span>Find your next match</span><kbd class="key">/</kbd></button><button class="icon-btn" data-action="notifications" aria-label="Notifications">${icon("bell")}</button><button class="wallet-button" data-action="connect">${icon("wallet")} ${state.connected ? "5,000 tCKB" : "Connect wallet"} ${state.connected ? '<i class="dot"></i>' : ""}</button><a href="#/account" class="avatar" aria-label="Your account">S</a></div></header><div class="preview-strip"><span>INTERACTIVE PROPOSAL · All activity is simulated</span><a href="#/review">Review guide ${icon("up")}</a></div><main id="main" class="main"><div class="page-enter">${content}</div></main></div><nav class="mobile-nav" aria-label="Mobile navigation">${[
    ["home", "home", "Home"],
    ["markets", "markets", "Markets"],
    ["five", "five", "Five"],
    ["matchday", "live", "Live"],
    ["club", "club", "Club"],
  ]
    .map(
      ([id, ic, label]) =>
        `<a href="#/${id}" class="${active === id ? "active" : ""}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a>`,
    )
    .join("")}</nav>`;
}
function hero() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><i class="dot"></i>Introducing Streak Five</div><h2>Your weekend.<br/><em>Your starting five.</em></h2><p>Five players. One captain. A whole weekend of reasons to watch.</p><div class="hero-buttons">${link("five", `${state.submitted ? "See your five" : "Build your five"} ${icon("arrow")}`, "btn mint")}<button class="text-link" data-action="how-five">How it works ${icon("up")}</button></div><div class="hero-footer">${icon("shield")}Free to play. No wallet needed for fantasy.</div></div><div class="hero-art" aria-hidden="true"><div class="hero-ring"></div><div class="hero-grid"></div>${shirt(findPlayer("saka"), "hero-jersey")}${shirt(findPlayer("haaland"), "hero-jersey middle")}${shirt(findPlayer("palmer"), "hero-jersey last")}<span class="float-label">Your football instinct, rewarded.</span><div class="hero-ticket"><div class="trophy-medal">${icon("trophy")}</div><div><strong>Small squad. Big weekend.</strong><span>Founders Season · Matchweek 01</span></div></div></div></section>`;
}
function outcomes(f) {
  const picked = slipPicks().find((pick) => pick.fixture === f.id);
  return `<div class="outcomes" aria-label="Choose an outcome for ${f.home} versus ${f.away}">${["Home", "Draw", "Away"].map((s, i) => `<button class="outcome ${picked?.side === i ? "is-picked" : ""}" data-action="pick" data-fixture="${f.id}" data-side="${i}" aria-pressed="${picked?.side === i}" aria-label="Predict ${s} for ${f.home} versus ${f.away}"><span>${s}</span><strong>${f.sides[i]}%</strong><span class="pick-check" aria-hidden="true">${icon("check")}</span></button>`).join("")}</div>`;
}
function syncPickedOutcomes() {
  document.querySelectorAll('[data-action="pick"]').forEach((button) => {
    const selected = slipPicks().some(
      (pick) =>
        pick.fixture === button.dataset.fixture &&
        pick.side === Number(button.dataset.side),
    );
    button.classList.toggle("is-picked", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
function matchRow(f) {
  return `<div class="match-row"><div><a href="#/market/${f.id}" class="team-pair">${crest(f.h, f.hc)}<strong>${f.home}</strong><span class="vs">vs</span>${crest(f.a, f.ac)}<strong>${f.away}</strong></a><div class="fixture-meta"><span>${f.time}</span><span>·</span><span>${f.pool} tCKB pooled</span></div></div>${outcomes(f)}</div>`;
}
function home() {
  return `${title("Thursday, 15 October", "Good to have you here.", "A new matchweek. A few good calls to make.", `<span class="chip green"><i class="dot"></i>Founders Season</span>`)}${hero()}<div class="overview-grid"><section><div class="section-head"><div><h2>A weekend worth watching</h2><p>Sample fixtures · Pick a side, follow the story.</p></div>${link("markets", `All markets ${icon("arrow")}`, "text-link")}</div><div class="match-list">${fixtures.map(matchRow).join("")}</div><div class="season-stats"><div class="stat"><div class="eyebrow">Your fantasy rank</div><strong>03<span class="muted"> / 24</span></strong><small>Illustrative leaderboard</small></div><div class="stat"><div class="eyebrow">Prediction streak</div><strong class="coral">3 days</strong><small>One fixture at a time</small></div><div class="stat"><div class="eyebrow">Ready to claim</div><strong class="green">${state.claimed ? "0" : "469.5"}</strong><small>${link("activity", "View your activity →")}</small></div></div></section><aside class="overview-aside stack"><div class="mini-panel purple"><span class="eyebrow violet">Founders Season</span><h3>First through<br/>the turnstiles.</h3><p>Make your first pick. Finish a matchday. Leave your mark.</p><div class="progress-label"><span>Your founding badge</span><span>2 / 5</span></div><div class="progress"><span></span></div>${link("club", `Explore the club ${icon("arrow")}`, "text-link")}</div><div class="mini-panel"><div class="spread"><h3 style="font-size:14px;margin:0">The ones to catch</h3>${icon("trophy", "violet")}</div>${board
    .slice(0, 3)
    .map(
      (b, i) =>
        `<div class="mini-board"><span class="rank">${i + 1}</span><span class="avatar" style="color:${b.color};background:${b.color}14;border-color:${b.color}30">${b.initials}</span><span>${b.you ? "You" : b.name}</span><span class="points">${b.score}</span></div>`,
    )
    .join("")}</div></aside></div>${bottomNote()}`;
}
function pitch() {
  return `<div class="pitch-wrap"><div class="pitch-top"><strong>Late bloomers <span class="muted">/ Five</span></strong><span>MW 01</span></div><div class="pitch" aria-label="Your five-player squad"><div class="pitch-markings"><div class="goal"></div><div class="goal bottom"></div></div>${slots
    .map((s, i) => {
      const p = findPlayer(state.draft[i]);
      return `<button class="slot slot-${i}" data-action="player-slot" data-index="${i}" aria-label="${p ? `Change ${p.name}, ${s.label}` : `Choose ${s.label}`}" ${state.fiveScenario === "locked" ? "disabled" : ""}>${p ? `${shirt(p, `pitch-${i}`)}${state.captain === p.id ? '<span class="captain-badge">C</span>' : ""}<span class="player-name">${p.name}</span><span class="player-price">${p.price.toFixed(1)} credits</span>` : `<span class="empty-slot">${icon("plus")}</span><span class="player-name">${s.label}</span>`}</button>`;
    })
    .join(
      "",
    )}</div><div class="pitch-bottom"><span>1 GK · 1 DEF · 2 MID · 1 FWD</span><button class="text-link" data-action="autofill" ${state.fiveScenario === "locked" ? "disabled" : ""}>${icon("spark")}Try a suggested five</button></div></div>`;
}
function squadPanel() {
  const total = draftTotal(state.draft),
    count = state.draft.filter(Boolean).length;
  return `<aside class="workspace-panel"><div class="spread"><span class="eyebrow">Your squad budget</span><span class="chip">${count} / 5 players</span></div><div class="budget"><strong>${(budget - total).toFixed(1)}</strong><span>credits left of ${budget}</span></div><div class="budget-meter" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < total / 2 ? "used" : ""}"></i>`).join("")}</div><div class="squad-list">${slots
    .map((s, i) => {
      const p = findPlayer(state.draft[i]);
      return `<div class="squad-row"><span class="position-tag">${s.role}</span><strong>${p ? p.name : "Choose a player"}</strong>${p ? `<button class="captain-button ${state.captain === p.id ? "selected" : ""}" data-action="captain" data-id="${p.id}" aria-pressed="${state.captain === p.id}" aria-label="Make ${p.name} captain" ${state.fiveScenario === "locked" ? "disabled" : ""}>C</button>` : `<button class="captain-button" data-action="player-slot" data-index="${i}" aria-label="Choose ${s.label}" ${state.fiveScenario === "locked" ? "disabled" : ""}>+</button>`}</div>`;
    })
    .join(
      "",
    )}</div><p class="squad-help">${state.captain ? `<span class="green">${findPlayer(state.captain).name} is your captain.</span> Their points count twice.` : "Tap C beside a player to choose your captain. Their points count twice."}</p>${btn("submit-five", state.fiveScenario === "locked" ? `${icon("clock")}Team locked` : state.submitted ? `Save team changes ${icon("arrow")}` : `Review your five ${icon("arrow")}`, "mint full", state.fiveScenario === "locked" ? "disabled" : "")}<div id="squad-error" role="alert"></div><div class="small-notice">${icon("shield")}Free fantasy entry. Credits are a squad budget, not CKB or money.</div></aside>`;
}
function scoring() {
  return `<div class="rules-grid"><section class="workspace-panel"><span class="eyebrow">Proposed scoring</span><h2>Simple enough to follow.</h2><div class="rule-list">${[
    ["Plays 1–59 minutes", "+1"],
    ["Plays 60+ minutes", "+2 total"],
    ["Goal · GK / DEF", "+6"],
    ["Goal · MID", "+5"],
    ["Goal · FWD", "+4"],
    ["Assist", "+3"],
    ["Clean sheet · GK / DEF, 60+ min", "+4"],
    ["Every 3 goalkeeper saves", "+1"],
    ["Yellow / red card", "−1 / −3"],
    ["Captain", "2× total"],
  ]
    .map(
      ([a, b]) =>
        `<div class="rule-row"><span>${a}</span><strong>${b}</strong></div>`,
    )
    .join(
      "",
    )}</div></section><section class="workspace-panel"><span class="eyebrow">A fair starting line</span><h2>Everyone gets forty.</h2><p>Choose five different players within 40 credits: one goalkeeper, one defender, two midfielders and one forward. Any player can captain.</p><div class="rule-note">This is a proposed ruleset, not a launched competition. Player prices, statistics coverage and correction policy need approval.</div><h3>Before the first whistle</h3><p>One team per account per round. Edit until the round lock. All five positions lock together before the earliest included fixture.</p><div class="line"></div><h3>When the weekend ends</h3><p>Live points are provisional. A postponed fixture scores zero in the proposed round; no automatic substitutes. A published correction window precedes final standings.</p><button class="text-link" data-action="five-tab" data-value="team">Build your team ${icon("arrow")}</button></section></div>`;
}
function fiveResults() {
  const ids = ["raya", "gabriel", "saka", "mbeumo", "haaland"];
  return `<div class="score-hero"><div><span class="eyebrow violet">Sample final standings · MW 01</span><h2>A weekend well picked.</h2><p>Third in the club. One to build on.</p></div><div><strong>61</strong><p>fantasy points</p></div></div><div class="rules-grid"><div class="table-scroll"><table class="score-table"><thead><tr><th>Player</th><th>Contribution</th><th>Points</th></tr></thead><tbody>${ids.map((id, i) => `<tr><td>${findPlayer(id).name}${i === 4 ? ' <span class="chip green">C</span>' : ""}</td><td class="muted">${["Clean sheet and 3 saves", "Goal and clean sheet", "2 assists", "Goal in 45 minutes", "Hat-trick, captain x2"][i]}</td><td class="green">${[7, 12, 8, 6, 28][i]}</td></tr>`).join("")}</tbody></table></div><div class="workspace-panel"><span class="eyebrow">The next conversation starter</span><h2>Give the group chat<br/>something to talk about.</h2><p>This result is illustrative and independent of your draft. In production, every point links to a scoring event.</p>${btn("share-team", `${icon("up")}Preview your team card`, "secondary full", 'style="margin-top:23px"')}<div class="line"></div>${link("club", `See the leaderboard ${icon("arrow")}`, "text-link")}</div></div>`;
}
function five() {
  return `${title("Free fantasy · Founders Season", "Five players. All you.", "Build a little team for a big weekend.", `<select class="scenario" aria-label="Fantasy preview scenario" data-change="five-scenario"><option value="draft" ${state.fiveScenario === "draft" ? "selected" : ""}>Preview: open round</option><option value="locked" ${state.fiveScenario === "locked" ? "selected" : ""}>Preview: locked round</option></select>`)}${tabs(
    [
      ["team", "Your five"],
      ["points", "Points & results"],
      ["rules", "How scoring works"],
    ],
    state.fiveTab,
    "five-tab",
  )}${state.fiveTab === "team" ? `${state.submitted ? `<div class="selected-banner">${icon("check")}<div><strong>Your five are in.</strong><p>Saved in this browser for the preview. You can edit while the round is open.</p></div><button class="text-link" data-action="share-team">Team card ${icon("up")}</button></div>` : ""}${state.fiveScenario === "locked" ? '<div class="inline-status">The sample round is locked. Your saved team stays visible; edits are disabled.</div>' : ""}<div class="five-grid">${pitch()}${squadPanel()}</div>` : state.fiveTab === "rules" ? scoring() : fiveResults()}${bottomNote()}`;
}
function marketCard(f) {
  return `<article class="market-card"><div class="fixture-meta"><span>${f.time}</span><span class="green">${f.tag}</span></div><a href="#/market/${f.id}" class="market-teams"><div class="market-team">${crest(f.h, f.hc)}<strong>${f.home}</strong></div><span class="vs">VS</span><div class="market-team">${crest(f.a, f.ac)}<strong>${f.away}</strong></div></a>${outcomes(f)}<div class="pool-bar" aria-hidden="true">${f.sides.map((p) => `<span style="width:${p}%"></span>`).join("")}</div><footer><span>${f.pool} tCKB pooled</span><span>32 entries max</span></footer></article>`;
}
function markets() {
  const shown =
    state.marketFilter === "featured"
      ? fixtures.slice(0, 1)
      : state.marketFilter === "sunday"
        ? fixtures.filter((f) => f.time.startsWith("SUN"))
        : fixtures;
  return `${title("The prediction markets", "You know the game.", "Choose a fixture. Make your call. Follow it to the final whistle.", `<span class="chip green"><i class="dot"></i>CKB testnet preview</span>`)}<div class="filters" aria-label="Market filters">${[
    ["all", "All fixtures"],
    ["featured", "Featured"],
    ["sunday", "Sunday"],
  ]
    .map(
      ([id, label]) =>
        `<button class="filter ${state.marketFilter === id ? "active" : ""}" aria-pressed="${state.marketFilter === id}" data-action="market-filter" data-value="${id}">${label}</button>`,
    )
    .join(
      "",
    )}<button class="filter" data-action="schedule">${icon("activity")} Match schedule</button></div><div class="market-grid">${shown.map(marketCard).join("")}</div><div class="feature-banner">${icon("shield")}<div><h3>Your wallet. Your prediction. Your claim.</h3><p>Proposed direct on-chain flow. Your stake and recoverable storage are shown before signing. Pool percentages are not fixed odds.</p></div>${btn("market-rules", "Understand the rules", "secondary small")}</div>${bottomNote()}`;
}
function marketDetail() {
  const f = fixtures.find((f) => f.id === route().id) || fixtures[0];
  return `${title("Premier League · Sample fixture", `${f.home} vs ${f.away}`, "The context, the crowd and your call.", link("markets", `${icon("back")}Markets`, "text-link"))}<div class="market-detail"><section><div class="match-hero"><div class="spread"><span class="chip green">Open for predictions</span><span class="eyebrow">${f.time}</span></div><div class="market-teams"><div class="market-team">${crest(f.h, f.hc)}<strong>${f.home}</strong></div><div class="score"><small>PRE-MATCH</small>vs</div><div class="market-team">${crest(f.a, f.ac)}<strong>${f.away}</strong></div></div><div class="spread"><span class="muted">Sample pool</span><strong>${f.pool} tCKB</strong></div></div><div class="workspace-panel" style="margin-top:22px"><span class="eyebrow violet">Market vs Machine</span><h2>Two ways to read the game.</h2><p>Illustrative model estimates beside the crowd. Forecasts inform your choice; they do not determine results.</p>${f.sides.map((v, i) => `<div class="stat-compare"><div class="spread"><strong>${["Home", "Draw", "Away"][i]}</strong><span class="muted">Crowd ${v}% · Model ${[44, 27, 29][i]}%</span></div><div class="compare-bars"><span style="width:${v}%"></span><span style="width:${100 - v}%"></span></div></div>`).join("")}</div></section><aside class="workspace-panel"><span class="eyebrow">What's your call?</span><h2>Pick your side.</h2><p>Payouts depend on the final pool. These percentages show the distribution of sample stakes.</p><div style="margin:25px 0">${outcomes(f)}</div><div class="line"></div><div class="info-list"><div class="info-row">${icon("clock")}<div><strong>Closes at kickoff</strong><small>Only timely on-chain deposits are accepted.</small></div></div><div class="info-row">${icon("shield")}<div><strong>Six-hour result deadline</strong><small>Unresolved markets can be voided for refunds.</small></div></div><div class="info-row">${icon("wallet")}<div><strong>Claim from your wallet</strong><small>Winning payout or losing receipt storage.</small></div></div></div><button class="text-link" data-action="market-rules">Settlement and fee rules ${icon("up")}</button></aside></div>${bottomNote()}`;
}
function matchday() {
  const f = fixtures[0];
  return `${title("Stay close to the game", "Every minute matters.", "The match, your five and your predictions, together.", `<select class="scenario" aria-label="Match feed scenario" data-change="feed"><option value="live" ${state.feed === "live" ? "selected" : ""}>Preview: live feed</option><option value="delayed" ${state.feed === "delayed" ? "selected" : ""}>Preview: delayed feed</option><option value="empty" ${state.feed === "empty" ? "selected" : ""}>Preview: no live games</option></select>`)}${
    state.feed === "empty"
      ? `<div class="empty-state">${icon("clock")}<h2>A breather before kickoff.</h2><p>No sample matches are live in this scenario. Your team and open predictions are still here.</p>${link("markets", `Explore fixtures ${icon("arrow")}`, "btn secondary")}</div>`
      : `${state.feed === "delayed" ? '<div class="inline-status error">Feed delayed. Showing the last sample update from 4 minutes ago. Scores and fantasy points are provisional.</div>' : ""}<div class="market-detail"><section><div class="match-hero"><div class="spread"><span class="chip ${state.feed === "live" ? "green" : ""}"><i class="dot"></i>${state.feed === "live" ? "Sample live · 67′" : "Last known · 67′"}</span><span class="eyebrow">Premier League</span></div><div class="market-teams"><div class="market-team">${crest(f.h, f.hc)}<strong>Arsenal</strong></div><div class="score">2 <span class="muted">:</span> 1<small>SECOND HALF</small></div><div class="market-team">${crest(f.a, f.ac)}<strong>Chelsea</strong></div></div><p style="text-align:center;font-size:10px">Illustrative live state. Not a current match or settled result.</p></div>${tabs(
          [
            ["timeline", "Timeline"],
            ["stats", "Match stats"],
            ["lineup", "Your players"],
          ],
          state.matchTab,
          "match-tab",
        )}<div class="mini-panel">${
          state.matchTab === "timeline"
            ? `<div class="timeline">${[
                [
                  "67′",
                  "spark",
                  "Saka finds the corner.",
                  "Arsenal 2 : 1 Chelsea · Assist: Ødegaard",
                ],
                [
                  "54′",
                  "activity",
                  "A change for Chelsea.",
                  "Sample substitution event",
                ],
                [
                  "41′",
                  "spark",
                  "Palmer levels things up.",
                  "Arsenal 1 : 1 Chelsea",
                ],
                [
                  "18′",
                  "spark",
                  "Gabriel opens the scoring.",
                  "Arsenal 1 : 0 Chelsea",
                ],
              ]
                .map(
                  ([m, i, t, d]) =>
                    `<div class="timeline-item"><span class="minute">${m}</span>${icon(i)}<div><strong>${t}</strong><p>${d}</p></div></div>`,
                )
                .join("")}</div>`
            : state.matchTab === "stats"
              ? [
                  ["Possession", "56%", "44%", 56],
                  ["Shots on target", "6", "3", 66],
                  ["Corners", "5", "4", 55],
                  ["Expected goals", "1.82", "1.04", 64],
                ]
                  .map(
                    ([n, a, b, v]) =>
                      `<div class="stat-compare"><div class="spread"><strong>${a}</strong><span class="muted">${n}</span><strong>${b}</strong></div><div class="compare-bars"><span style="width:${v}%"></span><span style="width:${100 - v}%"></span></div></div>`,
                  )
                  .join("")
              : `<div class="stack">${["saka", "gabriel", "palmer"]
                  .map((id, i) => {
                    const p = findPlayer(id);
                    return `<div class="spread"><div class="row">${shirt(p, "lineup-kit")}<div><strong>${p.name}</strong><p>${p.club} · ${p.role}</p></div></div><span class="green">${[7, 12, 6][i]} provisional pts</span></div>`;
                  })
                  .join("")}</div>`
        }</div></section><aside class="stack"><div class="workspace-panel"><span class="eyebrow violet">Your Five · Sample live points</span><h2>Looking good out there.</h2><div class="budget"><strong>43</strong><span>provisional points</span></div><p>Captain points included. Scores can change after provider corrections.</p>${link("five", `Open your team ${icon("arrow")}`, "text-link")}</div><div class="mini-panel"><span class="eyebrow">Your sample prediction</span><h3>Arsenal to win</h3><p>100 tCKB staked. Waiting for the final result and on-chain settlement.</p><div class="inline-status">${icon("clock")}Match in progress · Not claimable</div>${link("activity", `View activity ${icon("arrow")}`, "text-link")}</div></aside></div>`
  }${bottomNote()}`;
}
function activity() {
  return `${title("Your football, accounted for", "Every call has a story.", "Predictions, fantasy entries and receipts in one place.", `<span class="chip">Sample account</span>`)}${tabs(
    [
      ["positions", "Predictions"],
      ["fantasy", "Fantasy"],
      ["receipts", "Receipts"],
    ],
    state.activityTab,
    "activity-tab",
  )}${
    state.activityTab === "fantasy"
      ? `<div class="activity-card"><div class="activity-left"><div class="activity-symbol">${icon("five")}</div><div><h3>Streak Five · Matchweek 01</h3><p>${state.submitted ? "Your team is saved in this preview." : "Your first five are waiting to be picked."}</p></div></div>${link("five", "Open your five →", "btn secondary")}</div>`
      : state.activityTab === "receipts"
        ? `<div class="stack">${[
            ["Winning prediction", "Sample payout · 469.5 tCKB"],
            ["Void refund", "Sample refund · 421 tCKB"],
          ]
            .map(
              ([t, p], i) =>
                `<div class="activity-card"><div><h3>${t}</h3><p>${p}</p></div>${btn(i ? "refund-receipt" : "receipt", `View receipt ${icon("up")}`, "secondary small")}</div>`,
            )
            .join("")}</div>`
        : `<div class="stack"><div class="activity-card"><div class="activity-left"><div class="activity-symbol">${icon("check")}</div><div><span class="eyebrow green">${state.claimed ? "Claimed in preview" : "Ready to claim"}</span><h3 style="margin-top:5px">Arsenal to win</h3><p>Sample settled fixture · 100 tCKB stake</p><button class="text-link" data-action="receipt">Payout breakdown ${icon("up")}</button></div></div><div class="activity-actions"><div class="amount green">469.5 <small>tCKB · includes 321 storage</small></div>${btn("claim", state.claimed ? `${icon("check")}Claimed` : "Review claim", "mint small", state.claimed ? "disabled" : "")}</div></div><div class="activity-card"><div class="activity-left"><div class="activity-symbol" style="color:var(--violet)">${icon("clock")}</div><div><span class="eyebrow violet">${state.refunded ? "Refunded in preview" : "Voided · No result"}</span><h3 style="margin-top:5px">Villa to win</h3><p>Six-hour deadline passed. No market fees.</p></div></div><div class="activity-actions"><div class="amount">421 <small>tCKB · stake + storage</small></div>${btn("refund", state.refunded ? "Refunded" : "Review refund", "secondary small", state.refunded ? "disabled" : "")}</div></div>${state.positions
            .map((p) => {
              const f = fixtures.find((f) => f.id === p.fixture) || fixtures[0];
              return `<div class="activity-card"><div class="activity-left"><div class="activity-symbol">${icon("markets")}</div><div><span class="eyebrow">Preview submission</span><h3 style="margin-top:5px">${[f.home, "Draw", f.away][p.side]} ${p.side === 1 ? "" : "to win"}</h3><p>${esc(p.amount)} tCKB · awaiting admission in the simulated flow${p.batchCount > 1 ? `; ${p.batchCount} picks in one payment` : ""}</p></div></div><span class="chip">Pending acceptance</span></div>`;
            })
            .join("")}</div>`
  }${bottomNote()}`;
}
function leaderTable() {
  return `<div class="table-scroll"><table class="score-table"><thead><tr><th>Rank</th><th>Player</th><th class="team-col">Crew</th><th>MW 01 points</th></tr></thead><tbody>${board.map((b, i) => `<tr class="${b.you ? "you" : ""}"><td class="muted">0${i + 1}</td><td><div class="row"><span class="avatar" style="background:${b.color}15;color:${b.color};border-color:${b.color}30">${b.initials}</span><span>${b.name}${b.you ? ' <span class="chip green">You</span>' : ""}</span></div></td><td class="muted team-col">${b.team}</td><td class="green">${b.score}</td></tr>`).join("")}</tbody></table></div>`;
}
function club() {
  return `${title("The clubhouse", "Good company. Better rivalry.", "A place for your people, your progress and a little friendly competition.")}${tabs(
    [
      ["leaderboard", "Leaderboard"],
      ["crews", "Crews"],
      ["streak", "Daily streak"],
      ["badges", "Your badges"],
    ],
    state.clubTab,
    "club-tab",
  )}${
    state.clubTab === "leaderboard"
      ? `<div class="score-hero"><div><span class="eyebrow violet">Founders Season · Fantasy</span><h2>There’s a spot with your name on it.</h2><p>One squad per player. Points come from football, never from stake size.</p></div>${icon("trophy")}</div>${leaderTable()}`
      : state.clubTab === "crews"
        ? `<div class="rules-grid"><div class="crew-card"><span class="chip violet">PRIVATE LEAGUE · PROPOSED FOLLOW-UP</span><h3>The Sunday XI</h3><p>A group chat with a scoreboard. Compare your weekly fantasy points with friends.</p><div class="crew-members">${board
            .slice(0, 4)
            .map(
              (b) =>
                `<span class="avatar" style="color:${b.color}">${b.initials}</span>`,
            )
            .join(
              "",
            )}</div><span class="muted">${state.joined ? "You joined this sample crew." : "8 sample members · Friends welcome"}</span>${btn("join-crew", state.joined ? `${icon("check")}Joined in preview` : `Join sample crew ${icon("arrow")}`, "secondary full", state.joined ? "disabled" : "")}</div><div class="workspace-panel"><span class="eyebrow">Bring your people</span><h2>Everyone thinks<br/>they know football.</h2><p>Give them somewhere to prove it. Private leagues are shown here for the full product direction, after the launch essentials.</p>${btn("invite", `${icon("copy")}Preview invite`, "secondary full", 'style="margin-top:25px"')}</div></div>`
        : state.clubTab === "streak"
          ? `<div class="rules-grid"><div class="workspace-panel"><span class="eyebrow coral">Daily prediction streak</span><h2>One day at a time.</h2><div class="budget"><strong class="coral">3</strong><span>days in your sample streak</span></div><div class="days">${["M", "T", "W", "T", "F", "S", "S"].map((d, i) => `<div class="day ${i < 3 ? "done" : ""}"><span>${d}</span><i>${i < 3 ? icon("check") : i + 12}</i></div>`).join("")}</div><p>This is your prediction streak, separate from fantasy points. Take a break whenever you need one.</p>${link("markets", "Explore today’s sample fixtures →", "btn secondary full")}<div class="small-notice">Paid revivals and rebates remain a separate product decision for the testnet launch.</div></div><div class="mini-panel purple"><span class="eyebrow violet">A familiar part of Streak</span><h3>The run stays with you.</h3><p>The redesign keeps daily predictions alongside Five. It does not turn your wallet balance into a fantasy score.</p></div></div>`
          : `<div class="review-grid">${[
              [
                "shield",
                "First through the turnstiles",
                "Complete a prediction and a redemption.",
                "2 of 2 · sample earned",
              ],
              [
                "five",
                "A five of your own",
                "Submit your first valid fantasy squad.",
                state.submitted ? "Earned in preview" : "Not earned yet",
              ],
              [
                "fire",
                "Weekend regular",
                "Return for three different matchweeks.",
                "1 of 3 · sample progress",
              ],
            ]
              .map(
                ([i, t, d, p]) =>
                  `<div class="review-card">${icon(i)}<h3>${t}</h3><p>${d}</p><div class="line"></div><span class="chip green">${p}</span></div>`,
              )
              .join(
                "",
              )}</div><div class="rule-note">Badges have no cash value. A fixed feedback reward pool is proposed separately; no prize amount or eligibility rules have been approved.</div>`
  }${bottomNote()}`;
}
function wallet() {
  return `${title("Your wallet", "Keep your game in view.", "Testnet funds, recoverable storage and claims, clearly separated.")}${!state.connected ? `<div class="selected-banner">${icon("wallet")}<div><strong>Your wallet is not connected.</strong><p>You can explore and play fantasy without one. Predictions use a supported CKB wallet.</p></div></div>` : ""}<div class="wallet-layout"><section class="balance-card"><div class="spread"><span class="eyebrow">Sample testnet wallet</span><span class="chip green">Pudge</span></div><div class="balance-number">${state.connected ? "5,000.00" : "Connect"} ${state.connected ? "<small>tCKB</small>" : ""}</div><p>${state.connected ? "Available in your wallet · simulated balance" : "Connect a demo wallet to explore the prediction flow."}</p>${btn(state.connected ? "fund" : "connect", state.connected ? `${icon("plus")}Get testnet CKB` : `${icon("wallet")}Connect demo wallet`, "secondary")}<div class="line"></div><div class="info-row">${icon("shield")}<div><strong>Testnet only</strong><small>These assets and preview balances have no promised monetary value.</small></div></div></section><section class="workspace-panel"><span class="eyebrow">Where your funds go</span><h2>A little more clarity.</h2><div class="info-list"><div class="info-row">${icon("markets")}<div><strong>Prediction principal</strong><small>The amount you put behind your chosen outcome.</small></div></div><div class="info-row">${icon("shield")}<div><strong>Recoverable storage · 321 tCKB</strong><small>Held for each claim cell, returned when redeemed.</small></div></div><div class="info-row">${icon("activity")}<div><strong>Network fee</strong><small>A small separate cost, shown before signing.</small></div></div></div>${link("activity", `Open your claims ${icon("arrow")}`, "text-link")}</section></div><div class="feature-banner"><div><h3>Already used the original Streak?</h3><p>The proposed migration keeps old custodial balances and withdrawal recovery accessible in a clearly separate legacy account.</p></div>${btn("legacy", "View legacy account", "secondary small")}</div>${bottomNote()}`;
}
function account() {
  return `${title("Your corner of Streak", "Make yourself at home.", "A few small choices that make the experience yours.")}<div class="wallet-layout"><section class="workspace-panel"><div class="row"><span class="avatar" style="width:58px;height:58px;font-size:22px">S</span><div><h2>Somtee</h2><p>Founding player · Sample account</p></div></div><div class="line"></div><div class="setting"><div><h3>Reduce motion</h3><p>Keep the feedback. Skip the sweeping transitions.</p></div><button class="toggle" role="switch" aria-label="Reduce motion" aria-checked="${!!state.reduced}" data-action="toggle-motion"></button></div><div class="setting"><div><h3>Matchday reminders</h3><p>Preview notification preferences.</p></div>${btn("reminders", "Manage", "secondary small")}</div><div class="setting"><div><h3>Wallet connection</h3><p>${state.connected ? "Demo wallet connected." : "No wallet connected. Fantasy stays available."}</p></div>${btn(state.connected ? "disconnect" : "connect", state.connected ? "Disconnect" : "Connect", "secondary small")}</div><div class="line"></div>${btn("reset", "Reset this preview", "secondary")}</section><section class="mini-panel purple"><span class="eyebrow violet">The details matter</span><h3>Quiet when it should be.</h3><p>Motion follows your device preference automatically. Financial confirmations stay visible, focus returns to where you were, and no sound plays without your choice.</p><div class="line"></div>${link("welcome", "See the public welcome page →", "text-link")}${link("review", "Open the design review guide →", "text-link")}</section></div>${bottomNote()}`;
}
function welcome() {
  return `<section class="landing-intro"><span class="chip green">Founders Season · Testnet proposal</span><h1>Football feels better<br/>when <em>you’re in it.</em></h1><p>Build your five. Back your football instinct. Find your people for the next matchday.</p><div class="hero-buttons">${link("five", `Play Streak Five ${icon("arrow")}`, "btn mint")}${link("markets", "Explore predictions", "btn secondary")}</div><div class="bottom-note" style="justify-content:center">Free fantasy entry · CKB testnet predictions · No real-money betting</div></section><div class="landing-hero">${hero()}</div><div class="review-grid">${[
    [
      "five",
      "Pick a little team.",
      "Five players and one captain. A fresh start every round.",
    ],
    [
      "markets",
      "Have a football opinion.",
      "See the pool, choose your side and follow your on-chain claim.",
    ],
    [
      "club",
      "Make a matchday of it.",
      "A leaderboard, familiar names and a reason to come back.",
    ],
  ]
    .map(
      ([i, t, p]) =>
        `<article class="review-card">${icon(i)}<h3>${t}</h3><p>${p}</p></article>`,
    )
    .join("")}</div>${bottomNote()}`;
}
function review() {
  return `${title("Proposal 01 · October 15, 2026", "Take it for a matchday.", "A working design study, before the production rebuild.")}<div class="review-grid">${[
    [
      "five",
      "01 / Build your five",
      "Choose five players, stay within 40 credits, select a captain, review and save. Try an over-budget choice, then the locked-round scenario.",
      "five",
      "Start with Five",
    ],
    [
      "markets",
      "02 / Build your slip",
      "Pick several matches, set each stake and review one combined payment. Every prediction settles independently. Minimize and restore the basket, then try a rejected signature and retry.",
      "markets",
      "Explore markets",
    ],
    [
      "activity",
      "03 / Follow it through",
      "Review a winning payout, simulate a claim, inspect a void refund and open the receipt. All money and transactions are examples.",
      "activity",
      "Open activity",
    ],
    [
      "live",
      "04 / Follow the match",
      "Switch between timeline, statistics and players. Try the delayed feed and no-live-games states.",
      "matchday",
      "Open Matchday",
    ],
    [
      "club",
      "05 / Find your people",
      "Explore the fantasy leaderboard, proposed crews, daily prediction streak and founding badges.",
      "club",
      "Visit the club",
    ],
    [
      "settings",
      "06 / Feel the details",
      "Compare reduced motion, keyboard navigation and mobile sheets. Reset the preview any time.",
      "account",
      "Open preferences",
    ],
  ]
    .map(
      ([i, t, p, href, label]) =>
        `<article class="review-card">${icon(i)}<h3>${t}</h3><p>${p}</p>${link(href, `${label} ${icon("arrow")}`, "text-link")}</article>`,
    )
    .join(
      "",
    )}</div><div class="feature-banner"><div><h3>The design and the system belong together.</h3><p>The architecture proposal covers frontend boundaries, database correctness, durable workers, fantasy scoring and a future agent workflow. No production migration or agent policy is activated by this preview.</p></div><a class="btn secondary small" href="./ARCHITECTURE-PROPOSAL.md" target="_blank" rel="noopener">Read proposal ${icon("up")}</a></div><div class="rule-note">Illustrative team memberships, fixtures, prices, scores and accounts are not current football facts. Team drafts persist only in this browser. The preview sends no wallet, football API or analytics requests.</div>${bottomNote()}`;
}
function render(focus = false) {
  const focused = document.activeElement;
  const selector = focused?.dataset.action
    ? '[data-action="' +
      CSS.escape(focused.dataset.action) +
      '"]' +
      ["value", "id", "index"]
        .filter((k) => focused.dataset[k] !== undefined)
        .map((k) => "[data-" + k + '="' + CSS.escape(focused.dataset[k]) + '"]')
        .join("")
    : null;
  const { name } = route();
  const renderers = {
    home,
    five,
    markets,
    market: marketDetail,
    matchday,
    activity,
    club,
    wallet,
    account,
    welcome,
    review,
  };
  app.innerHTML = shell((renderers[name] || home)());
  document.title = `Streak / ${name === "five" ? "Your starting five" : name === "home" ? "The next matchday" : name[0].toUpperCase() + name.slice(1)}`;
  renderDock();
  if (focus) app.querySelector("h1")?.focus({ preventScroll: true });
  else if (selector && !dialog.open)
    app.querySelector(selector)?.focus({ preventScroll: true });
}

function openModal(type, html) {
  cancelWindowTransition();
  stopMotion();
  modalVersion++;
  const wasOpen = dialog.open;
  if (!wasOpen) lastFocus = document.activeElement;
  modal = type;
  dialog.style.animation = "";
  dialog.innerHTML = html;
  if (!wasOpen) {
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }
  dialog.scrollTop = 0;
  (
    dialog.querySelector("[autofocus]") ||
    dialog.querySelector("#dialog-title") ||
    dialog
  ).focus({ preventScroll: true });
}
function modalHead(eyebrow, name, actions = "") {
  return `<div class="dialog-head"><div class="window-controls" role="group" aria-label="Window controls">${actions}<button class="window-control window-control-close" data-action="close-modal" aria-label="Close dialog" title="Close dialog"><span class="window-control-icon" aria-hidden="true">${icon("close")}</span><span class="window-control-label">Close</span></button></div><div class="dialog-heading"><div class="eyebrow">${eyebrow}</div><h2 id="dialog-title" tabindex="-1">${name}</h2></div></div>`;
}
function closeModal(restore = true) {
  cancelWindowTransition();
  stopMotion();
  if (modal === "slip") persist();
  modalVersion++;
  dialog.close();
  dialog.replaceChildren();
  modal = "";
  document.body.style.overflow = "";
  if (restore) {
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    else document.querySelector("#main h1")?.focus({ preventScroll: true });
  }
  renderDock();
}
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function infoModal(titleText, content, eyebrow = "Streak · Preview") {
  openModal(
    "info",
    `${modalHead(eyebrow, titleText)}<div class="dialog-content">${content}</div>`,
  );
}
function openPicker(index) {
  if (state.fiveScenario === "locked") return;
  pickerIndex = index;
  openModal(
    "picker",
    `${modalHead(`${slots[index].role} · ${(budget - draftTotal(state.draft) + (findPlayer(state.draft[index])?.price || 0)).toFixed(1)} credits available`, "Find your player")}<div class="dialog-content"><div class="search-field">${icon("search")}<input class="field" id="player-search" data-input="player-search" placeholder="Search players or clubs" aria-label="Search players" autofocus/></div><div id="player-options" class="player-list"></div><div class="picker-footer"><span>Sample prices & player data</span><span>40-credit squad budget</span></div>${state.draft[index] ? `<button class="text-link" data-action="remove-player">Remove this player ${icon("close")}</button>` : ""}</div>`,
  );
  renderPlayers("");
}
function renderPlayers(query) {
  const list = players.filter(
    (p) =>
      p.role === slots[pickerIndex].role &&
      `${p.name} ${p.full} ${p.club}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  document.querySelector("#player-options").innerHTML = list.length
    ? list
        .map((p) => {
          const error = selectionError(state.draft, pickerIndex, p.id);
          return `<button class="player-option" data-action="choose-player" data-id="${p.id}" ${error ? `disabled title="${esc(error)}"` : ""}>${shirt(p, `picker-${p.id}`)}<div><strong>${p.name}</strong><small>${p.club} · ${error ? (error.includes("already") ? "Already selected" : "Over budget") : `${p.points} sample points`}</small></div><div class="price"><strong>${p.price.toFixed(1)}</strong><small>credits</small></div><span class="add">${icon(state.draft[pickerIndex] === p.id ? "check" : "plus")}</span></button>`;
        })
        .join("")
    : '<div class="empty-state"><h3>No players found.</h3><p>Try a surname or club code.</p></div>';
}
function reviewTeam() {
  const error = state.draft.some((x) => !x)
    ? "Choose all five players before continuing."
    : !state.captain
      ? "Choose a captain by tapping C beside a player."
      : "";
  if (error) {
    const el = document.querySelector("#squad-error");
    el.className = "form-error";
    el.textContent = error;
    return;
  }
  openModal(
    "team-confirm",
    `${modalHead("Free fantasy · Matchweek 01", "Your five, ready to go.")}<div class="dialog-content confirmation"><div class="mini-kits">${state.draft.map((id) => shirt(findPlayer(id), `review-${id}`)).join("")}</div><p><strong>${findPlayer(state.captain).name}</strong> wears the armband.<br/>${draftTotal(state.draft).toFixed(1)} of 40 credits used.</p><div class="inline-status">${icon("clock")}You can edit until the round locks. This preview saves locally, without an account.</div>${btn("confirm-team", `Save your five ${icon("check")}`, "mint full")}<p class="tagline">No entry fee. No wallet signature.</p></div>`,
  );
}
function teamSuccess() {
  state.submitted = true;
  persist();
  render();
  openModal(
    "team-success",
    `${modalHead("Saved in this preview", "That’s your five.")}<div class="dialog-content confirmation"><div class="success-symbol">${icon("check")}</div><h3>Now for the football.</h3><p>Your team is saved on this device. You can keep making changes while the sample round is open.</p>${btn("view-team", "Back to your team", "mint full")}${btn("share-team", "Preview team card", "secondary full", 'style="margin-top:10px"')}<p class="tagline">Production saves will require a signed-in fantasy account.</p></div>`,
  );
}
function openShare() {
  const ids = state.draft.filter(Boolean);
  infoModal(
    "One for the group chat.",
    `<div class="share-card"><div class="brand"><img src="./mark.svg" alt=""/><span>streak.</span></div><span class="eyebrow">Somtee’s starting five</span><h3>Late bloomers.</h3><div class="mini-kits">${(ids.length ? ids : ["raya", "gabriel", "saka", "mbeumo", "haaland"]).map((id) => shirt(findPlayer(id), `share-${id}`)).join("")}</div><span class="chip green">Founders Season · MW 01</span><p style="margin-top:20px">Think you can pick a better five?</p></div><p style="margin-top:15px">Visual preview only. Public sharing will use an opt-in team snapshot after the round locks, never a private draft.</p>${btn("copy-share", "Copy preview invitation", "secondary full", 'style="margin-top:17px"')}`,
    "Share card · Sample",
  );
}
function openConnect(intent = null) {
  connectIntent = intent;
  if (state.connected) {
    location.hash = "#/wallet";
    return;
  }
  openModal(
    "connect",
    `${modalHead("Testnet predictions", "Bring your wallet.")}<div class="dialog-content"><p>Fantasy is free to explore without a wallet. Predictions use testnet CKB and a supported signing wallet.</p><div class="inline-status">${icon("info")}This preview simulates connection. It does not access a wallet extension or request a signature.</div>${btn("connect-demo", `${icon("wallet")}Connect demo wallet`, "full")}<div class="line"></div><h3>First time on CKB?</h3><p>The production flow will check wallet compatibility and explain testnet funding before you place a prediction.</p></div>`,
  );
}
function openSlip(fixtureId, side) {
  if (fixtureId) addPick(fixtureId, side);
  if (!slipPicks().length) return;
  const picks = slipPicks();
  openModal(
    "slip",
    `${modalHead("Your prediction slip · Simulated", "Make your calls.", `<button class="window-control window-control-minimize" data-action="minimize" aria-label="Minimize prediction slip" title="Minimize prediction slip"><span class="window-control-icon" aria-hidden="true">${icon("minus")}</span><span class="window-control-label">Minimize</span></button>`)}<div class="dialog-content slip-content"><div class="slip-summary"><span class="slip-count">${picks.length}</span><div><strong>${picks.length === 1 ? "One pick to start." : `${picks.length} picks. One payment.`}</strong><p>Every prediction settles independently.</p></div></div><div class="slip-picks">${picks.map(slipPickCard).join("")}</div>${btn("add-more-picks", `${icon("plus")}Add more matches`, "secondary full slip-add-more")}<div class="slip-footer"><div id="stake-breakdown"></div>${btn("review-prediction", state.connected ? `Review ${picks.length === 1 ? "prediction" : `${picks.length} predictions`} ${icon("arrow")}` : `Connect demo wallet ${icon("arrow")}`, "full")}<div id="stake-error" role="alert"></div><div class="picker-footer"><span>Testnet · No real funds</span><button class="text-link" data-action="discard-slip">Clear slip</button></div></div></div>`,
  );
  renderBreakdown();
  renderDock();
  warmSurface(dialog, { eager: true });
}
function addPick(fixtureId, side) {
  if (!fixtures.some((f) => f.id === fixtureId) || ![0, 1, 2].includes(side))
    return;
  state.slip ||= { picks: [], active: fixtureId };
  const existing = slipPicks().find((pick) => pick.fixture === fixtureId);
  if (existing) existing.side = side;
  else state.slip.picks.push({ fixture: fixtureId, side, amount: 100 });
  state.slip.active = fixtureId;
  persist();
}
function slipPickCard(pick, index) {
  const fixture = fixtures.find((f) => f.id === pick.fixture);
  const inputId = index === 0 ? "stake" : `stake-${pick.fixture}`;
  return `<article class="slip-pick" data-fixture="${pick.fixture}"><div class="slip-pick-head"><div><span class="eyebrow">Sample ${fixture.time}</span><strong>${fixture.home} vs ${fixture.away}</strong></div><button class="icon-btn" data-action="remove-pick" data-fixture="${pick.fixture}" aria-label="Remove ${fixture.home} vs ${fixture.away} from slip" title="Remove prediction">${icon("close")}</button></div><div class="slip-pick-choice">${crest(fixture.h, fixture.hc)}${crest(fixture.a, fixture.ac)}<span class="slip-choice-label">${outcomeLabel(pick)}</span></div><div class="slip-pick-stake"><div><label for="${inputId}" class="form-label">Your stake</label><div class="stake-input"><input id="${inputId}" data-input="stake" data-fixture="${pick.fixture}" type="number" min="100" max="4678" step="1" value="${esc(pick.amount)}" aria-label="Stake for ${fixture.home} vs ${fixture.away}" inputmode="numeric"/><span>tCKB</span></div></div><div class="presets">${[100, 200, 500].map((amount) => `<button data-action="stake-preset" data-fixture="${pick.fixture}" data-amount="${amount}" aria-label="Stake ${amount} tCKB on ${fixture.home} vs ${fixture.away}">${amount}</button>`).join("")}</div></div></article>`;
}
function renderBreakdown() {
  cancelWindowTransition();
  const totals = slipTotals();
  const el = document.querySelector("#stake-breakdown");
  if (el)
    el.innerHTML = `<div class="breakdown"><div class="spread"><span>Total stakes · ${totals.count} ${totals.count === 1 ? "pick" : "picks"}</span><strong data-total="principal">${money(totals.principal)} tCKB</strong></div><div class="spread"><span>Recoverable storage · ${totals.count} × ${receiptStorage}</span><strong data-total="storage">${money(totals.storage)} tCKB</strong></div><div class="spread"><span>Estimated network fee · one payment</span><strong data-total="fee">0.005 tCKB</strong></div><div class="spread total"><span>Total to pay</span><strong data-total="pay">${money(totals.total)} tCKB</strong></div></div><p class="slip-payment-note">Storage returns when each receipt is redeemed. Pool returns vary and are calculated separately for each pick.</p>`;
  if (el) {
    document.querySelector("#stake-error")?.replaceChildren();
    dialog
      .querySelectorAll('[aria-invalid="true"]')
      .forEach((input) => input.removeAttribute("aria-invalid"));
    warmSurface(dialog);
  }
  renderDock();
}
function renderDock() {
  syncPickedOutcomes();
  const totals = slipTotals();
  document.body.classList.toggle("has-dock", !!state.slip && modal !== "slip");
  dockHost.innerHTML =
    state.slip && modal !== "slip"
      ? `<button class="dock" data-action="restore-slip" aria-label="Restore prediction slip"><span class="dock-symbol">${icon("markets")}<span class="dock-count">${totals.count}</span></span><span><strong>${totals.count} ${totals.count === 1 ? "prediction" : "predictions"} in your slip</strong><small>${money(totals.principal)} tCKB staked · ${money(totals.total)} total</small></span>${icon("up")}</button>`
      : "";
}
async function minimize() {
  if (!dialog.open || modal !== "slip" || !state.slip) return;
  stopMotion();
  const transition = ++windowTransition;
  const version = modalVersion;
  const hash = location.hash;
  dialog.dataset.windowTransition = "minimize";
  dialog.style.animation = "none";
  pendingWindowGeometry = windowGeometry();
  const content = reducedMotion()
    ? null
    : captureSurface(dialog) || (await ensureSurface(dialog));
  // Closing, editing or navigating while the image is prepared cancels this
  // intent. An old async preparation must never hide a newer screen or draft.
  if (
    transition !== windowTransition ||
    version !== modalVersion ||
    hash !== location.hash ||
    !dialog.open ||
    modal !== "slip"
  )
    return;
  const source = dialog.getBoundingClientRect();
  closeModal(false);
  renderDock();
  const dock = dockHost.querySelector(".dock");
  const target = dockMouth(
    dock.querySelector(".dock-symbol").getBoundingClientRect(),
  );
  ticketGenie(source, target, content);
  dock.focus({ preventScroll: true });
  // The persistent dock is the acknowledgement; a toast would cover the neck.
}
async function restoreSlip() {
  if (!state.slip) return;
  const dock = dockHost.querySelector(".dock");
  const target = dock
    ? dockMouth(dock.querySelector(".dock-symbol").getBoundingClientRect())
    : null;
  openSlip();
  if (target && !reducedMotion()) {
    dialog.style.animation = "none";
    const transition = ++windowTransition;
    const version = modalVersion;
    const hash = location.hash;
    dialog.dataset.windowTransition = "restore";
    dialog.classList.add("genie-preparing");
    pendingWindowGeometry = windowGeometry();
    const content = captureSurface(dialog) || (await ensureSurface(dialog));
    if (
      transition !== windowTransition ||
      version !== modalVersion ||
      hash !== location.hash ||
      !dialog.open ||
      modal !== "slip"
    )
      return;
    dialog.classList.remove("genie-preparing");
    delete dialog.dataset.windowTransition;
    pendingWindowGeometry = undefined;
    ticketGenie(dialog.getBoundingClientRect(), target, content, {
      reverse: true,
      surface: dialog,
    });
  }
}
function reviewPrediction() {
  const picks = slipPicks();
  if (!picks.length) return;
  const totals = slipTotals();
  const invalid = picks.find(
    (pick) =>
      !Number.isFinite(Number(pick.amount)) ||
      !Number.isInteger(Number(pick.amount)) ||
      Number(pick.amount) < 100,
  );
  if (invalid || totals.total > sampleBalance) {
    const error = document.querySelector("#stake-error");
    error.className = "form-error";
    const fixture = invalid && fixtures.find((f) => f.id === invalid.fixture);
    error.textContent = invalid
      ? "Enter a whole-number stake of at least 100 tCKB for " +
        fixture.home +
        " vs " +
        fixture.away +
        "."
      : "Not enough sample balance. This slip needs " +
        money(totals.total) +
        " tCKB including storage and the network fee. Your demo wallet has " +
        money(sampleBalance) +
        " tCKB.";
    if (invalid) {
      const input = dialog.querySelector(
        'input[data-fixture="' + invalid.fixture + '"]',
      );
      input.setAttribute("aria-invalid", "true");
      input.focus({ preventScroll: false });
    }
    return;
  }
  if (!state.connected) {
    state.connected = true;
    persist();
    render();
    openSlip();
    notify("Demo wallet connected. No extension was accessed.");
    return;
  }
  const summary = picks
    .map((pick) => {
      const fixture = fixtures.find((f) => f.id === pick.fixture);
      return (
        '<div class="slip-review-row"><div><strong>' +
        outcomeLabel(pick) +
        "</strong><small>" +
        fixture.home +
        " vs " +
        fixture.away +
        "</small></div><strong>" +
        money(pick.amount) +
        " tCKB</strong></div>"
      );
    })
    .join("");
  openModal(
    "prediction-review",
    modalHead("One combined payment \u00b7 Simulated", "Before you sign.") +
      '<div class="dialog-content"><div class="slip-review-list">' +
      summary +
      '</div><div class="breakdown"><div class="spread"><span>Total stakes</span><strong>' +
      money(totals.principal) +
      ' tCKB</strong></div><div class="spread"><span>Recoverable storage \u00b7 ' +
      totals.count +
      " receipts</span><strong>" +
      money(totals.storage) +
      ' tCKB</strong></div><div class="spread"><span>Estimated network fee</span><strong>0.005 tCKB</strong></div><div class="spread total"><span>Total to pay</span><strong data-total="pay">' +
      money(totals.total) +
      ' tCKB</strong></div></div><div class="inline-status">' +
      icon("check") +
      'One payment. Each prediction settles independently, with its own claim or refund.</div><p>Winning profit depends on each final pool. The protocol takes 2% and the creator 1% of losing stakes. A void returns the principal and storage for that pick without market fees.</p><div class="small-notice">' +
      icon("clock") +
      'Every pick is checked before signing. If one market changes, the whole slip returns for review. No silent partial payment.</div><label for="sign-scenario" class="form-label">Review scenario</label><select id="sign-scenario" class="field"><option value="success">Simulate successful submission</option><option value="reject">Simulate wallet rejection</option><option value="conflict">Simulate shard conflict</option></select>' +
      btn(
        "sign-prediction",
        "Simulate combined payment",
        "full",
        'style="margin-top:20px"',
      ) +
      btn(
        "restore-slip",
        "Edit your slip",
        "secondary full",
        'style="margin-top:10px"',
      ) +
      "</div>",
  );
  renderDock();
}
async function signPrediction() {
  const scenario = document.querySelector("#sign-scenario")?.value;
  if (scenario !== "success") {
    openModal(
      "prediction-error",
      `${modalHead("Your draft is safe", scenario === "reject" ? "Signature declined." : "That shard just changed.")}<div class="dialog-content"><div class="inline-status error">${icon("info")}${scenario === "reject" ? "Nothing was submitted. All picks remain in your slip. Your wallet balance is unchanged in this simulation." : "Another sample prediction used this input. Refresh the affected pick and review the entire slip before signing again."}</div><p>${scenario === "reject" ? "You can return to your slip and try again when you are ready." : "Production retries must recheck the cutoff and amount. They must never reuse a stale signed transaction or silently double-submit."}</p>${btn("restore-slip", "Return to your slip", "secondary full", 'style="margin-top:20px"')}</div>`,
    );
    return;
  }
  if (!slipPicks().length) return;
  const picks = slipPicks().map((pick) => ({ ...pick }));
  const totals = slipTotals();
  const batchId = "sample-" + crypto.randomUUID();
  const epoch = previewEpoch;
  state.slip = null;
  persist();
  openModal(
    "prediction-pending",
    `${modalHead("Simulated chain submission", "Sending your predictions.")}<div class="dialog-content confirmation"><div class="loading-bars" aria-hidden="true"><i></i><i></i><i></i></div><p role="status">Waiting for the sample network response. Closing this surface does not cancel a submitted transaction.</p></div>`,
  );
  renderDock();
  const version = modalVersion;
  await new Promise((resolve) => setTimeout(resolve, 850));
  if (epoch !== previewEpoch) return;
  state.positions.push(
    ...picks.map((pick, index) => ({
      ...pick,
      id: batchId + "-" + index,
      batchId,
      batchCount: picks.length,
      batchTotal: totals.total,
    })),
  );
  persist();
  render();
  if (version !== modalVersion) {
    notify("Sample submission recorded in My activity.");
    return;
  }
  openModal(
    "prediction-success",
    `${modalHead("Simulation complete", "Your calls are on their way.")}<div class="dialog-content confirmation"><div class="success-symbol">${icon("check")}</div><h3>Submitted. Next: admission.</h3><p>${picks.length} ${picks.length === 1 ? "prediction was" : "predictions were"} submitted in one sample payment of ${money(totals.total)} tCKB. Each settles independently. Chain inclusion and cutoff checks still determine admission.</p>${btn("view-activity", "View your activity", "mint full")}<p class="tagline">No CKB was moved. No real transaction hash was created.</p></div>`,
  );
  renderDock();
}
function claimReview(refund = false) {
  if (!state.connected) {
    openConnect(refund ? "refund" : "claim");
    return;
  }
  const amount = refund ? 421 : 469.5;
  openModal(
    refund ? "refund" : "claim",
    `${modalHead(refund ? "Voided market · Sample" : "Winning claim · Sample", refund ? "Your stake comes home." : "A good call, settled.")}<div class="dialog-content"><div class="breakdown"><div class="spread"><span>Original principal</span><strong>100 tCKB</strong></div>${refund ? "" : `<div class="spread"><span>Share of profit, after market fees</span><strong>48.5 tCKB</strong></div>`}<div class="spread"><span>Returned receipt storage</span><strong>321 tCKB</strong></div><div class="spread total"><span>Claim output</span><strong>${amount} tCKB</strong></div></div><p>${refund ? "The sample market was voided after the result deadline. No market fees are taken." : "The claim cell is consumed once and pays its pinned owner. Other users do not need to claim first."} Your wallet pays the network fee separately.</p>${btn(refund ? "confirm-refund" : "confirm-claim", "Simulate claim signature", "mint full", 'style="margin-top:24px"')}<div class="small-notice">${icon("shield")}Demonstration only. This does not sign or broadcast a transaction.</div></div>`,
  );
}
function receipt(refund = false) {
  infoModal(
    "Every part, accounted for.",
    `<div class="chip green">${refund ? (state.refunded ? "Refunded" : "Refund ready") : state.claimed ? "Claimed" : "Claim ready"} · Simulated</div><div class="breakdown"><div class="spread"><span>Market</span><strong>${refund ? "Villa vs Tottenham" : "Arsenal vs Chelsea"}</strong></div><div class="spread"><span>Principal</span><strong>100 tCKB</strong></div><div class="spread"><span>${refund ? "Refund" : "Payout after market fees"}</span><strong>${refund ? "100" : "148.5"} tCKB</strong></div><div class="spread"><span>Returned storage</span><strong>321 tCKB</strong></div><div class="spread total"><span>Claim output</span><strong>${refund ? "421" : "469.5"} tCKB</strong></div></div><div class="receipt-code"><strong>Illustrative receipt · No transaction hash</strong>Production receipts will identify the protocol version, market outpoint, settlement transaction and claim transaction, with explorer links.</div><p>Existing custodial settlement anchors will retain their own label. A hash anchor and a contract-enforced payout must never look interchangeable.</p>`,
    "Receipt · Preview",
  );
}
function search() {
  infoModal(
    "Find your next fixture.",
    `<div class="search-field">${icon("search")}<input class="field" data-input="fixture-search" placeholder="Search a club" aria-label="Search fixtures" autofocus/></div><div id="fixture-results">${fixtures.map((f) => `<a class="info-row" href="#/market/${f.id}">${crest(f.h, f.hc)}<div><strong>${f.home} vs ${f.away}</strong><small>${f.time}</small></div>${icon("chevron")}</a>`).join("")}</div>`,
    "Search · Sample fixtures",
  );
}
const actions = {
  "dismiss-toast": () => {
    clearTimeout(toastTimer);
    toastHost.replaceChildren();
  },
  "close-modal": () => closeModal(),
  "player-slot": (el) => openPicker(Number(el.dataset.index)),
  "choose-player": (el) => {
    const error = selectionError(state.draft, pickerIndex, el.dataset.id);
    if (error) {
      notify(error);
      return;
    }
    const old = state.draft[pickerIndex];
    state.draft[pickerIndex] = el.dataset.id;
    if (state.captain === old) state.captain = null;
    state.submitted = false;
    persist();
    closeModal(false);
    render();
    document
      .querySelector(`.slot-${pickerIndex}`)
      ?.focus({ preventScroll: true });
    notify(`${findPlayer(el.dataset.id).name} joins your five.`);
  },
  "remove-player": () => {
    const old = state.draft[pickerIndex];
    state.draft[pickerIndex] = null;
    if (state.captain === old) state.captain = null;
    state.submitted = false;
    persist();
    closeModal(false);
    render();
  },
  captain: (el) => {
    if (state.fiveScenario === "locked") return;
    state.captain = el.dataset.id;
    state.submitted = false;
    persist();
    render();
    document
      .querySelector(`[data-action="captain"][data-id="${el.dataset.id}"]`)
      ?.focus({ preventScroll: true });
    notify(`${findPlayer(state.captain).name} gets the armband.`);
  },
  autofill: () => {
    if (state.fiveScenario === "locked") return;
    state.draft = ["raya", "gabriel", "saka", "mbeumo", "haaland"];
    state.captain = "haaland";
    state.submitted = false;
    persist();
    render();
    notify("A suggested five. Swap anyone to make it yours.");
  },
  "submit-five": () => {
    if (state.fiveScenario !== "locked") reviewTeam();
  },
  "confirm-team": teamSuccess,
  "view-team": () => {
    closeModal(false);
    state.fiveTab = "team";
    render(true);
  },
  "share-team": openShare,
  "five-tab": (el) => {
    state.fiveTab = el.dataset.value;
    render();
  },
  "market-filter": (el) => {
    state.marketFilter = el.dataset.value;
    render();
  },
  "match-tab": (el) => {
    state.matchTab = el.dataset.value;
    render();
  },
  "club-tab": (el) => {
    state.clubTab = el.dataset.value;
    render();
  },
  "activity-tab": (el) => {
    state.activityTab = el.dataset.value;
    render();
  },
  connect: () => openConnect(),
  "connect-demo": () => {
    const intent = connectIntent;
    connectIntent = null;
    state.connected = true;
    persist();
    closeModal(false);
    render();
    if (intent === "claim" || intent === "refund")
      claimReview(intent === "refund");
    notify("Demo wallet connected. No wallet extension was accessed.");
  },
  disconnect: () => {
    state.connected = false;
    persist();
    render();
    notify("Demo wallet disconnected. Your fantasy draft is still here.");
  },
  pick: (el) => {
    stopMotion();
    const fixtureId = el.dataset.fixture;
    const side = Number(el.dataset.side);
    const existing = slipPicks().find((pick) => pick.fixture === fixtureId);
    const open = !slipPicks().length || existing?.side === side;
    addPick(fixtureId, side);
    if (open) openSlip();
    else {
      renderDock();
      notify(
        existing
          ? "Prediction updated. Your stake is unchanged."
          : `${slipPicks().length} picks in your slip. Keep picking or review your total.`,
      );
    }
  },
  "stake-preset": (el) => {
    const pick = slipPicks().find(
      (pick) => pick.fixture === el.dataset.fixture,
    );
    if (!pick) return;
    pick.amount = Number(el.dataset.amount);
    persist();
    dialog.querySelector(`input[data-fixture="${pick.fixture}"]`).value =
      pick.amount;
    renderBreakdown();
  },
  "add-more-picks": () => {
    closeModal(false);
    if (route().name !== "markets") location.hash = "#/markets";
    else
      document
        .querySelector('[data-action="pick"]:not(.is-picked)')
        ?.focus({ preventScroll: false });
  },
  "remove-pick": (el) => {
    if (!state.slip) return;
    state.slip.picks = slipPicks().filter(
      (pick) => pick.fixture !== el.dataset.fixture,
    );
    if (!state.slip.picks.length) state.slip = null;
    else if (
      !state.slip.picks.some((pick) => pick.fixture === state.slip.active)
    )
      state.slip.active = state.slip.picks[0].fixture;
    persist();
    if (state.slip) openSlip();
    else {
      closeModal();
      notify("Your slip is clear. Pick a match to start again.");
    }
    renderDock();
  },
  minimize: minimize,
  "restore-slip": restoreSlip,
  "discard-slip": () => {
    state.slip = null;
    persist();
    closeModal();
    notify("Prediction slip discarded.");
  },
  "review-prediction": reviewPrediction,
  "sign-prediction": signPrediction,
  "view-activity": () => {
    closeModal(false);
    location.hash = "#/activity";
  },
  claim: () => claimReview(false),
  refund: () => claimReview(true),
  "confirm-claim": () => {
    state.claimed = true;
    persist();
    closeModal(false);
    render(true);
    notify("Sample claim complete. 469.5 tCKB includes returned storage.");
  },
  "confirm-refund": () => {
    state.refunded = true;
    persist();
    closeModal(false);
    render(true);
    notify("Sample refund complete. Principal and storage returned.");
  },
  receipt: () => receipt(false),
  "refund-receipt": () => receipt(true),
  "toggle-motion": () => {
    state.reduced = !state.reduced;
    document.documentElement.dataset.reduced = String(state.reduced);
    stopMotion();
    persist();
    render();
    document
      .querySelector('[data-action="toggle-motion"]')
      ?.focus({ preventScroll: true });
  },
  "join-crew": () => {
    state.joined = true;
    persist();
    render();
    notify("You joined The Sunday XI in this preview.");
  },
  search: search,
  "copy-share": async () => {
    const text =
      "Pick your five for the weekend. Streak Five is a free fantasy concept in design review. This is a preview invitation, not a live competition.";
    try {
      await navigator.clipboard.writeText(text);
      notify("Preview invitation copied.");
    } catch {
      infoModal("Your preview invitation.", `<p>${text}</p>`);
    }
  },
  reset: () =>
    infoModal(
      "Start with a clean sheet?",
      `<p>This clears only this design preview’s local team, wallet simulation and activity. It does not affect the Streak application.</p>${btn("confirm-reset", "Reset preview", "secondary full", 'style="margin-top:22px"')}`,
    ),
  "confirm-reset": () => {
    previewEpoch++;
    Object.assign(state, structuredClone(defaults));
    state.fiveTab = "team";
    state.fiveScenario = "draft";
    state.clubTab = "leaderboard";
    state.activityTab = "positions";
    state.marketFilter = "all";
    state.feed = "live";
    state.matchTab = "timeline";
    document.documentElement.dataset.reduced = "false";
    persist();
    closeModal(false);
    location.hash = "#/home";
    render();
    notify("Preview reset. A fresh matchday.");
  },
  "how-five": () =>
    infoModal(
      "A little team. A whole weekend.",
      `<ol class="help-list"><li>Choose five players within a 40-credit budget.</li><li>Pick a captain. Their points count twice.</li><li>Review your team before the round locks.</li><li>Follow provisional points, then final standings.</li></ol><p>No betting or wallet connection is required for fantasy. Production entry will need an account.</p><a class="btn mint full" style="margin-top:22px" href="#/five">Build your five ${icon("arrow")}</a>`,
    ),
  "market-rules": () =>
    infoModal(
      "Know your prediction.",
      `<ul class="help-list"><li>Home, draw or away after regulation time and stoppage time. Proposed fixture rules must be pinned before staking.</li><li>Minimum stake: 100 testnet CKB. Recoverable receipt storage: 321 CKB. Network fees are separate.</li><li>Winners share losing stakes proportionally after 2% protocol and 1% creator fees on losing stakes.</li><li>The backend oracle reports the result. It remains a trusted source, not a decentralized truth mechanism.</li><li>Six hours after scheduled kickoff, an unresolved market may be voided. Accepted stakes and storage return without market fees.</li><li>Shares exist as non-transferable claim positions after closure in the current prototype. An included deposit can still be rejected for a late cutoff.</li></ul><p>These are proposed UI disclosures around the Week 20 prototype. Real-world fixture binding and app integration remain implementation work.</p>`,
    ),
  schedule: () =>
    infoModal(
      "A weekend at a glance.",
      `<p>Illustrative schedule, not a current fixture listing.</p><div class="info-list">${fixtures.map((f) => `<a class="info-row" href="#/market/${f.id}">${icon("activity")}<div><strong>${f.home} vs ${f.away}</strong><small>${f.time} · sample fixture</small></div>${icon("chevron")}</a>`).join("")}</div>`,
    ),
  notifications: () =>
    infoModal(
      "A little heads-up.",
      `<div class="info-list"><div class="info-row">${icon("five")}<div><strong>Your five are waiting.</strong><small>Finish your sample squad before the round locks.</small></div></div><div class="info-row">${icon("wallet")}<div><strong>A sample claim is ready.</strong><small>Open My activity to review principal, profit and storage.</small></div></div></div><p style="margin-top:18px">No notifications are sent by this preview.</p>`,
    ),
  fund: () =>
    infoModal(
      "A little testnet fuel.",
      `<p>In the live product, this step will check your balance and guide you to the official faucet. The preview uses a fixed sample balance of 5,000 tCKB.</p><div class="inline-status">${icon("info")}We do not request faucet funds or change any balance here.</div><h3>Before your first prediction</h3><p>Allow for at least 100 tCKB principal, 321 tCKB recoverable storage and the network fee.</p>`,
    ),
  legacy: () =>
    infoModal(
      "Your original account stays reachable.",
      `<p>The current Streak application uses a custodial ledger. The proposed new prediction flow deposits directly into market cells.</p><div class="rule-note">Legacy balances, pending withdrawals and old receipts must be reconciled and remain recoverable during migration. No automatic conversion is proposed.</div><p>This is a design placeholder for the recovery area, not a live balance or withdrawal form.</p>`,
    ),
  invite: () =>
    infoModal(
      "Save them a spot.",
      `<p>A proposed private league invitation:</p><div class="receipt-code"><strong>The Sunday XI</strong>Five players. A captain. Bragging rights.<br/>Join our weekly fantasy league when Streak Five opens.</div><p>This preview does not generate a live invitation link or send messages.</p>`,
    ),
  reminders: () =>
    infoModal(
      "Only the useful nudges.",
      `<p>Proposed reminders: a round closing soon, a claim ready, and your final fantasy result. Each will be opt-in and independently switchable.</p><div class="inline-status">${icon("bell")}No email, Telegram or browser permission is requested in this preview.</div>`,
    ),
};
document.addEventListener("click", (e) => {
  if (e.target.closest(".skip")) {
    e.preventDefault();
    document.querySelector("#main h1")?.focus({ preventScroll: false });
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const action = actions[el.dataset.action];
  if (action) action(el);
});
document.addEventListener("input", (e) => {
  const type = e.target.dataset.input;
  if (type === "player-search") renderPlayers(e.target.value);
  if (type === "stake") {
    const pick = slipPicks().find(
      (pick) => pick.fixture === e.target.dataset.fixture,
    );
    if (!pick) return;
    pick.amount = e.target.value;
    persist();
    renderBreakdown();
  }
  if (type === "fixture-search") {
    const q = e.target.value.toLowerCase();
    const found = fixtures.filter((f) =>
      `${f.home} ${f.away}`.toLowerCase().includes(q),
    );
    document.querySelector("#fixture-results").innerHTML = found.length
      ? found
          .map(
            (f) =>
              `<a class="info-row" href="#/market/${f.id}">${crest(f.h, f.hc)}<div><strong>${f.home} vs ${f.away}</strong><small>${f.time}</small></div>${icon("chevron")}</a>`,
          )
          .join("")
      : "<p>No sample fixtures match that search.</p>";
  }
});
document.addEventListener("change", (e) => {
  const type = e.target.dataset.change;
  if (type === "five-scenario") {
    state.fiveScenario = e.target.value;
    render();
  }
  if (type === "feed") {
    state.feed = e.target.value;
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !dialog.open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    search();
  }
});
window.addEventListener("hashchange", () => {
  stopMotion();
  if (dialog.open) closeModal(false);
  render(true);
  window.scrollTo({ top: 0, behavior: "instant" });
});
const refreshSlipSurface = () => {
  if (
    dialog.dataset.windowTransition &&
    pendingWindowGeometry !== windowGeometry()
  )
    cancelWindowTransition();
  if (dialog.open && modal === "slip") warmSurface(dialog);
};
dialog.addEventListener("scroll", refreshSlipSurface, { passive: true });
window.addEventListener("resize", refreshSlipSurface, { passive: true });
window.visualViewport?.addEventListener("resize", refreshSlipSurface, {
  passive: true,
});
for (const event of ["pointerdown", "keydown"]) {
  document.addEventListener(
    event,
    () => {
      if (dialog.dataset.windowTransition) cancelWindowTransition();
    },
    { capture: true, passive: true },
  );
}
render();
