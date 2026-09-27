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
let api, wid, result, held;
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
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const w = await api(
    "chrome.windows.create({url:['https://example.com/#plico-pointer-one','https://example.org/#plico-pointer-two'],focused:true})",
  );
  wid = w.id;
  await sleep(450);
  const ids = (await api(`chrome.tabs.query({windowId:${wid}})`)).map((t) => t.id);
  const active = async () => (await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id;
  await api(`chrome.tabs.update(${ids[0]},{active:true})`);
  await sleep(150);
  native('activate');
  key('cmd+,11');
  await sleep(150);
  native('pointer', 'loose-peer');
  await sleep(200);
  assert.equal(await active(), ids[1]);
  const visible = () =>
    JSON.parse(native('windows')).some((w) => w.kCGWindowName === 'Plico Navigator');
  assert(!visible());
  const passed = ['fixed native mouse click selects a loose tab and dismisses latched navigator'];
  key('cmd+,11');
  await sleep(150);
  native('pointer', 'blank');
  await sleep(100);
  assert(!visible());
  assert.equal(await active(), ids[1]);
  passed.push('clicking blank space inside panel cancels without changing active tab');
  const group = await api(
    `chrome.tabs.group({tabIds:${JSON.stringify(ids)},createProperties:{windowId:${wid}}})`,
  );
  await api(`chrome.tabGroups.update(${group},{title:'plico:1'})`);
  await api(`chrome.tabs.update(${ids[0]},{active:true})`);
  await sleep(150);
  key('cmd+,11');
  await sleep(150);
  native('pointer', 'stack-down');
  await sleep(100);
  assert.equal(await active(), ids[0]);
  key('cmd+,cmd-');
  await sleep(180);
  assert.equal(await active(), ids[1]);
  passed.push('vertical scroll selects stack candidate and bare Command commits it');
  await api(`chrome.tabs.update(${ids[0]},{active:true})`);
  await sleep(150);
  const child = spawn('python3', ['scripts/native-input.py', 'gesture', 'cmd+,wait', '1400']);
  const done = new Promise((resolve) => {
    child.on('error', resolve);
    child.on('close', (code) => resolve(code ? Error('Held input failed ' + code) : null));
  });
  held = { child, done };
  await sleep(350);
  native('pointer', 'stack-down');
  assert.equal(await active(), ids[0]);
  const heldError = await done;
  held = null;
  if (heldError) throw heldError;
  await sleep(150);
  assert.equal(await active(), ids[1]);
  passed.push('scroll during bare Command hold commits only when Command releases');
  // Many blank tabs keep the horizontal overflow fixture lightweight.
  await api(`chrome.tabs.ungroup(${JSON.stringify(ids)})`);
  for (let i = 0; i < 25; i++)
    await api(
      `chrome.tabs.create({windowId:${wid},url:'about:blank#plico-pointer-${i}',active:false})`,
    );
  await api(`chrome.tabs.update(${ids[0]},{active:true})`);
  await sleep(200);
  key('cmd+,11');
  await sleep(200);
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
  capture('pointer-before-scroll');
  native('pointer', 'bar-right');
  await sleep(180);
  capture('pointer-after-scroll');
  assert.equal(await active(), ids[0]);
  native('pointer', 'bar-left');
  await sleep(180);
  capture('pointer-return-scroll');
  key('53');
  assert.equal(await active(), ids[0]);
  passed.push(
    'horizontal scroll keeps actual active tab unchanged; captures retained for visual comparison',
  );
  result = {
    at: new Date().toISOString(),
    passed,
    captures: [
      '.local/pointer-before-scroll.png',
      '.local/pointer-after-scroll.png',
      '.local/pointer-return-scroll.png',
    ],
  };
} finally {
  if (held) {
    if (held.child.pid && held.child.exitCode === null) held.child.kill('SIGTERM');
    await held.done;
  }
  try {
    if (wid && api) await api(`chrome.windows.remove(${wid})`);
  } finally {
    b.close();
  }
}
fs.writeFileSync('.local/pointer-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
