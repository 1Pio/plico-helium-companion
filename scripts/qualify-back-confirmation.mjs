// Real beforeunload prompt and cancellation in a disposable, isolated tab.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browser } from './cdp.mjs';
import { verifyExtensionSource } from './verify-extension-source.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await browser();
let api, wid, pageSession, dialog, child;
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
  const fixture = await api(
    "chrome.windows.create({url:'https://example.com/#plico-back-confirm-parent',focused:true})",
  );
  wid = fixture.id;
  child = await api(
    `chrome.tabs.create({windowId:${wid},openerTabId:${fixture.tabs[0].id},url:'https://example.org/#plico-back-confirm-child',active:true})`,
  );
  for (let i = 0; i < 30; i++) {
    if ((await api(`chrome.tabs.get(${child.id})`)).status === 'complete') break;
    await sleep(100);
  }
  const page = (await b.call('Target.getTargets')).targetInfos.find(
    (t) => t.url === 'https://example.org/#plico-back-confirm-child',
  );
  pageSession = (await b.call('Target.attachToTarget', { targetId: page.targetId, flatten: true }))
    .sessionId;
  await b.call('Page.enable', {}, pageSession);
  b.on('Page.javascriptDialogOpening', (d, s) => {
    if (s === pageSession) dialog = d;
  });
  await b.call(
    'Runtime.evaluate',
    {
      expression:
        "window.plicoBeforeUnload=e=>{e.preventDefault();e.returnValue='unsaved test';};window.addEventListener('beforeunload',window.plicoBeforeUnload);document.body.innerHTML='<button>Fixture activation</button>';",
      userGesture: true,
    },
    pageSession,
  );
  for (const type of ['mousePressed', 'mouseReleased'])
    await b.call(
      'Input.dispatchMouseEvent',
      { type, x: 30, y: 20, button: 'left', clickCount: 1 },
      pageSession,
    );
  await api(`chrome.windows.update(${wid},{focused:true})`);
  await sleep(300);
  const focused = await api(
    '(async()=>(await globalThis.__plicoQualification.queue(globalThis.__plicoQualification.snapshot)).state.window)()',
  );
  assert(
    focused.id === wid && focused.focused,
    'Test browser cannot obtain focus; dismiss any system modal before this qualification',
  );
  await api(
    `void (async()=>{const m=globalThis.__plicoQualification,s=(await m.queue(m.snapshot)).state;globalThis.plicoBackFinished=false;await m.queue(()=>m.handle({v:1,epoch:m.connectionEpoch(),request:crypto.randomUUID(),window:${wid},revision:s.revision,type:'back',tab:${child.id}}));globalThis.plicoBackFinished=true;})()`,
  );
  for (let i = 0; i < 30 && !dialog; i++) await sleep(100);
  assert.equal(dialog?.type, 'beforeunload', 'Browser must retain unsaved-page confirmation');
  await b.call('Page.handleJavaScriptDialog', { accept: false }, pageSession);
  dialog = null;
  await sleep(250);
  assert(
    (await api(`chrome.tabs.query({windowId:${wid}})`)).some((t) => t.id === child.id),
    'Cancel must preserve unsaved child',
  );
  await sleep(700);
  const finished = await api('globalThis.plicoBackFinished');
  const result = {
    at: new Date().toISOString(),
    confirmationPreserved: true,
    cancelPreservesChild: true,
    queueReleasedAfterCancel: finished,
  };
  fs.writeFileSync('.local/back-confirmation-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert(finished, 'Canceled close must not indefinitely block all future bridge operations');
} finally {
  if (pageSession) {
    if (dialog)
      await b.call('Page.handleJavaScriptDialog', { accept: false }, pageSession).catch(() => {});
    await b
      .call(
        'Runtime.evaluate',
        { expression: "window.removeEventListener('beforeunload',window.plicoBeforeUnload)" },
        pageSession,
      )
      .catch(() => {});
  }
  if (wid && api) await api(`chrome.windows.remove(${wid}).catch(()=>{})`).catch(() => {});
  b.close();
}
