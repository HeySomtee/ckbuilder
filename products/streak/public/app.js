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

import { createApiClient, createPoller } from "./runtime.js";

// Reading a ledger never needs the wallet SDK. Load its remote dependency graph
// only when the user connects or signs, keeping startup independent of the CDN.
let ccc;
let walletModule;
function loadWalletModule() {
  if (!walletModule) {
    walletModule = import("https://esm.sh/@ckb-ccc/connector@1")
      .then((module) => (ccc = module.ccc))
      .catch((error) => {
        walletModule = null;
        throw error;
      });
  }
  return walletModule;
}

const $ = (sel, root = document) => root.querySelector(sel);
const root = $("#app");
const overlay = $("#overlay");
const toasts = $("#toasts");
const integerFormatter = new Intl.NumberFormat();
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function fmtNum(n, frac = 2) {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n)))
    return "—";
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
  return integerFormatter.format(Number(n));
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
  return Number.isNaN(d.getTime()) ? "—" : timeFormatter.format(d);
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFormatter.format(d);
}

function teamMark(team) {
  if (team?.logo) {
    return `<span class="flag"><img src="${esc(team.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="flag">${esc(team?.flag || "⚽")}</span>`;
}

function competitionName(match) {
  return match?.competition?.name || "Football";
}

function competitionOptions(competitions, selected = "") {
  return (competitions || [])
    .map(
      (competition) => `
    <option value="${esc(competition.id)}" ${String(competition.id) === String(selected) ? "selected" : ""}>
      ${esc(competition.name)}
    </option>
  `,
    )
    .join("");
}
function localDateKey(v = new Date()) {
  const d = v instanceof Date ? v : new Date(v);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

const api = createApiClient();

// ─────────────────────────────────────────────────────── app-wide state ────

// CCC wallet login + client-signed treasury payments.
let cccConnector = null;
async function getConnector() {
  if (cccConnector) return cccConnector;
  await loadWalletModule();
  if (cccConnector) return cccConnector;
  const el = document.createElement("ccc-connector");
  el.style.display = "none";
  el.style.zIndex = "999";
  document.body.appendChild(el);
  try {
    el.setClient(new ccc.ClientPublicTestnet());
  } catch (e) {
    console.warn("ccc client", e);
  }
  el.addEventListener("close", () => {
    el.style.display = "none";
  });
  cccConnector = el;
  return el;
}

function currentSigner() {
  return cccConnector?.signer?.signer ?? null;
}

/** Open the wallet picker; resolve with the connected signer. */
async function connectWallet() {
  const el = await getConnector();
  return new Promise((resolve, reject) => {
    if (el.signer?.signer) {
      resolve(el.signer.signer);
      return;
    }
    const cleanup = () => {
      el.removeEventListener("willUpdate", onUpdate);
      el.removeEventListener("close", onClose);
      el.style.display = "none";
    };
    const onUpdate = () => {
      if (el.signer?.signer) {
        cleanup();
        resolve(el.signer.signer);
      }
    };
    const onClose = () => {
      cleanup();
      if (!el.signer?.signer) reject(new Error("Wallet connection cancelled."));
    };
    el.addEventListener("willUpdate", onUpdate);
    el.addEventListener("close", onClose);
    el.style.display = "";
  });
}

async function ensureSigner() {
  return currentSigner() ?? (await connectWallet());
}

function disconnectWallet() {
  try {
    cccConnector?.disconnect?.();
  } catch {}
}

/** Sign the server-issued login nonce and establish a session. */
async function walletLogin() {
  const signer = await connectWallet();
  const address = await signer.getRecommendedAddress();
  const { message } = await api("/auth/nonce", {
    method: "POST",
    body: { address },
  });
  const signature = await signer.signMessage(message);
  return api("/auth/verify", { method: "POST", body: { address, signature } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sign + broadcast a transfer to the treasury; returns the tx hash (no wait). */
async function broadcastTransfer(amountCkb) {
  const signer = await ensureSigner();
  const client = signer.client;
  const w = await api("/wallet");
  const { script: toLock } = await ccc.Address.fromString(
    w.treasuryAddress,
    client,
  );
  const tx = ccc.Transaction.from({
    outputs: [
      { lock: toLock, capacity: ccc.fixedPointFrom(String(amountCkb)) },
    ],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer);
  return signer.sendTransaction(tx);
}

/** POST a treasury-confirm endpoint, retrying until the tx commits server-side. */
async function confirmTreasuryTx(path, txHash) {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      return await api(path, { method: "POST", body: { txHash } });
    } catch (err) {
      const pending = /not committed|not found/i.test(err.message || "");
      if (pending && Date.now() < deadline) {
        await sleep(4000);
        continue;
      }
      throw err;
    }
  }
}

const state = {
  user: null,
  sessionResolved: false,
  dashboard: null,
  liveStatus: null,
  poller: null,
  pollRoute: null,
  pollView: null,
  clockTimer: null,
  route: null,
  activities: [],
  nextActivityId: 1,
  onboardingShown: false,
};

function isAuthed() {
  return !!state.user;
}

// ── Background activity indicator (non-blocking on-chain actions) ────────────

function activityHost() {
  let host = document.getElementById("activity-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "activity-host";
    host.className = "activity-host";
    document.body.appendChild(host);
  }
  return host;
}
function renderActivities() {
  const host = activityHost();
  host.innerHTML = state.activities
    .map(
      (a) => `
    <div class="activity ${a.status}">
      <span class="a-spin">${a.status === "run" ? "\u27f3" : a.status === "ok" ? "\u2713" : "\u2715"}</span>
      <span class="a-label">${esc(a.label)}</span>
    </div>
  `,
    )
    .join("");
  host.style.display = state.activities.length ? "" : "none";
}
function beginActivity(label) {
  const id = state.nextActivityId++;
  state.activities.push({ id, label, status: "run" });
  renderActivities();
  return id;
}
function endActivity(id, ok, label) {
  const a = state.activities.find((x) => x.id === id);
  if (a) {
    a.status = ok ? "ok" : "err";
    if (label) a.label = label;
    renderActivities();
  }
  setTimeout(() => {
    state.activities = state.activities.filter((x) => x.id !== id);
    renderActivities();
  }, 3200);
}
/** Run an async task in the background with a global indicator + toasts. */
function runBackground(label, fn) {
  const id = beginActivity(label);
  return fn()
    .then((res) => {
      endActivity(id, true, `${label} \u00b7 done`);
      return res;
    })
    .catch((err) => {
      endActivity(id, false, `${label} failed`);
      toast(err.message || `${label} failed`, "err");
    });
}

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

let modalReturnFocus = null;
let modalOverflow = "";
const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(event, host) {
  if (event.key !== "Tab") return;
  const controls = [...host.querySelectorAll(focusableSelector)].filter(
    (element) => element.getClientRects().length > 0,
  );
  const first = controls[0],
    last = controls[controls.length - 1];
  if (!first) {
    event.preventDefault();
    host.focus();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      !controls.includes(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      !controls.includes(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}

function dismissModal() {
  const close = overlay.querySelector(".close[data-close]");
  if (close) close.click();
  else closeModal();
}

function openModal(html) {
  if (!overlay.classList.contains("on")) {
    modalReturnFocus = document.activeElement;
    modalOverflow = document.body.style.overflow;
  }
  overlay.innerHTML = html;
  overlay.classList.add("on");
  overlay.setAttribute("aria-hidden", "false");
  root.inert = true;
  document.body.style.overflow = "hidden";
  const dialog = overlay.querySelector(".modal") || overlay.firstElementChild;
  if (dialog) {
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.tabIndex = -1;
    const heading = dialog.querySelector(".m-h");
    if (heading) {
      heading.id = "modal-title";
      dialog.setAttribute("aria-labelledby", heading.id);
    }
    prepareFormLabels(dialog);
  }
  // Wire EVERY [data-close] control (X icon, Skip/Cancel buttons), not just the first.
  overlay.querySelectorAll("[data-close]").forEach((el) => {
    el.onclick = closeModal;
    if (el.tagName !== "BUTTON") {
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute("aria-label", "Close dialog");
      el.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          el.click();
        }
      };
    }
  });
  overlay.onclick = (e) => {
    if (e.target === overlay) dismissModal();
  };
  overlay.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissModal();
    } else if (dialog) trapFocus(event, dialog);
  };
  (
    dialog?.querySelector(
      'input:not([type="hidden"]), select, textarea, button:not([data-close])',
    ) || dialog
  )?.focus({ preventScroll: true });
}
function closeModal() {
  overlay.classList.remove("on");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = "";
  overlay.onclick = null;
  overlay.onkeydown = null;
  root.inert = false;
  document.body.style.overflow = modalOverflow;
  if (modalReturnFocus?.isConnected)
    modalReturnFocus.focus({ preventScroll: true });
  modalReturnFocus = null;
}

// ──────────────────────────────────────────────────────────── routing ──────

const routes = {
  "": renderDashboard,
  dashboard: renderDashboard,
  markets: renderMarkets,
  market: renderMarketDetail, // #market/<id>
  streak: renderStreak,
  portfolio: renderPortfolio,
  wallet: renderWallet,
  leaderboard: renderLeaderboard,
  crews: renderCrews,
  fixtures: renderFixtures,
  receipts: renderReceipts, // gallery of published receipts
  receipt: renderReceiptPublic, // #receipt/<marketId>  (unauthenticated shareable page)
};

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  return { name: h[0] || "", params: h.slice(1), hash: location.hash };
}

function mountRouteView() {
  const current = $("#view");
  if (!current) return null;
  const next = document.createElement("div");
  next.className = "view";
  next.id = "view";
  next.setAttribute("aria-busy", "true");
  next.innerHTML = spinner();
  current.replaceWith(next);
  return next;
}

function isActiveView(view) {
  return !!view && view.isConnected && view === $("#view");
}

async function navigate() {
  closeMobileNav();
  stopPolling();
  const r = parseRoute();
  state.route = r;
  // Public shareable receipt page — no auth required.
  if (r.name === "receipt") {
    teardownShell();
    root.innerHTML = `<div class="public-shell"><div class="public-card">${spinner()}</div></div>`;
    try {
      await renderReceiptPublic(r);
    } catch (err) {
      if (state.route !== r) return;
      console.error(err);
      root.innerHTML = `<div class="public-shell"><div class="public-card"><h1>Receipt not available</h1><p class="dim mono">${esc(err.message)}</p><a class="btn btn-ghost" href="#/dashboard">Return to Streak</a></div></div>`;
    }
    return;
  }
  // Public receipts open without an authentication round trip. Resolve the
  // session only if their reader subsequently enters the personal ledger.
  if (!state.sessionResolved) {
    try {
      const session = await api("/me");
      state.user = session.user;
    } catch {
      /* guest */
    }
    state.sessionResolved = true;
    if (state.route !== r) return;
  }
  if (!isAuthed()) {
    return renderAuth(r);
  }
  renderShell();
  const view = routes[r.name] || routes["dashboard"];
  // Every navigation gets a fresh DOM target. Requests from a previous route
  // may still finish, but they can only update their now-detached target and
  // can never paint over the page the user most recently selected.
  r.view = mountRouteView();
  const activeRouteName = routes[r.name] ? r.name || "dashboard" : "dashboard";
  highlightNav(activeRouteName);
  document.title = `${activeRouteName.charAt(0).toUpperCase() + activeRouteName.slice(1)} · Streak`;
  try {
    await view(r);
    if (isActiveView(r.view) && !state.poller) startPolling(null);
  } catch (err) {
    if (state.route !== r || !isActiveView(r.view)) return;
    console.error(err);
    toast(err.message, "err");
    r.view.innerHTML = `
      <div class="panel">
        <div class="panel-b dim mono center" style="padding:40px">
          COULD NOT LOAD THIS PAGE · ${esc(err.message)}<br/><br/>
          <button class="btn btn-ghost btn-sm" id="route-retry">RETRY</button>
        </div>
      </div>
    `;
    r.view.querySelector("#route-retry").onclick = () => navigate();
  } finally {
    if (isActiveView(r.view)) {
      r.view.removeAttribute("aria-busy");
      prepareRouteActions(r.view);
    }
  }
}

// Some successful actions navigate immediately after changing the hash. The
// browser's queued event must not issue the same route's requests a second time.
window.addEventListener("hashchange", () => {
  if (state.route?.hash !== location.hash) navigate();
});

const routeRequests = {
  dashboard: ["/dashboard"],
  markets: ["/markets?status=open", "/status"],
  streak: ["/dashboard", "/markets?status=open"],
  portfolio: ["/portfolio"],
  wallet: ["/wallet"],
  leaderboard: ["/leaderboard"],
  crews: ["/crews"],
  fixtures: ["/matches"],
  receipts: ["/receipts"],
};
let prefetchTimer;
function prefetchIntent(event) {
  const target = event.target?.closest?.(
    "a[href], [data-go], #connect-top, #connect-main",
  );
  if (!target || navigator.connection?.saveData) return;
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(
    () => {
      if (target.id === "connect-top" || target.id === "connect-main") {
        loadWalletModule().catch(() => {});
        return;
      }
      if (!isAuthed()) return;
      const hash =
        target.getAttribute("href") ||
        (target.dataset.go ? `#/market/${target.dataset.go}` : "");
      if (!hash.startsWith("#")) return;
      const [name, id] = hash.replace(/^#\/?/, "").split("/");
      const paths =
        name === "market" && id
          ? [`/markets/${encodeURIComponent(id)}`]
          : routeRequests[name];
      for (const path of paths || []) api(path).catch(() => {});
    },
    event.type === "focusin" ? 0 : 100,
  );
}
document.addEventListener("pointerover", prefetchIntent, { passive: true });
document.addEventListener("focusin", prefetchIntent);

// ──────────────────────────────────────────── shell (status, tape, rail) ───

function renderShell() {
  if (root.dataset.shell === "1") return;
  root.innerHTML = `
    <div class="shell">
      <aside class="rail" id="rail" aria-label="Main navigation">${navHtml()}</aside>
      <header class="status-bar" id="status-bar"></header>
      <div class="tape" id="tape"><div class="tape-label">From the book <span>↗</span></div><div class="tape-track" id="tape-track">—</div></div>
      <main class="main" id="main"><div class="view" id="view">${spinner()}</div></main>
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
  const links = (items) =>
    items
      .map(
        ([route, glyph, label, number]) =>
          `<a href="#/${route}" data-route="${route}"><span class="icon">${icon(glyph)}</span><span>${label}</span><span class="nav-number">${number}</span></a>`,
      )
      .join("");
  return `
    <a class="ledger-brand" href="#/dashboard" data-route="dashboard"><span class="brand-mark">S.</span><span class="wordmark">Streak<span>The football ledger</span></span></a>
    <div class="rail-section">The book <span>Vol. 01</span></div>
    ${links([
      ["dashboard", "dash", "Overview", "01"],
      ["markets", "mkt", "Markets", "02"],
      ["fixtures", "cal", "Schedule", "03"],
      ["receipts", "rc", "Receipts", "04"],
    ])}
    <div class="rail-section">Your pages</div>
    ${links([
      ["portfolio", "pf", "Portfolio", "05"],
      ["streak", "st", "Daily streak", "06"],
      ["crews", "crew", "Crews", "07"],
      ["leaderboard", "lb", "Leaderboard", "08"],
    ])}
    <div class="rail-note"><span class="little-star">✳</span><p>Good instincts.<br>Better records.</p><span>Every pick has a paper trail.</span></div>
    <div class="rail-foot">
      <a href="#/wallet" data-route="wallet" class="account-link"><span class="account-monogram">${esc((state.user?.username || "S").slice(0, 1).toUpperCase())}</span><span><strong>${esc(state.user?.username || "Your account")}</strong><small>${esc(shortAddr(state.user?.walletAddress))}</small></span><span>↗</span></a>
      <button class="signout-link" id="signout">Close the book <span>↗</span></button>
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

// Delegate shell actions once so refreshed navigation retains its handlers.
let navDelegated = false;
function ensureNavDelegation() {
  if (navDelegated) return;
  navDelegated = true;

  document.addEventListener("keydown", (event) => {
    const drawer = $("#mobile-nav-drawer");
    if (drawer?.classList.contains("on") && !overlay.classList.contains("on")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileNav(true);
        return;
      }
      trapFocus(event, drawer);
    }
    const target = event.target;
    if (
      (event.key === "Enter" || event.key === " ") &&
      target?.matches?.('[data-go][tabindex="0"]')
    ) {
      event.preventDefault();
      target.click();
    }
  });

  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    // Hamburger toggle
    if (t.closest("#mobile-nav-toggle")) {
      e.preventDefault();
      toggleMobileNav();
      return;
    }

    // How-it-works / onboarding
    if (t.closest("#help-btn")) {
      e.preventDefault();
      closeMobileNav();
      showOnboarding(true);
      return;
    }

    // Sign out
    if (t.closest("#signout")) {
      e.preventDefault();
      closeMobileNav();
      const button = t.closest("#signout");
      button.disabled = true;
      button.textContent = "Signing out…";
      try {
        await api("/logout", { method: "POST" });
      } catch {}
      disconnectWallet();
      state.user = null;
      state.dashboard = null;
      state.liveStatus = null;
      state.onboardingShown = false;
      api.invalidate();
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
    if (drawer && t === drawer) closeMobileNav(true);
  });
}

function toggleMobileNav() {
  const drawer = $("#mobile-nav-drawer");
  if (!drawer) return;
  const open = drawer.classList.toggle("on");
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
  $("#mobile-nav-toggle")?.setAttribute("aria-expanded", String(open));
  if (open) {
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Navigation");
    drawer.tabIndex = -1;
    (
      drawer.querySelector("a.active") ||
      drawer.querySelector("a") ||
      drawer
    ).focus();
  } else closeMobileNav(true);
}

function closeMobileNav(restoreFocus = false) {
  const drawer = $("#mobile-nav-drawer");
  if (!drawer) return;
  drawer.classList.remove("on");
  drawer.setAttribute("aria-hidden", "true");
  $("#mobile-nav-toggle")?.setAttribute("aria-expanded", "false");
  if (restoreFocus) $("#mobile-nav-toggle")?.focus();
}

function teardownShell() {
  root.innerHTML = "";
  delete root.dataset.shell;
  stopPolling();
  if (state.clockTimer) {
    clearInterval(state.clockTimer);
    state.clockTimer = null;
  }
}

function highlightNav(name) {
  const active = name === "market" ? "markets" : name;
  document
    .querySelectorAll("#rail a[data-route], #mobile-nav-drawer a[data-route]")
    .forEach((a) => {
      const current = a.dataset.route === active;
      a.classList.toggle("active", current);
      if (current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
}

function prepareRouteActions(view) {
  if (!view) return;
  prepareFormLabels(view);
  view.querySelectorAll("[data-go]").forEach((element) => {
    if (element.matches("button, a[href]") || element.dataset.keyboardReady)
      return;
    element.dataset.keyboardReady = "1";
    const destination = state.route?.name === "receipts" ? "receipt" : "market";
    const href = `#/${destination}/${encodeURIComponent(element.dataset.go)}`;
    element.tabIndex = 0;
    element.setAttribute("role", "link");
    element.setAttribute(
      "aria-label",
      `Open ${destination}: ${element.textContent.trim().replace(/\s+/g, " ").slice(0, 180)}`,
    );
    const link = element.querySelector("a:not([href])");
    if (link) link.href = href;
    if (!element.onclick)
      element.onclick = () => {
        location.hash = href;
      };
  });
}

function prepareFormLabels(host) {
  host.querySelectorAll(".field").forEach((field) => {
    const label = field.querySelector("label");
    const input = field.querySelector("input[id], select[id], textarea[id]");
    if (label && input && !label.htmlFor) label.htmlFor = input.id;
  });
}

function updateStatusBar() {
  const bar = $("#status-bar");
  if (!bar) return;
  const live = state.liveStatus;
  const u = state.user;
  const signature = JSON.stringify([
    live?.simulated,
    live?.enabled,
    u?.escrowCkb,
    u?.streak?.current,
  ]);
  if (bar.dataset.signature !== signature) {
    bar.dataset.signature = signature;
    bar.innerHTML = `
      <button class="mobile-nav-btn" id="mobile-nav-toggle" aria-label="Open navigation" aria-controls="mobile-nav-drawer" aria-expanded="${$("#mobile-nav-drawer")?.classList.contains("on") ? "true" : "false"}">☰</button>
      <span class="edition-label">Football, on the record.</span>
      <span class="header-date">${new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</span>
      <span class="right"><span class="feed-status"><span class="pulse ${live?.simulated ? "sim" : live?.enabled ? "" : "off"}"></span>${live?.simulated ? "Simulated feed" : live?.enabled ? "Live feed" : "Feed offline"}</span><span class="network-tag">CKB testnet</span><a class="header-balance" href="#/wallet">${fmtCkb(u?.escrowCkb)} <small>CKB</small> <span>↗</span></a><button class="statusbtn" id="help-btn" title="How Streak works" aria-label="How Streak works">?</button></span>
    `;
  }
}

function updateClock() {
  // The ledger shows an edition date, so there is no per-second DOM churn.
  const date = $(".header-date");
  const text = new Date().toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (date && date.textContent !== text) date.textContent = text;
}

function updateFootBar() {
  const f = $("#foot");
  if (!f) return;
  const c = state.dashboard?.counts;
  const html = `<span class="footer-mark">S.</span><span>Kept on Nervos CKB</span><span class="footer-stats">${fmtInt(c?.openMarkets)} open markets <span>·</span> ${fmtCkb(c?.totalPoolCkb)} CKB in the book</span><span class="right">2% protocol · 1% creator</span>`;
  if (f.innerHTML !== html) f.innerHTML = html;
}

function spinner() {
  return `<div class="loading-ledger" role="status" style="padding:60px;text-align:center;color:var(--ink-2);font-family:var(--mono);font-size:11px;letter-spacing:0.08em">Opening the ledger…</div>`;
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
  const items = bets
    .concat(bets)
    .map(
      (b) => `
    <span class="tape-item">
      <span class="t-mkt">${esc(b.matchLabel)}</span>
      <span class="t-side ${b.outcome}">${b.outcome.toUpperCase()}</span>
      <span class="t-amt">${fmtCkb(b.amountCkb)}</span>
      <span class="t-user">@${esc(b.user)}</span>
    </span>
  `,
    )
    .join("");
  t.innerHTML = items;
}

// ────────────────────────────────────────────────── inline SVG: spark ──────

function sparkSvg(ticks, w = 80, h = 22) {
  if (!ticks || ticks.length < 2) {
    return `<svg class="spark" width="${w}" height="${h}"><line x1="0" y1="${h - 1}" x2="${w}" y2="${h - 1}" class="axis"/></svg>`;
  }
  // Plot the implied prob of the leading outcome.
  const last = ticks[ticks.length - 1].p;
  const lead = Object.entries(last).reduce(
    (a, b) => (b[1] > a[1] ? b : a),
    ["home", 0],
  )[0];
  const pts = ticks
    .map((t, i) => {
      const x = (i / (ticks.length - 1)) * (w - 2) + 1;
      const y = h - 1 - (t.p[lead] || 0) * (h - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    lead === "home"
      ? "var(--up)"
      : lead === "away"
        ? "var(--down)"
        : "var(--neutral)";
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
  const t0 = ticks[0].t,
    t1 = ticks[ticks.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const paths = new Map();

  function path(outcome) {
    if (paths.has(outcome)) return paths.get(outcome);
    const result = ticks
      .map((tt, i) => {
        const x = pad.l + ((tt.t - t0) / span) * iw;
        const y = pad.t + (1 - (tt.p[outcome] || 0)) * ih;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    paths.set(outcome, result);
    return result;
  }
  function area(outcome) {
    const top = path(outcome);
    return `${top} L${(pad.l + iw).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l.toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  }

  const ylabels = [0, 0.25, 0.5, 0.75, 1]
    .map((y) => {
      const py = pad.t + (1 - y) * ih;
      return `
      <line class="grid x" x1="${pad.l}" y1="${py.toFixed(1)}" x2="${(pad.l + iw).toFixed(1)}" y2="${py.toFixed(1)}"/>
      <text class="axis-label" x="${pad.l - 6}" y="${(py + 3).toFixed(1)}" text-anchor="end">${(y * 100).toFixed(0)}%</text>
    `;
    })
    .join("");

  const xlabels = [0, 0.25, 0.5, 0.75, 1]
    .map((p) => {
      const px = pad.l + p * iw;
      const lbl = timeFormatter.format(new Date(t0 + p * span));
      return `<text class="axis-label" x="${px.toFixed(1)}" y="${(pad.t + ih + 14).toFixed(1)}" text-anchor="middle">${lbl}</text>`;
    })
    .join("");

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

async function renderDashboard(r = state.route) {
  const view = r?.view ?? $("#view");
  await refreshDashboard();
  if (!isActiveView(view)) return;
  const d = state.dashboard,
    u = state.user,
    headline = d?.headline;
  const streak = u?.streak?.current ?? 0;
  view.innerHTML = `
    <div class="ledger-heading"><div><div class="eyebrow">Your daily edition <span>—</span> No. 01</div><h1>A good day to<br><em>back your instinct.</em></h1><p>The fixtures, the figures, and your next chapter.</p></div><div class="edition-stamp"><span>STREAK & CO.</span><strong>THE<br>DAILY BOOK</strong><span>FOOTBALL · ON RECORD</span></div></div>
    <div class="kpis overview-kpis">
      <div class="kpi"><span class="l">01 / Available balance</span><span class="v">${fmtCkb(u?.escrowCkb)} <small>CKB</small></span><a class="d" href="#/wallet">Manage your funds ↗</a></div>
      <div class="kpi"><span class="l">02 / Net returns</span><span class="v ${pnlClass(u?.stats.netPnlShannons)}">${fmtPnl(Number(u?.stats.netPnlShannons || 0) / 1e8)} <small>CKB</small></span><span class="d">Your settled positions</span></div>
      <div class="kpi"><span class="l">03 / Win rate</span><span class="v">${u?.winRate ?? 0}<small>%</small></span><span class="d">${u?.stats.wonBets ?? 0} won · ${u?.stats.lostBets ?? 0} lost</span></div>
      <div class="kpi"><span class="l">04 / The current run</span><span class="v">${streak}<small> in a row</small><span class="streak-spark">✳</span></span><span class="d">Personal best: ${u?.streak.best ?? 0}</span></div>
    </div>
    <div class="section-heading"><h2>On the desk today</h2><a class="text-link" href="#/markets">All markets <span>↗</span></a></div>
    <div class="grid-2 desk-grid">
      <section class="panel featured-market"><div class="panel-h"><span class="title"><span class="red-dot"></span> The featured fixture</span><span class="meta">${headline ? esc(competitionName(headline.match)) : "The fixture book"}</span></div><div class="panel-b">${headline ? headlineCard(headline) : '<div class="empty-ledger"><span>↗</span><h3>A quiet page, for now.</h3><p>Fresh fixtures will appear here when markets open.</p><a class="text-link" href="#/fixtures">See the schedule →</a></div>'}</div></section>
      <section class="journal-card"><div class="journal-top"><span class="eyebrow">A little, every day.</span><span>06 /</span></div><h2>Keep the<br><em>story going.</em></h2><p>One considered pick a day.<br>Let a good run write itself.</p><div class="streak-dots" aria-label="Current streak: ${streak}">${Array.from({ length: 7 }, (_, i) => `<span class="${i < Math.min(streak, 7) ? "done" : ""}">${i < Math.min(streak, 7) ? "✓" : String(i + 1).padStart(2, "0")}</span>`).join("")}</div><a class="btn journal-cta" href="#/streak">${u?.streak?.status === "failed" ? "Review your streak" : "Your daily streak"} <span>↗</span></a><span class="journal-note">${streak ? streak + " chapters and counting." : "Every streak begins with one."}</span></section>
    </div>
    ${Number(u?.escrowCkb || 0) <= 0 ? '<div class="fund-hint"><span class="fh-ico">↗</span><span class="fh-txt"><b>Your first entry starts here.</b> Add CKB to your account when you’re ready to make a pick.</span><a class="text-link" href="#/wallet">Add funds →</a></div>' : ""}
    <div class="grid-2 desk-bottom"><section class="panel"><div class="panel-h"><span class="title">Recent entries</span><span class="meta">From across the book</span></div><div class="entry-list">${
      (d?.recentBets ?? [])
        .slice(0, 4)
        .map(
          (b, i) =>
            `<div class="ledger-entry"><span class="entry-no">${String(i + 1).padStart(2, "0")}</span><div><strong>${esc(b.matchLabel)}</strong><small>@${esc(b.user)} <span>·</span> ${esc(b.outcome)} pick</small></div><span class="entry-amount">${fmtCkb(b.amountCkb)} <small>CKB</small></span></div>`,
        )
        .join("") ||
      '<div class="quiet-note">The book is open. The first entry is still to come.</div>'
    }</div></section>
    <section class="panel"><div class="panel-h"><span class="title">Names to follow</span><a class="text-link" href="#/leaderboard">The standings ↗</a></div><table class="tbl"><thead><tr><th>No.</th><th>Bookkeeper</th><th class="right">Run</th><th class="right">Return</th></tr></thead><tbody>${(d?.leaderboardTop ?? []).map((row) => `<tr class="${row.isMe ? "me" : ""}"><td class="mono">${String(row.rank).padStart(2, "0")}</td><td>@${esc(row.username)}</td><td class="num">${row.current}</td><td class="num ${pnlClass(row.netPnlCkb)}">${fmtPnl(row.netPnlCkb)}</td></tr>`).join("") || '<tr><td colspan="4" class="quiet-note">Room for a name. Perhaps yours.</td></tr>'}</tbody></table></section></div>
    <div class="page-colophon"><span>Streak — The football ledger</span><span>Keep a good record.</span><span>01</span></div>
  `;
  bindHeadline();
  startPolling(renderDashboard);
  if (!state.onboardingShown) {
    state.onboardingShown = true;
    showOnboarding(false);
  }
}

function headlineCard(m) {
  return `
    <div class="fixture-dateline"><span>${esc(m.match.stage || "Match winner")}</span><span>${fmtDateTime(m.closesAt)} <span class="dim">·</span> ${m.status === "open" ? "Closes in " + timeUntil(m.closesAt) : esc(m.status)}</span></div>
    <div class="feature-teams"><div class="feature-team">${teamMark(m.match.home)}<h3>${esc(m.match.home.name)}</h3><span>HOME</span></div><div class="feature-versus">${m.match.status === "final" || m.match.status === "live" ? `<strong>${m.match.score?.home ?? 0} : ${m.match.score?.away ?? 0}</strong>` : "<i>v.</i>"}</div><div class="feature-team">${teamMark(m.match.away)}<h3>${esc(m.match.away.name)}</h3><span>AWAY</span></div></div>
    <div class="feature-outcomes">${["home", "draw", "away"].map((o) => `<button class="outcome ${o}" data-go="${esc(m.id)}"><span>${o === "home" ? "Home win" : o === "away" ? "Away win" : "The draw"}</span><strong>${fmtPct(m.prices[o])}</strong><small>${fmtOdds(m.prices[o])}×</small></button>`).join("")}</div>
    <div class="fixture-bottom"><span>${fmtCkb(m.totalPoolCkb)} CKB in the pool</span><a class="text-link" href="#/market/${encodeURIComponent(m.id)}">Open the market ↗</a></div>
  `;
}

function bindHeadline() {
  document.querySelectorAll(".outcome[data-go]").forEach((b) => {
    b.onclick = () => {
      location.hash = `#/market/${b.dataset.go}`;
    };
  });
}

// ───────────────────────────────────────────────────────── markets list ────

async function renderMarkets(r) {
  const view = r?.view ?? $("#view");
  const competitions = state.liveStatus?.competitions || [];
  view.innerHTML = `
    <div class="page-h">
      <h1>Markets</h1>
      <span class="sub"></span>
      <div class="right">
        <select class="input" id="flt" aria-label="Market state" style="width:auto;font-size:11px">
          <option value="">All states</option>
          <option value="open" selected>Open</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
        </select>
        <select class="input" id="cmp-flt" aria-label="Competition" style="width:auto;font-size:11px">
          <option value="">All competitions</option>
          ${competitionOptions(competitions)}
        </select>
      </div>
    </div>
    <div id="mkt-body">${spinner()}</div>
  `;
  view.querySelector("#flt").onchange = (e) => {
    loadMarkets(
      e.target.value || undefined,
      view.querySelector("#cmp-flt")?.value || undefined,
      view,
    ).catch((error) => toast(error.message, "err"));
  };
  view.querySelector("#cmp-flt").onchange = (e) => {
    loadMarkets(
      view.querySelector("#flt")?.value || undefined,
      e.target.value || undefined,
      view,
    ).catch((error) => toast(error.message, "err"));
  };
  // Provider metadata fills the selector independently of the actual market list.
  if (!competitions.length)
    api("/status")
      .then((status) => {
        if (!isActiveView(view)) return;
        state.liveStatus = status.live;
        const select = view.querySelector("#cmp-flt");
        if (select)
          select.innerHTML = `<option value="">All competitions</option>${competitionOptions(status.live?.competitions, select.value)}`;
        updateStatusBar();
      })
      .catch(() => {});
  await loadMarkets("open", undefined, view);
  if (!isActiveView(view)) return;
  startPolling(() =>
    loadMarkets(
      view.querySelector("#flt")?.value || undefined,
      view.querySelector("#cmp-flt")?.value || undefined,
      view,
    ),
  );
}

async function loadMarkets(status, competition, view = $("#view")) {
  if (!isActiveView(view)) return;
  const request = (view.marketRequest || 0) + 1;
  view.marketRequest = request;
  const body = view.querySelector("#mkt-body");
  if (!body) return;
  body.setAttribute("aria-busy", "true");
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (competition) params.set("competition", competition);
  let data;
  try {
    data = await api(`/markets${params.size ? `?${params}` : ""}`);
  } finally {
    if (view.marketRequest === request) body.removeAttribute("aria-busy");
  }
  if (!isActiveView(view) || view.marketRequest !== request) return;
  const ms = data.markets || [];
  const signature = JSON.stringify(ms);
  if (body.marketSignature === signature) return;
  body.marketSignature = signature;
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
            <th>Competition</th>
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
          ${ms
            .map(
              (m) => `
            <tr class="mkt-row" data-go="${m.id}">
              <td class="tm">
                ${teamMark(m.match.home)}<span class="code">${m.match.home.code}</span>
                <span class="vs">vs</span>
                <span class="code">${m.match.away.code}</span>${teamMark(m.match.away)}
                ${m.match.status === "final" ? `<span class="mono dim" style="margin-left:8px">${m.match.score?.home ?? 0}–${m.match.score?.away ?? 0}</span>` : ""}
              </td>
              <td class="small">${esc(competitionName(m.match))}</td>
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
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  body.querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => {
      location.hash = `#/market/${tr.dataset.go}`;
    };
  });
  prepareRouteActions(body);
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

function fixtureStatusChip(match) {
  if (match.status === "live") return `<span class="chip live">LIVE</span>`;
  if (match.status === "final")
    return `<span class="chip resolved">FINAL</span>`;
  if (match.status === "suspended")
    return `<span class="chip closed">SUSPENDED</span>`;
  if (match.status === "postponed")
    return `<span class="chip closed">POSTPONED</span>`;
  if (match.status === "cancelled")
    return `<span class="chip void">CANCELLED</span>`;
  return `<span class="chip">SCHEDULED</span>`;
}

function insightPct(source, outcome, hasSample = true) {
  const value = source?.probabilities?.[outcome];
  return hasSample && Number.isFinite(value) ? fmtPct(value) : "—";
}

function strongestOutcome(source) {
  if (!source?.probabilities) return null;
  return ["home", "draw", "away"].reduce(
    (best, outcome) =>
      source.probabilities[outcome] > source.probabilities[best]
        ? outcome
        : best,
    "home",
  );
}

function insightComparisonHtml(insights, market) {
  const outcomes = [
    ["home", market.match.home.name],
    ["draw", "Draw"],
    ["away", market.match.away.name],
  ];
  const crowdHasSample = insights.crowd.totalBets > 0;
  const leaders = {
    crowd: crowdHasSample ? strongestOutcome(insights.crowd) : null,
    machine: strongestOutcome(insights.machine),
    books: strongestOutcome(insights.bookmakers),
  };
  return `
    <div class="insight-table">
      <div class="insight-row insight-head">
        <span>Outcome</span><span>Crowd</span><span>Machine</span><span>Books</span>
      </div>
      ${outcomes
        .map(
          ([outcome, label]) => `
        <div class="insight-row">
          <span class="insight-team">${esc(label)}</span>
          <span class="${leaders.crowd === outcome ? "insight-lead" : ""}">${insightPct(insights.crowd, outcome, crowdHasSample)}</span>
          <span class="${leaders.machine === outcome ? "insight-lead" : ""}">${insightPct(insights.machine, outcome)}</span>
          <span class="${leaders.books === outcome ? "insight-lead" : ""}">${insightPct(insights.bookmakers, outcome)}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function teamTableCard(team, side) {
  if (!team)
    return `<div class="insight-team-card dim">${esc(side)} table data unavailable</div>`;
  return `
    <div class="insight-team-card">
      <div><span class="code">${esc(team.name)}</span><span class="rank">#${team.rank}</span></div>
      <div class="insight-statline"><span>${team.points} pts</span><span>${team.played} played</span><span>${team.goalsFor}:${team.goalsAgainst} goals</span></div>
      <div class="dim mono" style="font-size:10px">FORM · ${esc(team.form || "—")} · ${team.won}W ${team.drawn}D ${team.lost}L</div>
    </div>
  `;
}

function marketInsightsHtml(insights, market) {
  const machine = insights.machine;
  const books = insights.bookmakers;
  const h2h = insights.headToHead || [];
  return `
    ${insightComparisonHtml(insights, market)}
    <div class="insight-summary">
      <div>
        <span class="label">MODEL READ</span>
        <span>${machine?.advice ? esc(machine.advice) : "Prediction unavailable"}</span>
        ${machine?.predictedWinner?.comment ? `<span class="dim">${esc(machine.predictedWinner.comment)}</span>` : ""}
      </div>
      <div>
        <span class="label">BOOK CONSENSUS</span>
        <span>${books ? `${books.bookmakerCount} bookmakers · ${(books.averageMargin * 100).toFixed(1)}% mean margin` : "Not available yet"}</span>
        ${books?.updatedAt ? `<span class="dim">Updated ${fmtDateTime(books.updatedAt)}</span>` : ""}
      </div>
    </div>
    ${
      insights.table?.home || insights.table?.away
        ? `
      <div class="insight-context-grid">
        ${teamTableCard(insights.table?.home, "Home")}
        ${teamTableCard(insights.table?.away, "Away")}
      </div>
    `
        : ""
    }
    ${
      h2h.length
        ? `
      <div class="insight-h2h">
        <span class="label">LAST ${h2h.length} MEETINGS</span>
        ${h2h
          .map(
            (item) => `
          <div><span>${fmtDateTime(item.date)}</span><span>${esc(item.home)} <b>${item.homeGoals}–${item.awayGoals}</b> ${esc(item.away)}</span></div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }
    ${
      (insights.warnings || []).length
        ? `
      <div class="insight-warnings">${insights.warnings.map((warning) => `<span>△ ${esc(warning)}</span>`).join("")}</div>
    `
        : ""
    }
    <div class="insight-foot">
      <span>${insights.frozen ? "FROZEN AT KICKOFF" : `LIVE PRE-MATCH · fetched ${fmtDateTime(insights.fetchedAt)}`}</span>
      ${insights.snapshotHash ? `<span title="${esc(insights.snapshotHash)}">SHA256 · ${esc(insights.snapshotHash.slice(0, 12))}…</span>` : ""}
    </div>
  `;
}

async function loadMarketInsights(market, view = $("#view"), attempt = 0) {
  const body = view?.querySelector("#insights-body");
  const meta = view?.querySelector("#insights-meta");
  if (!body || !isActiveView(view)) return;
  try {
    const data = await api(
      `/markets/${encodeURIComponent(market.id)}/insights`,
      { force: attempt > 0 },
    );
    if (!isActiveView(view) || !body.isConnected || !meta?.isConnected) return;
    meta.innerHTML = data.insights.frozen
      ? `<span class="chip resolved">FROZEN</span>`
      : `<span class="chip live">PRE-MATCH</span>`;
    const html = marketInsightsHtml(data.insights, market);
    if (body.innerHTML !== html) body.innerHTML = html;
    view.insightsRefreshing = !!data.refreshing;
    clearTimeout(view.insightsTimer);
    if (data.refreshing && attempt < 4) {
      view.insightsTimer = setTimeout(
        () => {
          if (isActiveView(view) && !document.hidden)
            loadMarketInsights(market, view, attempt + 1);
        },
        1500 * 2 ** attempt,
      );
    }
  } catch (error) {
    if (isActiveView(view) && body.isConnected) {
      body.innerHTML = `<div class="dim mono center" style="padding:24px">ANALYTICS UNAVAILABLE · ${esc(error.message)}</div>`;
    }
  }
}

// ──────────────────────────────────────────────────────── market detail ────

async function renderMarketDetail(r) {
  const id = r.params[0];
  if (!id) {
    location.hash = "#/markets";
    return;
  }
  const view = $("#view");
  view.innerHTML = spinner();

  const { market: m } = await api(`/markets/${encodeURIComponent(id)}`);
  if (!isActiveView(view)) return;
  view.market = m;
  view.marketSignature = JSON.stringify(m);
  view.innerHTML = `
    <div class="page-h">
      <h1>${esc(m.match.home.name)} <span class="dim" style="font-weight:400">vs</span> ${esc(m.match.away.name)}</h1>
      <span class="sub">${esc(competitionName(m.match))} · ${esc(m.match.stage)} · kickoff ${fmtDateTime(m.closesAt)}</span>
      <div class="right"><span id="market-state">${marketStatusChip(m)}</span><a class="btn btn-ghost" href="#/markets">← Back</a></div>
    </div>

    <div class="match-card">
      <div class="side">
        ${teamMark(m.match.home)}
        <div class="meta"><span class="code">${m.match.home.code}</span><span class="nm">${esc(m.match.home.name)}</span></div>
      </div>
      <div class="center">
        ${
          m.match.status === "final" || m.match.status === "live"
            ? `<span class="score" id="market-score">${m.match.score?.home ?? 0} : ${m.match.score?.away ?? 0}</span>`
            : `<span class="vs" id="market-score">vs</span>`
        }
        <span class="kick" id="market-kick">${m.match.status === "live" ? "LIVE" : m.status === "open" ? `closes in ${timeUntil(m.closesAt)}` : fmtDateTime(m.closesAt)}</span>
      </div>
      <div class="side away">
        <div class="meta" style="align-items:flex-end"><span class="code">${m.match.away.code}</span><span class="nm">${esc(m.match.away.name)}</span></div>
        ${teamMark(m.match.away)}
      </div>
    </div>

    <div class="detail-grid">
      <div class="col">
        <div class="panel">
          <div class="panel-h">
            <span class="title">Implied Probability</span>
            <span class="meta" id="market-pool-meta">Total pool · ${fmtCkb(m.totalPoolCkb)} CKB · ${m.totalBets} bets · ${m.uniqueBettors} traders</span>
          </div>
          <div id="market-chart">${chartSvg(m.history)}</div>
        </div>

        <div class="panel" id="market-insights">
          <div class="panel-h">
            <span class="title">Market vs Machine</span>
            <span class="meta" id="insights-meta">${spinnerInline()}</span>
          </div>
          <div class="panel-b" id="insights-body">${spinner()}</div>
        </div>

        <div class="panel">
          <div class="panel-h">
            <span class="title">Bet Feed</span>
            <span class="meta" id="market-feed-meta">last ${m.feed.length}</span>
          </div>
          <div class="feed" id="feed">
            ${
              m.feed.length === 0
                ? `<div class="dim mono center" style="padding:30px;font-size:11px;letter-spacing:0.14em">NO BETS YET — BE FIRST</div>`
                : m.feed
                    .map(
                      (f) => `
                <div class="feed-row">
                  <span class="t">${fmtTime(f.placedAt)}</span>
                  <span class="o ${f.outcome}">${f.outcome.toUpperCase()}</span>
                  <span class="u">@${esc(f.user)}</span>
                  <span class="a">${fmtCkb(f.amountCkb)} CKB <span class="dim">@ ${fmtPct(f.priceAtBet)}</span></span>
                </div>
              `,
                    )
                    .join("")
            }
          </div>
        </div>

        ${
          m.myPositions.length
            ? `
          <div class="panel">
            <div class="panel-h"><span class="title">My Positions</span><span class="meta">${m.myPositions.length}</span></div>
            <table class="tbl">
              <thead><tr><th>Side</th><th class="right">Stake</th><th class="right">Entry</th><th>Status</th><th class="right">Payout</th><th></th></tr></thead>
              <tbody>
                ${m.myPositions
                  .map(
                    (p) => `
                  <tr>
                    <td><span class="chip ${p.outcome === "home" ? "open" : p.outcome === "away" ? "failed" : "closed"}">${p.outcome.toUpperCase()}</span> ${p.isStreakPick ? `<span class="tag-streak">STREAK</span>` : ""}</td>
                    <td class="num">${fmtCkb(p.amountCkb)}</td>
                    <td class="num small">${fmtPct(p.priceAtBet)}</td>
                    <td class="small">${p.settled ? (p.payoutCkb && Number(p.payoutCkb) > 0 ? `<span class="up">SETTLED</span>` : `<span class="down">LOST</span>`) : "<span class='amber'>OPEN</span>"}</td>
                    <td class="num ${p.settled && Number(p.payoutCkb || 0) > Number(p.amountCkb) ? "up" : ""}">${p.settled ? fmtCkb(p.payoutCkb) : "—"}</td>
                    <td class="small">${fmtDateTime(p.placedAt)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
            : ""
        }
      </div>

      <div class="col">
        <div class="panel">
          <div class="panel-h"><span class="title">${m.status === "open" ? "Place Bet" : "Market " + m.status.toUpperCase()}</span></div>
          <div class="panel-b">${m.status === "open" ? betPanelHtml(m) : marketSummaryHtml(m)}</div>
        </div>

        ${
          m.status === "resolved" || m.status === "void"
            ? `
          <div class="panel" id="settlement-panel">
            <div class="panel-h">
              <span class="title">On-chain Settlement</span>
              <span class="meta" id="settlement-badge">${spinnerInline()}</span>
            </div>
            <div class="panel-b" id="settlement-body">${spinner()}</div>
          </div>
        `
            : ""
        }

        <div class="panel">
          <div class="panel-h"><span class="title">Pool Composition</span></div>
          <div class="panel-b" id="market-pools">
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
  if (m.status === "resolved" || m.status === "void")
    loadSettlementPanel(m, view);
  loadMarketInsights(m, view);
  startPolling(renderMarketDetail);
}

async function refreshMarketDetail(r) {
  const view = r?.view;
  if (!isActiveView(view) || !view.market) return;
  const { market: fresh } = await api(
    `/markets/${encodeURIComponent(view.market.id)}`,
  );
  if (!isActiveView(view) || state.route !== r) return;
  const signature = JSON.stringify(fresh);
  if (view.insightsRefreshing) loadMarketInsights(fresh, view, 1);
  if (signature === view.marketSignature) return;
  // A market closing changes which actions are available. Otherwise only the
  // live figures change; stake inputs, chosen side, focus and handlers survive.
  if (fresh.status !== view.market.status) return renderMarketDetail(r);
  Object.assign(view.market, fresh);
  view.marketSignature = signature;
  const setText = (selector, text) => {
    const element = view.querySelector(selector);
    if (element && element.textContent !== text) element.textContent = text;
  };
  const setHtml = (selector, html) => {
    const element = view.querySelector(selector);
    if (element && element.innerHTML !== html) element.innerHTML = html;
  };
  const scored =
    fresh.match.status === "live" || fresh.match.status === "final";
  const score = view.querySelector("#market-score");
  if (score) score.className = scored ? "score" : "vs";
  setText(
    "#market-score",
    scored
      ? `${fresh.match.score?.home ?? 0} : ${fresh.match.score?.away ?? 0}`
      : "vs",
  );
  setText(
    "#market-kick",
    fresh.match.status === "live"
      ? "LIVE"
      : fresh.status === "open"
        ? `closes in ${timeUntil(fresh.closesAt)}`
        : fmtDateTime(fresh.closesAt),
  );
  setText(
    "#market-pool-meta",
    `Total pool · ${fmtCkb(fresh.totalPoolCkb)} CKB · ${fresh.totalBets} bets · ${fresh.uniqueBettors} traders`,
  );
  setText("#market-feed-meta", `last ${fresh.feed.length}`);
  setHtml("#market-state", marketStatusChip(fresh));
  setHtml("#market-chart", chartSvg(fresh.history));
  setHtml("#market-pools", poolBreakdownHtml(fresh));
  setHtml(
    "#feed",
    fresh.feed.length
      ? fresh.feed
          .map(
            (entry) => `
    <div class="feed-row"><span class="t">${fmtTime(entry.placedAt)}</span><span class="o ${entry.outcome}">${entry.outcome.toUpperCase()}</span><span class="u">@${esc(entry.user)}</span><span class="a">${fmtCkb(entry.amountCkb)} CKB <span class="dim">@ ${fmtPct(entry.priceAtBet)}</span></span></div>
  `,
          )
          .join("")
      : `<div class="dim mono center" style="padding:30px">No bets yet. Make the first entry.</div>`,
  );
  for (const outcome of ["home", "draw", "away"]) {
    setText(`[data-pick="${outcome}"] .p`, fmtPct(fresh.prices[outcome]));
    setText(
      `[data-pick="${outcome}"] .o`,
      `${fmtOdds(fresh.prices[outcome])}× odds`,
    );
  }
  view.refreshBetSummary?.();
}

function poolBreakdownHtml(m) {
  const total = Math.max(
    1,
    Number(m.pools.home) + Number(m.pools.draw) + Number(m.pools.away),
  );
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
        ${["home", "draw", "away"]
          .map(
            (o) => `
          <div class="outcome ${o}" data-pick="${o}">
            <div class="l">${o === "home" ? m.match.home.code : o === "away" ? m.match.away.code : "DRAW"}</div>
            <div class="p">${fmtPct(m.prices[o])}</div>
            <div class="o">${fmtOdds(m.prices[o])}× odds</div>
          </div>
        `,
          )
          .join("")}
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

      ${
        state.user?.streak.status === "active" &&
        state.user?.streak.lastPickDate !== localDateKey()
          ? `
        <label class="opt"><input type="checkbox" id="bet-streak"/>Lock as today's streak pick (+1 streak if it wins)</label>
      `
          : ""
      }

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
  const sumSide = $("#sum-side"),
    sumPrice = $("#sum-price"),
    sumOdds = $("#sum-odds"),
    sumPayout = $("#sum-payout");
  const goBtn = $("#bet-go");
  const amtInput = $("#bet-amt");

  function recompute() {
    if (!side) {
      goBtn.disabled = true;
      goBtn.textContent = "SELECT A SIDE";
      return;
    }
    if (!amt || amt < 10) {
      goBtn.disabled = true;
      goBtn.textContent = "ENTER STAKE ≥ 10 CKB";
      return;
    }
    const code =
      side === "home"
        ? m.match.home.code
        : side === "away"
          ? m.match.away.code
          : "DRAW";
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
    b.tabIndex = 0;
    b.setAttribute("role", "button");
    b.setAttribute("aria-pressed", "false");
    b.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        b.click();
      }
    };
    b.onclick = () => {
      side = b.dataset.pick;
      document.querySelectorAll(".bet-panel .outcome").forEach((x) => {
        x.classList.toggle("selected", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      recompute();
    };
  });
  document.querySelectorAll(".bet-panel .quick button").forEach((b) => {
    b.onclick = () => {
      amtInput.value = b.dataset.amt;
      amt = Number(b.dataset.amt);
      recompute();
    };
  });
  amtInput.oninput = () => {
    amt = Number(amtInput.value);
    recompute();
  };
  const view = $("#view");
  view.refreshBetSummary = recompute;

  goBtn.onclick = async () => {
    if (!side) return;
    const asStreakPick = $("#bet-streak")?.checked;
    confirmBet({ market: m, side, amount: amt, asStreakPick });
  };
}

function confirmBet({ market, side, amount, asStreakPick }) {
  const code =
    side === "home"
      ? market.match.home.code
      : side === "away"
        ? market.match.away.code
        : "DRAW";
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
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      const r = await api(`/markets/${encodeURIComponent(market.id)}/bet`, {
        method: "POST",
        body: { outcome: side, amountCkb: amount, asStreakPick },
      });
      closeModal();
      toast(`Bet locked · escrow now ${r.newEscrowCkb} CKB`, "ok");
      await refreshUser();
      if (state.route?.name === "market" && state.route.params[0] === market.id)
        renderMarketDetail(state.route);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Lock Bet";
      toast(err.message, "err");
      if (err.code === "insufficient_escrow") {
        setTimeout(() => {
          closeModal();
          location.hash = "#/wallet";
        }, 1200);
      }
    }
  };
}

// ──────────────────────────────────────────────────────── streak page ─────

async function renderStreak(r = state.route) {
  const view = $("#view");
  let u = state.user;
  const today = localDateKey();

  // Fetch dashboard + open markets together to cut a round-trip off tab load.
  const [, marketsResp] = await Promise.all([
    refreshDashboard(),
    api("/markets?status=open"),
  ]);
  if (!isActiveView(view)) return;
  u = state.user || u;
  const canPick =
    u.streak.status === "active" && u.streak.lastPickDate !== today;
  const { markets } = marketsResp;
  const todays = (markets || []).filter(
    (m) => localDateKey(m.closesAt) === today,
  );
  const visibleMarkets = todays.length ? todays : (markets || []).slice(0, 8);

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
        ${
          u.streak.status === "failed"
            ? `<button class="btn btn-amber" id="renew">REVIVE · ${state.dashboard?.constants.renewFeeCkb ?? 63} CKB</button><button class="btn btn-ghost" id="reset">RESET TO 0</button>${state.dashboard?.crewRevive?.eligible ? `<div class="dim mono up" style="font-size:10px;text-align:right;margin-top:2px">+${fmtCkb(state.dashboard.crewRevive.rebateCkb)} CKB crew rebate applies</div>` : ""}`
            : canPick
              ? `<div class="dim mono" style="font-size:11px;text-align:right">Pick any market below and<br/>check "streak pick" to lock it.</div>`
              : `<div class="dim mono" style="font-size:11px;text-align:right">Streak pick locked for today.<br/>Come back tomorrow.</div>`
        }
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-h"><span class="title">Today's Markets</span><span class="meta">${todays.length} open</span></div>
      ${
        visibleMarkets.length === 0
          ? `<div class="panel-b dim mono center" style="padding:30px;font-size:11px;letter-spacing:0.14em">NO OPEN MATCHES AVAILABLE — CHECK THE SCHEDULE</div>`
          : `<table class="tbl">
            <thead><tr><th>Match</th><th>Stage</th><th class="right">Home</th><th class="right">Draw</th><th class="right">Away</th><th class="right">Closes</th><th></th></tr></thead>
            <tbody>${visibleMarkets
              .map(
                (m) => `
              <tr class="mkt-row" data-go="${m.id}">
                <td class="tm">${teamMark(m.match.home)}<span class="code">${m.match.home.code}</span><span class="vs">vs</span><span class="code">${m.match.away.code}</span>${teamMark(m.match.away)}</td>
                <td class="small">${esc(m.match.stage)}</td>
                <td class="num up">${fmtPct(m.prices.home)}</td>
                <td class="num neutral">${fmtPct(m.prices.draw)}</td>
                <td class="num down">${fmtPct(m.prices.away)}</td>
                <td class="num small">${timeUntil(m.closesAt)}</td>
                <td><a class="btn btn-sm">OPEN ›</a></td>
              </tr>`,
              )
              .join("")}
            </tbody>
           </table>`
      }
      ${
        todays.length === 0 && visibleMarkets.length > 0
          ? `<div class="panel-b dim mono" style="font-size:10.5px;padding-top:0">No open matches fall on your local date right now. Showing next open markets instead.</div>`
          : ""
      }
    </div>
  `;

  view.querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => {
      location.hash = `#/market/${tr.dataset.go}`;
    };
  });
  if ($("#renew")) $("#renew").onclick = confirmRenew;
  if ($("#reset")) $("#reset").onclick = confirmReset;
  prepareRouteActions(view);
}

function confirmRenew() {
  const fee = state.dashboard?.constants.renewFeeCkb ?? 63;
  const revive = state.dashboard?.crewRevive;
  const rebateLine =
    revive && revive.eligible
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
    btn.disabled = true;
    btn.textContent = "Approve in wallet…";
    let txHash;
    try {
      txHash = await broadcastTransfer(fee);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Sign & Send";
      toast(err.message, "err");
      return;
    }
    closeModal();
    toast("Revive submitted — confirming on-chain…", "ok");
    runBackground(`Reviving streak · ${fee} CKB`, async () => {
      const r = await confirmTreasuryTx("/renew", txHash);
      const extra =
        Number(r.rebateCkb) > 0
          ? ` · +${fmtCkb(r.rebateCkb)} CKB crew rebate`
          : "";
      toast(`Streak revived${extra}`, "ok");
      await refreshDashboard();
      await refreshUser();
      if (state.route?.name === "streak") renderStreak();
    });
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
    const button = $("#reset-go");
    button.disabled = true;
    button.textContent = "Resetting…";
    try {
      await api("/reset", { method: "POST" });
      closeModal();
      toast("Streak reset to 0", "ok");
      await refreshUser();
      if (state.route?.name === "streak") renderStreak();
    } catch (err) {
      button.disabled = false;
      button.textContent = "Reset to 0";
      toast(err.message, "err");
    }
  };
}

// ─────────────────────────────────────────────────────── portfolio ────────

async function renderPortfolio() {
  const view = $("#view");
  view.innerHTML = spinner();
  const data = await api("/portfolio");
  if (!isActiveView(view)) return;
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
      ${
        data.positions.length === 0
          ? `<div class="panel-b dim mono center" style="padding:40px;font-size:11px;letter-spacing:0.14em">NO POSITIONS YET — PLACE A BET ON MARKETS ›</div>`
          : `<table class="tbl">
            <thead><tr><th>Placed</th><th>Match</th><th>Side</th><th class="right">Stake</th><th class="right">Entry</th><th>Status</th><th class="right">Payout</th><th class="right">P&L</th></tr></thead>
            <tbody>${data.positions
              .map(
                (p) => `
              <tr class="mkt-row" data-go="${p.marketId}">
                <td class="small mono">${fmtDateTime(p.placedAt)}</td>
                <td>${esc(p.matchLabel)} ${p.isStreakPick ? `<span class="tag-streak">STREAK</span>` : ""}</td>
                <td><span class="o ${p.outcome} mono" style="text-transform:uppercase">${p.outcome}</span></td>
                <td class="num">${fmtCkb(p.amountCkb)}</td>
                <td class="num small">${fmtPct(p.priceAtBet)}</td>
                <td>${positionStatusChip(p)}</td>
                <td class="num">${p.settled ? fmtCkb(p.payoutCkb) : "—"}</td>
                <td class="num ${p.pnlCkb ? pnlClass(p.pnlCkb) : "dim"}">${p.pnlCkb ? fmtPnl(p.pnlCkb) : "—"}</td>
              </tr>`,
              )
              .join("")}
            </tbody>
          </table>`
      }
    </div>
  `;

  view.querySelectorAll("tr.mkt-row").forEach((tr) => {
    tr.onclick = () => {
      location.hash = `#/market/${tr.dataset.go}`;
    };
  });
  prepareRouteActions(view);
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
  if (!isActiveView(view)) return;

  view.innerHTML = `
    <div class="page-h">
      <h1>Account</h1>
      <span class="sub">Funding, custody, and Telegram notifications for your Streak account</span>
      <div class="right"><button class="btn btn-ghost" id="edit-username">DISPLAY NAME</button><a class="btn btn-ghost" href="${w.faucet}" target="_blank" rel="noopener">FAUCET ↗</a></div>
    </div>

    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span class="l">On-Chain Wallet</span><span class="v" data-wallet-balance>${fmtCkb(w.chainBalanceCkb)}</span><span class="d dim mono">${shortAddr(w.address)}</span></div>
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
          ${
            state.user?.telegramConnected
              ? `Connected${state.user?.telegramUsername ? ` as @${esc(state.user.telegramUsername)}` : ""}. You will receive personalized pick and settlement alerts.`
              : "Connect Telegram in one tap. We auto-link your chat when you press Start in the bot."
          }
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${
            state.user?.telegramConnected
              ? `<button class="btn btn-ghost btn-sm" id="tg-disconnect">Disconnect</button>`
              : `<button class="btn btn-amber btn-sm" id="tg-connect">Connect Telegram</button>`
          }
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
        ${
          w.recent.deposits.length === 0
            ? `<div class="panel-b dim mono" style="font-size:11px">—</div>`
            : `<table class="tbl"><thead><tr><th>When</th><th class="right">Amount</th><th>Tx</th></tr></thead><tbody>${w.recent.deposits.map((d) => `<tr><td class="small mono">${fmtDateTime(d.at)}</td><td class="num up">+${fmtCkb(d.amountCkb)}</td><td class="small mono"><a href="${d.explorer}" target="_blank" rel="noopener">${d.txHash.slice(0, 10)}…</a></td></tr>`).join("")}</tbody></table>`
        }
      </div>
      <div class="panel">
        <div class="panel-h"><span class="title">Recent Withdrawals</span></div>
        ${
          w.recent.withdraws.length === 0
            ? `<div class="panel-b dim mono" style="font-size:11px">—</div>`
            : `<table class="tbl"><thead><tr><th>When</th><th class="right">Amount</th><th>Tx / Status</th></tr></thead><tbody>${w.recent.withdraws.map((d) => `<tr><td class="small mono">${fmtDateTime(d.at)}</td><td class="num ${d.status === "failed" ? "dim" : "down"}">${d.status === "failed" ? "" : "−"}${fmtCkb(d.amountCkb)}</td><td class="small mono">${d.explorer ? `<a href="${esc(d.explorer)}" target="_blank" rel="noopener">${shortHash(d.txHash)}</a>` : ""}${d.status === "pending" ? '<span class="chip">PENDING</span>' : d.status === "failed" ? '<span class="chip failed">FAILED · REFUNDED</span>' : ""}</td></tr>`).join("")}</tbody></table>`
        }
      </div>
    </div>
  `;

  if (w.balanceRefreshing) hydrateWalletBalance();
  const depositInput = view.querySelector("#dep-amt");
  view.querySelector("#dep-go").onclick = async () => {
    const amt = Number(depositInput.value);
    if (!amt || amt < w.minOnchainCkb) {
      toast(`Minimum deposit is ${w.minOnchainCkb} CKB.`, "err");
      return;
    }
    const btn = $("#dep-go");
    btn.disabled = true;
    btn.textContent = "APPROVE IN WALLET…";
    let txHash;
    try {
      txHash = await broadcastTransfer(amt);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "SIGN & DEPOSIT";
      toast(err.message, "err");
      return;
    }
    // Broadcast done — confirm in the background so the user can keep navigating.
    depositInput.value = "";
    btn.disabled = false;
    btn.textContent = "SIGN & DEPOSIT";
    toast("Deposit submitted — confirming on-chain…", "ok");
    runBackground(`Depositing ${amt} CKB`, async () => {
      const r = await confirmTreasuryTx("/wallet/deposit", txHash);
      toast(`Deposited ${r.amountCkb} CKB · escrow updated`, "ok");
      await refreshUser();
      if (state.route?.name === "wallet") renderWallet();
    });
  };
  $("#wd-go").onclick = async () => {
    const amt = Number($("#wd-amt").value);
    if (!amt || amt < w.minOnchainCkb) {
      toast(`Minimum withdraw is ${w.minOnchainCkb} CKB.`, "err");
      return;
    }
    const btn = $("#wd-go");
    btn.disabled = true;
    btn.textContent = "SIGNING…";
    try {
      const r = await api("/wallet/withdraw", {
        method: "POST",
        body: { amountCkb: amt },
      });
      toast(`Withdrew ${r.amountCkb} CKB · tx ${r.txHash.slice(0, 10)}…`, "ok");
      await refreshUser();
      if (isActiveView(view)) renderWallet();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "SIGN & WITHDRAW";
      toast(err.message, "err");
    }
  };

  const eu = $("#edit-username");
  if (eu) eu.onclick = () => promptSetUsername(false);

  const tgConnect = $("#tg-connect");
  if (tgConnect) {
    tgConnect.onclick = async () => {
      const btn = tgConnect;
      btn.disabled = true;
      btn.textContent = "CREATING LINK…";
      try {
        const r = await api("/integrations/telegram/connect", {
          method: "POST",
        });
        window.open(r.url, "_blank", "noopener");
        toast("Telegram link opened — press Start in the bot", "ok");
      } catch (err) {
        toast(err.message, "err");
      } finally {
        btn.disabled = false;
        btn.textContent = "Connect Telegram";
      }
    };
  }
  const tgDisconnect = $("#tg-disconnect");
  if (tgDisconnect) {
    tgDisconnect.onclick = async () => {
      const btn = tgDisconnect;
      btn.disabled = true;
      btn.textContent = "DISCONNECTING…";
      try {
        const r = await api("/integrations/telegram/disconnect", {
          method: "POST",
        });
        state.user = r.user;
        toast("Telegram disconnected", "ok");
        if (isActiveView(view)) await renderWallet();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Disconnect";
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
  if (!isActiveView(view)) return;
  view.innerHTML = `
    <div class="page-h"><h1>Leaderboard</h1><span class="sub">Top 100 by realised P&L</span></div>
    <div class="panel">
      <table class="tbl">
        <thead><tr><th>Rank</th><th>User</th><th class="right">P&L (CKB)</th><th class="right">Turnover</th><th class="right">Streak</th><th class="right">Best</th><th class="right">Win Rate</th></tr></thead>
        <tbody>${
          (lb || [])
            .map(
              (r) => `
          <tr class="${r.isMe ? "me" : ""}">
            <td class="mono amber">${r.rank}</td>
            <td>@${esc(r.username)} ${r.isMe ? `<span class="tag-streak">YOU</span>` : ""}</td>
            <td class="num ${pnlClass(r.netPnlCkb)}">${fmtPnl(r.netPnlCkb)}</td>
            <td class="num small">${fmtCkb(r.turnoverCkb)}</td>
            <td class="num amber">${r.current}</td>
            <td class="num">${r.best}</td>
            <td class="num">${r.winRate}%</td>
          </tr>`,
            )
            .join("") ||
          `<tr><td colspan="7" class="dim mono center">NO PLAYERS YET</td></tr>`
        }
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
  if (!isActiveView(view)) return;
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

    ${
      crews.length === 0
        ? `<div class="panel"><div class="panel-b dim mono center" style="padding:44px;font-size:11px;letter-spacing:0.14em">
          NO CREWS YET — CREATE ONE AND SHARE THE INVITE CODE, OR JOIN A FRIEND'S WITH THEIR CODE
        </div></div>`
        : crews.map((c) => crewCard(c)).join("")
    }
  `;

  $("#crew-create").onclick = promptCreateCrew;
  const joinBtn = $("#crew-join-btn");
  if (joinBtn) joinBtn.onclick = () => doJoinCrew($("#crew-code").value);
  const codeInput = $("#crew-code");
  if (codeInput)
    codeInput.onkeydown = (e) => {
      if (e.key === "Enter") doJoinCrew(codeInput.value);
    };
  view.querySelectorAll("[data-copy]").forEach((el) => {
    el.onclick = () => {
      navigator.clipboard?.writeText(el.dataset.copy);
      toast("Invite code copied", "ok");
    };
  });
  view.querySelectorAll("[data-leave]").forEach((btn) => {
    btn.onclick = () => confirmLeaveCrew(btn.dataset.leave, btn.dataset.name);
  });
  view.querySelectorAll("[data-go]").forEach((el) => {
    el.onclick = () => {
      location.hash = `#/market/${el.dataset.go}`;
    };
  });
  prepareRouteActions(view);
}

function crewCard(c) {
  const hint = c.reviveHint;
  const reviveBanner =
    hint && hint.eligible
      ? `<div class="crew-revive up">
         <span>✓ Revive rebate ready — <span class="amber">+${fmtCkb(hint.rebateCkb)} CKB</span> to escrow.
         ${hint.coPickers.map(esc).join(", ")} also backed ${esc(hint.matchLabel || "the same match")}.</span>
         <a class="btn btn-sm btn-amber" href="#/streak">Revive ›</a>
       </div>`
      : hint
        ? `<div class="crew-revive dim">Your streak failed — no crew-mate co-picked that match, so no rebate yet. <a href="#/streak">Revive ›</a></div>`
        : "";

  const coPicks = c.coPicks.length
    ? `<div class="crew-copicks">${c.coPicks
        .map(
          (cp) => `
        <span class="copick-chip" data-go="m-${cp.matchId}" title="Open market">
          <span class="cp-match">${esc(cp.matchLabel)}</span>
          ${cp.outcome ? `<span class="o ${cp.outcome}">${cp.outcome.toUpperCase()}</span>` : `<span class="dim">SPLIT</span>`}
          <span class="cp-n">×${cp.members.length}</span>
        </span>`,
        )
        .join("")}</div>`
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
        <tbody>${c.members
          .map(
            (m, i) => `
          <tr class="${m.isMe ? "me" : ""}">
            <td class="mono amber">${i + 1}</td>
            <td>${m.isOwner ? `<span title="owner" class="amber">★</span> ` : ""}@${esc(m.username)} ${m.isMe ? `<span class="tag-streak">YOU</span>` : ""} ${m.status === "failed" ? `<span class="chip failed" style="margin-left:4px">FAILED</span>` : ""}</td>
            <td class="num amber">${m.current}</td>
            <td class="num">${m.best}</td>
            <td class="num small">${m.winRate}%</td>
            <td class="num ${pnlClass(m.netPnlCkb)}">${fmtPnl(m.netPnlCkb)}</td>
            <td class="small">${m.todayPick ? `${esc(m.todayPick.matchLabel)} <span class="o ${m.todayPick.outcome}">${m.todayPick.outcome.toUpperCase()}</span>` : `<span class="dim">—</span>`}</td>
          </tr>`,
          )
          .join("")}
        </tbody>
      </table>
      <div class="crew-sub">Crew feed</div>
      ${
        c.feed.length
          ? `<div class="crew-feed">${c.feed
              .map(
                (f) => `
            <div class="feed-row">
              <span class="feed-user">@${esc(f.user)}</span>
              <span class="feed-kind ${f.kind}">${f.kind === "win" ? "WON" : f.kind === "loss" ? "LOST" : "PICKED"}</span>
              <span class="o ${f.outcome}">${f.outcome.toUpperCase()}</span>
              <span class="feed-match">${esc(f.matchLabel)}</span>
              <span class="feed-time dim">${fmtDateTime(f.at)}</span>
            </div>`,
              )
              .join("")}</div>`
          : `<div class="dim mono" style="font-size:10.5px;padding:2px 2px">No streak-pick activity yet.</div>`
      }
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
    go.disabled = true;
    go.textContent = "Creating…";
    try {
      const { crew } = await api("/crews", { method: "POST", body: { name } });
      closeModal();
      toast(`Crew "${crew.name}" created · code ${crew.inviteCode}`, "ok");
      if (state.route?.name === "crews") renderCrews();
    } catch (err) {
      go.disabled = false;
      go.textContent = "Create";
      toast(err.message, "err");
    }
  };
  input.focus();
  input.onkeydown = (e) => {
    if (e.key === "Enter") go.click();
  };
}

async function doJoinCrew(code) {
  if (!code || !code.trim()) {
    toast("Enter an invite code", "err");
    return;
  }
  const button = $("#crew-join-btn");
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.textContent = "Joining…";
  }
  try {
    const { crew } = await api("/crews/join", {
      method: "POST",
      body: { code: code.trim() },
    });
    toast(`Joined "${crew.name}"`, "ok");
    if (state.route?.name === "crews") renderCrews();
  } catch (err) {
    toast(err.message, "err");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Join";
    }
  }
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
    const button = $("#crew-leave-go");
    button.disabled = true;
    button.textContent = "Leaving…";
    try {
      await api(`/crews/${encodeURIComponent(crewId)}/leave`, {
        method: "POST",
      });
      closeModal();
      toast("Left crew", "ok");
      if (state.route?.name === "crews") renderCrews();
    } catch (err) {
      button.disabled = false;
      button.textContent = "Leave crew";
      toast(err.message, "err");
    }
  };
}

// ──────────────────────────────────────────────────────── fixtures ────────

async function renderFixtures() {
  const view = $("#view");
  view.innerHTML = spinner();
  const { matches, competitions = [] } = await api("/matches");
  if (!isActiveView(view)) return;

  const draw = (selectedCompetition = "") => {
    const visible = selectedCompetition
      ? matches.filter(
          (match) =>
            String(match.competition?.id) === String(selectedCompetition),
        )
      : matches;
    const byDate = {};
    for (const match of visible) (byDate[match.date] ||= []).push(match);
    const dates = Object.keys(byDate).sort();
    const today = localDateKey();

    view.innerHTML = `
      <div class="page-h">
        <h1>Schedule</h1>
        <span class="sub">${visible.length} fixtures</span>
        <div class="right">
          <select class="input" id="fixture-cmp" aria-label="Competition" style="width:auto;font-size:11px">
            <option value="">All competitions</option>
            ${competitionOptions(competitions, selectedCompetition)}
          </select>
        </div>
      </div>
      ${
        dates.length
          ? dates
              .map(
                (date) => `
        <div class="panel" style="margin-bottom:10px">
          <div class="panel-h">
            <span class="title">${new Date(date + "T00:00:00Z").toUTCString().slice(0, 16)}</span>
            ${date === today ? `<span class="chip live" style="margin-left:8px">TODAY</span>` : ""}
            <span class="meta">${byDate[date].length} matches</span>
          </div>
          <table class="tbl">
            <thead><tr><th>Kickoff</th><th>Competition</th><th>Stage</th><th>Match</th><th>Venue</th><th>Status</th><th class="right">Score</th><th></th></tr></thead>
            <tbody>${byDate[date]
              .map(
                (match) => `
              <tr class="mkt-row" data-go="m-${match.id}">
                <td class="small mono">${fmtTime(match.kickoff)}</td>
                <td class="small">${esc(competitionName(match))}</td>
                <td class="small">${esc(match.stage)}${match.group ? " · " + esc(match.group) : ""}</td>
                <td class="tm">${teamMark(match.home)}<span class="code">${match.home.code}</span><span class="vs">vs</span><span class="code">${match.away.code}</span>${teamMark(match.away)}</td>
                <td class="small dim">${esc(match.venue ?? "—")}</td>
                <td>${fixtureStatusChip(match)}</td>
                <td class="num mono">${match.score ? `${match.score.home}–${match.score.away}` : "—"}</td>
                <td><a class="btn btn-sm">MARKET ›</a></td>
              </tr>`,
              )
              .join("")}
            </tbody>
          </table>
        </div>
      `,
              )
              .join("")
          : `<div class="panel"><div class="panel-b dim mono center" style="padding:40px">NO FIXTURES FOR THIS COMPETITION</div></div>`
      }
    `;

    view.querySelector("#fixture-cmp").onchange = (event) =>
      draw(event.target.value);
    view.querySelectorAll("tr.mkt-row").forEach((row) => {
      row.onclick = () => {
        location.hash = `#/market/${row.dataset.go}`;
      };
    });
    prepareRouteActions(view);
  };

  draw();
}

// ──────────────────────────────────────────────────── auth (landing) ─────

function renderAuth() {
  teardownShell();
  renderLanding();
}

function renderLanding() {
  root.innerHTML = `
    <div class="landing-page">
      <header class="landing-header"><a class="landing-brand" href="#/"><span class="brand-mark">S.</span><span class="wordmark">Streak<span>The football ledger</span></span></a><span class="landing-header-note">For the love of the game.<br>And a well-kept record.</span><button class="btn btn-amber" id="connect-top">Open your ledger ↗</button></header>
      <main class="landing-main"><section class="landing-copy"><div class="eyebrow"><span class="red-dot"></span> A new chapter in football predictions</div><h1>A good instinct<br>deserves a<br><em>good record.</em></h1><p>A home for your football picks. Follow the fixtures, back your reading of the game, and build a streak worth putting on paper.</p><button class="btn btn-amber landing-cta" id="connect-main">Connect wallet & begin <span>↗</span></button><div class="landing-caption">Your wallet is your account. Your story starts here.</div><div id="connect-status" class="connect-status" role="status"></div></section>
      <section class="book-scene" aria-label="The Streak daily ledger"><div class="book-shadow"></div><div class="ledger-book"><div class="book-spine"></div><div class="book-cover"><div class="book-edition">VOLUME I <span>EST. 2026</span></div><div class="cover-rule"></div><span class="book-title">The<br>Streak<br><em>Ledger.</em></span><div class="cover-rule short"></div><span class="book-subtitle">A RECORD OF FOOTBALL<br>& GOOD INSTINCTS</span><div class="book-emblem">S.</div><div class="book-bottom">ONE PICK. EVERY DAY.</div></div></div><div class="book-slip"><span class="eyebrow">A note to the reader</span><p>Fortune favours<br>the <em>consistent.</em></p><span class="slip-signature">Keep the run alive. — S.</span></div></section></main>
      <section class="landing-principles"><div><span>01 / FIND YOUR FIXTURE</span><h2>Read the game.</h2><p>Football markets, live pools, and the figures that help you find your angle.</p></div><div><span>02 / MAKE YOUR MARK</span><h2>Back your instinct.</h2><p>Choose an outcome. Make a daily pick. Give a good run somewhere to begin.</p></div><div><span>03 / KEEP THE RECEIPT</span><h2>It’s on the record.</h2><p>Settled results with verifiable receipts, recorded on Nervos CKB.</p></div></section>
      <footer class="landing-footer"><span>Streak & Co. <span>—</span> The football ledger</span><span class="network-tag">Nervos CKB · Pudge testnet</span><span>A little, every day.</span></footer>
    </div>
  `;
  const go = async (btn) => {
    const status = $("#connect-status");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "CONNECTING…";
    if (status)
      status.textContent =
        "Approve the connection and signature in your wallet…";
    try {
      const r = await walletLogin();
      state.user = r.user;
      toast(
        r.justCreated ? `Welcome · ${shortAddr(r.walletAddress)}` : "Signed in",
        "ok",
      );
      location.hash = "#/dashboard";
      navigate();
      if (r.justCreated) setTimeout(() => showOnboarding(true), 500);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = label;
      if (status) status.textContent = "";
      toast(err.message || "Connection failed", "err");
    }
  };
  const b1 = $("#connect-top"),
    b2 = $("#connect-main");
  if (b1) b1.onclick = () => go(b1);
  if (b2) b2.onclick = () => go(b2);
}

/** Optional display-name prompt (post-signup) and editor. */
function promptSetUsername(firstTime = false) {
  openModal(`
    <div class="modal">
      <div class="m-h">${firstTime ? "Pick a display name" : "Change display name"} <span class="close" data-close>×</span></div>
      <div class="m-b">
        <div class="field"><label>Username (optional)</label><input class="input" id="uname" maxlength="20" placeholder="3–20 letters, numbers or _"/></div>
        <div class="dim mono" style="font-size:10.5px">Shown on the leaderboard and crew feeds. You can skip this — your address is used until you set one.</div>
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" data-close>${firstTime ? "Skip" : "Cancel"}</button>
        <button class="btn btn-amber" id="uname-go">Save</button>
      </div>
    </div>
  `);
  const go = $("#uname-go");
  const input = $("#uname");
  if (input && state.user?.hasUsername) input.value = state.user.username;
  go.onclick = async () => {
    const username = (input.value || "").trim();
    if (!username) {
      closeModal();
      return;
    }
    go.disabled = true;
    go.textContent = "Saving…";
    try {
      const r = await api("/me/username", {
        method: "POST",
        body: { username },
      });
      state.user = r.user;
      closeModal();
      toast("Display name set", "ok");
      updateStatusBar();
      if (state.route?.name === "wallet") renderWallet();
    } catch (err) {
      go.disabled = false;
      go.textContent = "Save";
      toast(err.message, "err");
    }
  };
  if (input) input.focus();
}

/** First-run onboarding / how-to. Shows once unless forced. */
function showOnboarding(force = false) {
  if (!force) {
    try {
      if (localStorage.getItem("streak_onboarded") === "1") return;
    } catch {}
    if (overlay.classList.contains("on")) return;
  }
  const done = () => {
    try {
      localStorage.setItem("streak_onboarded", "1");
    } catch {}
  };
  openModal(`
    <div class="modal">
      <div class="m-h">Welcome to Streak <span class="close" data-close>×</span></div>
      <div class="m-b">
        <div class="dim" style="font-size:12px;line-height:1.6">A parimutuel prediction market on CKB Pudge. Three steps to your first pick:</div>
        <ol class="onboard-steps">
          <li><span class="on-num">1</span><div><b>Wallet connected</b><div class="dim">Your CKB wallet is your account — no email or password.</div></div></li>
          <li><span class="on-num">2</span><div><b>Fund your account</b><div class="dim">Deposit CKB into escrow (you sign it in your wallet). Get testnet CKB from the <a href="https://faucet.nervos.org/" target="_blank" rel="noopener">Pudge faucet</a> first.</div></div></li>
          <li><span class="on-num">3</span><div><b>Make a pick</b><div class="dim">Back a side on any market, or lock one streak pick a day and keep the run alive.</div></div></li>
        </ol>
      </div>
      <div class="m-f">
        <button class="btn btn-ghost" id="onboard-skip">Explore first</button>
        <button class="btn btn-amber" id="onboard-fund">Fund my account ›</button>
      </div>
    </div>
  `);
  const skip = $("#onboard-skip");
  if (skip)
    skip.onclick = () => {
      done();
      closeModal();
    };
  const fund = $("#onboard-fund");
  if (fund)
    fund.onclick = () => {
      done();
      closeModal();
      location.hash = "#/wallet";
      navigate();
    };
  const x = overlay.querySelector(".close[data-close]");
  if (x)
    x.onclick = () => {
      done();
      closeModal();
    };
}

// ──────────────────────────────────────────────────────── data sync ───────

async function refreshUser() {
  const wallet = state.user?.walletAddress;
  try {
    const r = await api("/me");
    if (state.user?.walletAddress !== wallet) return;
    state.user = r.user;
  } catch (err) {
    if (err.status === 401) {
      state.user = null;
    }
  }
  updateStatusBar();
}

async function refreshDashboard(force = false) {
  const wallet = state.user?.walletAddress;
  try {
    const d = await api("/dashboard", { force });
    if (state.user?.walletAddress !== wallet) return;
    state.dashboard = d;
    state.user = d.user;
    state.liveStatus = d.live;
    updateStatusBar();
    updateFootBar();
    renderTape();
    if (d.balanceRefreshing) hydrateWalletBalance();
    return d;
  } catch (err) {
    if (err.status === 401) {
      state.user = null;
    }
    throw err;
  }
}

async function hydrateWalletBalance() {
  const wallet = state.user?.walletAddress;
  if (!wallet || document.hidden) return;
  try {
    const data = await api("/wallet/balance");
    if (state.user?.walletAddress !== wallet || data.balanceUnavailable) return;
    if (state.dashboard) {
      state.dashboard.walletBalanceCkb = data.chainBalanceCkb;
      state.dashboard.balanceRefreshing = false;
    }
    document.querySelectorAll("[data-wallet-balance]").forEach((element) => {
      element.textContent = fmtCkb(data.chainBalanceCkb);
    });
    updateStatusBar();
  } catch {
    /* The ledger stays usable when the chain provider is unavailable. */
  }
}

function stopPolling() {
  state.poller?.stop();
  state.poller = null;
  state.pollRoute = null;
  state.pollView = null;
}

// Refresh after the previous request completes. Keep form DOM and selection
// intact, and do no background traffic while the tab is hidden.
function startPolling(viewFn) {
  state.pollView = viewFn;
  if (state.pollRoute === state.route && state.poller) return;
  stopPolling();
  const armedRoute = state.route;
  state.pollRoute = armedRoute;
  state.pollView = viewFn;
  state.poller = createPoller({
    isActive: () => state.route === armedRoute && isAuthed(),
    isVisible: () => !document.hidden,
    task: async () => {
      try {
        const before = JSON.stringify(state.dashboard);
        await refreshDashboard(true);
        if (state.route !== armedRoute || !isAuthed() || document.hidden)
          return;
        if (overlay.classList.contains("on")) return;
        const update = state.pollView;
        if (
          update === renderDashboard &&
          before === JSON.stringify(state.dashboard)
        )
          return;
        if (update === renderMarketDetail)
          await refreshMarketDetail(armedRoute);
        else await update?.(armedRoute);
        if (state.route === armedRoute) prepareRouteActions(armedRoute.view);
      } catch (error) {
        if (error.status === 401 && state.route === armedRoute) navigate();
      }
    },
  });
  if (!state.clockTimer)
    state.clockTimer = setInterval(() => {
      if (!document.hidden) updateClock();
    }, 60_000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateClock();
    state.poller?.wake();
  }
});

// ───────────────────────────────────────── settlement receipts (UI) ────────

/**
 * Loads the on-chain settlement panel on the market-detail page and, if the
 * user has any bets in this market, appends "prove my bet" affordances.
 */
async function loadSettlementPanel(m, view = $("#view")) {
  const body = view?.querySelector("#settlement-body");
  const badge = view?.querySelector("#settlement-badge");
  if (!body || !badge) return;
  let d;
  try {
    d = await api(`/receipts/${encodeURIComponent(m.id)}`);
  } catch (err) {
    if (!isActiveView(view) || !body.isConnected || !badge.isConnected) return;
    body.innerHTML = `<div class="dim mono" style="font-size:11.5px">
      Receipt not yet published. The engine writes an on-chain fingerprint to Pudge shortly after settlement.
    </div>`;
    badge.innerHTML = `<span class="chip">PENDING</span>`;
    return;
  }
  if (!isActiveView(view) || !body.isConnected || !badge.isConnected) return;
  const p = d.payload;
  const rec = d.receipt;
  const oc = d.onChain || {};
  badge.innerHTML = receiptVerificationHtml(rec, oc, true);

  const shareUrl = `${location.origin}/#/receipt/${encodeURIComponent(m.id)}`;
  const tweetText = `Settled on-chain via Streak — ${p.match.home.code} vs ${p.match.away.code} · winner: ${String(p.winner).toUpperCase()}${p.match.score ? " " + p.match.score.home + "-" + p.match.score.away : ""} · ${p.bets.count} bets, ${fmtCkb(Number(p.totalPaidShannons) / 1e8)} CKB paid`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;

  body.innerHTML = `
    <div style="font-family:var(--mono);font-size:11.5px;color:var(--ink-1);display:grid;grid-template-columns:1fr auto;gap:6px 12px">
      <span class="label">Winner</span><span class="amber">${String(p.winner).toUpperCase()}</span>
      <span class="label">Bets settled</span><span>${p.bets.count}</span>
      <span class="label">Oracle</span><span>${esc(p.oracle.source)}${p.oracle.live ? "" : " (sim)"}</span>
      <span class="label">Payload hash</span><span class="hash-cell" title="${esc(d.payloadHash)}">${shortHash(d.payloadHash)}<button class="copy-mini" data-copy="${esc(d.payloadHash)}">copy</button></span>
      <span class="label">Merkle root</span><span class="hash-cell" title="${esc(p.bets.merkleRoot)}">${shortHash(p.bets.merkleRoot)}<button class="copy-mini" data-copy="${esc(p.bets.merkleRoot)}">copy</button></span>
      ${
        rec
          ? `
        <span class="label">Receipt tx</span><span class="hash-cell" title="${esc(rec.txHash)}">${shortHash(rec.txHash)}<button class="copy-mini" data-copy="${esc(rec.txHash)}">copy</button></span>
        <span class="label">Output idx</span><span>${rec.index}</span>
        <span class="label">Treasury lock</span><span class="hash-cell" data-receipt-lock title="${esc(oc.expectedTreasuryLockArgs || "")}">${shortHash(oc.expectedTreasuryLockArgs || "")}</span>
      `
          : ""
      }
    </div>
    <div class="dim mono" data-receipt-reason style="font-size:10.5px;margin-top:8px">${rec && oc.ok === false && !oc.pending ? `Verification failed: ${esc(oc.reason || "unknown")}` : ""}</div>
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
      try {
        await navigator.clipboard.writeText(el.dataset.copy);
        toast("copied", "ok");
      } catch {
        toast("copy failed", "err");
      }
    };
  });
  const prove = view.querySelector("#prove-mine");
  if (prove) prove.onclick = () => showInclusionProof(m.id, { mine: true });
  if (oc.pending) hydrateReceiptVerification(m.id, view, true);
}

function receiptVerificationHtml(receipt, check, compact = false) {
  if (compact) {
    if (!receipt) return '<span class="chip">PUBLISH PENDING</span>';
    if (check.pending)
      return '<span class="chip">VERIFICATION PENDING</span><button class="btn btn-ghost btn-sm" data-recheck-receipt>Check again</button>';
    return check.ok
      ? '<span class="chip open">✓ VERIFIED ON-CHAIN</span>'
      : '<span class="chip failed">CHECK FAILED</span>';
  }
  if (!receipt)
    return '<span class="v-tick">…</span><span>Publish pending</span><span class="dim mono small">On-chain fingerprint not yet written</span>';
  if (check.pending)
    return '<span class="v-tick">…</span><span>Verification pending</span><span class="dim mono small">The receipt is available while its on-chain fingerprint is checked.</span><button class="btn btn-ghost btn-sm" data-recheck-receipt>Check again</button>';
  return check.ok
    ? '<span class="v-tick">✓</span><span>Verified on-chain</span><span class="dim mono small">Payload hash matches Pudge cell</span>'
    : `<span class="v-tick down">✗</span><span>Verification failed</span><span class="dim mono small">${esc(check.reason || "Hash disagreement")}</span>`;
}

async function hydrateReceiptVerification(id, host, compact = false) {
  const verdict = host.querySelector(
    compact ? "#settlement-badge" : "#receipt-verdict",
  );
  if (!host.isConnected || !verdict) return;
  verdict.setAttribute("aria-busy", "true");
  const retry = verdict.querySelector("[data-recheck-receipt]");
  if (retry) {
    retry.disabled = true;
    retry.textContent = "Checking…";
  }
  try {
    const data = await api(`/receipts/${encodeURIComponent(id)}?verify=1`, {
      force: true,
    });
    if (!host.isConnected || !verdict.isConnected) return;
    const check = data.onChain || {};
    verdict.innerHTML = receiptVerificationHtml(data.receipt, check, compact);
    if (!compact)
      verdict.className = `verdict ${check.ok ? "ok" : check.pending || !data.receipt ? "pending" : "bad"}`;
    const lock = host.querySelector("[data-receipt-lock]");
    if (lock) {
      lock.textContent = shortHash(check.expectedTreasuryLockArgs);
      lock.title = check.expectedTreasuryLockArgs || "";
    }
    const reason = host.querySelector("[data-receipt-reason]");
    if (reason) reason.textContent = check.ok ? "" : check.reason || "";
  } catch (error) {
    if (!host.isConnected || !verdict.isConnected) return;
    const reason = host.querySelector("[data-receipt-reason]");
    if (reason) reason.textContent = error.message;
  } finally {
    verdict.removeAttribute("aria-busy");
    const again = verdict.querySelector("[data-recheck-receipt]");
    if (again) {
      again.disabled = false;
      again.textContent = "Check again";
      again.onclick = () => hydrateReceiptVerification(id, host, compact);
    }
  }
}

async function showInclusionProof(marketId, { mine, betId } = {}) {
  const out =
    document.getElementById("prove-out") ||
    document.getElementById("receipt-prove-out");
  if (!out) return;
  out.innerHTML = spinnerInline();
  const q = new URLSearchParams();
  if (mine) q.set("mine", "1");
  if (betId) q.set("bet", betId);
  const url = `/receipts/${encodeURIComponent(marketId)}/proof${q.toString() ? "?" + q.toString() : ""}`;
  let d;
  try {
    d = await api(url);
  } catch (err) {
    toast(err.message, "err");
    return;
  }
  if (!out.isConnected) return;
  const proofs = d.proofs || [];
  if (proofs.length === 0) {
    out.innerHTML = `<div class="dim mono" style="font-size:11px">No bets to prove in this market.</div>`;
    return;
  }
  out.innerHTML = `
    <div class="panel-inner" style="border:1px solid var(--line);padding:10px;background:rgba(0,0,0,0.28)">
      <div class="dim mono" style="font-size:10px;letter-spacing:0.14em;margin-bottom:6px">INCLUSION ${d.rootsMatch ? '<span class="up">· ROOT ✓</span>' : '<span class="down">· ROOT MISMATCH</span>'}</div>
      ${proofs
        .map((p) =>
          p.ok
            ? `
        <div style="border-top:1px dashed var(--line);padding-top:8px;margin-top:8px;font-family:var(--mono);font-size:11px">
          <div class="row"><span class="label flex-1">bet</span><span>${shortHash(p.betId)}</span></div>
          <div class="row"><span class="label flex-1">index</span><span>${p.index}</span></div>
          <div class="row"><span class="label flex-1">outcome</span><span>${p.leaf.outcome.toUpperCase()} · ${fmtCkb(Number(p.leaf.amountShannons) / 1e8)} CKB</span></div>
          <div class="row"><span class="label flex-1">leaf</span><span class="hash-cell">${shortHash(p.leafHash)}</span></div>
          <div class="dim" style="font-size:10px;margin-top:4px">${p.proof.length} sibling(s) · walking to root ${shortHash(d.merkleRoot)}</div>
        </div>
      `
            : `<div class="dim" style="font-size:11px">bet ${shortHash(p.betId)}: ${esc(p.reason)}</div>`,
        )
        .join("")}
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
  if (!isActiveView(view)) return;
  view.innerHTML = `
    <div class="page-h">
      <h1>Settlement Receipts</h1>
      <span class="sub">Every resolved market with an on-chain fingerprint on Pudge testnet</span>
    </div>
    <div class="panel">
      <div class="panel-h"><span class="title">${receipts.length} published</span><span class="meta">newest first</span></div>
      ${
        receipts.length === 0
          ? `<div class="dim mono center" style="padding:60px;font-size:11px;letter-spacing:0.14em">NO RECEIPTS YET — SETTLE A MARKET TO PUBLISH ONE</div>`
          : `<table class="tbl">
             <thead><tr><th>Match</th><th>Stage</th><th>Winner</th><th class="right">Bets</th><th class="right">Paid</th><th>Settled</th><th>Tx</th><th></th></tr></thead>
             <tbody>
               ${receipts
                 .map(
                   (r) => `
                 <tr data-go="${esc(r.marketId)}">
                   <td>${esc(r.label)}${r.score ? ` <span class="dim">(${r.score.home}-${r.score.away})</span>` : ""}</td>
                   <td class="small dim">${esc(r.stage)}</td>
                   <td class="amber">${String(r.winner).toUpperCase()}</td>
                   <td class="num">${r.betCount}</td>
                   <td class="num">${fmtCkb(Number(r.totalPaidShannons) / 1e8)}</td>
                   <td class="small dim">${fmtDateTime(r.settledAt)}</td>
                   <td class="mono small hash-cell">${r.receipt ? shortHash(r.receipt.txHash) : `<span class="chip">PENDING</span>`}</td>
                   <td class="small"><a class="btn btn-ghost btn-sm" href="#/receipt/${encodeURIComponent(r.marketId)}">Open ›</a></td>
                 </tr>
               `,
                 )
                 .join("")}
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
  if (state.route !== r) return;
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
        <div class="verdict ${verified ? "ok" : oc.pending || !rec ? "pending" : "bad"}" id="receipt-verdict">
          ${receiptVerificationHtml(rec, oc)}
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
          <span class="dim">${fmtCkb(Number(p.totalPaidShannons) / 1e8)} CKB paid</span>
        </div>

        <div class="grid2">
          <div class="mini-panel">
            <div class="mp-h">POOLS</div>
            <div class="mp-row"><span class="up">HOME</span><span class="num">${fmtCkb(Number(p.pools.home) / 1e8)}</span></div>
            <div class="mp-row"><span class="neutral">DRAW</span><span class="num">${fmtCkb(Number(p.pools.draw) / 1e8)}</span></div>
            <div class="mp-row"><span class="down">AWAY</span><span class="num">${fmtCkb(Number(p.pools.away) / 1e8)}</span></div>
          </div>
          <div class="mini-panel">
            <div class="mp-h">FEES</div>
            <div class="mp-row"><span class="dim">Protocol ${(p.fees.protocolBps / 100).toFixed(2)}%</span><span class="num">${fmtCkb(Number(p.protocolFeeShannons) / 1e8)}</span></div>
            <div class="mp-row"><span class="dim">Creator ${(p.fees.creatorBps / 100).toFixed(2)}%</span><span class="num">${fmtCkb(Number(p.creatorFeeShannons) / 1e8)}</span></div>
            <div class="mp-row"><span class="dim">Distributable</span><span class="num amber">${fmtCkb(Number(p.distributableShannons) / 1e8)}</span></div>
          </div>
        </div>

        <div class="mini-panel">
          <div class="mp-h">ON-CHAIN PROOF</div>
          <div class="mp-row"><span class="dim">Payload hash</span><span class="hash-cell mono small">${shortHash(d.payloadHash)}<button class="copy-mini" data-copy="${esc(d.payloadHash)}">copy</button></span></div>
          <div class="mp-row"><span class="dim">Merkle root</span><span class="hash-cell mono small">${shortHash(p.bets.merkleRoot)}<button class="copy-mini" data-copy="${esc(p.bets.merkleRoot)}">copy</button></span></div>
          ${
            rec
              ? `
            <div class="mp-row"><span class="dim">Receipt tx</span><span class="hash-cell mono small">${shortHash(rec.txHash)}<button class="copy-mini" data-copy="${esc(rec.txHash)}">copy</button></span></div>
            <div class="mp-row"><span class="dim">Cell data</span><span class="mono small"><code>STKR</code>|v${d.version}|sha256(payload)</span></div>
            <div class="mp-row"><span class="dim">Treasury lock</span><span class="hash-cell mono small" data-receipt-lock>${shortHash(oc.expectedTreasuryLockArgs || "")}</span></div>
          `
              : ""
          }
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
      try {
        await navigator.clipboard.writeText(el.dataset.copy);
        toast("copied", "ok");
      } catch {
        toast("copy failed", "err");
      }
    };
  });
  if (oc.pending)
    hydrateReceiptVerification(id, root.querySelector(".public-card"));
}

// ──────────────────────────────────────────────────────────── boot ────────

(async () => {
  if (parseRoute().name === "receipt") {
    await navigate();
    return;
  }
  if (!root.innerHTML.trim()) root.innerHTML = spinner();
  root.setAttribute("aria-busy", "true");
  try {
    const r = await api("/me");
    state.user = r.user;
  } catch {
    /* not signed in */
  }
  state.sessionResolved = true;
  root.removeAttribute("aria-busy");
  await navigate();
})();
