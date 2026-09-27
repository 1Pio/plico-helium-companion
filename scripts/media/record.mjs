// Record one predefined teaching sequence in the marked demo window.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { browser } from '../cdp.mjs';
if (process.env.PLICO_DEMO !== '1') throw Error('Demo profile required');
const scene = process.argv[2];
if (!['navigation', 'stacks', 'composer', 'busy'].includes(scene))
  throw Error('navigation|stacks|composer|busy');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const folder = path.resolve('.local/public-release/media');
const fixture = JSON.parse(fs.readFileSync(path.join(folder, 'fixture.json')));
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
      scene === 'stacks' ? '16' : scene === 'composer' ? '8' : scene === 'busy' ? '14' : '11',
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
  if (scene === 'navigation') {
    await input('gesture', 'cmd+,wait,124,wait,124,wait,cmd-', '950');
    await sleep(800);
    await input('gesture', 'cmd+,123,wait,53,cmd-', '950');
    await sleep(600);
    await input('gesture', 'ctrl+,48,wait,ctrl-', '800');
  } else if (scene === 'stacks') {
    await input('gesture', 'cmd+,18,wait,125,wait,125,wait,cmd-', '700');
    await sleep(700);
    await input('gesture', 'cmd+,19,wait,cmd-', '700');
    await input('gesture', 'cmd+,18,wait,cmd-', '700');
    await sleep(600);
    await input('gesture', 'cmd+,123,wait,shift+,19,wait,19,wait,shift-,cmd-', '650');
    await sleep(600);
    await input('gesture', 'cmd+,20,125,125,126,19,125,18,wait,cmd-', '700');
  } else if (scene === 'busy') {
    await input('gesture', 'cmd+,18,wait,125,125,125,125,125,125,125,125,wait,cmd-', '650');
    await sleep(700);
    await input('gesture', 'cmd+,19,125,wait,20,125,wait,18,wait,cmd-', '650');
    await sleep(500);
    await input('gesture', 'cmd+,126,126,126,wait,53,cmd-', '650');
  } else {
    await input('gesture', 'cmd+,17,cmd-', '0');
    await sleep(650);
    await input('text', 'css');
    await sleep(1200);
    await input('gesture', '125,wait,125,wait,36', '800');
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
