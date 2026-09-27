// Deliberate fault injection only into the native host owned by the marked test browser.
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
let target, sessionId, result;
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
  assert.equal(process.env.PLICO_QUALIFICATION, '1');
  assert.equal(owned.profile, process.cwd() + '/.local/helium-qualification-profile');
  const processes = await b.call('SystemInfo.getProcessInfo');
  assert.equal(processes.processInfo.find((p) => p.type === 'browser')?.id, owned.pid);
  const prior = hosts();
  assert.equal(prior.length, 1);
  assert((await action('status')).connected);
  // Reverify the exact browser-owned process immediately before the deliberate crash.
  assert.deepEqual(hosts(), prior);
  process.kill(prior[0], 'SIGKILL');
  for (let i = 0; i < 30 && (await action('status')).connected; i++) await sleep(100);
  assert(!(await action('status')).connected);
  assert.equal(hosts().length, 0);
  await sleep(600);
  assert.equal(hosts().length, 0, 'Crash must not start an uncontrolled reconnect loop');
  assert(
    (await b.call('Target.getTargets')).targetInfos.some((t) => t.targetId === target),
    'Helium remains alive and controllable',
  );
  await action('connect');
  for (let i = 0; i < 30 && !hosts().length; i++) await sleep(100);
  assert.equal(hosts().length, 1);
  assert.notEqual(hosts()[0], prior[0]);
  assert((await action('status')).connected);
  result = {
    at: new Date().toISOString(),
    passed: [
      'owned native host crash leaves Helium usable',
      'bridge detects abrupt EOF and stays disconnected without looping',
      'explicit reconnect starts exactly one fresh native host',
    ],
  };
} finally {
  try {
    if (sessionId)
      await b.call(
        'Runtime.evaluate',
        { expression: "chrome.runtime.sendMessage({type:'connect'})", awaitPromise: true },
        sessionId,
      );
  } finally {
    try {
      if (target) await b.call('Target.closeTarget', { targetId: target });
    } finally {
      b.close();
    }
  }
}
fs.writeFileSync('.local/host-crash-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
