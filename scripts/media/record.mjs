// Record one predefined teaching sequence in the marked demo window.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { browser } from '../cdp.mjs';
if (process.env.PLICO_DEMO !== '1') throw Error('Demo profile required');
if (
  execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], {
    encoding: 'utf8',
  }).trim() !== '1'
)
  throw Error('Memory pressure is not Normal');
const scene = process.argv[2];
if (!['navigation', 'stacks', 'composer', 'busy'].includes(scene))
  throw Error('navigation|stacks|composer|busy');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const take = process.argv.find((a) => a.startsWith('--take='))?.split('=')[1] || 'current';
if (!/^[a-z0-9-]+$/.test(take)) throw Error('Invalid take name');
const folder = path.resolve(`.local/media-refresh-044/${take}`);
const fixture = JSON.parse(fs.readFileSync(path.join(folder, 'fixture.json')));
if (fixture.scene !== scene) throw Error('Prepare the matching scene before recording');
const state = JSON.parse(fs.readFileSync('.local/browser-pid.json'));
if (!state.profile.endsWith('/helium-demo-profile')) throw Error('Wrong profile');
const logPath = path.join(folder, scene + '.jsonl');
const movie = path.join(folder, scene + '.mov');
if (fs.existsSync(logPath) || fs.existsSync(movie)) throw Error('Existing scene preserved');
const log = fs.openSync(logPath, 'wx', 0o600);
const input = async (command, ...args) =>
  new Promise((resolve, reject) => {
    const child = spawn('python3', ['scripts/native-input.py', command, ...args], {
      env: { ...process.env, PLICO_TRACE_INPUT: '1', PLICO_DEMO_INPUT: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (data) => {
      fs.writeSync(log, data);
      errors += data;
    });
    child.on('exit', (code) => (code ? reject(Error(errors)) : resolve()));
  });
const b = await browser();
let recorder;
let captureFailure;
try {
  const worker = (await b.call('Target.getTargets')).targetInfos.find(
    (t) =>
      t.type === 'service_worker' &&
      t.url.endsWith('/background.mjs') &&
      t.url.includes('baedceam'),
  );
  const { sessionId } = await b.call('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  const api = async (expression) => {
    const r = await b.call(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  await api(`chrome.tabs.update(${fixture.ids[0]},{active:true})`);
  execFileSync('python3', ['scripts/native-input.py', 'activate']);
  await api(`chrome.windows.update(${fixture.window},{focused:true})`);
  await sleep(500);
  const binary = path.resolve('build/Plico Helium Companion.app/Contents/MacOS/plico-companion');
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split(
    '\n',
  );
  const hosts = rows.flatMap((line) => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    return m && Number(m[2]) === state.pid && m[3].startsWith(binary + ' ') ? [Number(m[1])] : [];
  });
  if (hosts.length !== 1) throw Error('Exactly one owned companion required');
  // Runtime messages from a worker do not loop back to that same worker.
  const { targetId: statusTarget } = await b.call('Target.createTarget', {
    url: 'chrome-extension://baedceamflgfanjingjiinnhmhfjopbk/popup.html',
    background: true,
  });
  const { sessionId: statusSession } = await b.call('Target.attachToTarget', {
    targetId: statusTarget,
    flatten: true,
  });
  let statusLoaded = false;
  for (let i = 0; i < 50 && !statusLoaded; i++) {
    const ready = await b.call(
      'Runtime.evaluate',
      {
        expression:
          "location.pathname === '/popup.html' && document.readyState === 'complete' && !!globalThis.chrome?.runtime?.id",
        returnByValue: true,
      },
      statusSession,
    );
    statusLoaded = ready.result.value === true;
    if (!statusLoaded) await sleep(100);
  }
  if (!statusLoaded) throw Error('Status page did not finish loading');
  const statusResult = await b.call(
    'Runtime.evaluate',
    {
      expression: "chrome.runtime.sendMessage({type:'status'})",
      awaitPromise: true,
      returnByValue: true,
    },
    statusSession,
  );
  await b.call('Target.closeTarget', { targetId: statusTarget });
  const status = statusResult.result.value;
  if (status.status !== 'Connected') throw Error('Native input is not ready: ' + status.status);
  await api(`chrome.windows.update(${fixture.window},{focused:true})`);
  await sleep(300);
  // Materialize its owned panel before ScreenCaptureKit enumerates applications.
  execFileSync('python3', ['scripts/native-input.py', 'gesture', 'cmd+,11,cmd-', '0']);
  execFileSync('python3', ['scripts/native-input.py', 'gesture', '53', '0']);
  await sleep(300);
  recorder = spawn(
    'build/bin/capture',
    [
      String(state.pid),
      String(hosts[0]),
      String(fixture.windowID),
      movie,
      scene === 'stacks' ? '17' : scene === 'composer' ? '8' : scene === 'busy' ? '14' : '14',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const done = new Promise((resolve, reject) => {
    recorder.on('error', reject);
    recorder.on('close', (code) => (code ? reject(Error('Capture failed ' + code)) : resolve()));
  });
  // Observe early failures while the input sequence is still awaiting steps.
  done.catch((error) => {
    captureFailure = error;
  });
  let started = false;
  recorder.stdout.on('data', (data) => {
    fs.writeSync(log, data);
    if (data.toString().includes('capture-start')) started = true;
  });
  recorder.stderr.on('data', (data) => fs.writeSync(log, data));
  for (let i = 0; i < 100 && !started; i++) await sleep(50);
  if (!started) throw captureFailure || Error('Capture did not start');
  await sleep(700);
  const waitFor = async (predicate, label) => {
    for (let i = 0; i < 30; i++) {
      if (await predicate()) return;
      await sleep(50);
    }
    throw Error(label);
  };
  const assertActive = (id) =>
    waitFor(
      async () =>
        (await api(`chrome.tabs.query({windowId:${fixture.window},active:true})`))[0].id === id,
      'Recorded selection did not commit',
    );
  const assertGroup = (id, expectedTitle) =>
    waitFor(async () => {
      const tab = await api(`chrome.tabs.get(${id})`);
      if (tab.groupId < 0) return false;
      const group = await api(`chrome.tabGroups.get(${tab.groupId})`);
      return group.title === expectedTitle;
    }, 'Recorded move did not commit to the expected stack');
  const chapter = (text) =>
    fs.writeSync(
      log,
      JSON.stringify({
        event: 'chapter',
        uptime: Number(
          execFileSync('python3', ['-c', 'import time; print(time.monotonic())'], {
            encoding: 'utf8',
          }),
        ),
        text,
      }) + '\n',
    );
  if (scene === 'navigation') {
    chapter('Hold Command · choose with the arrows');
    await input('gesture', 'cmd+,wait,124,wait,124,wait,123,wait,cmd-', '600');
    await assertActive(fixture.ids[1]);
    await sleep(600);
    chapter('Across to a stack · up and down inside it');
    await input(
      'gesture',
      'cmd+,124,wait,124,wait,125,wait,125,wait,126,wait,126,wait,cmd-',
      '550',
    );
    await assertActive(fixture.ids[4]);
  } else if (scene === 'stacks') {
    chapter('Add Shift to move a tab');
    await input(
      'gesture',
      'cmd+,124,wait,shift+,124,wait,123,wait,124,124,wait,shift-,cmd-',
      '400',
    );
    await sleep(500);
    await assertGroup(fixture.ids[1], 'Layout');
    chapter('Reorder inside a stack · release to apply');
    await input('gesture', 'cmd+,shift+,125,wait,125,wait,126,wait,shift-,cmd-', '350');
    await sleep(500);
    chapter('Move between stacks with the same arrows');
    await input('gesture', 'cmd+,shift+,124,wait,125,wait,123,wait,shift-,cmd-', '350');
    await assertGroup(fixture.ids[1], 'Layout');
  } else if (scene === 'busy') {
    chapter('Command-click six reference links');
    const page = (await b.call('Target.getTargets')).targetInfos.find(
      (t) => t.type === 'page' && t.url === fixture.urls[0],
    );
    const { sessionId: pageSession } = await b.call('Target.attachToTarget', {
      targetId: page.targetId,
      flatten: true,
    });
    const tracePointer = (key, down) =>
      fs.writeSync(
        log,
        JSON.stringify({
          event: 'key',
          source: 'browser-pointer',
          key,
          down,
          uptime: Number(
            execFileSync('python3', ['-c', 'import time; print(time.monotonic())'], {
              encoding: 'utf8',
            }),
          ),
        }) + '\n',
      );
    for (const url of fixture.additions) {
      const r = await b.call(
        'Runtime.evaluate',
        {
          expression: `(() => {const link = [...document.querySelectorAll('a')].find(a=>a.href===${JSON.stringify(url)} && a.getBoundingClientRect().width && a.getBoundingClientRect().left<320); if(!link) throw Error('Visible public reference link missing'); link.scrollIntoView({block:'nearest',behavior:'instant'}); const r=link.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
          returnByValue: true,
        },
        pageSession,
      );
      if (r.exceptionDetails) throw Error('Demo link is not visible');
      const { x, y } = r.result.value;
      await b.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, pageSession);
      tracePointer(55, true);
      tracePointer(-1, true);
      await b.call(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', button: 'left', clickCount: 1, modifiers: 4, x, y },
        pageSession,
      );
      await sleep(90);
      await b.call(
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', button: 'left', clickCount: 1, modifiers: 4, x, y },
        pageSession,
      );
      tracePointer(-1, false);
      tracePointer(55, false);
      await sleep(170);
      await assertActive(fixture.ids[0]);
    }
    // The index remains visible while links open in the background.
    chapter('Command + Shift · 1, 1, 2, 2, 3, 3');
    await input(
      'gesture',
      'cmd+,124,124,124,wait,shift+,18,wait,18,wait,19,wait,19,wait,20,wait,20,wait,shift-,wait,cmd-',
      '260',
    );
    await sleep(500);
    const sorted = await api(`chrome.tabs.query({windowId:${fixture.window}})`);
    for (const [index, url] of fixture.additions.entries()) {
      const tab = sorted.find((t) => t.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
      if (!tab || tab.groupId < 0) throw Error('Rapid sorting did not group every addition');
      const group = await api(`chrome.tabGroups.get(${tab.groupId})`);
      if (index < 2 && group.title !== 'State') throw Error('State sorting mismatch');
      if (index >= 2 && index < 4 && group.title !== 'Effects')
        throw Error('Effect sorting mismatch');
      if (index >= 4 && group.title !== 'plico:3') throw Error('Ref sorting mismatch');
    }
    await assertActive(fixture.ids[2]);
  } else {
    chapter('Command + T · search your open tabs');
    await input('gesture', 'cmd+,17,cmd-', '0');
    await sleep(400);
    await input('text', 'css');
    await sleep(700);
    await input('gesture', '125,wait,125,wait,36', '450');
  }
  await done;
  console.log(JSON.stringify({ scene, movie, events: logPath }));
} catch (error) {
  recorder?.kill('SIGTERM');
  throw error;
} finally {
  fs.closeSync(log);
  b.close();
}
