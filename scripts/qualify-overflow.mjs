import assert from'node:assert/strict';import fs from'node:fs';import{execFileSync,spawn}from'node:child_process';import{browser}from'./cdp.mjs';import{verifyExtensionSource}from'./verify-extension-source.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),native=(...a)=>execFileSync('python3',['scripts/native-input.py',...a],{encoding:'utf8'}),key=s=>native('gesture',s,'0');
function gesture(sequence,hold){const child=spawn('python3',['scripts/native-input.py','gesture',sequence,String(hold)]);let error;const done=new Promise(resolve=>{child.on('error',e=>error=e);child.on('close',(code,signal)=>resolve(error||((code!==0||signal)?Error('Input failed '+(signal||code)):null)));});return{child,done};}
const b=await browser();let api,wid,run,result;
try{
 const worker=(await b.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));const{sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});await verifyExtensionSource(b,sessionId);
 api=async expression=>{const r=await b.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 const w=await api(`chrome.windows.create({url:${JSON.stringify(Array.from({length:35},(_,i)=>'about:blank#plico-overflow-'+String(i+1).padStart(2,'0')))},focused:true})`);wid=w.id;await sleep(300);
 const ids=(await api(`chrome.tabs.query({windowId:${wid}})`)).map(t=>t.id),loose=ids.slice(0,20),stack=ids.slice(20,34),last=ids[34];
 const g1=await api(`chrome.tabs.group({tabIds:${JSON.stringify(stack)},createProperties:{windowId:${wid}}})`);await api(`chrome.tabGroups.update(${g1},{title:'plico:1',collapsed:true})`);
 const g10=await api(`chrome.tabs.group({tabIds:[${last}],createProperties:{windowId:${wid}}})`);await api(`chrome.tabGroups.update(${g10},{title:'plico:10',collapsed:true})`);
 await api(`chrome.tabs.update(${loose[0]},{active:true})`);await sleep(400);native('activate');await sleep(250);
 const active=async()=> (await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id;
 run=gesture('cmd+,29,wait',1700);await sleep(250);assert.equal(await active(),loose[0]);const panel=JSON.parse(native('windows')).find(w=>w.kCGWindowName==='Plico Navigator');assert(panel);execFileSync('/usr/sbin/screencapture',['-x','-l',String(panel.kCGWindowNumber),'.local/overflow-stack-ten.png']);let error=await run.done;run=null;if(error)throw error;await sleep(150);assert.equal(await active(),last);
 const passed=['stack 10 across overflowing bar defers activation until release'];
 // Stack 1 remembers its first member; fourteen rows exceed the native panel.
 run=gesture('cmd+,18,'+Array(10).fill('38').join(',')+',wait',1000);await sleep(300);assert.equal(await active(),last);const column=JSON.parse(native('windows')).find(w=>w.kCGWindowName==='Plico Navigator');assert(column);execFileSync('/usr/sbin/screencapture',['-x','-l',String(column.kCGWindowNumber),'.local/overflow-stack-column.png']);error=await run.done;run=null;if(error)throw error;await sleep(150);assert.equal(await active(),stack[10]);passed.push('long stack vertical navigation defers activation and selects offscreen member');
 // Reordering the last member downward wraps it to the first position.
 await api(`chrome.tabs.update(${stack.at(-1)},{active:true})`);await sleep(200);key('cmd+,18,shift+,38');await sleep(250);const ordered=(await api(`chrome.tabs.query({windowId:${wid}})`)).filter(t=>t.groupId!==-1);const groups=await api(`chrome.tabGroups.query({windowId:${wid}})`);const stackGroup=groups.find(g=>g.title==='plico:1').id;assert.deepEqual(ordered.filter(t=>t.groupId===stackGroup).map(t=>t.id),[stack.at(-1),...stack.slice(0,-1)]);passed.push('native downward reorder wraps bottom member to top');
 const original=await active();run=gesture('cmd+,29,wait',1300);await sleep(250);assert.equal(await active(),original);await api(`chrome.tabs.remove(${last})`);await sleep(150);error=await run.done;run=null;if(error)throw error;await sleep(150);assert.equal(await active(),original);assert(!JSON.parse(native('windows')).some(w=>w.kCGWindowName==='Plico Navigator'));passed.push('closing tentative target externally cancels draft without activating another tab');
 result={at:new Date().toISOString(),passed,captures:['.local/overflow-stack-ten.png','.local/overflow-stack-column.png']};
}finally{
 if(run){if(run.child.pid&&run.child.exitCode===null&&!run.child.signalCode)run.child.kill('SIGTERM');await run.done;}
 try{if(wid&&api)await api(`chrome.windows.remove(${wid})`);}finally{b.close();}
}
fs.writeFileSync('.local/overflow-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
