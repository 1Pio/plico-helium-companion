import {verifyExtensionSource} from './verify-extension-source.mjs';
// Uses the user's explicitly approved native harness and the isolated profile.
import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';import fs from 'node:fs';
import {browser} from './cdp.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const native=(...args)=>execFileSync('python3',['scripts/native-input.py',...args],{encoding:'utf8'});
const gesture=(keys,hold=0)=>new Promise((resolve,reject)=>{const p=spawn('python3',['scripts/native-input.py','gesture',keys,String(hold)],{stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',x=>err+=x);p.on('exit',code=>code?reject(Error(err||'native gesture failed '+code)):resolve());});
const b=await browser();let fixture;
try{
 const {targetInfos}=await b.call('Target.getTargets');const worker=targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));
 const {sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});
 await verifyExtensionSource(b,sessionId);
 async function api(expression){const r=await b.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
 fixture=await api(`chrome.windows.create({url:['https://example.com/#plico-a','https://example.org/#plico-b','https://example.net/#plico-c'],focused:true})`);
 const wid=fixture.id;await sleep(400);native('activate');await sleep(150);
 const tabs=()=>api(`chrome.tabs.query({windowId:${wid}})`);let initial=await tabs();const [a,bid,c]=initial.map(t=>t.id);
 const active=async()=> (await tabs()).find(t=>t.active).id;
 const activate=async id=>{await api(`chrome.tabs.update(${id},{active:true})`);await sleep(180);};
 const visible=()=>JSON.parse(native('windows')).some(w=>w.kCGWindowName==='Plico Navigator');
 const report=[];const pass=name=>report.push(name);
 await gesture('53');await activate(a);
 let run=gesture('cmd+,wait',700);await sleep(90);assert(!visible(),'hidden before reveal delay');await sleep(220);assert(visible(),'visible after hold delay');await run;await sleep(350);assert(!visible());pass('delayed Command reveal and release dismissal');
 run=gesture('cmd+,37,37,wait',700);await sleep(260);assert.equal(await active(),a,'no intermediate activation');assert(visible());await run;await sleep(200);assert.equal(await active(),c);pass('two-step selection commits only on Command release');
 const before=(await tabs()).map(t=>t.id);await gesture('cmd+,shift+,4,53');await sleep(200);assert.deepEqual((await tabs()).map(t=>t.id),before);assert.equal(await active(),c);pass('Escape cancels reorder and candidate');
 await gesture('cmd+,shift+,4');await sleep(250);assert.deepEqual((await tabs()).map(t=>t.id),[a,c,bid]);pass('Shift movement commits real loose order');
 await gesture('cmd+,11');assert(visible());await gesture('124');assert.equal(await active(),c);await gesture('cmd+');await sleep(220);assert.equal(await active(),bid);assert(!visible());pass('latched arrow candidate and bare Command commit');
 await activate(a);await activate(c);await activate(bid);
 run=gesture('ctrl+,48,wait',600);await sleep(220);assert.equal(await active(),bid);assert(visible());await run;await sleep(200);assert.equal(await active(),c);pass('Control-Tab MRU deferred until Control release');
 await gesture('cmd+,17');await sleep(200);assert.equal((await tabs()).length,3);assert(JSON.parse(native('windows')).some(w=>w.kCGWindowName==='Plico Search'));await gesture('53');pass('composer opens without allocating tab and Escape dismisses');
 console.log(JSON.stringify({passed:report,fixtureWindow:wid},null,2));
 fs.writeFileSync('.local/native-gesture-result.json',JSON.stringify({at:new Date().toISOString(),passed:report,fixtureWindow:wid},null,2));
}catch(e){console.error(e);process.exitCode=1;}
finally{b.close();}
