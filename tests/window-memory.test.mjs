import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WindowMemory } from '../extension/window-memory.mjs';
const storage = () => {
  const data = { session: {}, local: {} };
  return {
    data,
    ...Object.fromEntries(
      ['session', 'local'].map((name) => [
        name,
        {
          async get(k) {
            return { [k]: structuredClone(data[name][k]) };
          },
          async set(v) {
            Object.assign(data[name], structuredClone(v));
          },
        },
      ]),
    ),
  };
};
const stacks = (...a) => [a, ...Array.from({ length: 9 }, () => [])];
const tabs = (ids) => ids.map((id, i) => ({ id, url: 'https://example.org/' + i }));
test('window MRU and last-active survive focus changes and worker restart', async () => {
  const disk = storage(),
    m = new WindowMemory(disk),
    a = tabs([1, 2, 3]);
  await m.reconcile(1, a, stacks(1, 2), 1);
  await m.reconcile(1, a, stacks(1, 2), 2);
  await m.reconcile(2, tabs([4, 5]), stacks(4, 5), 4);
  let r = await m.reconcile(1, a, stacks(1, 2), 2);
  assert.equal(r.last[0], 2);
  assert.deepEqual(r.recent, [2, 1, 3]);
  await m.flush();
  r = await new WindowMemory(disk).reconcile(1, a, stacks(1, 2), 2);
  assert.deepEqual(r.recent, [2, 1, 3]);
  assert.equal(r.last[0], 2);
});
test('browser restart maps matching layout positions to new tab identifiers', async () => {
  const disk = storage(),
    m = new WindowMemory(disk);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  await m.flush();
  disk.data.session = {};
  const r = await new WindowMemory(disk).reconcile(9, tabs([11, 12, 13]), stacks(11, 12), 13);
  assert.equal(r.last[0], 12);
  assert.deepEqual(r.recent, [13, 12, 11]);
  assert(!JSON.stringify(disk.data.local).includes('https://'));
});
test('unmatched restored layout falls back without cross-window tab identities', async () => {
  const disk = storage(),
    m = new WindowMemory(disk);
  await m.reconcile(1, tabs([1, 2]), stacks(1, 2), 2);
  await m.flush();
  disk.data.session = {};
  const r = await new WindowMemory(disk).reconcile(2, tabs([8]), stacks(8), 8);
  assert.deepEqual(r.recent, [8]);
  assert.equal(r.last[0], 8);
});
test('late complete restore snapshot can recover saved stack member', async () => {
  const disk = storage(),
    first = new WindowMemory(disk);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  await first.flush();
  disk.data.session = {};
  const next = new WindowMemory(disk);
  await next.reconcile(7, tabs([11]), stacks(11), 11);
  const r = await next.reconcile(7, tabs([11, 12, 13]), stacks(11, 12), 13);
  assert.equal(r.last[0], 12);
});
test('a new same-layout window starts with its own history', async () => {
  const disk = storage(),
    m = new WindowMemory(disk);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  const r = await m.reconcile(2, tabs([21, 22, 23]), stacks(21, 22), 23);
  assert.equal(r.last[0], 21);
  assert.deepEqual(r.recent, [23, 21, 22]);
});
test('rapid activations in an unfocused window preserve their actual order', async () => {
  const m = new WindowMemory(storage());
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 1);
  await m.reconcile(2, tabs([4]), stacks(4), 4);
  await m.activate(1, 3);
  await m.activate(1, 2);
  const r = await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  assert.deepEqual(r.recent, [2, 3, 1]);
});
test('identical saved windows are not assigned one anothers histories', async () => {
  const disk = storage(),
    m = new WindowMemory(disk);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  await m.reconcile(2, tabs([4, 5, 6]), stacks(4, 5), 6);
  await m.flush();
  disk.data.session = {};
  const restored = new WindowMemory(disk);
  await restored.beginSession([7, 8]);
  const r = await restored.reconcile(7, tabs([11, 12, 13]), stacks(11, 12), 13);
  assert.equal(r.last[0], 11);
});
test('coalesced stack then loose activation retains the intermediate stack member', async () => {
  const m = new WindowMemory(storage());
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 1);
  await m.activate(1, 2);
  await m.activate(1, 3);
  const r = await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  assert.deepEqual(r.recent, [3, 2, 1]);
  assert.equal(r.last[0], 2);
});
test('moving an inactive recent loose tab into a stack does not simulate a visit', async () => {
  const m = new WindowMemory(storage());
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1), 1);
  await m.activate(1, 2);
  await m.activate(1, 3);
  await m.reconcile(1, tabs([1, 2, 3]), stacks(1), 3);
  const r = await m.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  assert.equal(r.last[0], 1);
});
test('worker restart retains membership before an unfocused window reconciles', async () => {
  const disk = storage(),
    first = new WindowMemory(disk);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 1);
  await first.flush();
  const restored = new WindowMemory(disk);
  await restored.activate(1, 2);
  await restored.activate(1, 3);
  const r = await restored.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  assert.equal(r.last[0], 2);
  assert.deepEqual(r.recent, [3, 2, 1]);
});
test('closed identical windows do not make the surviving restart anchor ambiguous', async () => {
  const disk = storage(),
    first = new WindowMemory(disk);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  await first.reconcile(2, tabs([4, 5, 6]), stacks(4, 5), 6);
  await first.forget(2);
  await first.flush();
  disk.data.session = {};
  const r = await new WindowMemory(disk).reconcile(9, tabs([11, 12, 13]), stacks(11, 12), 13);
  assert.equal(r.last[0], 12);
});
test('worker reload preserves pending restoration of an unfocused window', async () => {
  const disk = storage(),
    first = new WindowMemory(disk);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 2);
  await first.reconcile(1, tabs([1, 2, 3]), stacks(1, 2), 3);
  await first.flush();
  disk.data.session = {};
  const next = new WindowMemory(disk);
  await next.beginSession([8, 9]);
  await next.reconcile(8, tabs([50]), stacks(50), 50);
  await next.flush();
  const r = await new WindowMemory(disk).reconcile(9, tabs([11, 12, 13]), stacks(11, 12), 13);
  assert.equal(r.last[0], 12);
});
