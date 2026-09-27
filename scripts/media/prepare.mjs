// Populate only the dedicated marked demo profile with safe public documentation.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { browser } from '../cdp.mjs';
import { defaults } from '../../extension/settings.mjs';
if (process.env.PLICO_DEMO !== '1') throw Error('Demo profile required');
if (
  execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], {
    encoding: 'utf8',
  }).trim() !== '1'
)
  throw Error('Memory pressure is not Normal');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const take = process.argv.find((a) => a.startsWith('--take='))?.split('=')[1] || 'current';
if (!/^[a-z0-9-]+$/.test(take)) throw Error('Invalid take name');
const b = await browser();
try {
  const worker = (await b.call('Target.getTargets')).targetInfos.find(
    (t) =>
      t.type === 'service_worker' &&
      t.url === 'chrome-extension://baedceamflgfanjingjiinnhmhfjopbk/background.mjs',
  );
  if (!worker) throw Error('Shipping extension required for demo');
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
  await api(
    `chrome.storage.local.set({plicoSettings:${JSON.stringify({ ...defaults, theme: 'dark' })}})`,
  );
  const scene = process.argv.find((a) => a.startsWith('--scene='))?.split('=')[1] || 'navigation';
  if (!['navigation', 'stacks', 'busy', 'composer'].includes(scene)) throw Error('Unknown scene');
  const urls =
    scene === 'busy'
      ? [
          'https://react.dev/reference/react/hooks',
          'https://bearblog.dev/',
          'https://www.wikipedia.org/',
          'https://react.dev/reference/react/useContext',
          'https://react.dev/reference/react/useSyncExternalStore',
          'https://react.dev/reference/react/useInsertionEffect',
        ]
      : [
          'https://bearblog.dev/',
          'https://www.wikipedia.org/',
          'https://github.com/imputnet/helium',
          'https://web.dev/learn/css',
          'https://web.dev/learn/css/layout',
          'https://web.dev/learn/css/typography',
          'https://web.dev/learn/css/color',
          'https://react.dev/learn',
          'https://react.dev/reference/react/useState',
        ];
  const additions = [
    'useState',
    'useReducer',
    'useEffect',
    'useLayoutEffect',
    'useRef',
    'useImperativeHandle',
  ].map((name) => 'https://react.dev/reference/react/' + name);
  const resume = process.argv.find((a) => a.startsWith('--window='));
  if (resume && !/^--window=\d+$/.test(resume)) throw Error('Invalid demo window');
  if (!resume) {
    // The demo profile is disposable. Retire its old pages before loading a new
    // set so repeated takes never double the renderer working set.
    const previous = await api('chrome.windows.getAll()');
    await api("chrome.windows.create({url:'about:blank',focused:true})");
    for (const w of previous) await api(`chrome.windows.remove(${w.id})`);
  }
  const resident = new Set(
    scene === 'navigation'
      ? [0, 1, 4]
      : scene === 'composer'
        ? [0, 3, 4]
        : scene === 'busy'
          ? [0, 2]
          : [0, 1],
  );
  const win = await api(
    resume
      ? `chrome.windows.get(${Number(resume.split('=')[1])})`
      : `chrome.windows.create({url:${JSON.stringify(urls[0])},focused:true,left:50,top:70,width:1440,height:900})`,
  );
  if (!resume) {
    for (let index = 1; index < urls.length; index++) {
      const tab = await api(
        `chrome.tabs.create({windowId:${win.id},url:${JSON.stringify(urls[index])},active:false})`,
      );
      let loaded;
      for (let attempt = 0; attempt < 120; attempt++) {
        loaded = await api(`chrome.tabs.get(${tab.id})`);
        if (loaded.status === 'complete' && loaded.favIconUrl) break;
        await sleep(250);
      }
      if (loaded.status !== 'complete' || !loaded.favIconUrl)
        throw Error('Public demo page did not load');
      if (!resident.has(index)) await api(`chrome.tabs.discard(${tab.id})`);
    }
  }
  let tabs = [];
  for (let i = 0; i < 120; i++) {
    tabs = await api(`chrome.tabs.query({windowId:${win.id}})`);
    if (tabs.every((t) => (t.status === 'complete' || t.discarded) && t.favIconUrl)) break;
    await sleep(500);
  }
  if (!tabs.every((t) => (t.status === 'complete' || t.discarded) && t.favIconUrl))
    throw Error('Demo pages/favicons did not all load');
  if (tabs.some((t) => !urls.includes(t.url.replace(/\/$/, '')) && !urls.includes(t.url)))
    throw Error('Unexpected demo destination; inspect before recording');
  if (tabs.length !== urls.length) throw Error('Unexpected demo tab count');
  const ids = urls.map(
    (url) => tabs.find((t) => t.url.replace(/\/$/, '') === url.replace(/\/$/, ''))?.id,
  );
  if (ids.some((id) => !id)) throw Error('Missing expected demo destination');
  // An explicit resumed demo is restored to this fixture through real browser APIs.
  await api(`chrome.tabs.ungroup(${JSON.stringify(ids)})`);
  await api(`chrome.tabs.move(${JSON.stringify(ids)},{windowId:${win.id},index:0})`);
  await sleep(400);
  // Visit each loaded document once, as in a real research session. Background
  // loading alone does not guarantee Chromium has painted its first frame.
  for (const [index, id] of ids.entries()) {
    if (!resident.has(index)) continue;
    await api(`chrome.tabs.update(${id},{active:true})`);
    await sleep(350);
  }
  {
    const groups =
      scene === 'busy'
        ? [
            [[3, 4], 'State', 'blue'],
            [[5], 'Effects', 'purple'],
          ]
        : [
            [[3, 4, 5, 6], 'Layout', 'blue'],
            [[7, 8], 'Components', 'purple'],
          ];
    for (const [indices, title, color] of groups) {
      const group = await api(
        `chrome.tabs.group({tabIds:${JSON.stringify(indices.map((i) => ids[i]))},createProperties:{windowId:${win.id}}})`,
      );
      await api(
        `chrome.tabGroups.update(${group},{title:${JSON.stringify(title)},color:${JSON.stringify(color)},collapsed:true})`,
      );
      await sleep(250);
    }
  }
  // Deterministic last-visited members keep the first arrow-only lesson readable.
  for (const index of [0]) {
    await api(`chrome.tabs.update(${ids[index]},{active:true})`);
    await sleep(200);
  }
  // Inactive pages retain real titles, favicons and groups without their renderer.
  for (const [index, id] of ids.entries()) {
    if (!resident.has(index) && !(await api(`chrome.tabs.get(${id})`)).discarded)
      await api(`chrome.tabs.discard(${id})`);
  }
  // Retire earlier public-only demo windows after the replacement is complete.
  for (const other of await api('chrome.windows.getAll()'))
    if (other.id !== win.id) await api(`chrome.windows.remove(${other.id})`);
  execFileSync('python3', ['scripts/native-input.py', 'activate']);
  await api(`chrome.windows.update(${win.id},{focused:true})`);
  await sleep(1200);
  const windows = JSON.parse(
    execFileSync('python3', ['scripts/native-input.py', 'windows'], { encoding: 'utf8' }),
  );
  const owned = windows.filter(
    (w) =>
      w.kCGWindowOwnerPID === JSON.parse(fs.readFileSync('.local/browser-pid.json')).pid &&
      w.kCGWindowLayer === 0 &&
      w.kCGWindowBounds.Width >= 1000,
  );
  const target = owned.find((w) =>
    w.kCGWindowName?.includes(scene === 'busy' ? 'Built-in React Hooks' : 'Bear'),
  );
  if (!target) throw Error('Cannot identify the exact foreground demo window');
  const folder = `.local/media-refresh-044/${take}`;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    `${folder}/fixture.json`,
    JSON.stringify(
      {
        window: win.id,
        windowID: target.kCGWindowNumber,
        ids,
        urls,
        additions,
        scene,
        titles: tabs.map((t) => t.title),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      window: win.id,
      windowID: target.kCGWindowNumber,
      tabs: tabs.length,
      icons: tabs.filter((t) => t.favIconUrl).length,
    }),
  );
} finally {
  b.close();
}
