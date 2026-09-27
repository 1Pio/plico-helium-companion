import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browser } from './cdp.mjs';
import { verifyExtensionSource } from './verify-extension-source.mjs';
import { defaults } from '../extension/settings.mjs';
const mode = process.argv[2];
assert(['prepare', 'check'].includes(mode));
const record = '.local/group-restart-fixture.json',
  b = await browser();
try {
  const worker = (await b.call('Target.getTargets')).targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes('baedceam'),
  );
  const { sessionId } = await b.call('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  await verifyExtensionSource(b, sessionId);
  const api = async (expression) => {
    const r = await b.call(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (mode === 'prepare') {
    const token = crypto.randomUUID(),
      urls = ['a', 'b'].map((x) => 'https://example.org/#plico-native-restore-' + x + '-' + token);
    const saved = await api("chrome.storage.local.get('plicoSettings')"),
      config = structuredClone(defaults);
    config.slots[9] = { key: '0', modifiers: 2 };
    await api(`chrome.storage.local.set({plicoSettings:${JSON.stringify(config)}})`);
    const w = await api(`chrome.windows.create({url:${JSON.stringify(urls)},focused:true})`);
    await sleep(300);
    const tabs = await api(`chrome.tabs.query({windowId:${w.id}})`);
    for (const [i, t] of tabs.entries()) {
      const g = await api(
        `chrome.tabs.group({tabIds:[${t.id}],createProperties:{windowId:${w.id}}})`,
      );
      await api(`chrome.tabGroups.update(${g},{title:'${i ? 'Work' : 'Research'}',color:'green'})`);
    }
    await sleep(100);
    let s = await api('__plicoQualification.queue(()=>__plicoQualification.snapshot())');
    assert(s.state.stacks[1].includes(tabs[1].id));
    await api(`chrome.tabs.remove(${tabs[0].id})`);
    await sleep(200);
    s = await api('__plicoQualification.queue(()=>__plicoQualification.snapshot())');
    assert.equal(s.state.stacks[0].length, 0);
    assert(s.state.stacks[1].includes(tabs[1].id));
    fs.writeFileSync(record, JSON.stringify({ url: urls[1], saved, config }));
    console.log('Prepared native Work stack in fixed slot 2 with slot 1 empty');
  } else {
    const state = JSON.parse(fs.readFileSync(record));
    const wins = await api('chrome.windows.getAll({populate:true})');
    const w = wins.find((w) => w.tabs?.some((t) => t.url === state.url));
    assert(w, 'restored fixture exists');
    await api(`chrome.windows.update(${w.id},{focused:true})`);
    await sleep(250);
    let s = await api('__plicoQualification.queue(()=>__plicoQualification.snapshot())');
    const tab = s.tabs.find((t) => t.url === state.url);
    assert(tab);
    assert(s.state.stacks[1].includes(tab.id));
    assert.equal(s.state.stacks[0].length, 0);
    assert.equal(s.groups.find((g) => g.id === tab.groupId).title, 'Work');
    assert.deepEqual(
      (await api("chrome.storage.local.get('plicoSettings')")).plicoSettings,
      state.config,
    );
    const created = await api(
      `chrome.tabs.create({windowId:${w.id},url:'about:blank#plico-new-native-group',active:false})`,
    );
    await sleep(200);
    s = await api('__plicoQualification.queue(()=>__plicoQualification.snapshot())');
    assert(s.state.loose.includes(created.id));
    assert(s.tabs.findIndex((t) => t.id === created.id) < s.tabs.findIndex((t) => t.id === tab.id));
    await api(`chrome.windows.remove(${w.id})`);
    await api(
      state.saved.plicoSettings
        ? `chrome.storage.local.set(${JSON.stringify(state.saved)})`
        : "chrome.storage.local.remove('plicoSettings')",
    );
    const result = {
      at: new Date().toISOString(),
      passed: [
        'native group retains slot 2 after real browser restart with new IDs and empty slot 1',
        'native group name preserved',
        'configured slot shortcut persisted through browser restart',
        'new loose tab precedes adopted native stack',
      ],
    };
    fs.writeFileSync('.local/group-restart-result.json', JSON.stringify(result, null, 2));
    console.log(result);
  }
} finally {
  b.close();
}
