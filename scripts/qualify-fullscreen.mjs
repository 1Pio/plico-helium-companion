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
let api, wid, result;
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
    "chrome.windows.create({url:'https://example.org/#plico-fullscreen',focused:true})",
  );
  wid = w.id;
  await api(`chrome.windows.update(${wid},{state:'fullscreen'})`);
  await sleep(1400);
  assert.equal((await api(`chrome.windows.get(${wid})`)).state, 'fullscreen');
  native('activate');
  await sleep(400);
  key('cmd+,11');
  await sleep(150);
  let windows = JSON.parse(native('windows'));
  const panel = windows.find((w) => w.kCGWindowName === 'Plico Navigator');
  assert(panel, 'navigator visible in real fullscreen browser');
  const frames = windows.filter(
    (w) =>
      w.kCGWindowOwnerName === 'Helium' &&
      w.kCGWindowLayer === 0 &&
      w.kCGWindowAlpha > 0 &&
      w.kCGWindowBounds.Height > 200,
  );
  assert.equal(frames.length, 1, 'fixture fullscreen must have one visible main browser window');
  const frame = frames[0];
  assert(frame);
  fs.writeFileSync('.local/fullscreen-windows.json', JSON.stringify(windows, null, 2));
  const p = panel.kCGWindowBounds,
    f = frame.kCGWindowBounds;
  assert(Math.abs(p.X + p.Width / 2 - f.X - f.Width / 2) < 25);
  assert(
    Math.abs(p.Y + p.Height / 2 - f.Y - f.Height / 2) < 25,
    JSON.stringify({ panel: p, browser: f }),
  );
  execFileSync('/usr/sbin/screencapture', [
    '-x',
    '-l',
    String(panel.kCGWindowNumber),
    '.local/fullscreen-navigator.png',
  ]);
  key('53');
  await sleep(150);
  assert(!JSON.parse(native('windows')).some((w) => w.kCGWindowName === 'Plico Navigator'));
  assert.equal((await api(`chrome.windows.get(${wid})`)).state, 'fullscreen');
  await api(`chrome.windows.update(${wid},{state:'normal'})`);
  await sleep(1200);
  const restoredState = (await api(`chrome.windows.get(${wid})`)).state;
  assert(
    ['normal', 'maximized'].includes(restoredState),
    'browser must return to a non-fullscreen window',
  );
  native('activate');
  key('cmd+,11');
  await sleep(150);
  assert(JSON.parse(native('windows')).some((w) => w.kCGWindowName === 'Plico Navigator'));
  key('53');
  result = {
    at: new Date().toISOString(),
    passed: [
      'native navigator visible and centered in real Helium fullscreen window',
      'Escape dismisses navigator without exiting browser fullscreen',
      'navigator works after return to windowed mode with existing window manager',
    ],
    restoredState,
    capture: '.local/fullscreen-navigator.png',
  };
} finally {
  const failures = [];
  if (wid && api) {
    try {
      await api(`chrome.windows.update(${wid},{state:'normal'})`);
    } catch (e) {
      failures.push(e);
    }
    try {
      await api(`chrome.windows.remove(${wid})`);
    } catch (e) {
      failures.push(e);
    }
  }
  b.close();
  if (failures.length) throw new AggregateError(failures, 'Fullscreen cleanup failed');
}
fs.writeFileSync('.local/fullscreen-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
