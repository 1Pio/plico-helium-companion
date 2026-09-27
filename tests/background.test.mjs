import { test } from 'node:test';
import assert from 'node:assert/strict';
const event = () => ({
  listeners: [],
  addListener(f) {
    this.listeners.push(f);
  },
  emit(...args) {
    for (const f of this.listeners) f(...args);
  },
});
const wait = () => new Promise((r) => setImmediate(r));
async function settle() {
  for (let i = 0; i < 30; i++) await wait();
}
async function harness({
  race = false,
  placementRace = false,
  storage,
  initialTabs,
  initialGroups,
} = {}) {
  let tabs = [
    {
      id: 1,
      index: 0,
      groupId: 5,
      active: true,
      windowId: 7,
      title: 'One',
      url: 'https://example.org/1',
    },
    {
      id: 2,
      index: 1,
      groupId: 5,
      active: false,
      windowId: 7,
      title: 'Two',
      url: 'https://example.org/2',
    },
  ];
  if (initialTabs) tabs = structuredClone(initialTabs);
  let groups = initialGroups || [{ id: 5, title: 'plico:1' }],
    moveCalls = 0,
    messages = [],
    placementRaced = false,
    moveArguments = [];
  const port = {
    onMessage: event(),
    onDisconnect: event(),
    postMessage(m) {
      messages.push(m);
    },
    disconnect() {},
  };
  const api = {
    runtime: {
      id: 'test',
      onMessage: event(),
      onInstalled: event(),
      onStartup: event(),
      connectNative() {
        return port;
      },
    },
    windows: {
      async getAll() {
        return [{ id: 7, focused: true, left: 0, top: 0, width: 1000, height: 700 }];
      },
      onFocusChanged: event(),
      onBoundsChanged: event(),
    },
    tabs: {
      async get(id) {
        return structuredClone(tabs.find((t) => t.id === id));
      },
      async query(q) {
        const result = structuredClone(tabs.filter((t) => t.windowId === q.windowId));
        if (placementRace && !placementRaced && tabs.some((t) => t.id === 3)) {
          placementRaced = true;
          tabs.find((t) => t.id === 3).windowId = 8;
        }
        return result;
      },
      async ungroup(ids) {
        for (const t of tabs) if (ids.includes(t.id)) t.groupId = -1;
        if (race) tabs[1].windowId = 8;
      },
      async move(ids, { windowId }) {
        moveCalls++;
        moveArguments.push(structuredClone(arguments[1]));
        if (!Array.isArray(ids)) {
          const t = tabs.find((t) => t.id === ids);
          if (windowId !== undefined) t.windowId = windowId;
          tabs = tabs.filter((t) => t.id !== ids);
          tabs.splice(arguments[1].index, 0, t);
          tabs.forEach((x, i) => (x.index = i));
          return;
        }
        tabs = ids.map((id, index) => ({ ...tabs.find((t) => t.id === id), index, windowId }));
      },
      async group({ tabIds }) {
        let id = groups.length + 10;
        for (const t of tabs) if (tabIds.includes(t.id)) t.groupId = id;
        groups.push({ id, title: '' });
        return id;
      },
      async update(id, props) {
        for (const t of tabs) if (props.active) t.active = t.id === id;
        return tabs.find((t) => t.id === id);
      },
    },
    tabGroups: {
      async query() {
        return structuredClone(groups);
      },
      async update(id, props) {
        Object.assign(
          groups.find((g) => g.id === id),
          props,
        );
      },
      onCreated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    history: {
      async search() {
        return [];
      },
    },
    bookmarks: {
      async search() {
        return [];
      },
    },
    search: { async query() {} },
  };
  for (const k of [
    'onActivated',
    'onCreated',
    'onRemoved',
    'onMoved',
    'onAttached',
    'onDetached',
    'onUpdated',
  ])
    api.tabs[k] = event();
  if (storage) api.storage = storage;
  globalThis.chrome = api;
  await import('../extension/background.mjs?test=' + crypto.randomUUID());
  api.runtime.onInstalled.emit();
  await settle();
  return {
    api,
    port,
    messages,
    moveArguments,
    get tabs() {
      return tabs;
    },
    get moveCalls() {
      return moveCalls;
    },
  };
}
test('actual bridge commits only exact live tab sets and acknowledges', async () => {
  const h = await harness();
  const s = h.messages.find((m) => m.type === 'snapshot');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'commit-1',
    window: 7,
    revision: s.revision,
    type: 'commit',
    activate: 2,
    loose: [2, 1],
    stacks: Array.from({ length: 10 }, () => []),
  });
  await settle();
  assert.equal(h.moveCalls, 1);
  assert.deepEqual(
    h.tabs.map((t) => t.id),
    [2, 1],
  );
  assert.equal(h.tabs.find((t) => t.active).id, 2);
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'commit-1'));
  h.port.onMessage.emit({ v: 1, epoch: s.epoch, request: 'commit-1', window: 7, type: 'commit' });
  await settle();
  assert.equal(h.moveCalls, 1);
});
test('external cross-window movement during ungroup aborts without pulling tab back', async () => {
  const h = await harness({ race: true });
  const s = h.messages.find((m) => m.type === 'snapshot');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'race',
    window: 7,
    revision: s.revision,
    type: 'commit',
    activate: 2,
    loose: [2, 1],
    stacks: Array.from({ length: 10 }, () => []),
  });
  await settle();
  assert.equal(h.moveCalls, 0);
  assert.equal(h.tabs.find((t) => t.id === 2).windowId, 8);
  assert(h.messages.some((m) => m.type === 'error' && m.request === 'race'));
});
test('stale revision cannot mutate tabs', async () => {
  const h = await harness();
  const s = h.messages.find((m) => m.type === 'snapshot');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'stale',
    window: 7,
    revision: s.revision - 1,
    type: 'commit',
    activate: 2,
    loose: [2, 1],
    stacks: Array.from({ length: 10 }, () => []),
  });
  await settle();
  assert.equal(h.moveCalls, 0);
  assert(h.messages.some((m) => m.type === 'error' && m.request === 'stale'));
});

test('event snapshots never inherit prior queue return values', async () => {
  const h = await harness();
  for (let i = 0; i < 4; i++) {
    h.api.tabs.onUpdated.emit(1, {}, h.tabs[0]);
    await new Promise((r) => setTimeout(r, 35));
    await settle();
  }
  const snapshots = h.messages.filter((m) => m.type === 'snapshot');
  assert(snapshots.length >= 4);
  for (const s of snapshots) assert.equal(s.responseFor, null);
  assert(JSON.stringify(snapshots.at(-1)).length < 3000);
});

test('new tab leaves a Plico stack and precedes stacked tabs', async () => {
  const h = await harness();
  h.tabs.push({
    id: 3,
    index: 2,
    groupId: 5,
    active: false,
    windowId: 7,
    title: 'New',
    url: 'https://example.org/new',
  });
  h.api.tabs.onCreated.emit({ ...h.tabs.at(-1) });
  await settle();
  assert.deepEqual(
    h.tabs.map((t) => t.id),
    [3, 1, 2],
  );
  assert.equal(h.tabs[0].groupId, -1);
});

test('new-tab placement never moves an externally relocated tab back', async () => {
  const h = await harness({ placementRace: true });
  h.tabs.push({
    id: 3,
    index: 2,
    groupId: -1,
    active: false,
    windowId: 7,
    title: 'New',
    url: 'https://example.org/new',
  });
  h.api.tabs.onCreated.emit({ ...h.tabs.at(-1) });
  await settle();
  assert.equal(h.tabs.find((t) => t.id === 3).windowId, 8);
  assert(h.moveArguments.every((args) => args.windowId === undefined));
});

test('back request cannot target a newer active tab or stale revision', async () => {
  const h = await harness(),
    s = h.messages.find((m) => m.type === 'snapshot');
  let calls = 0;
  h.api.tabs.goBack = async () => {
    calls++;
  };
  for (const [request, tab, revision] of [
    ['wrong-tab', 2, s.revision],
    ['old-revision', 1, s.revision - 1],
  ]) {
    h.port.onMessage.emit({
      v: 1,
      epoch: s.epoch,
      request,
      window: 7,
      revision,
      type: 'back',
      tab,
    });
    await settle();
    assert(h.messages.some((m) => m.type === 'error' && m.request === request));
  }
  assert.equal(calls, 0);
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'valid-back',
    window: 7,
    revision: s.revision,
    type: 'back',
    tab: 1,
  });
  await settle();
  assert.equal(calls, 1);
});

test('pending unsaved-page confirmation releases the serialized bridge queue', async () => {
  const h = await harness(),
    s = h.messages.find((m) => m.type === 'snapshot');
  h.tabs[0].openerTabId = 2;
  h.api.tabs.goBack = async () => {
    throw Error('Cannot find a next page in history.');
  };
  let finish;
  h.api.tabs.remove = () => new Promise((r) => (finish = r));
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'pending-close',
    window: 7,
    revision: s.revision,
    type: 'back',
    tab: 1,
  });
  await settle();
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'pending-close'));
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'after-close',
    window: 7,
    type: 'refresh',
  });
  await settle();
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'after-close'));
  finish();
  await settle();
});

test('attachment observation preserves pending partial session restoration', async () => {
  const { WindowMemory } = await import('../extension/window-memory.mjs');
  const data = { session: {}, local: {} };
  const storage = Object.fromEntries(
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
  );
  const saved = [1, 2, 3].map((id) => ({ id, url: 'https://example.org/' + id })),
    stacks = [[1, 2], ...Array.from({ length: 9 }, () => [])];
  const memory = new WindowMemory(storage);
  await memory.reconcile(1, saved, stacks, 2);
  await memory.reconcile(1, saved, stacks, 3);
  await memory.flush();
  data.session = {};
  const h = await harness({
    storage,
    initialTabs: [
      { id: 11, index: 0, groupId: 5, active: true, windowId: 7, title: 'One', url: saved[0].url },
    ],
  });
  h.api.debugger = {
    async getTargets() {
      return [];
    },
  };
  const s = h.messages.find((m) => m.type === 'snapshot');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'observe',
    window: 7,
    type: 'attachments',
  });
  await settle();
  assert(h.messages.some((m) => m.type === 'attachments' && m.available === true));
  h.tabs[0].active = false;
  h.tabs.push(
    { id: 12, index: 1, groupId: 5, active: false, windowId: 7, title: 'Two', url: saved[1].url },
    { id: 13, index: 2, groupId: -1, active: true, windowId: 7, title: 'Three', url: saved[2].url },
  );
  h.api.tabs.onUpdated.emit(13, {}, h.tabs[2]);
  await new Promise((r) => setTimeout(r, 40));
  await settle();
  const final = h.messages.filter((m) => m.type === 'snapshot').at(-1);
  assert.equal(final.last[0], 12);
  assert.deepEqual(final.recent, [13, 12, 11]);
});

test('candidate close/mute validate identity and never activate a different tab', async () => {
  const h = await harness(),
    s = h.messages.find((m) => m.type === 'snapshot');
  const updates = [],
    closes = [];
  h.api.tabs.update = async (id, props) => {
    updates.push({ id, props });
  };
  h.api.tabs.remove = async (id) => closes.push(id);
  const send = async (type, request, extra = {}) => {
    h.port.onMessage.emit({
      v: 1,
      epoch: s.epoch,
      revision: s.revision,
      window: 7,
      tab: 2,
      type,
      request,
      ...extra,
    });
    await settle();
  };
  await send('mute', 'mute', { muted: true });
  assert.deepEqual(updates, [{ id: 2, props: { muted: true } }]);
  assert.equal(h.tabs.find((t) => t.active).id, 1);
  await send('close', 'close');
  assert.deepEqual(closes, [2]);
  await send('close', 'stale', { revision: s.revision - 1 });
  await send('close', 'wrong-window', { window: 8 });
  await send('close', 'unknown', { tab: 9 });
  await send('mute', 'invalid', { muted: 1 });
  assert.deepEqual(closes, [2]);
  assert.equal(updates.length, 1);
});
test('candidate close confirmation does not block refresh', async () => {
  const h = await harness(),
    s = h.messages.find((m) => m.type === 'snapshot');
  let finish;
  h.api.tabs.remove = () => new Promise((r) => (finish = r));
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    revision: s.revision,
    window: 7,
    tab: 2,
    type: 'close',
    request: 'close',
  });
  await settle();
  h.port.onMessage.emit({ v: 1, epoch: s.epoch, window: 7, type: 'refresh', request: 'refresh' });
  await settle();
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'refresh'));
  assert(!h.messages.some((m) => m.type === 'ack' && m.request === 'close'));
  finish();
  await settle();
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'close'));
});

test('favicon loading does not cache a placeholder before the real icon arrives', async () => {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  try {
    const h = await harness();
    h.api.runtime.getURL = () => 'https://extension.invalid/_favicon/';
    const refresh = async () => {
      const s = h.messages.filter((m) => m.type === 'snapshot').at(-1);
      h.port.onMessage.emit({
        v: 1,
        epoch: s.epoch,
        request: crypto.randomUUID(),
        window: 7,
        type: 'refresh',
      });
      await settle();
    };
    h.tabs[0].url += '?loading';
    await refresh();
    assert.equal(calls.length, 0);
    h.tabs[0].favIconUrl = 'https://example.org/icon1.png';
    await refresh();
    assert.equal(calls.length, 1);
    assert(h.messages.some((m) => m.type === 'icon'));
    await refresh();
    assert.equal(calls.length, 1);
    h.tabs[0].favIconUrl = 'https://example.org/icon2.png';
    await refresh();
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('changed in-flight favicon suppresses stale bytes and fetches the latest source', async () => {
  const original = globalThis.fetch,
    pending = [];
  globalThis.fetch = () =>
    new Promise((resolve) =>
      pending.push((bytes) => resolve({ arrayBuffer: async () => new Uint8Array(bytes).buffer })),
    );
  try {
    const h = await harness();
    h.api.runtime.getURL = () => 'https://extension.invalid/_favicon/';
    const refresh = async () => {
      const s = h.messages.filter((m) => m.type === 'snapshot').at(-1);
      h.port.onMessage.emit({
        v: 1,
        epoch: s.epoch,
        request: crypto.randomUUID(),
        window: 7,
        type: 'refresh',
      });
      await settle();
    };
    h.tabs[0].favIconUrl = 'https://example.org/old.png';
    await refresh();
    assert.equal(pending.length, 1);
    h.tabs[0].favIconUrl = 'https://example.org/new.png';
    await refresh();
    assert.equal(pending.length, 1);
    pending[0]([1]);
    await settle();
    assert.equal(h.messages.filter((m) => m.type === 'icon').length, 0);
    assert.equal(pending.length, 2);
    pending[1]([2]);
    await settle();
    assert.equal(
      h.messages.filter((m) => m.type === 'icon').at(-1).data,
      btoa(String.fromCharCode(2)),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('external native group no longer blocks unrelated committed organization', async () => {
  const h = await harness({
    initialGroups: [{ id: 5, title: 'Research', color: 'green', collapsed: false }],
    initialTabs: [
      { id: 1, index: 0, groupId: -1, active: true, windowId: 7 },
      { id: 2, index: 1, groupId: -1, active: false, windowId: 7 },
      { id: 3, index: 2, groupId: 5, active: false, windowId: 7 },
    ],
  });
  const s = h.messages.find((m) => m.type === 'snapshot');
  assert.deepEqual(s.stacks[0], [3]);
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'native-group',
    window: 7,
    revision: s.revision,
    type: 'commit',
    activate: 1,
    loose: [2, 1],
    stacks: s.stacks,
  });
  await settle();
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'native-group'));
  assert.deepEqual(
    h.tabs.map((t) => t.id),
    [2, 1, 3],
  );
  const groups = await h.api.tabGroups.query();
  assert(
    groups.some(
      (g) => g.id !== 5 && g.title === 'Research' && g.color === 'green' && g.collapsed === false,
    ),
  );
});

test('connection status waits for validated native input readiness without snapshot loop', async () => {
  const h = await harness();
  const s = h.messages.find((m) => m.type === 'snapshot');
  const getStatus = () =>
    new Promise((resolve) =>
      h.api.runtime.onMessage.emit({ type: 'status' }, { id: 'test' }, resolve),
    );
  assert.equal((await getStatus()).status, 'Connecting');
  const count = h.messages.filter((m) => m.type === 'snapshot').length;
  h.port.onMessage.emit({
    v: 1,
    epoch: 'obsolete',
    request: 'old',
    type: 'hostStatus',
    inputReady: true,
  });
  await settle();
  assert.equal((await getStatus()).status, 'Connecting');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'denied',
    type: 'hostStatus',
    accessibility: false,
    inputReady: false,
  });
  await settle();
  assert.equal((await getStatus()).status, 'Accessibility permission required');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'granted',
    type: 'hostStatus',
    accessibility: true,
    inputReady: true,
  });
  await settle();
  assert.equal((await getStatus()).status, 'Connected');
  assert.equal(h.messages.filter((m) => m.type === 'snapshot').length, count);
  assert(h.messages.some((m) => m.type === 'ack' && m.request === 'granted'));
});

test('queued native readiness cannot revive a disconnected host', async () => {
  const h = await harness();
  const s = h.messages.find((m) => m.type === 'snapshot');
  h.port.onMessage.emit({
    v: 1,
    epoch: s.epoch,
    request: 'late',
    type: 'hostStatus',
    accessibility: true,
    inputReady: true,
  });
  h.api.runtime.onMessage.emit({ type: 'disconnect' }, { id: 'test' }, () => {});
  await settle();
  const status = await new Promise((resolve) =>
    h.api.runtime.onMessage.emit({ type: 'status' }, { id: 'test' }, resolve),
  );
  assert.equal(status.status, 'Disconnected');
  assert.equal(status.connected, false);
});
