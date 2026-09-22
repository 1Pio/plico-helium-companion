// Isolated Helium only. Official built-in uBlock API is used solely to arrange/restore a local fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {browser} from './cdp.mjs';
import {verifyExtensionSource} from './verify-extension-source.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const native=(...args)=>execFileSync('python3',['scripts/native-input.py',...args],{encoding:'utf8'});
const requests=[];
const server=http.createServer((req,res)=>{
 requests.push(req.url);res.setHeader('Cache-Control','no-store');
 if(req.url==='/allowed.js'||req.url==='/plico-block-me.js'){
  res.setHeader('Content-Type','application/javascript');res.end(req.url==='/allowed.js'?'window.allowed=true':'window.blockedScript=true');
 }else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Plico uBlock fixture</title><h1>Local filtering fixture</h1><script src="/allowed.js"></script><script src="/plico-block-me.js"></script>');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
let c,api,ub,prior,wid,result;
try{
 c=await browser();const targets=(await c.call('Target.getTargets')).targetInfos;
 assert(!targets.some(t=>t.url.includes('gohpcoiikfjcpedfpahhfbmghokmefhc')),'Duplicate fixture uBlock must be removed');
 const worker=targets.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));
 const target=targets.find(t=>t.url==='chrome-extension://blockjmkbacgjkknlgpkjjiijinjdanf/background.html');assert(target,'Built-in uBlock background missing');
 const evaluator=async t=>{
  const {sessionId}=await c.call('Target.attachToTarget',{targetId:t.targetId,flatten:true});
  return [async expression=>{const r=await c.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},sessionId];
 };
 let sid;[api,sid]=await evaluator(worker);await verifyExtensionSource(c,sid);[ub]=await evaluator(target);
 const manifest=await ub('({name:chrome.runtime.getManifest().name,version:chrome.runtime.getManifest().version})');assert.equal(manifest.name,'uBlock Origin');
 prior=await ub('µBlock.loadUserFilters()');assert.equal(typeof prior.content,'string');assert(!prior.error);
 const w=await api(`chrome.windows.create({url:${JSON.stringify(url)},focused:true})`);wid=w.id;
 const tab=w.tabs[0].id;
 const page=(await c.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url===url);assert(page);const [evaluate]=await evaluator(page);
 const ready=async()=>{for(let i=0;i<50;i++){if(await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete" && window.allowed === true`))return;await sleep(100);}throw Error('Fixture did not finish loading');};
 await ready();assert.deepEqual(await evaluate('({allowed:!!window.allowed,blocked:!!window.blockedScript})'),{allowed:true,blocked:true});
 await ub(`µBlock.appendUserFilters(${JSON.stringify(`||127.0.0.1:${server.address().port}/plico-block-me.js$script`)})`);
 const before=requests.filter(x=>x==='/plico-block-me.js').length;
 await api(`chrome.tabs.reload(${tab},{bypassCache:true})`);await sleep(300);await ready();
 assert.deepEqual(await evaluate('({allowed:!!window.allowed,blocked:!!window.blockedScript})'),{allowed:true,blocked:false});
 assert.equal(requests.filter(x=>x==='/plico-block-me.js').length,before,'Filtered request reached local server');
 const peer=await api(`chrome.tabs.create({windowId:${wid},url:${JSON.stringify(url+'peer')},active:false})`);await sleep(250);
 native('activate');native('gesture','cmd+,37','0');await sleep(250);
 assert.equal((await api(`chrome.tabs.query({windowId:${wid},active:true})`))[0].id,peer.id);
 result={at:new Date().toISOString(),extension:manifest,passed:['both local scripts execute before fixture filter','real uBlock blocks only target script and prevents request','native Plico navigation commits while full uBlock is active']};
}finally{
 const failures=[];
 if(prior&&ub)try{await ub(`(async()=>{await µBlock.saveUserFilters(${JSON.stringify(prior.content)});await µBlock.loadFilterLists();return true})()`);}catch(e){failures.push(e);}
 if(wid&&api)try{await api(`chrome.windows.remove(${wid})`);}catch(e){failures.push(e);}
 c?.close();await new Promise(r=>server.close(r));
 if(failures.length)throw new AggregateError(failures,'uBlock fixture cleanup failed');
}
fs.writeFileSync('.local/ublock-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
