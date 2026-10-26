const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const players = [
  {
    id: 1,
    name: 'Reed J.',
    club: 'ARS',
    pos: 'GK',
    cost: 48,
    form: '5.4',
    next: 'CHE (H)',
    color: '#cd6260',
  },
  {
    id: 2,
    name: 'Hart D.',
    club: 'LIV',
    pos: 'DEF',
    cost: 55,
    form: '6.2',
    next: 'AVL (A)',
    color: '#b64b4e',
  },
  {
    id: 3,
    name: 'Morgan G.',
    club: 'CRY',
    pos: 'MID',
    cost: 75,
    form: '7.8',
    next: 'FUL (H)',
    color: '#8bc6d9',
  },
  {
    id: 4,
    name: 'Ellis R.',
    club: 'MCI',
    pos: 'MID',
    cost: 72,
    form: '8.1',
    next: 'NEW (H)',
    color: '#83b7cd',
  },
  {
    id: 5,
    name: 'Cole A.',
    club: 'CHE',
    pos: 'FWD',
    cost: 72,
    form: '6.9',
    next: 'ARS (A)',
    color: '#7a88cf',
  },
  {
    id: 6,
    name: 'Lewis T.',
    club: 'TOT',
    pos: 'MID',
    cost: 66,
    form: '7.2',
    next: 'WHU (H)',
    color: '#dadacf',
  },
  {
    id: 7,
    name: 'Bennett K.',
    club: 'NEW',
    pos: 'FWD',
    cost: 80,
    form: '5.8',
    next: 'MCI (A)',
    color: '#7e9395',
  },
  {
    id: 8,
    name: 'Stone L.',
    club: 'AVL',
    pos: 'DEF',
    cost: 52,
    form: '5.9',
    next: 'LIV (H)',
    color: '#a5728e',
  },
];
let ids = [1, 2, 3, 4, 5],
  captain = null,
  saved = null,
  position = 'ALL',
  sponsorState = 'open';
let brand = {
  name: 'Orbit',
  tagline: 'A home for your onchain ideas.',
  description: $('#brand-description').value,
  logo: true,
  anonymous: false,
  website: 'https://example.com',
};
let dialogTrigger;
function workspace(view) {
  $('.workspace').dataset.view = view;
  $$('[data-workspace]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.workspace === view)),
  );
}
$$('[data-workspace]').forEach((b) => {
  b.onclick = () => workspace(b.dataset.workspace);
});
const selected = () => ids.map((id) => players.find((p) => p.id === id));
const cost = () => selected().reduce((sum, p) => sum + p.cost, 0);
const snapshot = () => JSON.stringify({ ids: [...ids].sort(), captain });
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function switchTab(name, focus = false) {
  $('#toast').hidden = true;
  $$('[data-tab]').forEach((b) => {
    const active = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
    if (active && focus) b.focus();
  });
  $$('[role=tabpanel]').forEach((p) => {
    p.hidden = p.id !== `panel-${name}`;
  });
}
$$('[data-back-squad]').forEach((button) => {
  button.onclick = () => {
    workspace('squad');
    switchTab('team', true);
    $('#tab-team').scrollIntoView({ block: 'start' });
  };
});
$$('[data-tab]').forEach((b, index, tabs) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
  b.addEventListener('keydown', (e) => {
    const target =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : -1;
    if (target >= 0) {
      e.preventDefault();
      switchTab(tabs[target].dataset.tab, true);
    }
  });
});
function modal(title, content, trigger = document.activeElement) {
  dialogTrigger = trigger;
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = content;
  $('#dialog').showModal();
  $('#close-dialog').focus();
}
$('#close-dialog').onclick = () => $('#dialog').close();
$('#dialog-back-squad').onclick = () => {
  dialogTrigger = $('#tab-team');
  $('#dialog').close();
  workspace('squad');
  switchTab('team', true);
  $('#tab-team').scrollIntoView({ block: 'start' });
};
$('#dialog').addEventListener('close', () => {
  if (dialogTrigger?.isConnected) dialogTrigger.focus();
});
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, 4500);
}
function shirt(p) {
  return `<svg class="shirt" viewBox="0 0 100 100" aria-hidden="true"><path d="M29 8 10 25 20 44 32 35 28 92Q50 99 72 92L68 35 80 44 90 25 71 8Q50 24 29 8Z" fill="${p.color}"/><path d="M29 8Q50 29 71 8" fill="none" stroke="#eff4e5" stroke-width="5"/><path d="M34 37 34 79M66 37 66 79" stroke="#ffffff20" stroke-width="2"/><image href="/ckb-mark.png" x="59" y="28" width="10" height="10"/><text x="50" y="61" text-anchor="middle" fill="#fff" font-size="14" font-family="Arial" font-weight="900">${p.club}</text></svg>`;
}
function renderTeam() {
  const slots = [1, 2, 3, 4, 5].map((original) => players.find((p) => p.id === original));
  const ordered = [];
  const remaining = selected();
  for (const slot of slots) {
    const i = remaining.findIndex((p) => p.pos === slot.pos);
    ordered.push(i < 0 ? { empty: true, pos: slot.pos } : remaining.splice(i, 1)[0]);
  }
  $('#pitch').innerHTML = ordered
    .map((p) =>
      p.empty
        ? `<div class="player" data-role="${p.pos}"><button class="empty-pick" data-fill="${p.pos}">+ Pick ${p.pos}</button></div>`
        : `<div class="player" data-role="${p.pos}">${shirt(p)}<button class="captain-button" data-captain="${p.id}" aria-label="Captain ${p.name}" aria-pressed="${captain === p.id}">C</button><button class="remove" data-remove="${p.id}" aria-label="Remove ${p.name}">×</button><span class="player-name">${p.name}</span><span class="player-detail">${p.pos} · ${(p.cost / 10).toFixed(1)} · ${p.next}</span></div>`,
    )
    .join('');
  $$('[data-captain]').forEach((b) => {
    b.onclick = () => {
      captain = Number(b.dataset.captain);
      renderTeam();
      toast(`${players.find((p) => p.id === captain).name} is your captain. Double points.`);
    };
  });
  $$('[data-remove]').forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.remove);
      ids = ids.filter((v) => v !== id);
      if (captain === id) captain = null;
      renderTeam();
      renderPlayers();
      $('#choose-captain').focus();
    };
  });
  $$('[data-fill]').forEach((b) => {
    b.onclick = () => {
      position = b.dataset.fill;
      renderPlayers();
      workspace('players');
      $('#search').focus();
    };
  });
  const cp = players.find((p) => p.id === captain),
    dirty = saved && saved !== snapshot();
  $('#pick-count').textContent = `${ids.length} / 5 picked`;
  $('[data-workspace="squad"] span').textContent = String(ids.length);
  $('#budget').innerHTML = `${((400 - cost()) / 10).toFixed(1)} <small>/ 40 credits</small>`;
  $('#captain-title').textContent = cp
    ? `${cp.name} wears the armband`
    : 'One more call: choose your captain';
  $('#captain-copy').textContent = cp
    ? 'Double points, including deductions. Tap C to change.'
    : 'Tap C beside a shirt. Their points count double.';
  $('#choose-captain').textContent = cp ? 'Change' : 'Choose';
  $('#entry-status').textContent = saved
    ? dirty
      ? 'Unsaved changes · your previous team is still entered'
      : 'Team saved · you can edit until the deadline'
    : 'Draft · not entered yet';
  const missing =
    ids.length < 5
      ? `Pick ${5 - ids.length} more player${ids.length === 4 ? '' : 's'} to complete your five.`
      : !cp
        ? saved
          ? 'Choose a captain before saving your changes.'
          : 'Choose a captain to review your five.'
        : cost() > 400
          ? 'Your squad is over budget. Replace a player.'
          : '';
  $('#save-hint').textContent =
    missing ||
    (saved
      ? dirty
        ? 'Your changes are ready to save.'
        : 'All changes saved. Make another switch anytime before lock.'
      : 'Five picked. Captain chosen. You are ready.');
  $('#save-team').innerHTML = saved
    ? dirty
      ? 'Save changes <span>→</span>'
      : 'Changes saved <span>✓</span>'
    : 'Review your five <span>→</span>';
  $('#save-team').setAttribute('aria-disabled', String(Boolean(missing || (saved && !dirty))));
}
function renderPlayers() {
  $$('[data-position]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.position === position)),
  );
  const q = $('#search').value.toLowerCase();
  const rows = players.filter(
    (p) =>
      (position === 'ALL' || p.pos === position) && `${p.name} ${p.club}`.toLowerCase().includes(q),
  );
  $('#player-list').innerHTML =
    rows
      .map(
        (p) =>
          `<div class="player-row"><button class="player-info" data-profile="${p.id}"><span class="club-mark" style="--kit:${p.color}">${p.club}</span><span><b>${p.name}</b><small>${p.pos} · ${p.next}</small></span></button><span class="stat form">${p.form}</span><span class="stat">${(p.cost / 10).toFixed(1)}</span><button class="pick-button ${ids.includes(p.id) ? 'picked' : ''}" data-pick="${p.id}" aria-label="${ids.includes(p.id) ? 'Selected' : 'Add'} ${p.name}">${ids.includes(p.id) ? '✓' : '+'}</button></div>`,
      )
      .join('') ||
    '<p class="list-foot">No matching players. Try a different name or position.</p>';
  $$('[data-profile]').forEach((b) => {
    b.onclick = () => {
      const p = players.find((p) => p.id === Number(b.dataset.profile));
      modal(
        p.name,
        `<p>${p.club} · ${p.pos} · ${(p.cost / 10).toFixed(1)} credits</p><p>Illustrative player profile. Form ${p.form}. Next fixture ${p.next}.</p><h3>Last five gameweeks</h3>${[3, 8, 5, 11, 6].map((v, i) => `<div class="review-row"><span>Gameweek ${i + 4}</span><b>${v} pts</b></div>`).join('')}<p>Sample numbers for design review, not actual FPL records.</p>`,
      );
    };
  });
  $$('[data-pick]').forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.pick),
        p = players.find((p) => p.id === id);
      if (ids.includes(id)) return toast(`${p.name} is already in your five.`);
      const limit = p.pos === 'MID' ? 2 : 1,
        existing = selected().filter((x) => x.pos === p.pos);
      if (existing.length >= limit) {
        modal(
          `Swap your ${p.pos.toLowerCase()}?`,
          `<p>Choose who makes way for ${p.name}. Your team stays within its formation.</p>${existing.map((x) => `<button class="captain-option" data-swap="${x.id}">${x.name}<small>Replace with ${p.name} →</small></button>`).join('')}`,
        );
        $$('[data-swap]').forEach((s) => {
          s.onclick = () => {
            const old = Number(s.dataset.swap);
            if (cost() - players.find((x) => x.id === old).cost + p.cost > 400)
              return toast('This swap exceeds your 40-credit budget.');
            ids = ids.map((v) => (v === old ? id : v));
            if (captain === old) captain = null;
            $('#dialog').close();
            renderTeam();
            renderPlayers();
            toast(`${p.name} added. Save your changes when ready.`);
          };
        });
      } else if (cost() + p.cost > 400) toast('This player exceeds your remaining budget.');
      else {
        ids.push(id);
        renderTeam();
        renderPlayers();
        toast(`${p.name} added to your five.`);
      }
    };
  });
}
$('#choose-captain').onclick = () => {
  modal(
    'Who gets the armband?',
    `<p>Your captain scores double. Choose one of your five.</p>${
      selected()
        .map(
          (p) =>
            `<button class="captain-option" data-choose="${p.id}" aria-pressed="${captain === p.id}"><span>${p.name} <small>${p.pos}</small></span><span>${captain === p.id ? '✓ Captain' : 'Make captain'}</span></button>`,
        )
        .join('') || '<p>Add a player to your squad first.</p>'
    }`,
  );
  $$('[data-choose]').forEach((b) => {
    b.onclick = () => {
      captain = Number(b.dataset.choose);
      $('#dialog').close();
      renderTeam();
      toast('Captain chosen. Your five is ready to review.');
    };
  });
};
$('#save-team').onclick = () => {
  if ($('#save-team').getAttribute('aria-disabled') === 'true') return;
  modal(
    saved ? 'Save your changes?' : 'Your five. Ready to go.',
    `<p>${saved ? 'Your updated team will replace your previous entry.' : 'Free entry. No wallet signature or payment.'}</p>${selected()
      .map(
        (p) =>
          `<div class="review-row"><span>${p.name}</span><b>${p.id === captain ? 'Captain · ×2' : p.pos}</b></div>`,
      )
      .join(
        '',
      )}<p>You can edit until the gameweek deadline.</p><button id="confirm-save" class="primary">${saved ? 'Save changes' : 'Save my five'}</button>`,
  );
  $('#confirm-save').onclick = () => {
    saved = snapshot();
    $('#dialog').close();
    renderTeam();
    $('#activity-copy').textContent =
      'Preview team saved. Changes stay in this page until you refresh.';
    toast('Your five is saved in this preview.');
  };
};
$('#search').oninput = renderPlayers;
$$('[data-position]').forEach((b) => {
  b.onclick = () => {
    position = b.dataset.position;
    renderPlayers();
  };
});
$('#scenario').onchange = () => {
  ids = [1, 2, 3, 4, 5];
  captain = $('#scenario').value === 'saved' ? 3 : null;
  saved = captain ? snapshot() : null;
  renderTeam();
  renderPlayers();
  switchTab('team', true);
};
function renderSponsor() {
  $('#bid-hero').hidden = sponsorState !== 'open';
  const anonymous = sponsorState === 'anonymous' || brand.anonymous;
  const isWinner = sponsorState === 'winner' || sponsorState === 'anonymous';
  $('#strip-kicker').textContent = isWinner
    ? 'GAMEWEEK SPONSOR · SAMPLE'
    : sponsorState === 'open'
      ? 'SPONSOR AUCTION · OPEN'
      : 'A WEEKEND FOR EVERYONE';
  $('#strip-name').textContent = isWinner
    ? anonymous
      ? 'Community supporter'
      : brand.name
    : sponsorState === 'open'
      ? 'Your brand could be here'
      : 'Free to play. Always a game.';
  $('#strip-desc').textContent = isWinner
    ? anonymous
      ? 'Backing this gameweek, quietly.'
      : brand.tagline
    : 'Explore sponsorship';
  $('.strip-end').textContent = isWinner ? 'Meet the sponsor ↗' : 'View sponsorship →';
  $('#showcase-kicker').textContent = isWinner
    ? 'GAMEWEEK 9 SPONSOR · SAMPLE WINNER'
    : sponsorState === 'open'
      ? 'AUCTION OPEN · SPONSOR NOT YET CHOSEN'
      : 'THIS GAMEWEEK IS UNSPONSORED';
  $('#showcase-name').textContent = isWinner
    ? anonymous
      ? 'Community supporter'
      : brand.name
    : sponsorState === 'open'
      ? 'Make it your week.'
      : 'The game goes on.';
  $('#showcase-tagline').textContent = isWinner
    ? anonymous
      ? 'A gift to the game.'
      : brand.tagline
    : 'Free entry, with or without a sponsor.';
  $('#showcase-description').textContent = isWinner
    ? anonymous
      ? 'An anonymous supporter has backed this gameweek. No name, logo or website is displayed.'
      : brand.description
    : sponsorState === 'open'
      ? 'Lead the bidding to put your project beside every squad. Branding is published only after the winner is confirmed. Sample leading bid: 2,000 tCKB.'
      : 'There is no sponsored reward pool for this example. Players can still pick their five and compete on points.';
  $('#showcase-logo').hidden = !isWinner || anonymous || !brand.logo;
  $('.sponsor-strip .sponsor-symbol').hidden = !isWinner || anonymous || !brand.logo;
  $('#visit-sponsor').hidden = !isWinner || anonymous || !brand.website;
  $('#visit-sponsor').textContent = `Explore ${brand.name} ↗`;
  $('.sponsor-bottom').hidden = !isWinner;
  $('#showcase-note').textContent = isWinner
    ? 'Example of a confirmed winning sponsor. Brand and contribution are illustrative.'
    : 'Illustrative state only. No auction, funds or live sponsorship is changed.';
}
$('#sponsor-strip').onclick = () => switchTab('sponsors', true);
$('#place-bid').onclick = () => {
  modal(
    'Back this gameweek',
    `<p>Your top-ups combine into one bid. Only the confirmed winning bid funds the prize pool; other bids are refunded.</p><label class="bid-amount">Your contribution (tCKB)<input id="bid-amount" inputmode="decimal" value="2100" /></label><p id="bid-feedback" role="status">Sample leading bid: 2,000 tCKB. Minimum contribution: 100 tCKB.</p><button class="primary" id="review-bid">Review sponsor bid</button><p>Design preview only. No wallet request or transfer.</p>`,
    $('#place-bid'),
  );
  $('#review-bid').onclick = () => {
    const value = $('#bid-amount').value.trim();
    if (!/^\d+(?:\.\d{1,8})?$/.test(value)) {
      $('#bid-feedback').textContent = 'Enter a tCKB amount with up to eight decimal places.';
      return;
    }
    const [whole, fraction = ''] = value.split('.');
    if (BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0')) < 10000000000n) {
      $('#bid-feedback').textContent = 'The minimum contribution is 100 tCKB.';
      return;
    }
    $('#dialog-content').innerHTML =
      `<div class="review-row"><span>Your contribution</span><b>${escape(value)} tCKB</b></div><p>In the app, you would review the exact network fee and approve this contribution in your wallet. Funding and confirmation would then appear in Activity.</p><p>Your optional branding belongs to the bid. It becomes public only if you win.</p><button class="primary" id="bid-done">Done previewing</button><p>No funds moved. No bid has been submitted.</p>`;
    $('#bid-done').onclick = () => $('#dialog').close();
    $('#bid-done').focus();
  };
};
$('#anonymous').onchange = () => {
  $('#brand-fields').disabled = $('#anonymous').checked;
};
$('#brand-description').oninput = () => {
  $('#description-count').textContent = `${$('#brand-description').value.length} / 240 characters`;
};
$('#brand-description').oninput();
$('#update-brand').onclick = () => {
  const name = $('#brand-name').value.trim(),
    website = $('#brand-website').value.trim();
  if (!$('#anonymous').checked && !name) {
    $('#brand-name').focus();
    return toast('Add a sponsor name, or choose anonymous sponsorship.');
  }
  if (website && !$('#anonymous').checked) {
    try {
      if (new URL(website).protocol !== 'https:') throw Error();
    } catch {
      $('#brand-website').focus();
      return toast('Use a full HTTPS website address.');
    }
  }
  brand = {
    name,
    tagline: $('#brand-tagline').value.trim(),
    description: $('#brand-description').value.trim(),
    website,
    logo: $('#use-logo').checked,
    anonymous: $('#anonymous').checked,
  };
  sponsorState = 'winner';
  $('#sponsor-scenario').value = 'winner';
  renderSponsor();
  toast('Sponsor profile updated in the preview only.');
  $('.showcase').scrollIntoView({ block: 'start' });
};
$('#visit-sponsor').onclick = () => {
  modal(
    `Visit ${brand.name}`,
    `<p>In the app, this would open the sponsor's website in a new tab.</p><p>${escape(brand.website)}</p><p>This isolated preview does not navigate to external sites.</p>`,
    $('#visit-sponsor'),
  );
};
$('#sponsor-scenario').onchange = () => {
  sponsorState = $('#sponsor-scenario').value;
  renderSponsor();
  switchTab('sponsors', true);
};
$('#show-auction').onclick = () => {
  sponsorState = 'open';
  $('#sponsor-scenario').value = 'open';
  renderSponsor();
  $('.showcase').scrollIntoView({ block: 'start' });
};
renderTeam();
renderPlayers();
renderSponsor();
