// Actual native keys plus browser state; only public fixtures in marked profile.
import assert from 'node:assert/strict';import fs from 'node:fs';import{execFileSync}from'node:child_process';
import{browser}from'./cdp.mjs';import{verifyExtensionSource}from'./verify-extension-source.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const native=(...a)=>execFileSync('python3',['scripts/native-input.py',...a],{encoding:'utf8'});
const key=s=>native('gesture',s,'0');const text=s=>native('text',s);
const b=await browser();let wid,api,wrapped=false;
try{
 const worker=(await b.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));
 const{sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});await verifyExtensionSource(b,sessionId);
 api=async expression=>{const r=await b.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 await api("void (globalThis.plicoCalls=[],globalThis.plicoCreate=chrome.tabs.create,globalThis.plicoUpdate=chrome.tabs.update,chrome.tabs.create=async(...args)=>{plicoCalls.push({method:'create',args});const result=await plicoCreate(...args);plicoCalls.push({method:'created',id:result.id,window:result.windowId});return result;},chrome.tabs.update=async(...args)=>{plicoCalls.push({method:'update',args});return plicoUpdate(...args);})");wrapped=true;
 const fixture=await api("chrome.windows.create({url:'https://example.org/#plico-composer-target',focused:true})");wid=fixture.id;const target=fixture.tabs[0].id;
 await sleep(450);native('activate');await api(`chrome.windows.update(${wid},{focused:true})`);await sleep(180);assert.equal((await api("chrome.windows.getAll({windowTypes:['normal']})")).find(w=>w.focused)?.id,wid,'exact fixture window must own input');
 const tabs=()=>api(`chrome.tabs.query({windowId:${wid}})`);let report=[];
 const capture=()=>{const panel=JSON.parse(native('windows')).find(w=>w.kCGWindowName==='Plico Search');assert(panel,'composer remains visible before submit');native('gesture','wait','0');const r=panel.kCGWindowBounds;execFileSync('/usr/sbin/screencapture',['-x','-R',`${r.X},${r.Y},${r.Width},${r.Height}`,'.local/composer-before-submit.png']);};
 const settle=async predicate=>{let current;for(let i=0;i<30;i++){current=await tabs();if(predicate(current))return current;await sleep(100);}return current;};
 key('cmd+,17');text('abc');key('cmd+,0');text('https://example.com/#plico-submit');await sleep(150);
 assert.equal((await tabs()).length,1);capture();key('36');let current=await settle(t=>t.length===2&&t.find(t=>t.active)?.url==='https://example.com/#plico-submit');assert.equal(current.length,2,JSON.stringify({calls:await api('plicoCalls'),tabs:current}));assert.equal(current.find(t=>t.active).url,'https://example.com/#plico-submit');report.push('native Select All replacement and exact URL submit');
 const edited=current.find(t=>t.active).id;
 key('cmd+,shift+,43');text('example');key('36');let search;for(let i=0;i<20;i++){await sleep(100);current=await tabs();search=current.find(t=>t.active)?.url;if(search&&new URL(search).searchParams.get('q')==='example')break;}assert.equal(current.length,2);assert.equal(current.find(t=>t.active).id,edited);assert.equal(new URL(search).searchParams.get('q'),'example','Observed fixture URL: '+search);report.push('URL composer edits existing tab using browser default search');
 key('cmd+,17');text('example');await sleep(250);key('125');key('36');current=await settle(t=>t.find(t=>t.active)?.id===target);assert.equal(current.length,2);assert.equal(current.find(t=>t.active).id,target);report.push('native composer jumps to existing tab without allocation');
 const result={at:new Date().toISOString(),passed:report,defaultSearchOrigin:new URL(search).origin};console.log(JSON.stringify(result,null,2));fs.writeFileSync('.local/composer-result.json',JSON.stringify(result,null,2));
}finally{if(wrapped&&api)await api('void (chrome.tabs.create=plicoCreate,chrome.tabs.update=plicoUpdate)').catch(()=>{});if(wid&&api)await api(`chrome.windows.remove(${wid})`).catch(()=>{});b.close();}
