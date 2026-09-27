import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { browser } from './cdp.mjs';
import { verifyExtensionSource } from './verify-extension-source.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  native = (...a) =>
    execFileSync('python3', ['scripts/native-input.py', ...a], { encoding: 'utf8' }),
  key = (s) => native('gesture', s, '0');
const b = await browser();
let api, wid, pageSession, dialog, held;
const passed = [];
try {
  const worker = (await b.call('Target.getTargets')).targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes('baedceam'),
  );
  const { sessionId } = await b.call('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  await verifyExtensionSource(b, sessionId);
  api = async (expression) => {
    const r = await b.call(
      'Runtime.evaluate',
      {
        expression: `(async()=>{return await (${expression})})()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const w = await api(
    "chrome.windows.create({url:['https://example.com/#plico-close-a','https://example.org/#plico-close-b','https://example.net/#plico-close-c'],focused:true})",
  );
  wid = w.id;
  await sleep(600);
  native('activate');
  await sleep(250);
  const tabs = () => api(`chrome.tabs.query({windowId:${wid}})`);
  const [a, c, d] = (await tabs()).map((t) => t.id);
  await api(`chrome.tabs.update(${a},{active:true})`);
  await sleep(200);
  await api(
    'void (globalThis.plicoOriginalRemove=chrome.tabs.remove,chrome.tabs.remove=async id=>{await new Promise(r=>setTimeout(r,400));return globalThis.plicoOriginalRemove(id);})',
  );
  key('cmd+,37,13');
  await sleep(850);
  let live = await tabs();
  assert(!live.some((t) => t.id === c));
  assert.equal(live.find((t) => t.active).id, d);
  passed.push(
    'Command release before delayed close acknowledgment commits only the surviving candidate',
  );
  await api('void (chrome.tabs.remove=globalThis.plicoOriginalRemove)');
  // Move one tab in the draft, then close another while preserving the draft.
  await api(`chrome.tabs.update(${a},{active:true})`);
  await sleep(180);
  key('cmd+,11');
  key('cmd+,shift+,18');
  await sleep(80);
  key('cmd+,13');
  await sleep(250);
  live = await tabs();
  assert.deepEqual(
    live.map((t) => t.id),
    [a],
  );
  assert.equal(live[0].groupId, -1, 'draft remains unapplied');
  key('cmd+,cmd-');
  await sleep(250);
  assert.notEqual((await tabs())[0].groupId, -1);
  passed.push('closing a candidate preserves unrelated draft organization until commit');
  // Real unsaved-page confirmation must remain cancelable with physical Escape.
  const target = (await b.call('Target.getTargets')).targetInfos.find(
    (t) => t.url === 'https://example.com/#plico-close-a',
  );
  pageSession = (
    await b.call('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  ).sessionId;
  await b.call('Page.enable', {}, pageSession);
  b.on('Page.javascriptDialogOpening', (d, s) => {
    if (s === pageSession) dialog = d;
  });
  b.on('Page.javascriptDialogClosed', (_, s) => {
    if (s === pageSession) dialog = null;
  });
  await b.call(
    'Runtime.evaluate',
    {
      expression:
        "window.plicoBeforeUnload=e=>{e.preventDefault();e.returnValue='unsaved';};window.addEventListener('beforeunload',window.plicoBeforeUnload);document.body.innerHTML='<button>Fixture activation</button>';",
      userGesture: true,
    },
    pageSession,
  );
  for (const type of ['mousePressed', 'mouseReleased'])
    await b.call(
      'Input.dispatchMouseEvent',
      { type, x: 30, y: 20, button: 'left', clickCount: 1 },
      pageSession,
    );
  key('cmd+,11');
  key('cmd+,13');
  for (let i = 0; i < 25 && !dialog; i++) await sleep(100);
  assert.equal(dialog?.type, 'beforeunload');
  key('53');
  for (let i = 0; i < 20 && dialog; i++) await sleep(100);
  assert(!dialog, 'Escape cancels native beforeunload prompt');
  assert.equal((await tabs())[0].id, a);
  await sleep(250);
  key('cmd+,11');
  await sleep(150);
  assert(JSON.parse(native('windows')).some((w) => w.kCGWindowName === 'Plico Navigator'));
  key('53');
  const child = spawn('python3', ['scripts/native-input.py', 'gesture', 'cmd+,wait', '650']);
  const done = new Promise((r) => child.on('close', r));
  held = { child, done };
  await sleep(350);
  assert(
    JSON.parse(native('windows')).some((w) => w.kCGWindowName === 'Plico Navigator'),
    'next bare Command works after canceled confirmation',
  );
  assert.equal(await done, 0);
  held = null;
  passed.push(
    'Escape cancels real unsaved-page confirmation and restores navigation, including next bare Command',
  );
  const result = { at: new Date().toISOString(), passed };
  fs.writeFileSync('.local/candidate-lifecycle-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (held) {
    if (held.child.exitCode === null) held.child.kill('SIGTERM');
    await held.done;
  }
  if (api)
    await api(
      'void (globalThis.plicoOriginalRemove&&(chrome.tabs.remove=globalThis.plicoOriginalRemove))',
    ).catch(() => {});
  if (pageSession) {
    if (dialog)
      await b.call('Page.handleJavaScriptDialog', { accept: false }, pageSession).catch(() => {});
    await b
      .call(
        'Runtime.evaluate',
        { expression: "window.removeEventListener('beforeunload',window.plicoBeforeUnload)" },
        pageSession,
      )
      .catch(() => {});
  }
  if (wid && api) await api(`chrome.windows.remove(${wid})`).catch(() => {});
  b.close();
}
