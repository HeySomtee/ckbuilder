import { CKB, decode, loadMarket, buildClaim, buildDeposit } from './client.mjs';
const $ = id => document.getElementById(id);
let ccc, client, connector, signer, manifest, current = [], nextShard = 0;
const status = message => { $('status').textContent = message; };
const amount = value => (Number(value) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });
async function connect() {
  if (!connector) {
    await import('https://esm.sh/@ckb-ccc/connector@1');
    connector = document.createElement('ccc-connector'); connector.setClient(client); document.body.append(connector);
    connector.addEventListener('close', () => { connector.style.display = 'none'; });
    connector.addEventListener('willUpdate', async () => {
      signer = connector.signer?.signer;
      if (signer) { connector.style.display = 'none'; $('connect').textContent = 'Change wallet'; await action(refresh); }
    });
  }
  if (signer) { connector.disconnect(); signer = undefined; }
  connector.style.display = '';
}
async function refresh() {
  const descriptor = manifest.markets[Number($('market').value || 0)];
  current = await loadMarket(ccc, client, descriptor, manifest);
  const control = current.find(x => x.state.kind === 'market');
  const open = control?.state.phase === 0 && Date.now() < descriptor.cutoff;
  $('marketState').textContent = open ? 'OPEN / deposits are provisional until their creation block is checked' : control ? 'BETTING CLOSED / awaiting settlement' : 'SETTLED / inspect confirmed transactions below';
  $('deposit').disabled = !open;
  $('positions').replaceChildren();
  for (const x of current.filter(x => x.state.kind === 'shard')) {
    const span = document.createElement('span'); span.textContent = `Shard ${x.state.id}: ${x.state.accepted} accepted / ${x.state.pending} pending`; $('positions').append(span);
  }
  $('claims').replaceChildren();
  if (!signer) { $('claims').textContent = 'Connect a wallet to find your claims.'; return; }
  const lock = (await ccc.Address.fromString(await signer.getRecommendedAddress(), client)).script;
  const claims = current.filter(x => x.state.kind === 'claim' && x.state.owner === lock.hash());
  if (!claims.length) $('claims').textContent = 'No unspent claims for this wallet in this market.';
  for (const { cell, state } of claims) {
    const div = document.createElement('div'); div.className = 'claim';
    const value = document.createElement('strong'); value.textContent = `${amount(cell.cellOutput.capacity)} CKB`;
    const note = document.createElement('p'); note.className = 'hint'; note.textContent = `Claim ${state.id} / includes 321 CKB returned storage`;
    const button = document.createElement('button'); button.textContent = 'Claim to wallet';
    button.onclick = () => action(async () => {
      const tx = await buildClaim(ccc, client, signer, cell.outPoint, manifest);
      const hash = await signer.sendTransaction(tx); status('Claim submitted: ' + hash);
      await client.waitTransaction(hash, 1, 300000); status('Claim confirmed: ' + hash); await refresh();
    }); div.append(value, note, button); $('claims').append(div);
  }
}
async function action(fn) { try { await fn(); } catch (error) { status(error.message || String(error)); } }
$('connect').onclick = () => action(connect);
$('refresh').onclick = () => action(refresh);
$('market').onchange = () => action(refresh);
$('stake').onsubmit = event => { event.preventDefault(); action(async () => {
  if (!signer) { await connect(); return; }
  const descriptor = manifest.markets[Number($('market').value)];
  const principal = BigInt($('amount').value) * CKB, outcome = Number(document.querySelector('input[name=outcome]:checked').value);
  const { tx, shard } = await buildDeposit(ccc, client, signer, descriptor, manifest, outcome, principal, nextShard);
  const hash = await signer.sendTransaction(tx); nextShard = (shard + 1) % 4; status('Stake submitted: ' + hash);
  await client.waitTransaction(hash, 1, 300000); status('Stake committed. Admission still depends on its creation timestamp.'); await refresh();
}); };
async function start() {
  manifest = await (await fetch('./deployment.json')).json();
  $('marketCount').textContent = manifest.markets.length;
  manifest.markets.forEach((m, i) => { const option = document.createElement('option'); option.value = i; option.textContent = m.label; $('market').append(option); });
  const run = await (await fetch('./run.json')).json();
  $('transactions').replaceChildren();
  for (const [label, hash] of [['Contract deployment', run.deployment], ['Market settlement', run.settlement], ...(run.winningClaims || []).map((h, i) => [`Winning claim ${i + 1}`, h]), ['Losing stake storage returned', run.losingStorageReturn], ['Empty-market timeout', run.timeout]]) {
    if (!hash) continue; const link = document.createElement('a'); link.href = 'https://pudge.explorer.nervos.org/transaction/' + hash; link.target = '_blank'; link.rel = 'noopener'; link.textContent = label;
    const small = document.createElement('small'); small.textContent = hash; link.append(small); $('transactions').append(link);
  }
  ({ ccc } = await import('https://esm.sh/@ckb-ccc/core@1.12.5'));
  client = new ccc.ClientPublicTestnet({ url: manifest.rpc, fallbacks: [] });
  await refresh(); status('Connected directly to CKB testnet. No application database required.');
}
action(start);
