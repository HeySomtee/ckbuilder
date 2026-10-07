export const CKB = 100000000n;
export const STORAGE = 321n * CKB;
const bytes = hex => Uint8Array.from(hex.slice(2).match(/../g) || [], x => parseInt(x, 16));
const hex = data => '0x' + Array.from(data, x => x.toString(16).padStart(2, '0')).join('');
const u64 = (data, at) => new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(at, true);
export function decode(data) {
  const b = bytes(data);
  if (b[0] === 3 && b.length === 43) return { kind: 'claim', id: b[1], owner: hex(b.slice(2, 34)), outcome: b[34], principal: u64(b, 35) };
  if (b[0] === 0 && b.length === 3) return { kind: 'market', phase: b[1], outcome: b[2] };
  if (b[0] === 1 && b.length >= 4 && b.length === 4 + 41 * (b[2] + b[3])) return { kind: 'shard', id: b[1], accepted: b[2], pending: b[3], bytes: b };
  if (b[0] === 2 && b.length === 34) return { kind: 'reserve', outcome: b[1], totals: [u64(b, 2), u64(b, 10), u64(b, 18)] };
  throw new Error('Unknown contract cell layout');
}
function checkCell(cell, manifest) {
  const type = cell.cellOutput.type, lock = cell.cellOutput.lock;
  if (!type || type.codeHash !== manifest.protocolHash || type.hashType !== 'data2' || bytes(type.args).length !== 172 || lock.codeHash !== manifest.guardHash || lock.hashType !== 'data2' || lock.args !== type.hash()) throw new Error('Cell does not belong to the pinned Week 20 contract');
}
export async function loadMarket(ccc, client, descriptor, manifest) {
  const cells = [];
  for await (const cell of client.findCellsByType(ccc.Script.from(descriptor.type), true)) {
    checkCell(cell, manifest); cells.push({ cell, state: decode(cell.outputData) });
  }
  return cells;
}
export async function buildClaim(ccc, client, signer, outPoint, manifest) {
  const cell = await client.getCellLive(outPoint, true, true);
  if (!cell) throw new Error('This claim is already spent or unavailable');
  checkCell(cell, manifest); const state = decode(cell.outputData);
  if (state.kind !== 'claim') throw new Error('This is not a funded claim');
  const address = await ccc.Address.fromString(await signer.getRecommendedAddress(), client);
  if (address.script.hash() !== state.owner) throw new Error('Connect the wallet that owns this claim');
  const tx = ccc.Transaction.from({ inputs: [{ previousOutput: outPoint }],
    outputs: [{ capacity: cell.cellOutput.capacity, lock: address.script }], outputsData: ['0x'], cellDeps: manifest.codeDeps });
  await tx.completeFeeBy(signer, 1000n);
  return tx;
}
export async function buildDeposit(ccc, client, signer, descriptor, manifest, outcome, principal, startShard = 0) {
  if (!Number.isInteger(outcome) || outcome < 0 || outcome > 2 || principal < 100n * CKB) throw new Error('Choose an outcome and stake at least 100 testnet CKB');
  if (Date.now() >= descriptor.cutoff) throw new Error('Betting has closed');
  const address = await ccc.Address.fromString(await signer.getRecommendedAddress(), client);
  if (bytes(address.script.args).length > 20) throw new Error('This prototype supports wallet locks with at most 20 argument bytes');
  const cells = await loadMarket(ccc, client, descriptor, manifest);
  const control = cells.find(c => c.state.kind === 'market' && c.state.phase === 0);
  if (!control) throw new Error('Market is not open');
  for (let offset = 0; offset < 4; offset++) {
    const id = (startShard + offset) % 4;
    const selected = cells.find(c => c.state.kind === 'shard' && c.state.id === id && c.state.accepted + c.state.pending < 8);
    if (!selected) continue;
    const b = selected.state.bytes, accepted = selected.state.accepted + selected.state.pending;
    const withHeader = await client.getCellWithHeader(selected.cell.outPoint);
    if (!withHeader?.header) throw new Error('Shard is awaiting confirmation');
    if (selected.state.pending && Number(withHeader.header.timestamp) >= descriptor.cutoff) throw new Error('Previous stake is late; use the closure/refund workflow');
    const next = new Uint8Array(4 + 41 * (accepted + 1));
    next.set([1, id, accepted, 1]); next.set(b.slice(4), 4);
    const at = 4 + 41 * accepted; next.set(bytes(address.script.hash()), at); next[at + 32] = outcome;
    new DataView(next.buffer).setBigUint64(at + 33, principal, true);
    const tx = ccc.Transaction.from({ inputs: [{ previousOutput: selected.cell.outPoint }],
      outputs: [{ ...selected.cell.cellOutput, capacity: selected.cell.cellOutput.capacity + principal + STORAGE }],
      outputsData: [hex(next)], cellDeps: [...manifest.codeDeps, { outPoint: control.cell.outPoint, depType: 'code' }], headerDeps: [withHeader.header.hash] });
    await tx.completeInputsByCapacity(signer); await tx.completeFeeBy(signer, 1000n);
    return { tx, shard: id };
  }
  throw new Error('All four shards are full or unavailable');
}
