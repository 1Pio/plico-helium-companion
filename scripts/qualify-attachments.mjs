import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { browser } from './cdp.mjs';
import { verifyExtensionSource } from './verify-extension-source.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  native = (...a) =>
    execFileSync('python3', ['scripts/native-input.py', ...a], { encoding: 'utf8' }),
  key = (s) => native('gesture', s, '0');
const b = await browser();
let api,
  wid,
  attachedSession,
  wrapped = false,
  result;
try {
  const worker = (await b.call('Target.getTargets')).targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes('baedceam'),
  );
  assert(worker);
  const { sessionId } = await b.call('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  await verifyExtensionSource(b, sessionId);
  api = async (expression) => {
    const r = await b.call(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  assert(await api("chrome.permissions.contains({permissions:['debugger']})"));
  const token = crypto.randomUUID(),
    urls = [
      'https://example.com/#plico-attachment-one-' + token,
      'https://example.org/#plico-attachment-two-' + token,
    ];
  const w = await api(`chrome.windows.create({url:${JSON.stringify(urls)},focused:true})`);
  wid = w.id;
  await sleep(500);
  const tabs = await api(`chrome.tabs.query({windowId:${wid}})`);
  const initial = tabs.find((t) => t.active).id;
  const target = (await b.call('Target.getTargets')).targetInfos.find((t) => t.url === urls[1]);
  assert(target);
  ({ sessionId: attachedSession } = await b.call('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  }));
  const get = () =>
    api(
      `(async()=>{const {debuggerStatus}=globalThis.__plicoQualification;return debuggerStatus(chrome.debugger,await chrome.tabs.query({windowId:${wid}}))})()`,
    );
  assert.deepEqual(await get(), { available: true, attached: [tabs[1].id] });
  await api(
    'globalThis.__plicoGetTargets=chrome.debugger.getTargets;globalThis.__plicoTargetCalls=0;chrome.debugger.getTargets=function(...args){__plicoTargetCalls++;return __plicoGetTargets.apply(chrome.debugger,args)}',
  );
  wrapped = true;
  native('activate');
  key('cmd+,11');
  await sleep(250);
  assert.equal(await api('__plicoTargetCalls'), 1, 'One metadata read on reveal');
  assert.equal((await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id, initial);
  const capture = (name) => {
    const panel = JSON.parse(native('windows')).find((w) => w.kCGWindowName === 'Plico Navigator');
    assert(panel);
    execFileSync('/usr/sbin/screencapture', [
      '-x',
      '-l',
      String(panel.kCGWindowNumber),
      '.local/' + name + '.png',
    ]);
  };
  capture('attachment-present');
  await sleep(600);
  assert.equal(await api('__plicoTargetCalls'), 1, 'No idle polling while latched');
  key('53');
  const group = await api(
    `chrome.tabs.group({tabIds:${JSON.stringify(tabs.map((t) => t.id))},createProperties:{windowId:${wid}}})`,
  );
  await api(`chrome.tabGroups.update(${group},{title:'plico:1'})`);
  await sleep(150);
  native('activate');
  key('cmd+,11');
  await sleep(250);
  capture('attachment-stack');
  key('53');
  await b.call('Target.detachFromTarget', { sessionId: attachedSession });
  attachedSession = null;
  assert.deepEqual(await get(), { available: true, attached: [] });
  native('activate');
  key('cmd+,11');
  await sleep(250);
  capture('attachment-cleared');
  key('53');
  result = {
    at: new Date().toISOString(),
    passed: [
      'external CDP attachment mapped only to correct page tab',
      'reveal reads metadata once without changing active tab',
      'latched navigator does not poll while idle',
      'external detach clears metadata on next reveal',
    ],
    captures: [
      '.local/attachment-present.png',
      '.local/attachment-cleared.png',
      '.local/attachment-stack.png',
    ],
  };
} finally {
  const errors = [];
  if (attachedSession)
    try {
      await b.call('Target.detachFromTarget', { sessionId: attachedSession });
    } catch (e) {
      errors.push(e);
    }
  if (wrapped && api)
    try {
      await api(
        'chrome.debugger.getTargets=__plicoGetTargets;delete globalThis.__plicoGetTargets;delete globalThis.__plicoTargetCalls',
      );
    } catch (e) {
      errors.push(e);
    }
  if (wid && api)
    try {
      await api(`chrome.windows.remove(${wid})`);
    } catch (e) {
      errors.push(e);
    }
  b.close();
  if (errors.length) throw new AggregateError(errors, 'Attachment fixture cleanup failed');
}
fs.writeFileSync('.local/attachments-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
