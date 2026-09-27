// Native group labels remain browser-owned. Hash anchors preserve assigned slots
// through browser restart without storing URLs or guessing ambiguous windows.
const KEY = 'plicoGroupSlotsV1';
const validSlots = (a) =>
  Array.isArray(a) &&
  a.length <= 10 &&
  a.every((s) => Number.isInteger(s) && s >= 0 && s < 10) &&
  new Set(a).size === a.length;
export class GroupSlots {
  constructor(storage) {
    this.storage = storage;
    this.windows = {};
    this.records = [];
    this.restore = [];
    this.pending = null;
    this.claimed = new Set();
    this.lastSaved = '';
    this.ready = Promise.all([storage?.session?.get(KEY), storage?.local?.get(KEY)])
      .then(([session, local]) => {
        const state = session?.[KEY];
        this.hadSession = !!state;
        if (state?.windows && typeof state.windows === 'object')
          for (const [id, w] of Object.entries(state.windows))
            if (w && typeof w.owner === 'string' && w.slots && typeof w.slots === 'object')
              this.windows[id] = w;
        const valid = (records) =>
          Array.isArray(records)
            ? records
                .filter(
                  (r) =>
                    r &&
                    typeof r.owner === 'string' &&
                    typeof r.signature === 'string' &&
                    /^[a-f0-9]{64}$/.test(r.signature) &&
                    validSlots(r.slots),
                )
                .slice(-32)
            : [];
        this.records = valid(local?.[KEY]);
        this.restore = state ? valid(state.restore) : structuredClone(this.records);
        if (Array.isArray(state?.pending))
          this.pending = new Set(state.pending.filter(Number.isInteger));
        if (Array.isArray(state?.claimed))
          this.claimed = new Set(state.claimed.filter((x) => typeof x === 'string'));
      })
      .catch(() => {});
  }
  async beginSession(ids) {
    await this.ready;
    if (this.pending === null) this.pending = new Set(this.hadSession ? [] : ids);
  }
  async interacted(windowId) {
    await this.ready;
    this.pending?.delete(windowId);
    await this.save();
  }
  async resolve(windowId, groups, tabs) {
    await this.beginSession([windowId]);
    let memory = this.windows[windowId] || { owner: crypto.randomUUID(), slots: {} };
    const ordered = [...groups].sort(
      (a, b) =>
        tabs.findIndex((t) => t.groupId === a.id) - tabs.findIndex((t) => t.groupId === b.id),
    );
    const bytes = new TextEncoder().encode(
      JSON.stringify([
        tabs.map((t) => t.url || ''),
        ordered.map((g) => [
          g.title,
          g.color,
          tabs.flatMap((t, i) => (t.groupId === g.id ? [i] : [])),
        ]),
      ]),
    );
    const signature = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (x) => x.toString(16).padStart(2, '0'),
    ).join('');
    if (this.pending.has(windowId)) {
      const matches = this.restore.filter(
        (r) => r.signature === signature && r.slots.length === ordered.length,
      );
      if (matches.length === 1 && !this.claimed.has(matches[0].owner)) {
        const saved = matches[0];
        this.records = this.records.filter((r) => r.owner !== memory.owner);
        memory = {
          owner: saved.owner,
          slots: Object.fromEntries(ordered.map((g, i) => [g.id, saved.slots[i]])),
        };
        this.claimed.add(saved.owner);
        this.pending.delete(windowId);
      }
    }
    const result = new Map(),
      used = new Set();
    for (const g of ordered) {
      const match = /^plico:([1-9]|10)$/.exec(g.title || '');
      if (match) {
        const slot = Number(match[1]) - 1;
        if (!used.has(slot)) {
          result.set(g.id, slot);
          used.add(slot);
        }
      }
    }
    for (const g of ordered)
      if (!result.has(g.id)) {
        const slot = memory.slots[g.id];
        if (Number.isInteger(slot) && slot >= 0 && slot < 10 && !used.has(slot)) {
          result.set(g.id, slot);
          used.add(slot);
        }
      }
    for (const g of ordered)
      if (!result.has(g.id)) {
        const slot = Array.from({ length: 10 }, (_, i) => i).find((i) => !used.has(i));
        if (slot !== undefined) {
          result.set(g.id, slot);
          used.add(slot);
        }
      }
    memory.slots = Object.fromEntries(result);
    this.windows[windowId] = memory;
    if (result.size === ordered.length) {
      const record = {
        owner: memory.owner,
        signature,
        slots: ordered.map((g) => result.get(g.id)),
      };
      const old = this.records.find((r) => r.owner === memory.owner);
      if (JSON.stringify(old) !== JSON.stringify(record)) {
        this.records = this.records.filter((r) => r.owner !== memory.owner);
        this.records.push(record);
        this.records = this.records.slice(-32);
      }
    }
    await this.save();
    return result;
  }
  async assign(windowId, groupId, slot) {
    await this.ready;
    const memory = (this.windows[windowId] ??= { owner: crypto.randomUUID(), slots: {} });
    for (const [id, s] of Object.entries(memory.slots)) if (s === slot) delete memory.slots[id];
    memory.slots[groupId] = slot;
    await this.save();
  }
  async forget(windowId) {
    await this.ready;
    const owner = this.windows[windowId]?.owner;
    delete this.windows[windowId];
    this.records = this.records.filter((r) => r.owner !== owner);
    this.restore = this.restore.filter((r) => r.owner !== owner);
    this.pending?.delete(windowId);
    await this.save();
  }
  async save() {
    const state = {
      windows: this.windows,
      pending: [...(this.pending || [])],
      claimed: [...this.claimed],
      restore: this.restore,
    };
    const encoded = JSON.stringify([state, this.records]);
    if (encoded === this.lastSaved) return;
    try {
      await Promise.all([
        this.storage?.session?.set({ [KEY]: state }),
        this.storage?.local?.set({ [KEY]: this.records }),
      ]);
      this.lastSaved = encoded;
    } catch {}
  }
}
