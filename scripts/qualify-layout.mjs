import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { browser } from './cdp.mjs';
import { verifyExtensionSource } from './verify-extension-source.mjs';
import { defaults } from '../extension/settings.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  native = (...a) =>
    execFileSync('python3', ['scripts/native-input.py', ...a], { encoding: 'utf8' }),
  key = (s) => native('gesture', s, '0');
const title =
  'A deliberately long project title with repeated information that must truncate before the trailing action column';
const server = http.createServer((req, res) =>
  res.end(
    `<!doctype html><title>${title}</title><style>html{height:100%;background:radial-gradient(ellipse at 30% 60%,#724021,transparent 55%),radial-gradient(ellipse at 80% 15%,#254949,transparent 55%),#121b25}</style>`,
  ),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/';
const b = await browser();
let api, wid, saved;
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
  const w = await api(
    `chrome.windows.create({url:${JSON.stringify([base + '?one', base + '?two', base + '?three'])},focused:true})`,
  );
  wid = w.id;
  await sleep(400);
  native('activate');
  await api(`chrome.windows.update(${wid},{focused:true})`);
  await sleep(180);
  const capture = (name) => {
    const panel = JSON.parse(native('windows')).find((w) => w.kCGWindowName === 'Plico Search');
    assert(panel);
    const r = panel.kCGWindowBounds,
      path = '.local/layout-' + name + '.png';
    execFileSync('/usr/sbin/screencapture', [
      '-x',
      '-R',
      `${r.X},${r.Y},${r.Width},${r.Height}`,
      path,
    ]);
    captures.push(path);
  };
  for (const theme of ['dark', 'light']) {
    await api(
      `chrome.storage.local.set({plicoSettings:${JSON.stringify({ ...defaults, theme })}})`,
    );
    await sleep(120);
    key('cmd+,17');
    await sleep(180);
    capture(theme + '-focused');
    key('48');
    capture(theme + '-unfocused');
    key('53');
  }
  const result = { at: new Date().toISOString(), captures };
  fs.writeFileSync('.local/layout-result.json', JSON.stringify(result, null, 2));
  console.log(result);
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
