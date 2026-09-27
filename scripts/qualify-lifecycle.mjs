import { verifyExtensionSource } from './verify-extension-source.mjs';
// Two-stage real browser restart check. Only owned, public fixture URLs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { browser } from './cdp.mjs';
const b = await browser();
try {
  const { targetInfos } = await b.call('Target.getTargets');
  const worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes('baedceam'));
  assert(worker);
  const { sessionId } = await b.call('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  await verifyExtensionSource(b, sessionId);
  const mode = process.argv[2] || 'prepare';
  if (!['prepare', 'check'].includes(mode)) throw Error('prepare|check only');
  const fixtureFile = '.local/lifecycle-fixture.json';
  const suffix = mode === 'prepare' ? crypto.randomUUID() : null;
  const urls =
    mode === 'prepare'
      ? [
          'https://example.com/#plico-persist-a-',
          'https://example.org/#plico-persist-b-',
          'https://example.net/#plico-persist-c-',
        ].map((u) => u + suffix)
      : JSON.parse(fs.readFileSync(fixtureFile, 'utf8')).urls;
  const r = await b.call(
    'Runtime.evaluate',
    {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
 const m=globalThis.__plicoQualification, sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const urls=${JSON.stringify(urls)};
 let win;
 if(${JSON.stringify(mode)}==='prepare')win=await chrome.windows.create({url:urls,focused:true});
 else {const wins=await chrome.windows.getAll({populate:true});win=wins.find(w=>w.tabs?.length===3&&urls.every(u=>w.tabs.some(t=>t.url===u)));if(!win)throw Error('Restored fixture missing');await chrome.windows.update(win.id,{focused:true});}
 let s;for(let i=0;i<15;i++){s=await m.queue(m.snapshot);if(s.state.window.id===win.id&&s.tabs.length===3&&urls.every(u=>s.tabs.some(t=>t.url===u)))break;await sleep(100);}
 if(s.state.window.id!==win.id)throw Error('Fixture focus not ready');
 const [a,b,c]=urls.map(u=>s.tabs.find(t=>t.url===u)?.id);if(!a||!b||!c)throw Error('Fixture tabs incomplete');
 const request=async(data)=>{const q=await m.queue(m.snapshot);await m.queue(()=>m.handle({v:1,epoch:m.connectionEpoch(),request:crypto.randomUUID(),window:win.id,revision:q.state.revision,...data}));await sleep(40);return (await m.queue(m.snapshot)).state;};
 if(${JSON.stringify(mode)}==='prepare'){
  let stacks=Array.from({length:10},()=>[]);stacks[0]=[a,b];
  await request({type:'commit',loose:[c],stacks,activate:b});await request({type:'commit',loose:[c],stacks,activate:c});
  await chrome.tabs.update(a,{active:true});await chrome.tabs.update(b,{active:true});await chrome.tabs.update(c,{active:true});await sleep(150);
  if((await m.queue(m.snapshot)).state.last[0]!==b)throw Error('Coalesced stack visit lost');
  const created=await chrome.tabs.create({windowId:win.id,url:'https://example.com/#plico-new-placement',active:false});
  let tabs;for(let i=0;i<15;i++){await sleep(60);tabs=await chrome.tabs.query({windowId:win.id});if(tabs.find(t=>t.id===created.id)?.index<tabs.find(t=>t.id===a)?.index)break;}
  if(tabs.find(t=>t.id===created.id)?.index>=tabs.find(t=>t.id===a)?.index)throw Error('New tab was not placed before stacks');
  await chrome.tabs.remove(created.id);await sleep(350);
  const duplicate=await chrome.windows.create({url:[urls[2],urls[0],urls[1]],focused:true});
  const dg=await chrome.tabs.group({tabIds:duplicate.tabs.slice(1).map(t=>t.id),createProperties:{windowId:duplicate.id}});await chrome.tabGroups.update(dg,{title:'plico:1'});
  for(let i=0;i<15;i++){await sleep(100);const q=await m.queue(m.snapshot);if(q.state.window.id===duplicate.id&&urls.every(u=>q.tabs.some(t=>t.url===u)))break;}
  await chrome.windows.remove(duplicate.id);await chrome.windows.update(win.id,{focused:true});await sleep(350);
 }
 s=(await m.queue(m.snapshot)).state;
 if(s.last[0]!==b)throw Error('Last-used stack member was not retained');
 if(s.recent[0]!==c||s.recent[1]!==b)throw Error('MRU was not retained');
 await sleep(250);
 return {mode:${JSON.stringify(mode)},window:win.id,passed:['stack last-used member','MRU order',...(${JSON.stringify(mode)}==='prepare'?['new tab before stacks','rapid intermediate stack visit','closed identical window does not retain an anchor']:['real browser session restore'])]};
})()`,
    },
    sessionId,
  );
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
  console.log(JSON.stringify(r.result.value, null, 2));
  if (mode === 'prepare') fs.writeFileSync(fixtureFile, JSON.stringify({ urls }, null, 2));
  fs.writeFileSync('.local/lifecycle-' + mode + '.json', JSON.stringify(r.result.value, null, 2));
} finally {
  b.close();
}
