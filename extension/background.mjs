import { GroupSlots } from './group-slots.mjs';
import { debuggerStatus } from './debugger-status.mjs';
import { defaults, migrateSettings } from './settings.mjs';
import { backToOpener } from './back.mjs';
import { WindowMemory } from './window-memory.mjs';
import { VERSION, validateCommit, destination } from './model.mjs';
const icons = new Map(),
  iconPending = new Map();
function requestIcons(tabs) {
  if (!chrome.runtime.getURL) return;
  for (const t of tabs.slice(0, 128)) {
    if (!t.url || !t.favIconUrl) continue;
    if (iconPending.has(t.url)) {
      iconPending.set(t.url, t);
      continue;
    }
    const cached = icons.get(t.url);
    if (cached?.source === t.favIconUrl) {
      send({ type: 'icon', url: t.url, data: cached.data });
      continue;
    }
    iconPending.set(t.url, t);
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', t.url);
    url.searchParams.set('size', '32');
    fetch(url, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.arrayBuffer())
      .then((buffer) => {
        if (buffer.byteLength > 32768 || iconPending.get(t.url)?.favIconUrl !== t.favIconUrl)
          return;
        const data = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        if (icons.size >= 128) icons.delete(icons.keys().next().value);
        icons.set(t.url, { source: t.favIconUrl, data });
        send({ type: 'icon', url: t.url, data });
      })
      .catch(() => {})
      .finally(() => {
        const latest = iconPending.get(t.url);
        iconPending.delete(t.url);
        if (latest && latest.favIconUrl !== t.favIconUrl) requestIcons([latest]);
      });
  }
}
const navigationMemory = new WindowMemory(chrome.storage);
const groupSlots = new GroupSlots(chrome.storage);
let settings = defaults;
async function loadSettings() {
  try {
    const saved = (await chrome.storage?.local?.get('plicoSettings'))?.plicoSettings;
    settings = saved ? migrateSettings(saved) : defaults;
    if (saved && JSON.stringify(saved) !== JSON.stringify(settings))
      await chrome.storage.local.set({ plicoSettings: settings });
  } catch {
    settings = defaults;
  }
}
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes.plicoSettings)
    queue(async () => {
      await loadSettings();
      await snapshot();
    });
});
const HOST = 'cc.helwig.plico.companion',
  PREFIX = 'plico:';
let snapshotTimer = null,
  lastIconFingerprint = '';
let port = null,
  epoch = '',
  revision = 0,
  fingerprint = '',
  chain = Promise.resolve(),
  lastWindow = null,
  status = 'Disconnected',
  seen = new Set();
function send(data) {
  port?.postMessage({ v: VERSION, epoch, ...data });
}
function scheduleSnapshot() {
  if (!port || snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    queue(snapshot);
  }, 25);
}
function queue(fn) {
  chain = chain
    .then(() => fn())
    .catch((e) => {
      status = e.message;
      console.warn(e);
    });
  return chain;
}
async function snapshot(responseFor = null) {
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  await navigationMemory.beginSession(wins.map((w) => w.id));
  await groupSlots.beginSession(wins.map((w) => w.id));
  const win = wins.find((w) => w.focused) || wins.find((w) => w.id === lastWindow) || wins[0];
  if (!win) {
    send({ type: 'inactive' });
    return null;
  }
  lastWindow = win.id;
  const tabs = await chrome.tabs.query({ windowId: win.id });
  const groups = await chrome.tabGroups.query({ windowId: win.id });
  const slots = await groupSlots.resolve(win.id, groups, tabs);
  const loose = [],
    stacks = Array.from({ length: 10 }, () => []);
  for (const t of tabs) (slots.has(t.groupId) ? stacks[slots.get(t.groupId)] : loose).push(t.id);
  const active = tabs.find((t) => t.active)?.id;
  const fp = JSON.stringify([
    settings,
    win.id,
    active,
    tabs.map((t) => [t.id, t.index, t.groupId]),
    groups.map((g) => [g.id, g.title]),
  ]);
  if (fp !== fingerprint) {
    revision++;
    fingerprint = fp;
  }
  const { recent, last } = await navigationMemory.reconcile(win.id, tabs, stacks, active);
  const iconFingerprint = JSON.stringify(tabs.map((t) => [t.id, t.url, t.favIconUrl]));
  const state = {
    type: 'snapshot',
    settings,
    responseFor,
    revision,
    window: {
      id: win.id,
      focused: win.focused,
      left: win.left,
      top: win.top,
      width: win.width,
      height: win.height,
    },
    active,
    loose,
    stacks,
    last,
    recent,
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title || 'Untitled',
      url: t.url || '',
      audible: !!t.audible,
      muted: !!t.mutedInfo?.muted,
      discarded: !!t.discarded,
      pinned: !!t.pinned,
      groupId: t.groupId,
    })),
  };
  send(state);
  if (iconFingerprint !== lastIconFingerprint) {
    lastIconFingerprint = iconFingerprint;
    requestIcons(tabs);
  }
  return { state, tabs, groups, slots };
}
async function handle(m) {
  if (
    !m ||
    m.v !== VERSION ||
    m.epoch !== epoch ||
    typeof m.request !== 'string' ||
    m.request.length > 80 ||
    seen.has(m.request)
  )
    return;
  seen.add(m.request);
  if (seen.size > 256) seen.delete(seen.values().next().value);
  try {
    // A valid host handshake confirms its event tap, not merely an open pipe.
    // Acknowledge without taking a snapshot: status must never make a feedback loop.
    if (m.type === 'hostStatus') {
      if (!port) return;
      if (
        typeof m.inputReady !== 'boolean' ||
        typeof m.accessibility !== 'boolean' ||
        (m.inputReady && !m.accessibility)
      )
        throw Error('Invalid host status');
      status = m.inputReady
        ? 'Connected'
        : m.accessibility
          ? 'Keyboard hook unavailable; reconnect Plico'
          : 'Accessibility permission required';
      send({ type: 'ack', request: m.request });
      return;
    }
    const current = await snapshot();
    if (!current) throw Error('No browser window');
    if (m.window !== current.state.window.id) throw Error('Window changed');
    if (m.type !== 'refresh' && m.type !== 'search' && m.type !== 'attachments') {
      await navigationMemory.interacted(m.window);
      await groupSlots.interacted(m.window);
    }
    if (m.type === 'commit') {
      if (m.revision !== current.state.revision) throw Error('Browser changed; draft canceled');
      const order = validateCommit(m, current.tabs);
      let expected = current.tabs.map((t) => ({ id: t.id, groupId: t.groupId, active: t.active }));
      async function verify() {
        if (!port || m.epoch !== epoch) throw Error('Disconnected; remaining operations canceled');
        const actual = await chrome.tabs.query({ windowId: m.window });
        if (
          JSON.stringify(
            actual.map((t) => ({ id: t.id, groupId: t.groupId, active: t.active })),
          ) !== JSON.stringify(expected)
        )
          throw Error('Tabs changed during commit; remaining operations canceled');
      }
      const wantedChanged =
        JSON.stringify([m.loose, m.stacks]) !==
        JSON.stringify([current.state.loose, current.state.stacks]);
      if (wantedChanged) {
        if (current.tabs.some((t) => t.pinned))
          throw Error('Unpin tabs before rearranging this window');
        if (current.groups.some((g) => !current.slots.has(g.id)))
          throw Error('More than ten native groups: free a stack slot before rearranging');
        const metadata = new Map(
          current.groups.map((g) => [
            current.slots.get(g.id),
            { title: g.title, color: g.color, collapsed: g.collapsed },
          ]),
        );
        const liveGroups = await chrome.tabGroups.query({ windowId: m.window });
        if (
          JSON.stringify(liveGroups.map((g) => [g.id, g.title, g.color, g.collapsed])) !==
          JSON.stringify(current.groups.map((g) => [g.id, g.title, g.color, g.collapsed]))
        )
          throw Error('Groups changed; draft canceled');
        const grouped = current.tabs.filter((t) => t.groupId !== -1).map((t) => t.id);
        await verify();
        if (grouped.length) {
          await chrome.tabs.ungroup(grouped);
          expected = expected.map((t) => ({ ...t, groupId: -1 }));
        }
        await verify();
        await chrome.tabs.move(order, { windowId: m.window, index: 0 });
        expected = order.map((id) => expected.find((t) => t.id === id));
        for (let s = 0; s < 10; s++)
          if (m.stacks[s].length) {
            await verify();
            const id = await chrome.tabs.group({
              tabIds: m.stacks[s],
              createProperties: { windowId: m.window },
            });
            expected = expected.map((t) =>
              m.stacks[s].includes(t.id) ? { ...t, groupId: id } : t,
            );
            await verify();
            await groupSlots.assign(m.window, id, s);
            await chrome.tabGroups.update(
              id,
              metadata.get(s) || { title: PREFIX + (s + 1), color: 'grey', collapsed: true },
            );
          }
      }
      await verify();
      await chrome.tabs.update(m.activate, { active: true });
    } else if (m.type === 'close' || m.type === 'mute') {
      if (
        m.revision !== current.state.revision ||
        !Number.isInteger(m.tab) ||
        !current.tabs.some((t) => t.id === m.tab)
      )
        throw Error('Candidate changed; action canceled');
      const live = await chrome.tabs.get(m.tab);
      if (live.windowId !== m.window || !port || m.epoch !== epoch)
        throw Error('Candidate moved; action canceled');
      if (m.type === 'mute') {
        if (typeof m.muted !== 'boolean') throw Error('Invalid mute state');
        await chrome.tabs.update(m.tab, { muted: m.muted });
      } else {
        // Do not hold the bridge queue behind a beforeunload confirmation.
        chrome.tabs
          .remove(m.tab)
          .then(() =>
            queue(async () => {
              send({ type: 'ack', request: m.request });
              await snapshot(m.request);
            }),
          )
          .catch((e) =>
            queue(async () => {
              send({ type: 'error', request: m.request, message: e.message });
              await snapshot(m.request);
            }),
          );
        return;
      }
    } else if (m.type === 'search') {
      if (typeof m.query !== 'string' || m.query.length > 8192) throw Error('Invalid query');
      const [history, bookmarks] = m.query.trim()
        ? await Promise.all([
            chrome.history.search({ text: m.query, maxResults: 8 }),
            chrome.bookmarks.search(m.query),
          ])
        : [[], []];
      const q = m.query.toLowerCase();
      const rows = current.state.tabs
        .filter((t) => (t.title + ' ' + t.url).toLowerCase().includes(q))
        .slice(0, 12)
        .map((t) => ({
          kind: 'tab',
          id: t.id,
          title: t.title,
          url: t.url,
          location: current.state.stacks.some((s) => s.includes(t.id))
            ? 'Stack ' + (current.state.stacks.findIndex((s) => s.includes(t.id)) + 1)
            : 'Loose',
        }));
      rows.push(
        ...history
          .filter((t) => t.url)
          .map((t) => ({ kind: 'url', title: t.title || t.url, url: t.url, location: 'History' })),
        ...bookmarks
          .filter((t) => t.url)
          .slice(0, 8)
          .map((t) => ({ kind: 'url', title: t.title || t.url, url: t.url, location: 'Bookmark' })),
      );
      send({ type: 'results', request: m.request, query: m.query, rows });
    } else if (m.type === 'open') {
      if (m.tab != null) {
        if (!current.tabs.some((t) => t.id === m.tab)) throw Error('Tab closed');
        await chrome.tabs.update(m.tab, { active: true });
      } else {
        const d = destination(m.text ?? '');
        if (m.edit) {
          if (!current.tabs.some((t) => t.id === m.edit)) throw Error('Tab closed');
          if (d.url) await chrome.tabs.update(m.edit, { url: d.url });
          else await chrome.search.query({ text: d.query, tabId: m.edit });
        } else if (d.url) await chrome.tabs.create({ windowId: m.window, url: d.url });
        else {
          const t = await chrome.tabs.create({ windowId: m.window, url: 'about:blank' });
          await chrome.search.query({ text: d.query, tabId: t.id });
        }
      }
    } else if (m.type === 'attachments') {
      const result = await debuggerStatus(chrome.debugger, current.tabs);
      send({ type: 'attachments', request: m.request, window: m.window, ...result });
    } else if (m.type === 'back') {
      if (m.revision !== current.state.revision || m.tab !== current.state.active)
        throw Error('Active tab changed; back canceled');
      const t = current.tabs.find((t) => t.id === m.tab);
      const result = await backToOpener(chrome.tabs, m.window, t.id);
      if (result?.completion)
        result.completion.catch((error) => {
          status = 'Back close failed: ' + error.message;
          scheduleSnapshot();
        });
    } else if (m.type !== 'refresh') throw Error('Unknown request');
    send({ type: 'ack', request: m.request });
    await snapshot(m.request);
  } catch (e) {
    send({ type: 'error', request: m.request, message: e.message });
    await snapshot(m.request);
  }
}
async function connect() {
  if (port) return;
  await loadSettings();
  epoch = crypto.randomUUID();
  revision = 0;
  fingerprint = '';
  lastIconFingerprint = '';
  seen.clear();
  const connection = chrome.runtime.connectNative(HOST);
  port = connection;
  status = 'Connecting';
  connection.onMessage.addListener((m) =>
    queue(() => (port === connection ? handle(m) : undefined)),
  );
  connection.onDisconnect.addListener(() => {
    if (port !== connection) return;
    status = chrome.runtime.lastError?.message || 'Disconnected';
    port = null;
  });
  await snapshot();
}
chrome.runtime.onMessage.addListener((m, s, reply) => {
  if (s.id !== chrome.runtime.id) return;
  if (m.type === 'connect') queue(connect).then(() => reply({ status }));
  else if (m.type === 'disconnect') {
    port?.disconnect();
    port = null;
    status = 'Disconnected';
    reply({ status });
  } else if (m.type === 'status') reply({ status, connected: !!port });
  else return;
  return true;
});
// Every new ordinary tab starts in the loose lane. Existing foreign groups and
// pinned tabs remain browser-owned; never pull a tab back across windows.
async function placeNewTab(created) {
  if (!port) return;
  const tab = await chrome.tabs.get(created.id);
  if (tab.windowId !== created.windowId || tab.pinned) return;
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  const groupedTabs = await chrome.tabs.query({ windowId: tab.windowId });
  const owned = new Set((await groupSlots.resolve(tab.windowId, groups, groupedTabs)).keys());
  if (tab.groupId !== -1 && !owned.has(tab.groupId)) return;
  const live = await chrome.tabs.get(tab.id);
  if (!port || live.windowId !== tab.windowId || live.groupId !== tab.groupId || live.pinned)
    return;
  if (owned.has(live.groupId)) await chrome.tabs.ungroup([live.id]);
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  const current = tabs.find((t) => t.id === tab.id);
  if (!port || !current || current.pinned || current.groupId !== -1) return;
  const others = tabs.filter((t) => t.id !== tab.id);
  const firstStack = others.findIndex((t) => owned.has(t.groupId));
  if (firstStack >= 0 && current.index !== firstStack)
    await chrome.tabs.move(tab.id, { index: firstStack });
}
chrome.tabs.onCreated.addListener((t) => {
  if (port)
    queue(async () => {
      await placeNewTab(t);
      await snapshot();
    });
});
chrome.tabs.onActivated.addListener(({ windowId, tabId }) => {
  navigationMemory.activate(windowId, tabId);
  scheduleSnapshot();
});
chrome.windows.onRemoved?.addListener((id) => {
  navigationMemory.forget(id);
  groupSlots.forget(id);
});
for (const event of [
  chrome.tabs.onRemoved,
  chrome.tabs.onMoved,
  chrome.tabs.onAttached,
  chrome.tabs.onDetached,
  chrome.tabs.onUpdated,
  chrome.tabGroups.onCreated,
  chrome.tabGroups.onUpdated,
  chrome.tabGroups.onRemoved,
  chrome.windows.onFocusChanged,
  chrome.windows.onBoundsChanged,
])
  event.addListener(scheduleSnapshot);
chrome.runtime.onInstalled.addListener(() => queue(connect));
chrome.runtime.onStartup.addListener(() => queue(connect));

// Internal module exports for the isolated runtime qualification harness.
// They add no runtime message or web-accessible extension surface.
export { snapshot, handle, queue, debuggerStatus };
export const connectionEpoch = () => epoch;
