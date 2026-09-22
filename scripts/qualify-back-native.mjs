import assert from'node:assert/strict';import fs from'node:fs';import{execFileSync}from'node:child_process';import{browser}from'./cdp.mjs';import{verifyExtensionSource}from'./verify-extension-source.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const native=(...a)=>execFileSync('python3',['scripts/native-input.py',...a],{encoding:'utf8'});const b=await browser();let api,wid;
try{
 const worker=(await b.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));const{sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});await verifyExtensionSource(b,sessionId);
 api=async expression=>{const r=await b.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 const w=await api("chrome.windows.create({url:'https://example.com/#plico-native-back-parent',focused:true})");wid=w.id;const parent=w.tabs[0].id;
 const child=await api(`chrome.tabs.create({windowId:${wid},openerTabId:${parent},url:'https://example.org/#plico-native-back-first',active:true})`);
 for(let i=0;i<30;i++){if((await api(`chrome.tabs.get(${child.id})`)).status==='complete')break;await sleep(100);}
 const target=(await b.call('Target.getTargets')).targetInfos.find(t=>t.url==='https://example.org/#plico-native-back-first');const page=(await b.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await b.call('Runtime.evaluate',{expression:"location.hash='plico-native-back-second'",userGesture:true},page);native('activate');await sleep(350);const history=await b.call('Page.getNavigationHistory',{},page);assert(history.currentIndex>0,'Fixture must have real back history');
 native('gesture','cmd+,51','0');await sleep(200);let tabs=await api(`chrome.tabs.query({windowId:${wid}})`);assert.equal(tabs.length,2);assert.equal(tabs.find(t=>t.active).id,child.id);assert.equal(tabs.find(t=>t.active).url,'https://example.org/#plico-native-back-first');
 native('gesture','cmd+,51','0');await sleep(200);tabs=await api(`chrome.tabs.query({windowId:${wid}})`);assert.equal(tabs.length,1);assert.equal(tabs[0].id,parent);assert(tabs[0].active);
 const result={at:new Date().toISOString(),passed:['native Back preserves ordinary in-tab history','second native Back closes empty-history linked child and returns to opener']};fs.writeFileSync('.local/back-native-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(wid&&api)await api(`chrome.windows.remove(${wid}).catch(()=>{})`).catch(()=>{});b.close();}
