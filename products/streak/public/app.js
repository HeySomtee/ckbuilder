/**
 * STREAK TERMINAL — single-page client.
 *
 * Vanilla ES modules, no framework. A hash router swaps views into the main
 * content area; the persistent shell (status bar, ticker tape, left rail,
 * footer) is rendered once and updated in place.
 *
 * Data comes from the JSON API in src/server.ts.
 */

// ───────────────────────────────────────────────────────────── helpers ─────

const $ = (sel, root = document) => root.querySelector(sel);
const root = $("#app");
const overlay = $("#overlay");
const toasts = $("#toasts");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function fmtNum(n, frac = 2) {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 10_000) return (v / 1_000).toFixed(1) + "k";
  return v.toFixed(frac);
}
function fmtCkb(s) {
  if (s === "—" || s === undefined || s === null) return "—";
  return fmtNum(s, Math.abs(Number(s)) < 1 ? 4 : 2);
}
function fmtInt(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}
function fmtPct(p) {
  if (p === null || p === undefined) return "—";
  return (Number(p) * 100).toFixed(1) + "%";
}
function fmtOdds(p) {
  if (!p || Number(p) === 0) return "∞";
  return (1 / Number(p)).toFixed(2);
}
function fmtPnl(s) {
  if (s === "—" || s === undefined || s === null) return "—";
  const n = Number(s);
  const sign = n > 0 ? "+" : "";
  return sign + fmtNum(n, Math.abs(n) < 1 ? 4 : 2);
}
function pnlClass(s) {
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return "dim";
  return n > 0 ? "up" : "down";
}
function shortAddr(a) {
  if (!a) return "—";
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function timeUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "0m";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ─────────────────────────────────────────────────────────────── API ──────

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─────────────────────────────────────────────────────── app-wide state ────

const state = {
  user: null,
  dashboard: null,
  liveStatus: null,
  pollTimer: null,
  clockTimer: null,
  route: null,
};

function isAuthed() { return !!state.user; }

// ───────────────────────────────────────────────────────────── toasts ──────

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${kind === "ok" ? "✓" : kind === "err" ? "✕" : "›"}</span><span>${esc(msg)}</span>`;
  toasts.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms";
    setTimeout(() => el.remove(), 220);
  }, 3500);
}

// ───────────────────────────────────────────────────────────── modals ──────

function openModal(html) {
  overlay.innerHTML = html;
  overlay.classList.add("on");
  overlay.setAttribute("aria-hidden", "false");
  const closer = overlay.querySelector("[data-close]");
  if (closer) closer.onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}
function closeModal() {
  overlay.classList.remove("on");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = "";
  overlay.onclick = null;
}

// ──────────────────────────────────────────────────────────── routing ──────

const routes = {
  "": renderDashboard,
  "dashboard": renderDashboard,
  "markets": renderMarkets,
  "market": renderMarketDetail,       // #market/<id>
  "streak": renderStreak,
  "portfolio": renderPortfolio,
  "wallet": renderWallet,
  "leaderboard": renderLeaderboard,
  "crews": renderCrews,
  "fixtures": renderFixtures,
  "receipts": renderReceipts,         // gallery of published receipts
  "receipt": renderReceiptPublic,     // #receipt/<marketId>  (unauthenticated shareable page)
};

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  return { name: h[0] || "", params: h.slice(1) };
}

async function navigate() {
  closeMobileNav();
  const r = parseRoute();
  state.route = r;
  // Public shareable receipt page — no auth required.
  if (r.name === "receipt") {
    teardownShell();
    try { await renderReceiptPublic(r); }
    catch (err) { console.error(err); root.innerHTML = `<div class="public-shell"><div class="public-card"><h1>Receipt not available</h1><p class="dim mono">${esc(err.message)}</p></div></div>`; }
    return;
  }
  if (!isAuthed()) {
    return renderAuth(r);
  }
  // Stop any polling armed by the previous view; the incoming view re-arms it
  // via startPolling() if it needs live refresh. Without this, e.g. the
  // dashboard's poll keeps re-rendering Overview on top of other pages.
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  renderShell();
  const view = routes[r.name] || routes["dashboard"];
  try {
    await view(r);
  } catch (err) {
    console.error(err);
    toast(err.message, "err");
  }
  highlightNav(r.name || "dashboard");
}

window.addEventListener("hashchange", () => navigate());

// ──────────────────────────────────────────── shell (status, tape, rail) ───

function renderShell() {
  if (root.dataset.shell === "1") return; // already mounted
  root.innerHTML = `
    <div class="shell">
      <header class="status-bar" id="status-bar"></header>
      <div class="tape" id="tape">
        <div class="tape-label">FLOW</div>
        <div class="tape-track" id="tape-track">—</div>
      </div>
      <aside class="rail" id="rail">${navHtml()}</aside>
      <main class="main"><div class="view" id="view">${spinner()}</div></main>
      <footer class="foot" id="foot"></footer>
      <div class="mobile-nav-drawer" id="mobile-nav-drawer" aria-hidden="true"></div>
    </div>
  `;
  root.dataset.shell = "1";
  updateStatusBar();
  updateFootBar();
  bindNav();
}

function navHtml() {
  return `
    <div class="rail-section">Terminal</div>
    <a data-route="dashboard"><span class="icon">${icon("dash")}</span>Overview</a>
    <a data-route="markets"><span class="icon">${icon("mkt")}</span>Markets</a>
    <a data-route="fixtures"><span class="icon">${icon("cal")}</span>Schedule</a>
    <a data-route="receipts"><span class="icon">${icon("rc")}</span>Receipts</a>
    <div class="rail-section">Account</div>
    <a data-route="portfolio"><span class="icon">${icon("pf")}</span>Portfolio</a>
    <a data-route="streak"><span class="icon">${icon("st")}</span>Streak</a>
    <a data-route="crews"><span class="icon">${icon("crew")}</span>Crews</a>
    <a data-route="wallet"><span class="icon">${icon("wl")}</span>Account</a>
    <a data-route="leaderboard"><span class="icon">${icon("lb")}</span>Leaderboard</a>
    <div class="rail-foot">
      <span class="label">Signed in</span> 
      <span class="mono">${esc(state.user?.username ?? "—")}</span> <br /> <br />
      <span class="label" style="margin-top:6px">Wallet</span>
      <span class="mono" title="${esc(state.user?.walletAddress ?? "")}">${shortAddr(state.user?.walletAddress)}</span> <br /> <br />
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" id="signout">Sign out</button>
    </div>
  `;
}

function icon(k) {
  const paths = {
    dash: '<rect x="2" y="2" width="5" height="5" stroke="currentColor" fill="none"/><rect x="9" y="2" width="5" height="5" stroke="currentColor" fill="none"/><rect x="2" y="9" width="5" height="5" stroke="currentColor" fill="none"/><rect x="9" y="9" width="5" height="5" stroke="currentColor" fill="none"/>',
    mkt: '<polyline points="2,12 5,8 9,10 14,3" stroke="currentColor" fill="none" stroke-linejoin="round"/>',
    cal: '<rect x="2" y="3" width="12" height="11" stroke="currentColor" fill="none"/><line x1="2" y1="6" x2="14" y2="6" stroke="currentColor"/>',
    pf: '<rect x="2" y="5" width="12" height="9" stroke="currentColor" fill="none"/><polyline points="5,5 5,2 11,2 11,5" stroke="currentColor" fill="none"/>',
    st: '<polygon points="8,2 10,7 15,7 11,10 13,15 8,12 3,15 5,10 1,7 6,7" stroke="currentColor" fill="none"/>',
    wl: '<rect x="2" y="4" width="12" height="9" stroke="currentColor" fill="none"/><circle cx="11" cy="8.5" r="1" fill="currentColor"/>',
    lb: '<line x1="3" y1="13" x2="3" y2="8" stroke="currentColor"/><line x1="8" y1="13" x2="8" y2="3" stroke="currentColor"/><line x1="13" y1="13" x2="13" y2="6" stroke="currentColor"/>',
    rc: '<rect x="3" y="2" width="10" height="12" stroke="currentColor" fill="none"/><line x1="5" y1="5" x2="11" y2="5" stroke="currentColor"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor"/><line x1="5" y1="11" x2="9" y2="11" stroke="currentColor"/>',
    crew: '<circle cx="5.5" cy="6" r="2" stroke="currentColor" fill="none"/><circle cx="11" cy="6" r="1.6" stroke="currentColor" fill="none"/><path d="M2 13c0-2 1.5-3 3.5-3s3.5 1 3.5 3" stroke="currentColor" fill="none"/><path d="M9.5 12c.2-1.6 1.4-2.4 2.8-2.2" stroke="currentColor" fill="none"/>',
  };
  return `<svg viewBox="0 0 16 16" width="14" height="14" stroke-width="1.4">${paths[k] || ""}</svg>`;
}

function bindNav() {
  const drawer = $("#mobile-nav-drawer");
  if (drawer && !drawer.dataset.ready) {
    drawer.innerHTML = `<div class="mobile-nav-panel">${navHtml()}</div>`;
    drawer.dataset.ready = "1";
  }
  ensureNavDelegation();
}

// Nav elements live inside containers that re-render (the status bar rewrites
// its innerHTML every second, wiping the hamburger's handler). So delegate all
// nav interaction from document — attached once — instead of binding elements
// directly. This survives every re-render.
let navDelegated = false;
function ensureNavDelegation() {
  if (navDelegated) return;
  navDelegated = true;

  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    // Hamburger toggle
    if (t.closest("#mobile-nav-toggle")) {
      e.preventDefault();
      toggleMobileNav();
      return;
    }

    // Sign out
    if (t.closest("#signout")) {
      e.preventDefault();
      closeMobileNav();
      try { await api("/logout", { method: "POST" }); } catch {}
      state.user = null;
      location.hash = "";
      teardownShell();
      navigate();
      return;
    }

    // Route links (rail + drawer)
    const link = t.closest("a[data-route]");
    if (link) {
      e.preventDefault();
      closeMobileNav();
      location.hash = `#/${link.dataset.route}`;
      return;
    }

    // Backdrop click closes the drawer
    const drawer = $("#mobile-nav-drawer");
    if (drawer && t === drawer) closeMobileNav();
  });
}

function toggleMobileNav() {
  const drawer = $("#mobile-nav-drawer");
  if (!drawer) return;
  const open = drawer.classList.toggle("on");
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
}

function closeMobileNav() {
  const drawer = $("#mobile-nav-drawer");
  if (!drawer) return;
  drawer.classList.remove("on");
  drawer.setAttribute("aria-hidden", "true");
}

function teardownShell() {
  root.innerHTML = "";
  delete root.dataset.shell;
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
}

function highlightNav(name) {
  const rail = $("#rail");
  if (!rail) return;
  rail.querySelectorAll("a[data-route]").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === name || (name === "dashboard" && a.dataset.route === "dashboard"));
  });
}

function updateStatusBar() {
  const bar = $("#status-bar");
  if (!bar) return;
  const live = state.liveStatus;
  const liveDot = live?.simulated
    ? `<span class="pulse sim"></span><span class="amber">SIM</span>`
    : live?.enabled
      ? `<span class="pulse"></span><span class="up">LIVE</span>`
      : `<span class="pulse off"></span><span class="dim">SIM</span>`;
  const liveText = live
    ? `${esc(live.league || live.base.replace(/^https?:\/\//, ""))} · ${live.matchCount} fx · ${live.liveMatches} live · ${live.finishedMatches} final`
    : `connecting…`;
  const u = state.user;
  bar.innerHTML = `
    <button class="mobile-nav-btn" id="mobile-nav-toggle" aria-label="Open navigation">☰</button>
    <span class="brand">STREAK · TERM</span>
    <span class="sep">|</span>
    <span>CKB · PUDGE</span>
    <span class="sep">|</span>
    ${liveDot}
    <span class="dim" style="font-size:10px">${liveText}</span>
    <span class="right">
      <span>BAL <span class="amber mono-num">${fmtCkb(u?.escrowCkb)}</span></span>
      <span>WALLET <span class="mono-num">${fmtCkb(state.dashboard?.walletBalanceCkb)}</span></span>
      <span>STREAK <span class="amber mono-num">${u?.streak.current ?? 0}</span></span>
      <span class="dim">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
    </span>
  `;
}

function updateFootBar() {
  const f = $("#foot");
  if (!f) return;
  const c = state.dashboard?.counts;
  f.innerHTML = `
    <span>POOL <span class="mono-num amber">${fmtCkb(c?.totalPoolCkb)}</span> CKB</span>
    <span class="sep">|</span>
    <span>MKT OPEN <span class="mono-num up">${fmtInt(c?.openMarkets)}</span></span>
    <span>CLOSED <span class="mono-num neutral">${fmtInt(c?.closedMarkets)}</span></span>
    <span>RESOLVED <span class="mono-num dim">${fmtInt(c?.resolvedMarkets)}</span></span>
    <span class="right">v1.0 · parimutuel · 2% protocol / 1% creator</span>
  `;
}

function spinner() {
  return `<div style="padding:60px;text-align:center;color:var(--ink-2);font-family:var(--mono);font-size:11px;letter-spacing:0.14em">LOADING…</div>`;
}

function spinnerInline() {
  return `<span class="dim mono" style="font-size:10px;letter-spacing:0.14em">CHECKING…</span>`;
}

// ─────────────────────────────────────────────────────────── tape feed ─────

function renderTape() {
  const t = $("#tape-track");
  if (!t) return;
  const bets = state.dashboard?.recentBets ?? [];
  if (!bets.length) {
    t.innerHTML = `<span class="dim">No bets yet — open a market on Markets ›</span>`;
    return;
  }
  // Duplicate so the marquee loop is seamless.
  const items = (bets.concat(bets)).map((b) => `
    <span class="tape-item">
      <span class="t-mkt">${esc(b.matchLabel)}</span>
      <span class="t-side ${b.outcome}">${b.outcome.toUpperCase()}</span>
      <span class="t-amt">${fmtCkb(b.amountCkb)}</span>
      <span class="t-user">@${esc(b.user)}</span>
    </span>
  `).join("");
  t.innerHTML = items;
}

// ────────────────────────────────────────────────── inline SVG: spark ──────

function sparkSvg(ticks, w = 80, h = 22) {
  if (!ticks || ticks.length < 2) {
    return `<svg class="spark" width="${w}" height="${h}"><line x1="0" y1="${h - 1}" x2="${w}" y2="${h - 1}" class="axis"/></svg>`;
  }
  // Plot the implied prob of the leading outcome.
  const last = ticks[ticks.length - 1].p;
  const lead = Object.entries(last).reduce((a, b) => (b[1] > a[1] ? b : a), ["home", 0])[0];
  const pts = ticks.map((t, i) => {
    const x = (i / (ticks.length - 1)) * (w - 2) + 1;
    const y = h - 1 - (t.p[lead] || 0) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const stroke = lead === "home" ? "var(--up)" : lead === "away" ? "var(--down)" : "var(--neutral)";
  return `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" style="stroke:${stroke}"/></svg>`;
}

// ────────────────────────────────────────────────── inline SVG: chart ──────

function chartSvg(ticks, w = 720, h = 260) {
  if (!ticks || ticks.length < 2) {
    return `<div class="chart chart-empty">No price history yet — be the first to place a bet</div>`;
  }
  const pad = { l: 36, r: 12, t: 18, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const t0 = ticks[0].t, t1 = ticks[ticks.length - 1].t;
  const span = Math.max(1, t1 - t0);

  function path(outcome) {
    return ticks
      .map((tt, i) => {
        const x = pad.l + ((tt.t - t0) / span) * iw;
        const y = pad.t + (1 - (tt.p[outcome] || 0)) * ih;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }
  function area(outcome) {
    const top = ticks
      .map((tt, i) => {
        const x = pad.l + ((tt.t - t0) / span) * iw;
        const y = pad.t + (1 - (tt.p[outcome] || 0)) * ih;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `${top} L${(pad.l + iw).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l.toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  }

  const ylabels = [0, 0.25, 0.5, 0.75, 1].map((y) => {
    const py = pad.t + (1 - y) * ih;
    return `
      <line class="grid x" x1="${pad.l}" y1="${py.toFixed(1)}" x2="${(pad.l + iw).toFixed(1)}" y2="${py.toFixed(1)}"/>
      <text class="axis-label" x="${pad.l - 6}" y="${(py + 3).toFixed(1)}" text-anchor="end">${(y * 100).toFixed(0)}%</text>
    `;
  }).join("");

  const xlabels = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const px = pad.l + p * iw;
    const lbl = new Date(t0 + p * span).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `<text class="axis-label" x="${px.toFixed(1)}" y="${(pad.t + ih + 14).toFixed(1)}" text-anchor="middle">${lbl}</text>`;
  }).join("");

  return `
    <svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
      ${ylabels}
      ${xlabels}
      <path class="area home" d="${area("home")}"/>
      <path class="area away" d="${area("away")}"/>
      <path class="area draw" d="${area("draw")}"/>
      <path class="line home" d="${path("home")}"/>
      <path class="line away" d="${path("away")}"/>
      <path class="line draw" d="${path("draw")}"/>
      <g class="legend" font-family="var(--mono)" font-size="10" transform="translate(${pad.l + 4}, ${pad.t + 4})">
        <rect width="10" height="10" fill="var(--up)"/><text x="14" y="9" fill="var(--ink-1)">HOME</text>
        <rect width="10" height="10" fill="var(--neutral)" x="64"/><text x="78" y="9" fill="var(--ink-1)">DRAW</text>
        <rect width="10" height="10" fill="var(--down)" x="128"/><text x="142" y="9" fill="var(--ink-1)">AWAY</text>
      </g>
    </svg>
  `;
}

// ──────────────────────────────────────────────────────────── views ────────

async function renderDashboard() {
  await refreshDashboard(true);
  const d = state.dashboard;
  const view = $("#view");
  const u = state.user;
  const headline = d?.headline;

  view.innerHTML = `
    <div class="page-h">
      <h1>Overview</h1>
      <span class="sub">${new Date().toUTCString().slice(0, 22)} UTC</span>
      <div class="right">
        <span class="chip">${u?.streak.status === "failed" ? "STREAK · FAILED" : "STREAK · " + (u?.streak.current ?? 0)}</span>
        <a class="btn btn-amber" href="#/markets">Browse markets ›</a>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="l">Net P&L</span><span class="v ${pnlClass(u?.stats.netPnlShannons)}">${fmtPnl(Number(u?.stats.netPnlShannons || 0) / 1e8)}</span><span class="d dim">CKB realised</span></div>
      <div class="kpi"><span class="l">Win Rate</span><span class="v">${u?.winRate ?? 0}%</span><span class="d dim">${u?.stats.wonBets}W / ${u?.stats.lostBets}L</span></div>
      <div class="kpi"><span class="l">Streak</span><span class="v amber">${u?.streak.current ?? 0}</span><span class="d dim">best ${u?.streak.best ?? 0}</span></div>
      <div class="kpi"><span class="l">Escrow</span><span class="v">${fmtCkb(u?.escrowCkb)}</span><span class="d dim">on platform</span></div>
      <div class="kpi"><span class="l">Wallet</span><span class="v">${fmtCkb(d?.walletBalanceCkb)}</span><span class="d dim">on-chain</span></div>
      <div class="kpi"><span class="l">Rank</span><span class="v">#${u?.rank ?? "—"}</span><span class="d dim">leaderboard</span></div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-h">
          <span class="title">Headline Market</span>
          <span class="meta">${headline ? `${esc(headline.match.stage)} · closes ${timeUntil(headline.closesAt)}` : "—"}</span>
        </div>
        <div class="panel-b">${headline ? headlineCard(headline) : `<div class="dim mono" style="text-align:center;padding:30px;font-size:11px;letter-spacing:0.14em">NO OPEN MARKETS</div>`}</div>
      </div>
      <div class="panel">
        <div class="panel-h"><span class="title">Top Streaks</span><span class="meta">#1 — #5</span></div>
        <div class="panel-b" style="padding:0">
          <table class="tbl">
            <thead><tr><th>#</th><th>User</th><th class="right">Streak</th><th class="right">P&L</th></tr></thead>
            <tbody>
              ${(d?.leaderboardTop ?? []).map((r) => `
                <tr class="${r.isMe ? "me" : ""}">
                  <td class="mono">${r.rank}</td>
                  <td>@${esc(r.username)}</td>
                  <td class="num amber">${r.current}</td>
                  <td class="num ${pnlClass(r.netPnlCkb)}">${fmtPnl(r.netPnlCkb)}</td>
                </tr>
              `).join("") || `<tr><td colspan="4" class="dim mono center">NO PLAYERS YET</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  bindHeadline();
  startPolling(renderDashboard);
}

function headlineCard(m) {
  return `
    <div class="match-card" style="margin:0">
      <div class="side">
        <span class="flag">${m.match.home.flag}</span>
        <div class="meta"><span class="code">${m.match.home.code}</span><span class="nm">${esc(m.match.home.name)}</span></div>
      </div>
      <div class="center">
        ${m.match.status === "final" || m.match.status === "live"
          ? `<span class="score">${m.match.score?.home ?? 0} : ${m.match.score?.away ?? 0}</span>`
          : `<span class="vs">vs</span>`}
        <span class="kick">${esc(m.match.stage)} · ${fmtDateTime(m.closesAt)}</span>
      </div>
      <div class="side away">
        <div class="meta" style="align-items:flex-end"><span class="code">${m.match.away.code}</span><span class="nm">${esc(m.match.away.name)}</span></div>
        <span class="flag">${m.match.away.flag}</span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px">
      ${["home", "draw", "away"].map((o) => `
        <button class="outcome ${o}" data-go="${m.id}">
          <div class="label">${o.toUpperCase()}</div>
          <div class="mono" style="font-size:18px;font-weight:600">${fmtPct(m.prices[o])}</div>
          <div class="mono" style="font-size:10px;color:var(--ink-2)">${fmtOdds(m.prices[o])}×</div>
        </button>
      `).join("")}
    </div>
  `;
}
function bindHeadline() {
  document.querySelectorAll(".outcome[data-go]").forEach((b) => {
    b.onclick = () => { location.hash = `#/market/${b.dataset.go}`; };
  });
}

// ───────────────────────────────────────────────────────── markets list ────

async function renderMarkets(r) {
  const view = $("#view");
  view.innerHTML = `
    <div class="page-h">
      <h1>Markets</h1>
      <span class="sub">FIFA World Cup 2026 · Round of 32 → Final</span>
      <div class="right">
        <select class="input" id="flt" style="width:auto;font-size:11px">
          <option value="">All states</option>
          <option value="open" selected>Open</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
    </div>
    <div id="mkt-body">${spinner()}</div>
  `;
  $("#flt").onchange = async (e) => {
    await loadMarkets(e.target.value || undefined);
  };
  await loadMarkets("open");
  startPolling(() => loadMarkets($("#flt")?.value || undefined));
}

async function loadMarkets(status) {
  const data = await api(`/markets${status ? `?status=${status}` : ""}`);
  const ms = data.markets || [];
  const body = $("#mkt-body");
  if (!body) return;
  if (!ms.length) {
    body.innerHTML = `<div class="panel"><div class="panel-b dim mono center" style="padding:40px;font-size:11px;letter-spacing:0.14em">NO MARKETS — TRY ANOTHER FILTER</div></div>`;
    return;
  }
  body.innerHTML = `
    <div class="panel" style="overflow:hidden">
      <table class="tbl">
        <thead>
          <tr>
            <th>Match</th>
            <th>Stage</th>
            <th>Status</th>
            <th class="right">Home</th>
            <th class="right">Draw</th>
            <th class="right">Away</th>
            <th class="right">Pool</th>
            <th class="right">Bets</th>
            <th class="right">Closes</th>
            <th class="right">Trend</th>
          </tr>
        </thead>
        <tbody>
          ${ms.map((m) => `
            <tr class="mkt-row" data-go="${m.id}">
              <td class="tm">
                <span class="flag">${m.match.home.flag}</span><span class="code">${m.match.home.code}</span>
                <span class="vs">vs</span>
                <span class="code">${m.match.away.code}</span><span class="flag">${m.match.away.flag}</span>
                ${m.match.status === "final" ? `<span class="mono dim" style="margin-left:8px">${m.match.score?.home ?? 0}–${m.match.score?.away ?? 0}</span>` : ""}
              </td>
              <td class="small">${esc(m.match.stage)}</td>
              <td>${marketStatusChip(m)}</td>
              <td class="num"><span class="price-cell"><span class="pp home">${fmtPct(m.prices.home)}</span><span class="od">${fmtOdds(m.prices.home)}×</span></span></td>
              <td class="num"><span class="price-cell"><span class="pp draw">${fmtPct(m.prices.draw)}</span><span class="od">${fmtOdds(m.prices.draw)}×</span></span></td>
              <td class="num"><span class="price-cell"><span class="pp away">${fmtPct(m.prices.away)}</span><span class="od">${fmtOdds(m.prices.away)}×</span></span></td>
              <td class="num">${fmtCkb(m.totalPoolCkb)}</td>
              <td class="num small">${m.totalBets} · ${m.uniqueBettors}u</td>
              <td class="num small">${m.status === "open" ? timeUntil(m.closesAt) : fmtDateTime(m.closesAt)}</td>
              <td class="num">${sparkSvg(m.spark)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  body.querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => { location.hash = `#/market/${tr.dataset.go}`; };
  });
}

function marketStatusChip(m) {
  if (m.match.status === "live") return `<span class="chip live">LIVE</span>`;
  if (m.status === "open") return `<span class="chip open">OPEN</span>`;
  if (m.status === "closed") return `<span class="chip closed">CLOSED</span>`;
  if (m.status === "resolved") {
    const o = m.resolvedOutcome;
    return `<span class="chip resolved">RESOLVED · ${String(o || "—").toUpperCase()}</span>`;
  }
  if (m.status === "void") return `<span class="chip void">VOID</span>`;
  return `<span class="chip">${esc(m.status)}</span>`;
}

// ──────────────────────────────────────────────────────── market detail ────

async function renderMarketDetail(r) {
  const id = r.params[0];
  if (!id) { location.hash = "#/markets"; return; }
  const view = $("#view");
  view.innerHTML = spinner();

  const { market: m } = await api(`/markets/${encodeURIComponent(id)}`);
  view.innerHTML = `
    <div class="page-h">
      <h1>${esc(m.match.home.name)} <span class="dim" style="font-weight:400">vs</span> ${esc(m.match.away.name)}</h1>
      <span class="sub">${esc(m.match.stage)} · kickoff ${fmtDateTime(m.closesAt)}</span>
      <div class="right">${marketStatusChip(m)}<a class="btn btn-ghost" href="#/markets">← Back</a></div>
    </div>

    <div class="match-card">
      <div class="side">
        <span class="flag">${m.match.home.flag}</span>
        <div class="meta"><span class="code">${m.match.home.code}</span><span class="nm">${esc(m.match.home.name)}</span></div>
      </div>
      <div class="center">
        ${m.match.status === "final" || m.match.status === "live"
          ? `<span class="score">${m.match.score?.home ?? 0} : ${m.match.score?.away ?? 0}</span>`
          : `<span class="vs">vs</span>`}
        <span class="kick">${m.match.status === "live" ? "LIVE" : m.status === "open" ? `closes in ${timeUntil(m.closesAt)}` : fmtDateTime(m.closesAt)}</span>
      </div>
      <div class="side away">
        <div class="meta" style="align-items:flex-end"><span class="code">${m.match.away.code}</span><span class="nm">${esc(m.match.away.name)}</span></div>
        <span class="flag">${m.match.away.flag}</span>
      </div>
    </div>

    <div class="detail-grid">
      <div class="col">
        <div class="panel">
          <div class="panel-h">
            <span class="title">Implied Probability</span>
            <span class="meta">Total pool · ${fmtCkb(m.totalPoolCkb)} CKB · ${m.totalBets} bets · ${m.uniqueBettors} traders</span>
          </div>
          ${chartSvg(m.history)}
        </div>

        <div class="panel">
          <div class="panel-h">
            <span class="title">Bet Feed</span>
            <span class="meta">last ${m.feed.length}</span>
          </div>
          <div class="feed" id="feed">
            ${m.feed.length === 0
              ? `<div class="dim mono center" style="padding:30px;font-size:11px;letter-spacing:0.14em">NO BETS YET — BE FIRST</div>`
              : m.feed.map((f) => `
                <div class="feed-row">
                  <span class="t">${fmtTime(f.placedAt)}</span>
                  <span class="o ${f.outcome}">${f.outcome.toUpperCase()}</span>
                  <span class="u">@${esc(f.user)}</span>
                  <span class="a">${fmtCkb(f.amountCkb)} CKB <span class="dim">@ ${fmtPct(f.priceAtBet)}</span></span>
                </div>
              `).join("")}
          </div>
        </div>

        ${m.myPositions.length ? `
          <div class="panel">
            <div class="panel-h"><span class="title">My Positions</span><span class="meta">${m.myPositions.length}</span></div>
            <table class="tbl">
              <thead><tr><th>Side</th><th class="right">Stake</th><th class="right">Entry</th><th>Status</th><th class="right">Payout</th><th></th></tr></thead>
              <tbody>
                ${m.myPositions.map((p) => `
                  <tr>
                    <td><span class="chip ${p.outcome === "home" ? "open" : p.outcome === "away" ? "failed" : "closed"}">${p.outcome.toUpperCase()}</span> ${p.isStreakPick ? `<span class="tag-streak">STREAK</span>` : ""}</td>
                    <td class="num">${fmtCkb(p.amountCkb)}</td>
                    <td class="num small">${fmtPct(p.priceAtBet)}</td>
                    <td class="small">${p.settled ? (p.payoutCkb && Number(p.payoutCkb) > 0 ? `<span class="up">SETTLED</span>` : `<span class="down">LOST</span>`) : "<span class='amber'>OPEN</span>"}</td>
                    <td class="num ${p.settled && Number(p.payoutCkb || 0) > Number(p.amountCkb) ? "up" : ""}">${p.settled ? fmtCkb(p.payoutCkb) : "—"}</td>
                    <td class="small">${fmtDateTime(p.placedAt)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ""}
      </div>

      <div class="col">
        <div class="panel">
          <div class="panel-h"><span class="title">${m.status === "open" ? "Place Bet" : "Market " + m.status.toUpperCase()}</span></div>
          <div class="panel-b">${m.status === "open" ? betPanelHtml(m) : marketSummaryHtml(m)}</div>
        </div>

        ${m.status === "resolved" || m.status === "void" ? `
          <div class="panel" id="settlement-panel">
            <div class="panel-h">
              <span class="title">On-chain Settlement</span>
              <span class="meta" id="settlement-badge">${spinnerInline()}</span>
            </div>
            <div class="panel-b" id="settlement-body">${spinner()}</div>
          </div>
        ` : ""}

        <div class="panel">
          <div class="panel-h"><span class="title">Pool Composition</span></div>
          <div class="panel-b">
            ${poolBreakdownHtml(m)}
          </div>
        </div>

        <div class="panel">
          <div class="panel-h"><span class="title">Market Info</span></div>
          <div class="panel-b" style="font-family:var(--mono);font-size:11.5px;color:var(--ink-1)">
            <div class="row"><span class="label flex-1">Creator</span><span>${m.creator ? "@" + esc(m.creator.username) : "system"}</span></div>
            <div class="row"><span class="label flex-1">Opened</span><span>${fmtDateTime(m.createdAt)}</span></div>
            <div class="row"><span class="label flex-1">Closes</span><span>${fmtDateTime(m.closesAt)}</span></div>
            <div class="row"><span class="label flex-1">Protocol fee</span><span>${(m.feeBps.protocol / 100).toFixed(2)}%</span></div>
            <div class="row"><span class="label flex-1">Creator fee</span><span>${(m.feeBps.creator / 100).toFixed(2)}%</span></div>
            <div class="row"><span class="label flex-1">Settlement</span><span>parimutuel · oracle live</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  if (m.status === "open") bindBetPanel(m);
  if (m.status === "resolved" || m.status === "void") loadSettlementPanel(m);
  startPolling(renderMarketDetail);
}

function poolBreakdownHtml(m) {
  const total = Math.max(1, Number(m.pools.home) + Number(m.pools.draw) + Number(m.pools.away));
  const pct = {
    home: Number(m.pools.home) / total,
    draw: Number(m.pools.draw) / total,
    away: Number(m.pools.away) / total,
  };
  return `
    <div style="height:8px;display:flex;border:1px solid var(--line);margin-bottom:10px">
      <div style="flex:${pct.home};background:var(--up)"></div>
      <div style="flex:${pct.draw};background:var(--neutral)"></div>
      <div style="flex:${pct.away};background:var(--down)"></div>
    </div>
    <div style="font-family:var(--mono);font-size:11.5px;display:grid;grid-template-columns:1fr auto auto;gap:4px 12px">
      <span class="up">HOME ${m.match.home.code}</span><span>${fmtCkb(Number(m.pools.home) / 1e8)}</span><span class="dim">${(pct.home * 100).toFixed(1)}%</span>
      <span class="neutral">DRAW</span><span>${fmtCkb(Number(m.pools.draw) / 1e8)}</span><span class="dim">${(pct.draw * 100).toFixed(1)}%</span>
      <span class="down">AWAY ${m.match.away.code}</span><span>${fmtCkb(Number(m.pools.away) / 1e8)}</span><span class="dim">${(pct.away * 100).toFixed(1)}%</span>
    </div>
  `;
}

function betPanelHtml(m) {
  return `
    <div class="bet-panel">
      <div class="outcomes">
        ${["home", "draw", "away"].map((o) => `
          <div class="outcome ${o}" data-pick="${o}">
            <div class="l">${o === "home" ? m.match.home.code : o === "away" ? m.match.away.code : "DRAW"}</div>
            <div class="p">${fmtPct(m.prices[o])}</div>
            <div class="o">${fmtOdds(m.prices[o])}× odds</div>
          </div>
        `).join("")}
      </div>

      <div class="field">
        <label>Stake (CKB)</label>
        <input class="input input-num" id="bet-amt" type="number" min="10" step="1" placeholder="100" />
      </div>
      <div class="quick">
        <button class="btn btn-ghost" data-amt="25">25</button>
        <button class="btn btn-ghost" data-amt="100">100</button>
        <button class="btn btn-ghost" data-amt="500">500</button>
        <button class="btn btn-ghost" data-amt="1000">1k</button>
      </div>

      <div class="summary">
        <span class="l">Side</span><span class="v" id="sum-side">—</span>
        <span class="l">Entry price</span><span class="v" id="sum-price">—</span>
        <span class="l">Decimal odds</span><span class="v" id="sum-odds">—</span>
        <span class="l">Potential payout*</span><span class="v amber" id="sum-payout">—</span>
        <span class="l">Escrow balance</span><span class="v">${fmtCkb(state.user?.escrowCkb)} CKB</span>
      </div>

      ${state.user?.streak.status === "active" && state.user?.streak.lastPickDate !== new Date().toISOString().slice(0, 10) ? `
        <label class="opt"><input type="checkbox" id="bet-streak"/>Lock as today's streak pick (+1 streak if it wins)</label>
      ` : ""}

      <button class="btn btn-amber btn-block" id="bet-go" disabled>SELECT A SIDE</button>
      <div class="dim mono" style="font-size:10px;line-height:1.5">
        * Estimated using current pool snapshot. Final payout is parimutuel: winners split the losing pool pro-rata net of ${(m.feeBps.protocol + m.feeBps.creator) / 100}% fees.
      </div>
    </div>
  `;
}

function marketSummaryHtml(m) {
  if (m.status === "resolved") {
    const o = m.resolvedOutcome;
    const p = m.payout;
    return `
      <div style="font-family:var(--mono);font-size:12px;color:var(--ink-1);display:grid;grid-template-columns:1fr auto;gap:6px 12px">
        <span class="label">Outcome</span><span class="amber">${String(o || "—").toUpperCase()}</span>
        <span class="label">Winner pool</span><span>${fmtCkb(Number(p?.winnerPoolShannons || 0) / 1e8)} CKB</span>
        <span class="label">Loser pool</span><span>${fmtCkb(Number(p?.loserPoolShannons || 0) / 1e8)} CKB</span>
        <span class="label">Distributed</span><span>${fmtCkb(Number(p?.totalPaidShannons || 0) / 1e8)} CKB</span>
        <span class="label">Protocol fee</span><span>${fmtCkb(Number(p?.protocolFeeShannons || 0) / 1e8)} CKB</span>
        <span class="label">Creator fee</span><span>${fmtCkb(Number(p?.creatorFeeShannons || 0) / 1e8)} CKB</span>
        <span class="label">Winners</span><span>${p?.winnerCount ?? 0}</span>
      </div>
    `;
  }
  if (m.status === "void") {
    return `<div class="dim mono" style="font-size:12px">Market voided — all bets refunded automatically.</div>`;
  }
  return `<div class="dim mono" style="font-size:12px">Market closed at kickoff. Awaiting result from the oracle feed.</div>`;
}

function bindBetPanel(m) {
  let side = null;
  let amt = 0;
  const sumSide = $("#sum-side"), sumPrice = $("#sum-price"), sumOdds = $("#sum-odds"), sumPayout = $("#sum-payout");
  const goBtn = $("#bet-go");
  const amtInput = $("#bet-amt");

  function recompute() {
    if (!side) { goBtn.disabled = true; goBtn.textContent = "SELECT A SIDE"; return; }
    if (!amt || amt < 10) { goBtn.disabled = true; goBtn.textContent = "ENTER STAKE ≥ 10 CKB"; return; }
    const code = side === "home" ? m.match.home.code : side === "away" ? m.match.away.code : "DRAW";
    sumSide.textContent = code;
    sumPrice.textContent = fmtPct(m.prices[side]);
    sumOdds.textContent = m.prices[side] ? fmtOdds(m.prices[side]) + "×" : "∞";
    // Estimated payout: stake * odds = stake / impliedProb.
    const est = m.prices[side] ? amt / m.prices[side] : amt;
    sumPayout.textContent = fmtCkb(est) + " CKB";
    goBtn.disabled = false;
    goBtn.textContent = `BUY ${code} · ${fmtCkb(amt)} CKB`;
  }

  document.querySelectorAll(".bet-panel .outcome").forEach((b) => {
    b.onclick = () => {
      side = b.dataset.pick;
      document.querySelectorAll(".bet-panel .outcome").forEach((x) => x.classList.toggle("selected", x === b));
      recompute();
    };
  });
  document.querySelectorAll(".bet-panel .quick button").forEach((b) => {
    b.onclick = () => { amtInput.value = b.dataset.amt; amt = Number(b.dataset.amt); recompute(); };
  });
  amtInput.oninput = () => { amt = Number(amtInput.value); recompute(); };

  goBtn.onclick = async () => {
    if (!side) return;
    const asStreakPick = $("#bet-streak")?.checked;
    confirmBet({ market: m, side, amount: amt, asStreakPick });
  };
}

function confirmBet({ market, side, amount, asStreakPick }) {
  const code = side === "home" ? market.match.home.code : side === "away" ? market.match.away.code : "DRAW";
  openModal(`
    <div class="modal">
      <div class="m-h">Confirm Bet <span class="close" data-close>×</span></div>
      <div class="m-b" style="font-family:var(--mono);font-size:12px">
        <div class="row"><span class="label flex-1">Market</span><span>${esc(market.match.label)}</span></div>
        <div class="row"><span class="label flex-1">Side</span><span class="${side === "home" ? "up" : side === "away" ? "down" : "neutral"}">${code} (${side.toUpperCase()})</span></div>
        <div class="row"><span class="label flex-1">Stake</span><span class="amber">${fmtCkb(amount)} CKB</span></div>
        <div class="row"><span class="label flex-1">Entry price</span><span>${fmtPct(market.prices[side])} (${fmtOdds(market.prices[side])}×)</span></div>
        ${asStreakPick ? `<div class="row"><span class="label flex-1">Streak pick</span><span class="amber">YES — +1 streak if it wins</span></div>` : ""}
        <div class="dim" style="font-size:10.5px;line-height:1.5;margin-top:6px">Stake is debited from your platform escrow. If your side wins you receive your stake back plus a pro-rata share of the losing pool minus ${((market.feeBps.protocol + market.feeBps.creator) / 100).toFixed(2)}% fees.</div>
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-amber" id="bet-confirm">Lock Bet</button>
      </div>
    </div>
  `);
  $("#bet-confirm").onclick = async () => {
    const btn = $("#bet-confirm");
    btn.disabled = true; btn.textContent = "Submitting…";
    try {
      const r = await api(`/markets/${encodeURIComponent(market.id)}/bet`, {
        method: "POST",
        body: { outcome: side, amountCkb: amount, asStreakPick },
      });
      closeModal();
      toast(`Bet locked · escrow now ${r.newEscrowCkb} CKB`, "ok");
      await refreshUser();
      renderMarketDetail({ params: [market.id] });
    } catch (err) {
      btn.disabled = false; btn.textContent = "Lock Bet";
      toast(err.message, "err");
      if (err.code === "insufficient_escrow") {
        setTimeout(() => { closeModal(); location.hash = "#/wallet"; }, 1200);
      }
    }
  };
}

// ──────────────────────────────────────────────────────── streak page ─────

async function renderStreak() {
  const view = $("#view");
  const u = state.user;
  await refreshDashboard();
  const today = new Date().toISOString().slice(0, 10);
  const canPick = u.streak.status === "active" && u.streak.lastPickDate !== today;

  // Find today's headline market (first open market of the day).
  const { markets } = await api("/markets?status=open");
  const todays = (markets || []).filter((m) => m.closesAt.slice(0, 10) === today);

  view.innerHTML = `
    <div class="page-h">
      <h1>Streak</h1>
      <span class="sub">One tagged bet per day. Win → +1. Lose → revive or reset.</span>
    </div>

    <div class="streak-hero">
      <div><div class="big">${u.streak.current}</div><div class="label">CURRENT STREAK</div></div>
      <div class="stats">
        <span class="k">Best</span><span class="k">Win Rate</span><span class="k">Renews</span>
        <span class="v">${u.streak.best}</span><span class="v">${u.winRate}%</span><span class="v">${u.stats.renews}</span>
        <span class="k">Status</span><span class="k">Today's pick</span><span class="k">Rank</span>
        <span class="v">${u.streak.status === "failed" ? `<span class="down">FAILED</span>` : `<span class="up">ACTIVE</span>`}</span>
        <span class="v">${u.streak.lastPickDate === today ? `<span class="amber">LOCKED</span>` : `<span class="dim">PENDING</span>`}</span>
        <span class="v">#${u.rank}</span>
      </div>
      <div class="col" style="gap:6px">
        ${u.streak.status === "failed"
          ? `<button class="btn btn-amber" id="renew">REVIVE · ${state.dashboard?.constants.renewFeeCkb ?? 63} CKB</button><button class="btn btn-ghost" id="reset">RESET TO 0</button>${state.dashboard?.crewRevive?.eligible ? `<div class="dim mono up" style="font-size:10px;text-align:right;margin-top:2px">+${fmtCkb(state.dashboard.crewRevive.rebateCkb)} CKB crew rebate applies</div>` : ""}`
          : canPick
            ? `<div class="dim mono" style="font-size:11px;text-align:right">Pick any market below and<br/>check "streak pick" to lock it.</div>`
            : `<div class="dim mono" style="font-size:11px;text-align:right">Streak pick locked for today.<br/>Come back tomorrow.</div>`
        }
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-h"><span class="title">Today's Markets</span><span class="meta">${todays.length} open</span></div>
      ${todays.length === 0
        ? `<div class="panel-b dim mono center" style="padding:30px;font-size:11px;letter-spacing:0.14em">NO OPEN MATCHES TODAY — CHECK THE SCHEDULE</div>`
        : `<table class="tbl">
            <thead><tr><th>Match</th><th>Stage</th><th class="right">Home</th><th class="right">Draw</th><th class="right">Away</th><th class="right">Closes</th><th></th></tr></thead>
            <tbody>${todays.map((m) => `
              <tr class="mkt-row" data-go="${m.id}">
                <td class="tm"><span class="flag">${m.match.home.flag}</span><span class="code">${m.match.home.code}</span><span class="vs">vs</span><span class="code">${m.match.away.code}</span><span class="flag">${m.match.away.flag}</span></td>
                <td class="small">${esc(m.match.stage)}</td>
                <td class="num up">${fmtPct(m.prices.home)}</td>
                <td class="num neutral">${fmtPct(m.prices.draw)}</td>
                <td class="num down">${fmtPct(m.prices.away)}</td>
                <td class="num small">${timeUntil(m.closesAt)}</td>
                <td><a class="btn btn-sm">OPEN ›</a></td>
              </tr>`).join("")}
            </tbody>
           </table>`
      }
    </div>
  `;

  $("#view").querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => { location.hash = `#/market/${tr.dataset.go}`; };
  });
  if ($("#renew")) $("#renew").onclick = confirmRenew;
  if ($("#reset")) $("#reset").onclick = confirmReset;
}

function confirmRenew() {
  const fee = state.dashboard?.constants.renewFeeCkb ?? 63;
  const revive = state.dashboard?.crewRevive;
  const rebateLine = revive && revive.eligible
    ? `<div class="mono up" style="font-size:11px;line-height:1.5">Crew rebate: <span class="amber">+${fmtCkb(revive.rebateCkb)} CKB</span> credited to escrow — ${esc((revive.coPickers || []).join(", "))} co-picked ${esc(revive.matchLabel || "the same match")}.</div>`
    : "";
  openModal(`
    <div class="modal">
      <div class="m-h">Revive Streak <span class="close" data-close>×</span></div>
      <div class="m-b">
        <div class="mono" style="font-size:12px;line-height:1.6">
          Sending <span class="amber">${fee} CKB</span> from your on-chain wallet to the platform treasury. This is a real Pudge testnet transaction.
        </div>
        <div class="dim mono" style="font-size:10.5px">
          Wallet balance: <span class="mono-num">${fmtCkb(state.dashboard?.walletBalanceCkb)}</span> CKB
        </div>
        ${rebateLine}
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-amber" id="renew-go">Sign & Send</button>
      </div>
    </div>
  `);
  $("#renew-go").onclick = async () => {
    const btn = $("#renew-go");
    btn.disabled = true; btn.textContent = "Signing…";
    try {
      const r = await api("/renew", { method: "POST" });
      closeModal();
      const extra = Number(r.rebateCkb) > 0 ? ` · +${fmtCkb(r.rebateCkb)} CKB crew rebate` : "";
      toast(`Streak revived · tx ${r.txHash.slice(0, 10)}…${extra}`, "ok");
      await refreshDashboard();
      await refreshUser();
      renderStreak();
    } catch (err) {
      btn.disabled = false; btn.textContent = "Sign & Send";
      toast(err.message, "err");
    }
  };
}

function confirmReset() {
  openModal(`
    <div class="modal">
      <div class="m-h">Reset Streak <span class="close" data-close>×</span></div>
      <div class="m-b mono" style="font-size:12px;line-height:1.6">
        Abandon this run and set your streak to <span class="amber">0</span>. No payment. Best streak (<span class="mono-num">${state.user.streak.best}</span>) is preserved.
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-down" id="reset-go">Reset to 0</button>
      </div>
    </div>
  `);
  $("#reset-go").onclick = async () => {
    try {
      await api("/reset", { method: "POST" });
      closeModal();
      toast("Streak reset to 0", "ok");
      await refreshUser();
      renderStreak();
    } catch (err) { toast(err.message, "err"); }
  };
}

// ─────────────────────────────────────────────────────── portfolio ────────

async function renderPortfolio() {
  const view = $("#view");
  view.innerHTML = spinner();
  const data = await api("/portfolio");
  const u = state.user;

  view.innerHTML = `
    <div class="page-h">
      <h1>Portfolio</h1>
      <span class="sub">All positions across all markets</span>
    </div>

    <div class="kpis" style="grid-template-columns:repeat(2,1fr)">
      <div class="kpi"><span class="l">Realised P&L</span><span class="v ${pnlClass(data.realisedPnlCkb)}">${fmtPnl(data.realisedPnlCkb)}</span><span class="d dim">CKB · all-time</span></div>
      <div class="kpi"><span class="l">Open Stake</span><span class="v">${fmtCkb(data.openStakeCkb)}</span><span class="d dim">CKB · unresolved</span></div>
      <div class="kpi"><span class="l">Turnover</span><span class="v">${fmtNum(Number(u.stats.turnoverShannons) / 1e8)}</span><span class="d dim">CKB · lifetime</span></div>
      <div class="kpi"><span class="l">Bets</span><span class="v">${u.stats.totalBets}</span><span class="d dim">${u.stats.wonBets}W / ${u.stats.lostBets}L</span></div>
    </div>

    <div class="panel">
      <div class="panel-h"><span class="title">Positions</span><span class="meta">${data.positions.length}</span></div>
      ${data.positions.length === 0
        ? `<div class="panel-b dim mono center" style="padding:40px;font-size:11px;letter-spacing:0.14em">NO POSITIONS YET — PLACE A BET ON MARKETS ›</div>`
        : `<table class="tbl">
            <thead><tr><th>Placed</th><th>Match</th><th>Side</th><th class="right">Stake</th><th class="right">Entry</th><th>Status</th><th class="right">Payout</th><th class="right">P&L</th></tr></thead>
            <tbody>${data.positions.map((p) => `
              <tr class="mkt-row" data-go="${p.marketId}">
                <td class="small mono">${fmtDateTime(p.placedAt)}</td>
                <td>${esc(p.matchLabel)} ${p.isStreakPick ? `<span class="tag-streak">STREAK</span>` : ""}</td>
                <td><span class="o ${p.outcome} mono" style="text-transform:uppercase">${p.outcome}</span></td>
                <td class="num">${fmtCkb(p.amountCkb)}</td>
                <td class="num small">${fmtPct(p.priceAtBet)}</td>
                <td>${positionStatusChip(p)}</td>
                <td class="num">${p.settled ? fmtCkb(p.payoutCkb) : "—"}</td>
                <td class="num ${p.pnlCkb ? pnlClass(p.pnlCkb) : "dim"}">${p.pnlCkb ? fmtPnl(p.pnlCkb) : "—"}</td>
              </tr>`).join("")}
            </tbody>
          </table>`
      }
    </div>
  `;

  view.querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => { location.hash = `#/market/${tr.dataset.go}`; };
  });
}

function positionStatusChip(p) {
  if (!p.settled) return `<span class="chip open">OPEN</span>`;
  if (p.result === "won") return `<span class="chip active">WON</span>`;
  if (p.result === "lost") return `<span class="chip failed">LOST</span>`;
  if (p.result === "void") return `<span class="chip void">VOID</span>`;
  return `<span class="chip">${p.result ?? "—"}</span>`;
}

// ────────────────────────────────────────────────────────── wallet ────────

async function renderWallet() {
  const view = $("#view");
  view.innerHTML = spinner();
  const w = await api("/wallet");

  view.innerHTML = `
    <div class="page-h">
      <h1>Account</h1>
      <span class="sub">Funding, custody, and Telegram notifications for your Streak account</span>
      <div class="right"><a class="btn btn-ghost" href="${w.faucet}" target="_blank" rel="noopener">FAUCET ↗</a></div>
    </div>

    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span class="l">On-Chain Wallet</span><span class="v">${fmtCkb(w.chainBalanceCkb)}</span><span class="d dim mono">${shortAddr(w.address)}</span></div>
      <div class="kpi"><span class="l">Platform Escrow</span><span class="v amber">${fmtCkb(w.escrowCkb)}</span><span class="d dim">CKB · spendable on markets</span></div>
      <div class="kpi"><span class="l">Creator Fees Earned</span><span class="v up">${fmtCkb(w.creatorFeesCkb)}</span><span class="d dim">CKB · lifetime</span></div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-h"><span class="title">Deposit → Escrow</span><span class="meta">on-chain · min ${w.minOnchainCkb} CKB</span></div>
        <div class="panel-b col" style="gap:10px">
          <div class="dim mono" style="font-size:11px;line-height:1.5">Funds move from your wallet to the platform treasury and are credited to your escrow balance. This is a real Pudge transaction.</div>
          <div class="field"><label>Amount (CKB)</label><input class="input input-num" id="dep-amt" type="number" min="${w.minOnchainCkb}" step="1" placeholder="${w.minOnchainCkb}"/></div>
          <button class="btn btn-amber btn-block" id="dep-go">SIGN & DEPOSIT</button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h"><span class="title">Withdraw → Wallet</span><span class="meta">on-chain · min ${w.minOnchainCkb} CKB</span></div>
        <div class="panel-b col" style="gap:10px">
          <div class="dim mono" style="font-size:11px;line-height:1.5">Move escrow balance back to your on-chain wallet. Real Pudge transaction signed by the treasury on your behalf.</div>
          <div class="field"><label>Amount (CKB)</label><input class="input input-num" id="wd-amt" type="number" min="${w.minOnchainCkb}" step="1" placeholder="${w.minOnchainCkb}"/></div>
          <button class="btn btn-ghost btn-block" id="wd-go">SIGN & WITHDRAW</button>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-h"><span class="title">Telegram Notifications</span></div>
      <div class="panel-b" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div class="dim mono" style="font-size:11px;line-height:1.5">
          ${state.user?.telegramConnected
            ? `Connected${state.user?.telegramUsername ? ` as @${esc(state.user.telegramUsername)}` : ""}. You will receive personalized pick and settlement alerts.`
            : "Connect Telegram in one tap. We auto-link your chat when you press Start in the bot."}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${state.user?.telegramConnected
            ? `<button class="btn btn-ghost btn-sm" id="tg-disconnect">Disconnect</button>`
            : `<button class="btn btn-amber btn-sm" id="tg-connect">Connect Telegram</button>`}
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-h"><span class="title">Wallet Details</span></div>
      <div class="panel-b" style="font-family:var(--mono);font-size:11.5px;color:var(--ink-1);display:grid;grid-template-columns:140px 1fr auto;gap:6px 12px;align-items:center">
        <span class="label">Address</span><span class="mono-num" id="addr">${esc(w.address)}</span><a class="btn btn-ghost btn-sm" href="${w.explorer}" target="_blank" rel="noopener">EXPLORER ↗</a>
        <span class="label">Treasury</span><span class="mono-num">${esc(w.treasuryAddress)}</span><a class="btn btn-ghost btn-sm" href="${w.treasuryExplorer}" target="_blank" rel="noopener">EXPLORER ↗</a>
        <span class="label">Network</span><span>CKB Pudge testnet</span><span></span>
      </div>
    </div>

    <div class="grid-2" style="margin-top:14px">
      <div class="panel">
        <div class="panel-h"><span class="title">Recent Deposits</span></div>
        ${w.recent.deposits.length === 0
          ? `<div class="panel-b dim mono" style="font-size:11px">—</div>`
          : `<table class="tbl"><thead><tr><th>When</th><th class="right">Amount</th><th>Tx</th></tr></thead><tbody>${w.recent.deposits.map((d) => `<tr><td class="small mono">${fmtDateTime(d.at)}</td><td class="num up">+${fmtCkb(d.amountCkb)}</td><td class="small mono"><a href="${d.explorer}" target="_blank" rel="noopener">${d.txHash.slice(0, 10)}…</a></td></tr>`).join("")}</tbody></table>`
        }
      </div>
      <div class="panel">
        <div class="panel-h"><span class="title">Recent Withdrawals</span></div>
        ${w.recent.withdraws.length === 0
          ? `<div class="panel-b dim mono" style="font-size:11px">—</div>`
          : `<table class="tbl"><thead><tr><th>When</th><th class="right">Amount</th><th>Tx</th></tr></thead><tbody>${w.recent.withdraws.map((d) => `<tr><td class="small mono">${fmtDateTime(d.at)}</td><td class="num down">-${fmtCkb(d.amountCkb)}</td><td class="small mono"><a href="${d.explorer}" target="_blank" rel="noopener">${d.txHash.slice(0, 10)}…</a></td></tr>`).join("")}</tbody></table>`
        }
      </div>
    </div>
  `;

  $("#dep-go").onclick = async () => {
    const amt = Number($("#dep-amt").value);
    if (!amt || amt < w.minOnchainCkb) { toast(`Minimum deposit is ${w.minOnchainCkb} CKB.`, "err"); return; }
    const btn = $("#dep-go"); btn.disabled = true; btn.textContent = "SIGNING…";
    try {
      const r = await api("/wallet/deposit", { method: "POST", body: { amountCkb: amt } });
      toast(`Deposited ${r.amountCkb} CKB · tx ${r.txHash.slice(0, 10)}…`, "ok");
      await refreshUser();
      renderWallet();
    } catch (err) { btn.disabled = false; btn.textContent = "SIGN & DEPOSIT"; toast(err.message, "err"); }
  };
  $("#wd-go").onclick = async () => {
    const amt = Number($("#wd-amt").value);
    if (!amt || amt < w.minOnchainCkb) { toast(`Minimum withdraw is ${w.minOnchainCkb} CKB.`, "err"); return; }
    const btn = $("#wd-go"); btn.disabled = true; btn.textContent = "SIGNING…";
    try {
      const r = await api("/wallet/withdraw", { method: "POST", body: { amountCkb: amt } });
      toast(`Withdrew ${r.amountCkb} CKB · tx ${r.txHash.slice(0, 10)}…`, "ok");
      await refreshUser();
      renderWallet();
    } catch (err) { btn.disabled = false; btn.textContent = "SIGN & WITHDRAW"; toast(err.message, "err"); }
  };

  const tgConnect = $("#tg-connect");
  if (tgConnect) {
    tgConnect.onclick = async () => {
      const btn = tgConnect; btn.disabled = true; btn.textContent = "CREATING LINK…";
      try {
        const r = await api("/integrations/telegram/connect", { method: "POST" });
        window.open(r.url, "_blank", "noopener");
        toast("Telegram link opened — press Start in the bot", "ok");
      } catch (err) {
        toast(err.message, "err");
      } finally {
        btn.disabled = false; btn.textContent = "Connect Telegram";
      }
    };
  }
  const tgDisconnect = $("#tg-disconnect");
  if (tgDisconnect) {
    tgDisconnect.onclick = async () => {
      const btn = tgDisconnect; btn.disabled = true; btn.textContent = "DISCONNECTING…";
      try {
        const r = await api("/integrations/telegram/disconnect", { method: "POST" });
        state.user = r.user;
        toast("Telegram disconnected", "ok");
        await renderWallet();
      } catch (err) {
        btn.disabled = false; btn.textContent = "Disconnect";
        toast(err.message, "err");
      }
    };
  }
}

// ──────────────────────────────────────────────────────── leaderboard ─────

async function renderLeaderboard() {
  const view = $("#view");
  view.innerHTML = spinner();
  const { leaderboard: lb } = await api("/leaderboard");
  view.innerHTML = `
    <div class="page-h"><h1>Leaderboard</h1><span class="sub">Top 100 by realised P&L</span></div>
    <div class="panel">
      <table class="tbl">
        <thead><tr><th>Rank</th><th>User</th><th class="right">P&L (CKB)</th><th class="right">Turnover</th><th class="right">Streak</th><th class="right">Best</th><th class="right">Win Rate</th></tr></thead>
        <tbody>${(lb || []).map((r) => `
          <tr class="${r.isMe ? "me" : ""}">
            <td class="mono amber">${r.rank}</td>
            <td>@${esc(r.username)} ${r.isMe ? `<span class="tag-streak">YOU</span>` : ""}</td>
            <td class="num ${pnlClass(r.netPnlCkb)}">${fmtPnl(r.netPnlCkb)}</td>
            <td class="num small">${fmtCkb(r.turnoverCkb)}</td>
            <td class="num amber">${r.current}</td>
            <td class="num">${r.best}</td>
            <td class="num">${r.winRate}%</td>
          </tr>`).join("") || `<tr><td colspan="7" class="dim mono center">NO PLAYERS YET</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ──────────────────────────────────────────────────────── crews ──────────

async function renderCrews() {
  const view = $("#view");
  view.innerHTML = spinner();
  const { crews } = await api("/crews");
  const u = state.user;

  view.innerHTML = `
    <div class="page-h">
      <h1>Crews</h1>
      <span class="sub">Friend groups over settlements — head-to-head streaks, co-picks &amp; revive rebates</span>
    </div>

    <div class="crew-actions">
      <button class="btn btn-amber btn-sm" id="crew-create">+ Create crew</button>
      <div class="crew-join">
        <input class="input input-sm" id="crew-code" placeholder="INVITE CODE" maxlength="6" autocomplete="off" style="text-transform:uppercase"/>
        <button class="btn btn-ghost btn-sm" id="crew-join-btn">Join</button>
      </div>
    </div>

    ${crews.length === 0
      ? `<div class="panel"><div class="panel-b dim mono center" style="padding:44px;font-size:11px;letter-spacing:0.14em">
          NO CREWS YET — CREATE ONE AND SHARE THE INVITE CODE, OR JOIN A FRIEND'S WITH THEIR CODE
        </div></div>`
      : crews.map((c) => crewCard(c)).join("")}
  `;

  $("#crew-create").onclick = promptCreateCrew;
  const joinBtn = $("#crew-join-btn");
  if (joinBtn) joinBtn.onclick = () => doJoinCrew($("#crew-code").value);
  const codeInput = $("#crew-code");
  if (codeInput) codeInput.onkeydown = (e) => { if (e.key === "Enter") doJoinCrew(codeInput.value); };
  view.querySelectorAll("[data-copy]").forEach((el) => {
    el.onclick = () => { navigator.clipboard?.writeText(el.dataset.copy); toast("Invite code copied", "ok"); };
  });
  view.querySelectorAll("[data-leave]").forEach((btn) => {
    btn.onclick = () => confirmLeaveCrew(btn.dataset.leave, btn.dataset.name);
  });
  view.querySelectorAll("[data-go]").forEach((el) => {
    el.onclick = () => { location.hash = `#/market/${el.dataset.go}`; };
  });
}

function crewCard(c) {
  const hint = c.reviveHint;
  const reviveBanner = hint && hint.eligible
    ? `<div class="crew-revive up">
         <span>✓ Revive rebate ready — <span class="amber">+${fmtCkb(hint.rebateCkb)} CKB</span> to escrow.
         ${hint.coPickers.map(esc).join(", ")} also backed ${esc(hint.matchLabel || "the same match")}.</span>
         <a class="btn btn-sm btn-amber" href="#/streak">Revive ›</a>
       </div>`
    : hint
      ? `<div class="crew-revive dim">Your streak failed — no crew-mate co-picked that match, so no rebate yet. <a href="#/streak">Revive ›</a></div>`
      : "";

  const coPicks = c.coPicks.length
    ? `<div class="crew-copicks">${c.coPicks.map((cp) => `
        <span class="copick-chip" data-go="m-${cp.matchId}" title="Open market">
          <span class="cp-match">${esc(cp.matchLabel)}</span>
          ${cp.outcome ? `<span class="o ${cp.outcome}">${cp.outcome.toUpperCase()}</span>` : `<span class="dim">SPLIT</span>`}
          <span class="cp-n">×${cp.members.length}</span>
        </span>`).join("")}</div>`
    : `<div class="dim mono" style="font-size:10.5px;padding:2px 2px">No shared streak picks today.</div>`;

  return `
    <div class="panel crew-panel" style="margin-bottom:12px">
      <div class="panel-h">
        <span class="title">${esc(c.name)}</span>
        <span class="chip code-chip" data-copy="${esc(c.inviteCode)}" title="Copy invite code">CODE ${esc(c.inviteCode)}</span>
        <span class="meta">${c.memberCount} member${c.memberCount === 1 ? "" : "s"}</span>
        <button class="btn btn-ghost btn-sm" data-leave="${c.id}" data-name="${esc(c.name)}" style="margin-left:auto">Leave</button>
      </div>
      ${reviveBanner}
      <div class="crew-sub">Today's co-picks</div>
      ${coPicks}
      <div class="crew-sub">Head-to-head</div>
      <table class="tbl">
        <thead><tr><th>#</th><th>Member</th><th class="right">Streak</th><th class="right">Best</th><th class="right">Win</th><th class="right">P&amp;L</th><th>Today's pick</th></tr></thead>
        <tbody>${c.members.map((m, i) => `
          <tr class="${m.isMe ? "me" : ""}">
            <td class="mono amber">${i + 1}</td>
            <td>${m.isOwner ? `<span title="owner" class="amber">★</span> ` : ""}@${esc(m.username)} ${m.isMe ? `<span class="tag-streak">YOU</span>` : ""} ${m.status === "failed" ? `<span class="chip failed" style="margin-left:4px">FAILED</span>` : ""}</td>
            <td class="num amber">${m.current}</td>
            <td class="num">${m.best}</td>
            <td class="num small">${m.winRate}%</td>
            <td class="num ${pnlClass(m.netPnlCkb)}">${fmtPnl(m.netPnlCkb)}</td>
            <td class="small">${m.todayPick ? `${esc(m.todayPick.matchLabel)} <span class="o ${m.todayPick.outcome}">${m.todayPick.outcome.toUpperCase()}</span>` : `<span class="dim">—</span>`}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="crew-sub">Crew feed</div>
      ${c.feed.length
        ? `<div class="crew-feed">${c.feed.map((f) => `
            <div class="feed-row">
              <span class="feed-user">@${esc(f.user)}</span>
              <span class="feed-kind ${f.kind}">${f.kind === "win" ? "WON" : f.kind === "loss" ? "LOST" : "PICKED"}</span>
              <span class="o ${f.outcome}">${f.outcome.toUpperCase()}</span>
              <span class="feed-match">${esc(f.matchLabel)}</span>
              <span class="feed-time dim">${fmtDateTime(f.at)}</span>
            </div>`).join("")}</div>`
        : `<div class="dim mono" style="font-size:10.5px;padding:2px 2px">No streak-pick activity yet.</div>`}
    </div>
  `;
}

function promptCreateCrew() {
  openModal(`
    <div class="modal">
      <div class="m-h">Create Crew <span class="close" data-close>×</span></div>
      <div class="m-b">
        <div class="field"><label>Crew name</label><input class="input" id="crew-name" maxlength="30" placeholder="e.g. The Away Enders"/></div>
        <div class="dim mono" style="font-size:10.5px">You'll get an invite code to share. Up to 12 members per crew.</div>
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-amber" id="crew-create-go">Create</button>
      </div>
    </div>
  `);
  const go = $("#crew-create-go");
  const input = $("#crew-name");
  go.onclick = async () => {
    const name = input.value.trim();
    go.disabled = true; go.textContent = "Creating…";
    try {
      const { crew } = await api("/crews", { method: "POST", body: { name } });
      closeModal();
      toast(`Crew "${crew.name}" created · code ${crew.inviteCode}`, "ok");
      renderCrews();
    } catch (err) { go.disabled = false; go.textContent = "Create"; toast(err.message, "err"); }
  };
  input.focus();
  input.onkeydown = (e) => { if (e.key === "Enter") go.click(); };
}

async function doJoinCrew(code) {
  if (!code || !code.trim()) { toast("Enter an invite code", "err"); return; }
  try {
    const { crew } = await api("/crews/join", { method: "POST", body: { code: code.trim() } });
    toast(`Joined "${crew.name}"`, "ok");
    renderCrews();
  } catch (err) { toast(err.message, "err"); }
}

function confirmLeaveCrew(crewId, name) {
  openModal(`
    <div class="modal">
      <div class="m-h">Leave Crew <span class="close" data-close>×</span></div>
      <div class="m-b mono" style="font-size:12px;line-height:1.6">
        Leave <span class="amber">${esc(name)}</span>? If you're the owner, it passes to another member. If you're the last one, the crew is deleted.
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-down" id="crew-leave-go">Leave crew</button>
      </div>
    </div>
  `);
  $("#crew-leave-go").onclick = async () => {
    try {
      await api(`/crews/${encodeURIComponent(crewId)}/leave`, { method: "POST" });
      closeModal();
      toast("Left crew", "ok");
      renderCrews();
    } catch (err) { toast(err.message, "err"); }
  };
}

// ──────────────────────────────────────────────────────── fixtures ────────

async function renderFixtures() {
  const view = $("#view");
  view.innerHTML = spinner();
  const { matches } = await api("/matches");
  // Group by date
  const byDate = {};
  for (const m of matches) (byDate[m.date] ||= []).push(m);
  const dates = Object.keys(byDate).sort();
  const today = new Date().toISOString().slice(0, 10);

  view.innerHTML = `
    <div class="page-h"><h1>Schedule</h1><span class="sub">${esc(state.liveStatus?.league ?? "Fixtures")} · ${matches.length} fixtures</span></div>
    ${dates.map((d) => `
      <div class="panel" style="margin-bottom:10px">
        <div class="panel-h">
          <span class="title">${new Date(d + "T00:00:00Z").toUTCString().slice(0, 16)}</span>
          ${d === today ? `<span class="chip live" style="margin-left:8px">TODAY</span>` : ""}
          <span class="meta">${byDate[d].length} matches</span>
        </div>
        <table class="tbl">
          <thead><tr><th>Kickoff</th><th>Stage</th><th>Match</th><th>Venue</th><th>Status</th><th class="right">Score</th><th></th></tr></thead>
          <tbody>${byDate[d].map((m) => `
            <tr class="mkt-row" data-go="m-${m.id}">
              <td class="small mono">${fmtTime(m.kickoff)}</td>
              <td class="small">${esc(m.stage)}${m.group ? " · " + esc(m.group) : ""}</td>
              <td class="tm"><span class="flag">${m.home.flag}</span><span class="code">${m.home.code}</span><span class="vs">vs</span><span class="code">${m.away.code}</span><span class="flag">${m.away.flag}</span></td>
              <td class="small dim">${esc(m.venue ?? "—")}</td>
              <td>${m.status === "live" ? `<span class="chip live">LIVE</span>` : m.status === "final" ? `<span class="chip resolved">FINAL</span>` : `<span class="chip">SCHEDULED</span>`}</td>
              <td class="num mono">${m.score ? `${m.score.home}–${m.score.away}` : "—"}</td>
              <td><a class="btn btn-sm">MARKET ›</a></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `).join("")}
  `;
  view.querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => { location.hash = `#/market/${tr.dataset.go}`; };
  });
}

// ──────────────────────────────────────────────────── auth (landing) ─────

function renderAuth(r) {
  teardownShell();
  const mode = location.hash.startsWith("#/signup") ? "signup" : location.hash.startsWith("#/signin") ? "signin" : "landing";
  if (mode === "landing") return renderLanding();
  renderSignForm(mode);
}

function renderLanding() {
  root.innerHTML = `
    <header class="status-bar" style="position:sticky;top:0">
      <span class="brand">STREAK · TERM</span>
      <span class="sep">|</span>
      <span>ON-CHAIN PREDICTION MARKETS · CKB PUDGE</span>
      <span class="right">
        <a class="btn btn-ghost btn-sm" href="#/signin">SIGN IN</a>
        <a class="btn btn-amber btn-sm" href="#/signup">CREATE WALLET</a>
      </span>
    </header>
    <div class="land">
      <div class="brand-big">STREAK</div>
      <div class="tag">PREDICTION-MARKET TERMINAL · CKB PUDGE TESTNET</div>
      <p class="pitch">
        A parimutuel sports prediction market modelled on Polymarket and built on
        <span class="amber">Nervos CKB</span>. Open a market on any World Cup 2026
        fixture, take any side, settle on the live oracle feed. Win the day's
        market and your streak grows. Lose it and pay to revive — all in real
        Pudge testnet CKB.
      </p>
      <div class="cta">
        <a class="btn btn-amber" href="#/signup">CREATE TERMINAL ACCOUNT</a>
        <a class="btn btn-ghost" href="#/signin">SIGN IN</a>
      </div>
      <pre class="ascii">
   ┌─────────────────────────────────────────────────────────────────┐
   │  MKT     SIDE   ODDS   POOL     CLOSES                          │
   │  ARG×FRA HOME   2.41×  4 920 CKB  in 02h 14m                    │
   │  GER×ESP DRAW   3.62×    885 CKB  in 11h 02m                    │
   │  BRA×NED AWAY   2.05×  6 130 CKB  LIVE  1–0                     │
   └─────────────────────────────────────────────────────────────────┘
      </pre>
    </div>
  `;
}

function renderSignForm(mode) {
  const title = mode === "signup" ? "Create Terminal Account" : "Sign In";
  const cta = mode === "signup" ? "CREATE & GENERATE WALLET" : "SIGN IN";
  root.innerHTML = `
    <header class="status-bar">
      <span class="brand">STREAK · TERM</span>
      <span class="sep">|</span>
      <span>${title.toUpperCase()}</span>
      <span class="right"><a class="btn btn-ghost btn-sm" href="#">← LANDING</a></span>
    </header>
    <div class="auth-shell">
      <div class="auth-card">
        <h2>${title}</h2>
        <div class="sub">${mode === "signup" ? "A fresh Pudge wallet is generated for you on signup." : "Welcome back."}</div>
        <form id="auth-form">
          <div class="field"><label>Username</label><input class="input" name="username" autocomplete="username" required minlength="3" maxlength="20"/></div>
          <div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required minlength="6"/></div>
          <button class="btn btn-amber btn-block" type="submit">${cta}</button>
        </form>
        <div class="swap">
          ${mode === "signup"
            ? `Already have an account? <a href="#/signin">Sign in</a>`
            : `New here? <a href="#/signup">Create account</a>`}
        </div>
      </div>
    </div>
  `;
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { username: f.username.value, password: f.password.value };
    const btn = f.querySelector("button");
    btn.disabled = true; btn.textContent = "WORKING…";
    try {
      const r = await api(mode === "signup" ? "/signup" : "/login", { method: "POST", body });
      state.user = r.user;
      if (r.justCreated) {
        toast(`Wallet created · ${shortAddr(r.walletAddress)}`, "ok");
      } else {
        toast("Signed in", "ok");
      }
      location.hash = "#/dashboard";
      navigate();
    } catch (err) {
      btn.disabled = false; btn.textContent = cta;
      toast(err.message, "err");
    }
  };
}

// ──────────────────────────────────────────────────────── data sync ───────

async function refreshUser() {
  try {
    const r = await api("/me");
    state.user = r.user;
  } catch (err) {
    if (err.status === 401) { state.user = null; }
  }
  updateStatusBar();
}

async function refreshDashboard(force = false) {
  try {
    const d = await api("/dashboard");
    state.dashboard = d;
    state.user = d.user;
    state.liveStatus = d.live;
    updateStatusBar();
    updateFootBar();
    renderTape();
  } catch (err) {
    if (err.status === 401) { state.user = null; }
  }
}

// Periodically re-run the current view so prices, ticker and status stay fresh.
function startPolling(viewFn) {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      await refreshDashboard();
      await viewFn(state.route);
    } catch (err) { /* swallow */ }
  }, 12_000);
  // Status-bar clock tick (set once; survives view changes).
  if (!state.clockTimer) state.clockTimer = setInterval(updateStatusBar, 1000);
}

// ───────────────────────────────────────── settlement receipts (UI) ────────

/**
 * Loads the on-chain settlement panel on the market-detail page and, if the
 * user has any bets in this market, appends "prove my bet" affordances.
 */
async function loadSettlementPanel(m) {
  const body = document.getElementById("settlement-body");
  const badge = document.getElementById("settlement-badge");
  if (!body || !badge) return;
  let d;
  try {
    d = await api(`/receipts/${encodeURIComponent(m.id)}`);
  } catch (err) {
    body.innerHTML = `<div class="dim mono" style="font-size:11.5px">
      Receipt not yet published. The engine writes an on-chain fingerprint to Pudge shortly after settlement.
    </div>`;
    badge.innerHTML = `<span class="chip">PENDING</span>`;
    return;
  }
  const p = d.payload;
  const rec = d.receipt;
  const oc = d.onChain || {};
  const verifiedChip = rec
    ? (oc.ok
        ? `<span class="chip open" style="background:rgba(66,196,138,0.14);border-color:rgba(66,196,138,0.4);color:var(--up)">✓ VERIFIED ON-CHAIN</span>`
        : `<span class="chip failed">CHECK FAILED</span>`)
    : `<span class="chip">PENDING</span>`;
  badge.innerHTML = verifiedChip;

  const shareUrl = `${location.origin}/#/receipt/${encodeURIComponent(m.id)}`;
  const tweetText = `Settled on-chain via Streak — ${p.match.home.code} vs ${p.match.away.code} · winner: ${String(p.winner).toUpperCase()}${p.match.score ? " " + p.match.score.home + "-" + p.match.score.away : ""} · ${p.bets.count} bets, ${fmtCkb(Number(p.totalPaidShannons)/1e8)} CKB paid`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;

  body.innerHTML = `
    <div style="font-family:var(--mono);font-size:11.5px;color:var(--ink-1);display:grid;grid-template-columns:1fr auto;gap:6px 12px">
      <span class="label">Winner</span><span class="amber">${String(p.winner).toUpperCase()}</span>
      <span class="label">Bets settled</span><span>${p.bets.count}</span>
      <span class="label">Oracle</span><span>${esc(p.oracle.source)}${p.oracle.live ? "" : " (sim)"}</span>
      <span class="label">Payload hash</span><span class="hash-cell" title="${esc(d.payloadHash)}">${shortHash(d.payloadHash)}<button class="copy-mini" data-copy="${esc(d.payloadHash)}">copy</button></span>
      <span class="label">Merkle root</span><span class="hash-cell" title="${esc(p.bets.merkleRoot)}">${shortHash(p.bets.merkleRoot)}<button class="copy-mini" data-copy="${esc(p.bets.merkleRoot)}">copy</button></span>
      ${rec ? `
        <span class="label">Receipt tx</span><span class="hash-cell" title="${esc(rec.txHash)}">${shortHash(rec.txHash)}<button class="copy-mini" data-copy="${esc(rec.txHash)}">copy</button></span>
        <span class="label">Output idx</span><span>${rec.index}</span>
        <span class="label">Treasury lock</span><span class="hash-cell" title="${esc(oc.expectedTreasuryLockArgs || "")}">${shortHash(oc.expectedTreasuryLockArgs || "")}</span>
      ` : ""}
    </div>
    ${rec && oc.ok === false ? `<div class="dim mono" style="font-size:10.5px;color:var(--down);margin-top:8px">verification failed: ${esc(oc.reason || "unknown")}</div>` : ""}
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <a class="btn btn-ghost btn-sm" href="#/receipt/${encodeURIComponent(m.id)}">Public receipt ›</a>
      ${d.explorer ? `<a class="btn btn-ghost btn-sm" href="${esc(d.explorer)}" target="_blank" rel="noopener">Pudge explorer ↗</a>` : ""}
      <button class="btn btn-ghost btn-sm" data-copy="${esc(shareUrl)}">Copy share link</button>
      <a class="btn btn-ghost btn-sm" href="${esc(twitterUrl)}" target="_blank" rel="noopener">Share ↗</a>
      ${state.user ? `<button class="btn btn-ghost btn-sm" id="prove-mine">Prove my bet(s)</button>` : ""}
    </div>
    <div class="dim mono" style="font-size:10px;line-height:1.6;margin-top:10px">
      The Pudge cell holds <code>STKR</code>|v|sha256(payload) at the treasury lock. Anyone can verify with <code>npm run verify -- ${esc(m.id)}</code>.
    </div>
    <div id="prove-out" style="margin-top:10px"></div>
  `;

  body.querySelectorAll("[data-copy]").forEach((el) => {
    el.onclick = async (e) => {
      e.preventDefault();
      try { await navigator.clipboard.writeText(el.dataset.copy); toast("copied", "ok"); }
      catch { toast("copy failed", "err"); }
    };
  });
  const prove = document.getElementById("prove-mine");
  if (prove) prove.onclick = () => showInclusionProof(m.id, { mine: true });
}

async function showInclusionProof(marketId, { mine, betId } = {}) {
  const q = new URLSearchParams();
  if (mine) q.set("mine", "1");
  if (betId) q.set("bet", betId);
  const url = `/receipts/${encodeURIComponent(marketId)}/proof${q.toString() ? "?" + q.toString() : ""}`;
  let d;
  try { d = await api(url); }
  catch (err) { toast(err.message, "err"); return; }
  const out = document.getElementById("prove-out") || document.getElementById("receipt-prove-out");
  if (!out) return;
  const proofs = d.proofs || [];
  if (proofs.length === 0) {
    out.innerHTML = `<div class="dim mono" style="font-size:11px">No bets to prove in this market.</div>`;
    return;
  }
  out.innerHTML = `
    <div class="panel-inner" style="border:1px solid var(--line);padding:10px;background:rgba(0,0,0,0.28)">
      <div class="dim mono" style="font-size:10px;letter-spacing:0.14em;margin-bottom:6px">INCLUSION ${d.rootsMatch ? '<span class="up">· ROOT ✓</span>' : '<span class="down">· ROOT MISMATCH</span>'}</div>
      ${proofs.map((p) => p.ok ? `
        <div style="border-top:1px dashed var(--line);padding-top:8px;margin-top:8px;font-family:var(--mono);font-size:11px">
          <div class="row"><span class="label flex-1">bet</span><span>${shortHash(p.betId)}</span></div>
          <div class="row"><span class="label flex-1">index</span><span>${p.index}</span></div>
          <div class="row"><span class="label flex-1">outcome</span><span>${p.leaf.outcome.toUpperCase()} · ${fmtCkb(Number(p.leaf.amountShannons)/1e8)} CKB</span></div>
          <div class="row"><span class="label flex-1">leaf</span><span class="hash-cell">${shortHash(p.leafHash)}</span></div>
          <div class="dim" style="font-size:10px;margin-top:4px">${p.proof.length} sibling(s) · walking to root ${shortHash(d.merkleRoot)}</div>
        </div>
      ` : `<div class="dim" style="font-size:11px">bet ${shortHash(p.betId)}: ${esc(p.reason)}</div>`).join("")}
    </div>
  `;
}

function shortHash(h) {
  if (!h) return "—";
  const s = String(h);
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

// ────────────────────── Receipts gallery (/#/receipts) ─────────────────────

async function renderReceipts() {
  const view = $("#view");
  view.innerHTML = spinner();
  const { receipts } = await api("/receipts");
  view.innerHTML = `
    <div class="page-h">
      <h1>Settlement Receipts</h1>
      <span class="sub">Every resolved market with an on-chain fingerprint on Pudge testnet</span>
    </div>
    <div class="panel">
      <div class="panel-h"><span class="title">${receipts.length} published</span><span class="meta">newest first</span></div>
      ${receipts.length === 0
        ? `<div class="dim mono center" style="padding:60px;font-size:11px;letter-spacing:0.14em">NO RECEIPTS YET — SETTLE A MARKET TO PUBLISH ONE</div>`
        : `<table class="tbl">
             <thead><tr><th>Match</th><th>Stage</th><th>Winner</th><th class="right">Bets</th><th class="right">Paid</th><th>Settled</th><th>Tx</th><th></th></tr></thead>
             <tbody>
               ${receipts.map((r) => `
                 <tr data-go="${esc(r.marketId)}">
                   <td>${esc(r.label)}${r.score ? ` <span class="dim">(${r.score.home}-${r.score.away})</span>` : ""}</td>
                   <td class="small dim">${esc(r.stage)}</td>
                   <td class="amber">${String(r.winner).toUpperCase()}</td>
                   <td class="num">${r.betCount}</td>
                   <td class="num">${fmtCkb(Number(r.totalPaidShannons)/1e8)}</td>
                   <td class="small dim">${fmtDateTime(r.settledAt)}</td>
                   <td class="mono small hash-cell">${r.receipt ? shortHash(r.receipt.txHash) : `<span class="chip">PENDING</span>`}</td>
                   <td class="small"><a class="btn btn-ghost btn-sm" href="#/receipt/${encodeURIComponent(r.marketId)}">Open ›</a></td>
                 </tr>
               `).join("")}
             </tbody>
           </table>`
      }
    </div>
  `;
}

// ────────────────── Public receipt page (/#/receipt/:id) ───────────────────

async function renderReceiptPublic(r) {
  const id = r.params[0];
  if (!id) throw new Error("Missing market id.");
  document.title = `Receipt · Streak`;
  const d = await api(`/receipts/${encodeURIComponent(id)}`);
  const p = d.payload;
  const rec = d.receipt;
  const oc = d.onChain || {};
  const verified = rec && oc.ok;

  const shareUrl = `${location.origin}/#/receipt/${encodeURIComponent(id)}`;
  const tweet = `Settled on-chain via Streak — ${p.match.home.code} vs ${p.match.away.code} · winner: ${String(p.winner).toUpperCase()}${p.match.score ? " " + p.match.score.home + "-" + p.match.score.away : ""}`;

  root.innerHTML = `
    <div class="public-shell">
      <header class="public-topbar">
        <span class="brand">STREAK · SETTLEMENT RECEIPT</span>
        <span class="dim mono small">CKB · PUDGE TESTNET</span>
        <a class="btn btn-ghost btn-sm" href="#/dashboard">Open terminal ›</a>
      </header>

      <main class="public-card">
        <div class="verdict ${verified ? "ok" : rec ? "bad" : "pending"}">
          ${verified
            ? `<span class="v-tick">✓</span><span>Verified on-chain</span><span class="dim mono small">payload hash matches Pudge cell</span>`
            : rec
              ? `<span class="v-tick down">✗</span><span>Verification failed</span><span class="dim mono small">${esc(oc.reason || "hash disagreement")}</span>`
              : `<span class="v-tick">…</span><span>Publish pending</span><span class="dim mono small">on-chain fingerprint not yet written</span>`}
        </div>

        <div class="match-block">
          <div class="tm"><span class="flag">${p.match.home.name === "—" ? "🏳️" : ""}</span><span class="code">${p.match.home.code}</span> <span class="nm dim">${esc(p.match.home.name)}</span></div>
          <div class="score">${p.match.score ? `${p.match.score.home} : ${p.match.score.away}` : `vs`}</div>
          <div class="tm r"><span class="nm dim">${esc(p.match.away.name)}</span> <span class="code">${p.match.away.code}</span></div>
        </div>
        <div class="dim mono small center" style="margin-top:-6px">${esc(p.match.stage)} · kickoff ${fmtDateTime(p.match.kickoff)}</div>

        <div class="winner-row">
          <span class="lab">WINNER</span>
          <span class="amber big">${String(p.winner).toUpperCase()}</span>
          <span class="sep">·</span>
          <span class="dim">${p.bets.count} bets, ${p.winnerCount} winners</span>
          <span class="sep">·</span>
          <span class="dim">${fmtCkb(Number(p.totalPaidShannons)/1e8)} CKB paid</span>
        </div>

        <div class="grid2">
          <div class="mini-panel">
            <div class="mp-h">POOLS</div>
            <div class="mp-row"><span class="up">HOME</span><span class="num">${fmtCkb(Number(p.pools.home)/1e8)}</span></div>
            <div class="mp-row"><span class="neutral">DRAW</span><span class="num">${fmtCkb(Number(p.pools.draw)/1e8)}</span></div>
            <div class="mp-row"><span class="down">AWAY</span><span class="num">${fmtCkb(Number(p.pools.away)/1e8)}</span></div>
          </div>
          <div class="mini-panel">
            <div class="mp-h">FEES</div>
            <div class="mp-row"><span class="dim">Protocol ${(p.fees.protocolBps/100).toFixed(2)}%</span><span class="num">${fmtCkb(Number(p.protocolFeeShannons)/1e8)}</span></div>
            <div class="mp-row"><span class="dim">Creator ${(p.fees.creatorBps/100).toFixed(2)}%</span><span class="num">${fmtCkb(Number(p.creatorFeeShannons)/1e8)}</span></div>
            <div class="mp-row"><span class="dim">Distributable</span><span class="num amber">${fmtCkb(Number(p.distributableShannons)/1e8)}</span></div>
          </div>
        </div>

        <div class="mini-panel">
          <div class="mp-h">ON-CHAIN PROOF</div>
          <div class="mp-row"><span class="dim">Payload hash</span><span class="hash-cell mono small">${shortHash(d.payloadHash)}<button class="copy-mini" data-copy="${esc(d.payloadHash)}">copy</button></span></div>
          <div class="mp-row"><span class="dim">Merkle root</span><span class="hash-cell mono small">${shortHash(p.bets.merkleRoot)}<button class="copy-mini" data-copy="${esc(p.bets.merkleRoot)}">copy</button></span></div>
          ${rec ? `
            <div class="mp-row"><span class="dim">Receipt tx</span><span class="hash-cell mono small">${shortHash(rec.txHash)}<button class="copy-mini" data-copy="${esc(rec.txHash)}">copy</button></span></div>
            <div class="mp-row"><span class="dim">Cell data</span><span class="mono small"><code>STKR</code>|v${d.version}|sha256(payload)</span></div>
            <div class="mp-row"><span class="dim">Treasury lock</span><span class="hash-cell mono small">${shortHash(oc.expectedTreasuryLockArgs || "")}</span></div>
          ` : ""}
          <div class="mp-row"><span class="dim">Oracle</span><span class="mono small">${esc(p.oracle.source)}${p.oracle.live ? "" : " (simulated)"}</span></div>
          <div class="mp-row"><span class="dim">Settled at</span><span class="mono small">${fmtDateTime(p.settledAt)}</span></div>
        </div>

        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:14px">
          ${d.explorer ? `<a class="btn btn-amber btn-sm" href="${esc(d.explorer)}" target="_blank" rel="noopener">Pudge explorer ↗</a>` : ""}
          <button class="btn btn-ghost btn-sm" data-copy="${esc(shareUrl)}">Copy link</button>
          <a class="btn btn-ghost btn-sm" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">Share on X ↗</a>
          <button class="btn btn-ghost btn-sm" id="rec-verify-cmd" data-copy="npm run verify -- ${esc(id)}">Copy verifier command</button>
        </div>

        <details class="raw-details">
          <summary>Show canonical payload (hashed on-chain)</summary>
          <pre class="raw-json">${esc(d.canonical)}</pre>
        </details>

        <div id="receipt-prove-out"></div>

        <footer class="public-foot">
          <span class="dim mono small">Streak Terminal · on-chain parimutuel market on Nervos CKB Pudge</span>
        </footer>
      </main>
    </div>
  `;

  root.querySelectorAll("[data-copy]").forEach((el) => {
    el.onclick = async (e) => {
      e.preventDefault();
      try { await navigator.clipboard.writeText(el.dataset.copy); toast("copied", "ok"); }
      catch { toast("copy failed", "err"); }
    };
  });
}

// ──────────────────────────────────────────────────────────── boot ────────

(async () => {
  try {
    const r = await api("/me");
    state.user = r.user;
  } catch { /* not signed in */ }
  await navigate();
})();
