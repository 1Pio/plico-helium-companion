import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { browser } from './cdp.mjs';
const owned = JSON.parse(fs.readFileSync('.local/browser-pid.json', 'utf8'));
const binary = process.cwd() + '/build/Plico Helium Companion.app/Contents/MacOS/plico-companion';
function hosts() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .flatMap((line) => {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      return m &&
        Number(m[2]) === owned.pid &&
        m[3].startsWith(binary + ' chrome-extension://baedceam')
        ? [Number(m[1])]
        : [];
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await browser();
let target, sessionId;
try {
  target = (
    await b.call('Target.createTarget', {
      url: 'chrome-extension://baedceamflgfanjingjiinnhmhfjopbk/options.html',
    })
  ).targetId;
  ({ sessionId } = await b.call('Target.attachToTarget', { targetId: target, flatten: true }));
  const action = async (type) => {
    const r = await b.call(
      'Runtime.evaluate',
      {
        expression: `chrome.runtime.sendMessage({type:${JSON.stringify(type)}})`,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const prior = hosts();
  assert.equal(prior.length, 1);
  assert((await action('status')).connected);
  assert.equal((await action('status')).status, 'Connected', 'Native readiness handshake');
  assert.equal((await action('disconnect')).status, 'Disconnected');
  for (let i = 0; i < 30 && hosts().length; i++) await sleep(100);
  assert.equal(hosts().length, 0, 'Disconnect must release the native process and its event tap');
  await sleep(600);
  assert(!(await action('status')).connected);
  assert.equal(hosts().length, 0, 'No unsolicited reconnect loop');
  await action('connect');
  for (let i = 0; i < 30 && !hosts().length; i++) await sleep(100);
  const next = hosts();
  assert.equal(next.length, 1);
  assert.notEqual(next[0], prior[0]);
  assert((await action('status')).connected);
  for (let i = 0; i < 30 && (await action('status')).status === 'Connecting'; i++) await sleep(100);
  assert.equal((await action('status')).status, 'Connected', 'Reconnected keyboard hook ready');
  const result = {
    at: new Date().toISOString(),
    passed: [
      'disconnect releases the browser-owned native host',
      'disconnected state remains usable without reconnect loop',
      'explicit reconnect starts exactly one fresh host',
    ],
  };
  fs.writeFileSync('.local/connection-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (sessionId)
    await b
      .call(
        'Runtime.evaluate',
        { expression: "chrome.runtime.sendMessage({type:'connect'})", awaitPromise: true },
        sessionId,
      )
      .catch(() => {});
  if (target) await b.call('Target.closeTarget', { targetId: target });
  b.close();
}
