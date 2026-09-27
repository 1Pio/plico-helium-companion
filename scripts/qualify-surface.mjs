// Real, lightweight pages and native input in the marked isolated browser only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { browser } from './cdp.mjs';
import { verifyExtensionSource } from './verify-extension-source.mjs';
import { defaults } from '../extension/settings.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const native = (...args) =>
  execFileSync('python3', ['scripts/native-input.py', ...args], { encoding: 'utf8' });
const key = (sequence) => native('gesture', sequence, '0');
const server = http.createServer((req, res) => {
  const n = Number(req.url.slice(1)) || 1;
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><title>Design reference ${n}</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect rx='9' width='32' height='32' fill='%235b8bd9'/%3E%3C/svg%3E"><style>html{height:100%;color:#ddd;background:radial-gradient(ellipse at 30% 60%,#724021,transparent 55%),radial-gradient(ellipse at 80% 15%,#254949,transparent 55%),#121b25;font:20px system-ui}body{margin:70px}p{color:#aeb5bb}</style><h1>Design reference ${n}</h1><p>Isolated navigation layout fixture</p>`,
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const b = await browser();
let api, wid, saved;
const folder = '.local/surface-' + (process.argv.includes('--shadow') ? 'shadow' : 'base');
fs.mkdirSync(folder, { recursive: true });
const captures = [];
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
  saved = await api("chrome.storage.local.get('plicoSettings')");
  const urls = Array.from({ length: 35 }, (_, i) => base + (i + 1));
  const win = await api(`chrome.windows.create({url:${JSON.stringify(urls)},focused:true})`);
  wid = win.id;
  await sleep(1000);
  native('activate');
  const ids = (await api(`chrome.tabs.query({windowId:${wid}})`)).map((t) => t.id);
  const group = await api(
    `chrome.tabs.group({tabIds:${JSON.stringify(ids.slice(3, 33))},createProperties:{windowId:${wid}}})`,
  );
  await api(`chrome.tabGroups.update(${group},{title:'plico:1'})`);
  const short = await api(
    `chrome.tabs.group({tabIds:${JSON.stringify(ids.slice(33))},createProperties:{windowId:${wid}}})`,
  );
  await api(`chrome.tabGroups.update(${short},{title:'plico:2'})`);
  const capture = async (name) => {
    const windows = JSON.parse(native('windows'));
    const panel = windows.find((w) => w.kCGWindowName === 'Plico Navigator');
    assert(panel, 'visible native panel');
    const bounds = await api(`chrome.windows.get(${wid})`),
      r = panel.kCGWindowBounds;
    assert(
      r.X >= bounds.left &&
        r.Y >= bounds.top &&
        r.X + r.Width <= bounds.left + bounds.width + 1 &&
        r.Y + r.Height <= bounds.top + bounds.height + 1,
      'panel stays inside paired browser',
    );
    const path = `${folder}/${name}.png`;
    execFileSync('/usr/sbin/screencapture', [
      '-x',
      '-o',
      '-l',
      String(panel.kCGWindowNumber),
      path,
    ]);
    captures.push({ name, path, bounds: r });
  };
  for (const theme of ['dark', 'light']) {
    await api(
      `chrome.storage.local.set({plicoSettings:${JSON.stringify({ ...defaults, theme })}})`,
    );
    for (const [name, index] of [
      ['first', 3],
      ['middle', 17],
      ['last', 32],
      ['short', 33],
      ['loose', 0],
    ]) {
      await api(`chrome.tabs.update(${ids[index]},{active:true})`);
      await sleep(250);
      native('activate');
      key('cmd+,11');
      await sleep(180);
      await capture(`${theme}-${name}`);
      assert.equal(
        (await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id,
        ids[index],
      );
      key('53');
    }
  }
  // Request a short window. A tiling manager may override it; record actual bounds.
  await api(`chrome.windows.update(${wid},{state:'normal',width:800,height:500})`);
  await sleep(400);
  await api(`chrome.tabs.update(${ids[17]},{active:true})`);
  await sleep(200);
  native('activate');
  key('cmd+,11');
  await sleep(200);
  await capture('requested-short-window');
  key('53');
  fs.writeFileSync(
    `${folder}/result.json`,
    JSON.stringify(
      {
        captures,
        checks: [
          'native panel bounds contained',
          'preview leaves active tab unchanged',
          'first/middle/last/short stack in both themes; inspect captures for fades and row count',
        ],
      },
      null,
      2,
    ),
  );
  console.log(folder);
} finally {
  try {
    if (api) {
      if (wid) await api(`chrome.windows.remove(${wid})`);
      await api(
        saved?.plicoSettings
          ? `chrome.storage.local.set(${JSON.stringify(saved)})`
          : "chrome.storage.local.remove('plicoSettings')",
      );
    }
  } finally {
    b.close();
    server.close();
  }
}
