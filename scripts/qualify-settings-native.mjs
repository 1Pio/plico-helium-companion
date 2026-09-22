import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {browser} from './cdp.mjs';
import {verifyExtensionSource} from './verify-extension-source.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const native=(...args)=>execFileSync('python3',['scripts/native-input.py',...args],{encoding:'utf8'});
const key=s=>native('gesture',s,'0');
const visible=()=>JSON.parse(native('windows')).some(w=>w.kCGWindowName==='Plico Navigator');
function startGesture(sequence,hold){
 const child=spawn('python3',['scripts/native-input.py','gesture',sequence,String(hold)]);let error=null;
 const done=new Promise(resolve=>{child.on('error',e=>{error=e;});child.on('close',(code,signal)=>resolve(error||((code!==0||signal)?Error('Native input failed: '+(signal||code)):null)));});
 return {child,done};
}
const b=await browser();let api,wid,previous,run,result;
try {
 const worker=(await b.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));
 const {sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});
 await verifyExtensionSource(b,sessionId);
 api=async expression=>{const r=await b.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 previous=await api("chrome.storage.local.get('plicoSettings')");
 const config={revealDelayMs:1000,keys:{left:'h',down:'j',up:'k',right:'l',toggle:'o',new:'t',edit:';',copy:'c',back:'Backspace'}};
 await api(`chrome.storage.local.set({plicoSettings:${JSON.stringify(config)}})`);
 const w=await api("chrome.windows.create({url:['https://example.org/#plico-settings-native','https://example.com/#plico-settings-peer'],focused:true})");wid=w.id;
 for(let i=0;i<100;i++){if((await api(`chrome.tabs.query({windowId:${wid}})`)).every(t=>t.status==='complete'))break;await sleep(100);}
 assert((await api(`chrome.tabs.query({windowId:${wid}})`)).every(t=>t.status==='complete'),'fixture pages must settle before timing gestures');
 native('activate');await sleep(600);
 key('cmd+,31');await sleep(100);assert(visible(),'custom Command+O must latch navigator');key('53');await sleep(120);assert(!visible());
 run=startGesture('cmd+,wait',1900);
 await sleep(350);assert(!visible(),'custom 1000 ms delay must keep navigator hidden at early sample');
 await sleep(950);assert(visible(),'navigator must appear after custom delay');
 const holdError=await run.done;run=null;if(holdError)throw holdError;await sleep(100);assert(!visible());
 // A dedicated action bypasses the hold delay and remains transactional.
 const first=w.tabs[0].id,second=w.tabs[1].id;await api(`chrome.tabs.update(${first},{active:true})`);await sleep(100);
 run=startGesture('cmd+,37,wait',600);
 await sleep(220);assert(visible(),'navigation action bypasses custom reveal delay');assert.equal((await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id,first);
 const commitError=await run.done;run=null;if(commitError)throw commitError;await sleep(100);assert.equal((await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id,second);
 // An interrupted supervisor must release its real native child and modifiers.
 run=startGesture('cmd+,37,wait',1900);await sleep(250);assert(visible());
 const childPID=execFileSync('pgrep',['-P',String(run.child.pid)],{encoding:'utf8'}).trim();assert(/^\d+$/.test(childPID));
 run.child.kill('SIGTERM');assert(await run.done);run=null;await sleep(150);assert(!visible());
 const alive=execFileSync('ps',['-axo','pid='],{encoding:'utf8'}).split('\n').map(x=>x.trim()).includes(childPID);assert(!alive,'native helper must exit before fixture restoration');
 result={at:new Date().toISOString(),passed:['custom Command+O latches native navigator','custom reveal delay applied with early/late samples','dedicated action bypasses delay and commits only on release','interrupted wrapper releases native child and held modifiers before cleanup'],preciseLatencyMeasured:false};
}finally{
 const failures=[];
 if(run){if(run.child.pid&&run.child.exitCode===null&&!run.child.signalCode)run.child.kill('SIGTERM');await run.done;}
 if(previous&&api)try{await api(Object.hasOwn(previous,'plicoSettings')?`chrome.storage.local.set(${JSON.stringify(previous)})`:"chrome.storage.local.remove('plicoSettings')");assert.deepEqual(await api("chrome.storage.local.get('plicoSettings')"),previous);}catch(e){failures.push(e);}
 if(wid&&api)try{await api(`chrome.windows.remove(${wid})`);}catch(e){failures.push(e);}
 b.close();if(failures.length)throw new AggregateError(failures,'Qualification cleanup failed');
}

fs.writeFileSync('.local/settings-native-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
