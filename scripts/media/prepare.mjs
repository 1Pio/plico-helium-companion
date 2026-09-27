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
  const urls = [
    'https://developer.mozilla.org/en-US/docs/Web/CSS',
    'https://web.dev/learn/css',
    'https://github.com/imputnet/helium',
    'https://developer.mozilla.org/en-US/docs/Web/SVG',
  ];
  const stacked = process.argv.includes('--stacks') || process.argv.includes('--busy');
  if (stacked)
    urls.push(
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout',
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout',
      'https://web.dev/learn/css/layout',
      'https://web.dev/learn/css/typography',
      'https://react.dev/learn',
      'https://react.dev/reference/react/useState',
      'https://react.dev/reference/react/useEffect',
      'https://web.dev/learn/accessibility',
      'https://web.dev/learn/forms',
      'https://developer.mozilla.org/en-US/docs/Web/Accessibility',
    );
  if (process.argv.includes('--busy'))
    urls.push(
      'https://web.dev/learn/css/spacing',
      'https://web.dev/learn/css/sizing',
      'https://web.dev/learn/css/color',
      'https://web.dev/learn/css/shadows',
      'https://web.dev/learn/css/borders',
      'https://web.dev/learn/css/transitions',
      'https://web.dev/learn/css/animations',
      'https://web.dev/learn/css/gradients',
    );
  const resume = process.argv.find((a) => a.startsWith('--window='));
  if (resume && !/^--window=\d+$/.test(resume)) throw Error('Invalid demo window');
  const win = await api(
    resume
      ? `chrome.windows.get(${Number(resume.split('=')[1])})`
      : `chrome.windows.create({url:${JSON.stringify(urls)},focused:true,left:50,top:70,width:1440,height:900})`,
  );
  let tabs = [];
  for (let i = 0; i < 120; i++) {
    tabs = await api(`chrome.tabs.query({windowId:${win.id}})`);
    if (tabs.every((t) => t.status === 'complete' && t.favIconUrl)) break;
    await sleep(500);
  }
  if (!tabs.every((t) => t.status === 'complete' && t.favIconUrl))
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
  for (const id of ids) {
    await api(`chrome.tabs.update(${id},{active:true})`);
    await sleep(350);
  }
  if (stacked) {
    for (const [indices, title, color] of [
      [[4, 5, 6, 7, ...ids.slice(14).map((_, i) => i + 14)], 'Layout', 'blue'],
      [[8, 9, 10], 'Components', 'purple'],
      [[11, 12, 13], 'Accessibility', 'green'],
    ]) {
      const group = await api(
        `chrome.tabs.group({tabIds:${JSON.stringify(indices.map((i) => ids[i]))}})`,
      );
      await api(
        `chrome.tabGroups.update(${group},{title:${JSON.stringify(title)},color:${JSON.stringify(color)},collapsed:true})`,
      );
      await sleep(250);
    }
  }
  await api(`chrome.tabs.update(${ids[0]},{active:true})`);
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
  const target = owned.find((w) => w.kCGWindowName?.includes('CSS'));
  if (!target) throw Error('Cannot identify the exact foreground demo window');
  fs.mkdirSync('.local/public-release/media', { recursive: true });
  fs.writeFileSync(
    '.local/public-release/media/fixture.json',
    JSON.stringify(
      {
        window: win.id,
        windowID: target.kCGWindowNumber,
        ids,
        urls,
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
