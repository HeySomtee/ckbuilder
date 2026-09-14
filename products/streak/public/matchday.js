/** Matchday screens share the app's route lifecycle and completion-based poller. */
export function createMatchdayView({ api, esc, teamMark, fmtCkb, fmtDateTime, isActiveView, startPolling }) {
  const minute = (m, extra) => m == null ? "—" : `${m}${extra ? `+${extra}` : ""}′`;
  const time = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  const routeId = (id) => encodeURIComponent(id);
  const patch = (view, selector, html) => {
    const el = view.querySelector(selector);
    if (el && el.mdHtml !== html) {
      const focused = el.contains(document.activeElement) ? document.activeElement : null;
      const restore = focused?.tagName === "SUMMARY" ? "summary" : focused?.hasAttribute("data-md-receipt") ? "[data-md-receipt]" : null;
      el.innerHTML = html; el.mdHtml = html;
      if (restore) el.querySelector(restore)?.focus({ preventScroll: true });
    }
  };
  const notice = (section, emptyText) => {
    if (!section) return `<div class="md-empty">Fetching match coverage…</div>`;
    if (section.state === "ready") return "";
    return `<div class="md-notice ${section.state === "stale" ? "md-delayed" : ""}" role="status">${esc(section.message || (section.state === "empty" ? emptyText : "Coverage is unavailable right now."))}</div>`;
  };
  const updated = (section) => section?.updatedAt ? `<span class="md-updated">Updated ${esc(time(section.updatedAt))}${section.state === "stale" ? " · delayed" : ""}</span>` : "";
  const scoreStatus = (m, score) => {
    if (score?.status === "HT") return "Half-time";
    if (["FT", "AET", "PEN"].includes(score?.status)) return score.label || "Full-time";
    if (["PST", "TBD", "SUSP", "INT", "CANC", "ABD", "AWD", "WO"].includes(score?.status)) return score.label || score.status;
    if (score?.minute != null) return `${minute(score.minute, score.extra)} · ${score.label || "Live"}`;
    return ({ scheduled: "Pre-match", live: "Live", final: "Full-time", suspended: "Suspended", postponed: "Postponed", cancelled: "Cancelled" })[m.match.status] || "Awaiting update";
  };

  function scoreHtml(m, data) {
    const section = data?.scoreboard, score = section?.data;
    const scoreline = score && (score.home !== null || score.away !== null) ? { home: score.home, away: score.away } : m.match.score;
    return `<div class="md-score-top"><span>${esc(m.match.competition?.name || m.match.stage)}</span><span>${esc(fmtDateTime(m.match.kickoff))}</span></div>
      <div class="md-score-teams"><div class="md-team">${teamMark(m.match.home)}<h2>${esc(m.match.home.name)}</h2><span>Home</span></div>
      <div class="md-score-centre"><span class="md-match-clock ${m.match.status === "live" ? "is-live" : ""}"><i></i>${esc(scoreStatus(m, score))}</span><div class="md-scoreline">${scoreline ? `${scoreline.home ?? "—"}<span>:</span>${scoreline.away ?? "—"}` : `<span class="md-versus">VS</span>`}</div><span class="md-venue">${esc(score?.venue || "Matchday centre")}</span></div>
      <div class="md-team md-away">${teamMark(m.match.away)}<h2>${esc(m.match.away.name)}</h2><span>Away</span></div></div>
      <div class="md-score-bottom"><span>${score?.status === "AET" || score?.status === "PEN" ? `90-minute score: ${score.regulation.home ?? "—"} – ${score.regulation.away ?? "—"}. Picks settle on regulation time.` : "From kickoff to the final whistle."}</span>${updated(section)}</div>
      ${section?.state === "stale" || section?.state === "unavailable" ? notice(section) : ""}`;
  }

  function timelineHtml(section) {
    const glyph = { goal: "⚽", card: "", substitution: "⇄", var: "VAR", other: "·" };
    return `<div class="md-section-heading"><div><span class="md-eyebrow">The story so far</span><h2>Match timeline</h2></div>${updated(section)}</div>
      ${notice(section, "No match events reported yet.")}
      <ol class="md-timeline">${(section?.data || []).map((event) => `<li class="md-event ${event.type}"><span class="md-event-minute">${minute(event.minute, event.extra)}</span><span class="md-event-icon ${event.type === "card" && /red/i.test(event.detail) ? "red-card" : ""}" aria-hidden="true">${glyph[event.type] ?? "·"}</span><div class="md-event-copy"><strong>${esc(event.detail)}</strong><span>${esc(event.player)}${event.assist ? `<small>${event.type === "substitution" ? "On: " : "Assist: "}${esc(event.assist)}</small>` : ""}</span></div><span class="md-event-team">${esc(event.teamId === section.homeId ? section.homeCode : section.awayCode)}</span></li>`).join("")}</ol>`;
  }

  function lineupHtml(section, m, side) {
    const team = m.match[side];
    const lineup = section?.data?.find((row) => row.teamId === team.id);
    if (!lineup) return `${notice(section, "Confirmed lineups have not been published yet.")}<div class="md-empty">${esc(team.name)}’s starting team will appear here when available.</div>`;
    const groups = new Map();
    const hasGrid = lineup.starters.every((player) => player.grid);
    if (hasGrid) for (const player of lineup.starters) {
      const row = groups.get(player.grid.row) || [];
      row.push(player); groups.set(player.grid.row, row);
    }
    const playerHtml = (p) => `<span class="md-shirt">${p.number ?? "—"}</span><span class="md-player-name">${esc(p.name)}</span>`;
    return `<div class="md-lineup-heading"><div><strong>${esc(lineup.formation || "Formation unavailable")}</strong><span>${lineup.confirmed ? "Confirmed XI" : "Partial lineup"}</span></div>${updated(section)}</div>${notice(section)}
      ${hasGrid ? `<div class="md-pitch ${side === "away" ? "away" : ""}" role="group" aria-label="${esc(team.name)} starting formation ${esc(lineup.formation || "")}"><div class="md-pitch-markings" aria-hidden="true"><i></i></div><div class="md-pitch-players">${[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => `<div class="md-pitch-row">${row.sort((a, b) => a.grid.column - b.grid.column).map((p) => `<div class="md-player">${playerHtml(p)}</div>`).join("")}</div>`).join("")}</div></div>` : `<div class="md-roster">${lineup.starters.map((p) => `<div>${playerHtml(p)}<small>${esc(p.position || "")}</small></div>`).join("")}</div>`}
      <div class="md-coach"><span>Coach</span><strong>${esc(lineup.coach || "Not reported")}</strong></div><h3 class="md-roster-title">Substitutes</h3><div class="md-roster">${lineup.substitutes.length ? lineup.substitutes.map((p) => `<div>${playerHtml(p)}<small>${esc(p.position || "")}</small></div>`).join("") : `<p class="dim">Substitutes have not been reported.</p>`}</div>`;
  }

  function statisticsHtml(section, m) {
    const value = (v, percent) => v === null ? "—" : `${v}${percent ? "%" : ""}`;
    return `<div class="md-section-heading"><div><span class="md-eyebrow">On the pitch</span><h2>Match statistics</h2></div>${updated(section)}</div>${notice(section, "Statistics have not been reported for this match.")}
      <div class="md-stat-teams"><span><i></i>${esc(m.match.home.code)}</span><span>${esc(m.match.away.code)}<i></i></span></div><div class="md-statistics">${(section?.data || []).map((stat) => {
        const total = (stat.home ?? 0) + (stat.away ?? 0);
        const known = stat.home !== null && stat.away !== null;
        const home = known && total ? stat.home / total * 100 : 0;
        const away = known && total ? stat.away / total * 100 : 0;
        return `<div class="md-stat"><div><strong>${value(stat.home, stat.percent)}</strong><span>${esc(stat.label)}</span><strong>${value(stat.away, stat.percent)}</strong></div><div class="md-stat-bar" aria-hidden="true"><i style="width:${home}%"></i><i style="width:${away}%"></i></div></div>`;
      }).join("")}</div><p class="md-footnote">A dash means the provider has not supplied that statistic.</p>`;
  }

  function pickHtml(m, receipt, expanded) {
    const settled = m.status === "resolved" || m.status === "void";
    const progress = !m.myPositions.length ? -1 : receipt ? 3 : settled ? 2 : m.match.status === "live" ? 1 : 0;
    const groups = new Map();
    for (const position of m.myPositions) {
      const key = `${position.outcome}:${position.settled}`;
      const previous = groups.get(key);
      if (previous) {
        previous.amountCkb += Number(position.amountCkb);
        previous.payoutCkb += Number(position.payoutCkb || 0);
        previous.isStreakPick ||= position.isStreakPick;
        previous.count++;
      } else groups.set(key, { ...position, amountCkb: Number(position.amountCkb), payoutCkb: Number(position.payoutCkb || 0), count: 1 });
    }
    return `<div class="md-section-heading"><div><span class="md-eyebrow">Your side of the game</span><h2>Your picks <span class="md-count">${m.myPositions.length}</span></h2></div><span class="md-pick-symbol" aria-hidden="true">↗</span></div>
      ${m.myPositions.length ? `<div class="md-picks">${[...groups.values()].map((p) => {
        const result = !p.settled ? "Awaiting result" : m.status === "void" ? "Refunded" : m.resolvedOutcome === p.outcome ? "Won" : "Lost";
        return `<div class="md-pick"><div><strong>${esc(p.outcome === "draw" ? "Match to end in a draw" : `${m.match[p.outcome].name} to win`)}</strong>${p.isStreakPick ? `<span class="tag-streak">STREAK</span>` : ""}</div><span class="md-pick-status ${result === "Won" ? "up" : result === "Lost" ? "down" : "amber"}">${result}${p.count > 1 ? ` · ${p.count} picks combined` : ""}</span><div class="md-pick-amounts"><span>Stake<strong>${fmtCkb(p.amountCkb)} <small>CKB</small></strong></span><span>${m.status === "void" ? "Refund" : "Payout"}<strong>${p.settled ? fmtCkb(p.payoutCkb) : "—"} <small>CKB</small></strong></span></div></div>`;
      }).join("")}</div>` : `<p class="md-footnote">You have no picks on this match.${m.status === "open" ? " There’s still time to make your call." : " Follow along from the sidelines."}</p>`}
      <details class="md-pick-details" ${expanded ? "open" : ""}><summary>Result & settlement <span aria-hidden="true">⌄</span></summary>${m.myPositions.length ? `<ol class="md-progress">${["Pick placed", m.status === "void" ? "Match voided" : "Match underway", "Result confirmed", "Receipt published"].map((label, i) => `<li class="${i <= progress ? "complete" : ""}"><span>${i <= progress ? "✓" : i + 1}</span>${label}</li>`).join("")}</ol>` : ""}
      <p class="md-footnote">${settled ? "Payouts reflect confirmed settlement." : "Live scores are provisional. Your payout appears after the result is confirmed."}</p>
      ${receipt ? `<a class="btn btn-amber md-full-button" data-md-receipt href="#/receipt/${routeId(m.id)}">View settlement receipt <span>↗</span></a>` : `<a class="btn btn-glass md-full-button" href="#/market/${routeId(m.id)}">${m.status === "open" ? "Open market" : "View market & settlement"}<span>↗</span></a>`}</details>`;
  }

  function forecastHtml(insights, m) {
    if (!insights) return `<h2>Before kickoff</h2><p class="md-footnote">Pre-match analysis is currently unavailable.</p><a class="md-text-link" href="#/market/${routeId(m.id)}">View market analysis ↗</a>`;
    const pct = (value) => value == null ? "—" : `${Math.round(value * 100)}%`;
    return `<div class="md-section-heading"><div><span class="md-eyebrow">Before kickoff</span><h2>Market vs Machine</h2></div></div><p class="md-footnote">${insights.frozen ? "The forecast captured at kickoff." : "The latest pre-match view."}</p><div class="md-forecast-head"><span>Outcome</span><span>Crowd</span><span>Model</span></div>${["home", "draw", "away"].map((outcome) => `<div class="md-forecast-row"><strong>${esc(outcome === "draw" ? "Draw" : m.match[outcome].code)}</strong><span>${pct(Number(insights.crowd?.totalPoolShannons) > 0 ? insights.crowd?.probabilities?.[outcome] : undefined)}</span><span>${pct(insights.machine?.probabilities?.[outcome])}</span></div>`).join("")}<div class="md-frozen">${insights.frozen ? "⌑ Frozen at kickoff" : "Updates until kickoff"}</div><a class="md-text-link" href="#/market/${routeId(m.id)}">Explore the full analysis ↗</a>`;
  }

  function bindTabs(view) {
    const tabs = [...view.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      view.mdTab = tab.dataset.mdTab;
      for (const button of tabs) {
        const active = button === tab;
        button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
        view.querySelector(`#${button.getAttribute("aria-controls")}`).hidden = !active;
      }
    };
    for (const [i, tab] of tabs.entries()) {
      tab.onclick = () => select(tab);
      tab.onkeydown = (event) => {
        const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : offset ? tabs[(i + offset + tabs.length) % tabs.length] : null;
        if (next) { event.preventDefault(); select(next); next.focus(); }
      };
    }
    view.querySelectorAll("[data-md-team]").forEach((button) => {
      button.onclick = () => {
        view.mdTeam = button.dataset.mdTeam;
        view.querySelectorAll("[data-md-team]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        patch(view, "#md-lineup-body", lineupHtml(view.mdData?.lineups, view.mdMarket, view.mdTeam));
      };
    });
  }

  async function detail(r) {
    const view = r.view;
    const id = routeId(r.params[0]);
    const [marketResult, liveResult, insightResult] = await Promise.allSettled([
      api(`/markets/${id}`), api(`/markets/${id}/matchday`, { force: true }), api(`/markets/${id}/insights`),
    ]);
    if (!isActiveView(view)) return;
    if (marketResult.status === "rejected" && !view.mdMarket) throw marketResult.reason;
    const m = marketResult.status === "fulfilled" ? marketResult.value.market : view.mdMarket;
    const live = liveResult.status === "fulfilled" ? liveResult.value : null;
    const data = live?.matchday || view.mdData;
    const insights = insightResult.status === "fulfilled" ? insightResult.value.insights : view.mdInsights;
    if (!view.mdReady) {
      view.mdTeam = "home";
      view.innerHTML = `<div class="md-page"><div class="md-page-heading"><div><a class="md-back" href="#/matchday">← All matches</a><h1>Matchday<span class="md-title-dot">.</span></h1></div><a class="btn btn-glass" href="#/market/${id}">Open market ↗</a></div><div class="md-score-card" id="md-score" aria-label="Match scoreboard"></div><div id="md-connection" role="status"></div>
        <div class="md-layout"><section class="md-match-column"><div class="md-tabs" role="tablist" aria-label="Match details">${[["timeline", "Timeline"], ["lineups", "Lineups"], ["stats", "Stats"]].map(([key, label], i) => `<button id="md-tab-${key}" role="tab" data-md-tab="${key}" aria-selected="${i === 0}" aria-controls="md-panel-${key}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join("")}</div><div class="md-glass md-match-panel"><section id="md-panel-timeline" role="tabpanel" aria-labelledby="md-tab-timeline" tabindex="0"></section><section id="md-panel-lineups" role="tabpanel" aria-labelledby="md-tab-lineups" tabindex="0" hidden><div class="md-section-heading"><div><span class="md-eyebrow">The starting teams</span><h2>Lineups</h2></div></div><div class="md-team-switch" aria-label="Choose a team">${["home", "away"].map((side) => `<button data-md-team="${side}" aria-pressed="${side === "home"}">${esc(m.match[side].name)}</button>`).join("")}</div><div id="md-lineup-body"></div></section><section id="md-panel-stats" role="tabpanel" aria-labelledby="md-tab-stats" tabindex="0" hidden></section></div></section><aside class="md-sidebar"><section class="md-glass md-pick-card" id="md-pick-card"></section><section class="md-glass md-forecast" id="md-forecast"></section></aside></div></div>`;
      view.mdReady = true; bindTabs(view);
    }
    view.mdMarket = m; view.mdData = data; view.mdInsights = insights;
    patch(view, "#md-score", scoreHtml(m, data));
    patch(view, "#md-connection", live && marketResult.status === "fulfilled" ? "" : `<div class="md-notice md-delayed">Connection interrupted. Displayed coverage or pick status may be out of date. Retrying automatically.</div>`);
    patch(view, "#md-panel-timeline", timelineHtml(data?.events ? { ...data.events, homeId: m.match.home.id, homeCode: m.match.home.code, awayCode: m.match.away.code } : null));
    patch(view, "#md-lineup-body", lineupHtml(data?.lineups, m, view.mdTeam));
    patch(view, "#md-panel-stats", statisticsHtml(data?.statistics, m));
    if (live) view.mdReceipt = live.receipt;
    const pickDisclosure = view.querySelector(".md-pick-details");
    const expanded = pickDisclosure ? pickDisclosure.open : window.matchMedia("(min-width: 761px)").matches || m.status === "resolved" || m.status === "void";
    patch(view, "#md-pick-card", pickHtml(m, view.mdReceipt, expanded));
    patch(view, "#md-forecast", forecastHtml(insights, m));
    // The first response is immediate; briefly check for the shared initial refresh.
    clearTimeout(view.mdInitialTimer);
    if (live?.refreshing && !data?.fetchedAt && (view.mdAttempts || 0) < 4) {
      view.mdAttempts = (view.mdAttempts || 0) + 1;
      view.mdInitialTimer = setTimeout(() => { if (isActiveView(view) && !document.hidden) detail(r).catch(() => {}); }, 1500 * view.mdAttempts);
    }
  }

  function lobbyCards(markets, filter) {
    const rows = markets.filter((m) => filter === "all" || (filter === "live" ? ["live", "suspended"].includes(m.match.status) : filter === "next" ? m.match.status === "scheduled" : ["final", "cancelled"].includes(m.match.status)));
    if (!rows.length) return `<div class="md-glass md-empty"><h2>${filter === "live" ? "No matches live right now" : "No matches in this view"}</h2><p>Check the upcoming fixtures and get ready for kickoff.</p></div>`;
    return rows.map((m) => `<a class="md-fixture md-glass ${m.match.status === "live" ? "md-fixture-live" : ""}" href="#/matchday/${routeId(m.id)}"><div class="md-fixture-top"><span>${esc(m.match.competition?.name || m.match.stage)}</span><span class="md-fixture-status">${m.match.status === "live" ? "● Live" : esc(m.match.status)}</span></div><div class="md-fixture-teams"><div>${teamMark(m.match.home)}<strong>${esc(m.match.home.name)}</strong><b>${m.match.score?.home ?? "—"}</b></div><div>${teamMark(m.match.away)}<strong>${esc(m.match.away.name)}</strong><b>${m.match.score?.away ?? "—"}</b></div></div><div class="md-fixture-footer"><span>${esc(fmtDateTime(m.match.kickoff))}</span><strong>Follow match ↗</strong></div></a>`).join("");
  }

  async function lobby(r) {
    const view = r.view;
    const { markets } = await api("/markets");
    if (!isActiveView(view)) return;
    const rank = (m) => m.match.status === "live" ? 0 : m.match.status === "suspended" ? 1 : m.match.status === "scheduled" ? 2 : 3;
    view.mdMarkets = [...markets].sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? b.match.kickoff.localeCompare(a.match.kickoff) : a.match.kickoff.localeCompare(b.match.kickoff)));
    if (!view.mdLobbyReady) {
      view.mdFilter = "all";
      view.innerHTML = `<div class="md-page"><div class="md-lobby-heading"><div><span class="md-eyebrow">The beautiful game. As it happens.</span><h1>Matchday<span class="md-title-dot">.</span></h1><p>Your matches, from the first whistle to the final call.</p></div><div class="md-live-count" id="md-live-count"></div></div><div class="md-lobby-tabs" aria-label="Filter matches">${[["all", "All matches"], ["live", "Live now"], ["next", "Upcoming"], ["finished", "Finished"]].map(([key, label]) => `<button data-md-filter="${key}" aria-pressed="${key === "all"}">${label}</button>`).join("")}</div><div class="md-fixture-grid" id="md-fixtures"></div></div>`;
      view.querySelectorAll("[data-md-filter]").forEach((button) => button.onclick = () => {
        view.mdFilter = button.dataset.mdFilter;
        view.querySelectorAll("[data-md-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        patch(view, "#md-fixtures", lobbyCards(view.mdMarkets, view.mdFilter));
      });
      view.mdLobbyReady = true;
    }
    patch(view, "#md-live-count", `<span class="pulse"></span><strong>${markets.filter((m) => m.match.status === "live").length}</strong><span>live now</span>`);
    patch(view, "#md-fixtures", lobbyCards(view.mdMarkets, view.mdFilter));
  }

  async function render(r) {
    if (!isActiveView(r.view)) return;
    if (r.params[0]) await detail(r); else await lobby(r);
    if (isActiveView(r.view)) startPolling(render);
  }
  return render;
}
