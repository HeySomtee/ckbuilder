import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DraftStore,
  DRAFT_KEY,
  parseDraft,
  amountShannons,
  totalShannons,
} from './src/features/predictions/draft.ts';
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
test('Exact independent totals and replacement preserve user amounts across reload', () => {
  const memory = storage();
  const store = new DraftStore(memory);
  store.select('market-1', 'fixture-1', 'home');
  const first = store.getSnapshot().draft.picks[0];
  store.amount(first.lineId, '10.00000001');
  store.select('market-2', 'fixture-2', 'away');
  store.select('market-1', 'fixture-1', 'draw');
  assert.equal(store.getSnapshot().draft.picks.length, 2);
  assert.equal(store.getSnapshot().draft.picks[0].amountCkb, '10.00000001');
  assert.equal(totalShannons(store.getSnapshot().draft.picks), 11000000001n);
  const restored = new DraftStore(memory);
  assert.deepEqual(restored.getSnapshot().draft, store.getSnapshot().draft);
  restored.amount(first.lineId, '10.');
  assert.equal(totalShannons(restored.getSnapshot().draft.picks), null);
  assert.equal(amountShannons('1e2'), null);
  assert.equal(amountShannons('0.00000001'), 1n);
});
test('Corruption remains untouched until explicit discard; oversized/duplicate drafts are rejected', () => {
  const memory = storage();
  memory.setItem(DRAFT_KEY, '{broken');
  const store = new DraftStore(memory);
  assert.equal(store.getSnapshot().blocked, true);
  assert.equal(store.select('market', 'fixture', 'home'), false);
  assert.equal(memory.getItem(DRAFT_KEY), '{broken');
  store.clear();
  assert.equal(store.getSnapshot().blocked, false);
  assert.equal(store.getSnapshot().draft.picks.length, 0);
  assert.throws(() => parseDraft('x'.repeat(20001)));
  store.select('market', 'fixture', 'home');
  const draft = store.getSnapshot().draft;
  assert.throws(() =>
    parseDraft(JSON.stringify({ ...draft, picks: [draft.picks[0], draft.picks[0]] })),
  );
});
test('Cross-tab conflicts are detected before writes even if the storage event was missed', () => {
  const memory = storage();
  const a = new DraftStore(memory);
  const b = new DraftStore(memory);
  a.select('a', 'a', 'home');
  assert.equal(b.select('b', 'b', 'away'), false);
  assert.equal(b.getSnapshot().conflict, true);
  assert.equal(parseDraft(memory.getItem(DRAFT_KEY)).picks[0].marketId, 'a');
  b.loadOtherTab();
  assert.equal(b.getSnapshot().draft.picks[0].marketId, 'a');
  b.select('b', 'b', 'away');
  a.externalChange();
  assert.equal(a.getSnapshot().conflict, true);
  a.keepThisTab();
  assert.equal(parseDraft(memory.getItem(DRAFT_KEY)).picks.length, 1);
});
test('Storage failures keep editable memory drafts and never claim saved', () => {
  const store = new DraftStore({
    getItem: () => null,
    setItem: () => {
      throw Error('Quota');
    },
  });
  store.select('market', 'fixture', 'home');
  assert.equal(store.getSnapshot().draft.picks.length, 1);
  assert.equal(store.getSnapshot().saved, false);
  assert.match(store.getSnapshot().warning, /could not be saved/);
  const blocked = new DraftStore({
    getItem: () => {
      throw Error('Security');
    },
    setItem: () => {},
  });
  blocked.select('market', 'fixture', 'home');
  assert.equal(blocked.getSnapshot().draft.picks.length, 1);
  assert.equal(blocked.getSnapshot().saved, false);
});
test('Storage denial after a saved draft switches to editable memory without overwriting it', () => {
  const memory = storage();
  let denied = false;
  const store = new DraftStore({
    getItem(key) {
      if (denied) throw Error('denied');
      return memory.getItem(key);
    },
    setItem: memory.setItem,
  });
  store.select('market', 'fixture', 'home');
  const saved = memory.getItem(DRAFT_KEY);
  const id = store.getSnapshot().draft.picks[0].lineId;
  denied = true;
  store.amount(id, '25');
  store.amount(id, '26');
  assert.equal(store.getSnapshot().draft.picks[0].amountCkb, '26');
  assert.equal(store.getSnapshot().saved, false);
  assert.equal(store.getSnapshot().conflict, false);
  assert.equal(memory.getItem(DRAFT_KEY), saved);
});

test('Eight-pick cap preserves existing picks, remove and clear persist immediately', () => {
  const memory = storage();
  const store = new DraftStore(memory);
  for (let i = 0; i < 8; i++) assert.equal(store.select(`m-${i}`, `f-${i}`, 'home'), true);
  assert.equal(store.select('ninth', 'ninth', 'away'), false);
  store.remove(store.getSnapshot().draft.picks[0].lineId);
  assert.equal(new DraftStore(memory).getSnapshot().draft.picks.length, 7);
  store.clear();
  assert.equal(new DraftStore(memory).getSnapshot().draft.picks.length, 0);
});
