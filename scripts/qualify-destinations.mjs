// Public owned fixtures. User approved leaving the public copy-test URL on the clipboard.
import assert from'node:assert/strict';import fs from'node:fs';import{execFileSync}from'node:child_process';import{browser}from'./cdp.mjs';import{verifyExtensionSource}from'./verify-extension-source.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),native=(...args)=>execFileSync('python3',['scripts/native-input.py',...args],{encoding:'utf8'}),key=s=>native('gesture',s,'0');
const b=await browser();let api,wid,bookmark,historyURL,result;
try{
 const worker=(await b.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));const{sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});await verifyExtensionSource(b,sessionId);
 api=async expression=>{const r=await b.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 const w=await api("chrome.windows.create({url:'https://example.org/#plico-copy-fixture',focused:true})");wid=w.id;
 for(let i=0;i<60;i++){if((await api(`chrome.tabs.get(${w.tabs[0].id})`)).status==='complete')break;await sleep(100);}
 native('activate');await sleep(300);native('copy-url');await sleep(250);const passed=['native Command+Shift+C copies exact actual-tab URL'];
 const suffix=crypto.randomUUID();const bookmarkURL='https://example.com/#plico-bookmark-'+suffix;
 bookmark=await api(`chrome.bookmarks.create({title:'plico bookmark qualification',url:${JSON.stringify(bookmarkURL)}})`);
 key('cmd+,17');native('text','plico bookmark qualification');await sleep(350);assert.equal((await api(`chrome.tabs.query({windowId:${wid}})`)).length,1);key('125');key('36');await sleep(200);
 let tabs=await api(`chrome.tabs.query({windowId:${wid}})`);assert.equal(tabs.length,2);assert.equal(tabs.find(t=>t.active).url,bookmarkURL);passed.push('native composer selects bookmark and allocates only on submit');
 historyURL='https://example.net/#plico-history-qualification-'+suffix;await api(`chrome.history.addUrl({url:${JSON.stringify(historyURL)}})`);assert((await api("chrome.history.search({text:'plico-history-qualification',maxResults:8})")).some(t=>t.url===historyURL),'fixture must be searchable before native selection');
 key('cmd+,17');native('text','plico-history-qualification');await sleep(350);key('125');key('36');await sleep(200);
 for(let i=0;i<100;i++){tabs=await api(`chrome.tabs.query({windowId:${wid}})`);if(tabs.find(t=>t.active)?.url===historyURL)break;await sleep(100);}
 assert.equal(tabs.length,3);assert.equal(tabs.find(t=>t.active).url,historyURL);passed.push('native composer selects matching history result');
 result={at:new Date().toISOString(),passed};
}finally{
 const failures=[];
 if(bookmark&&api)try{await api(`chrome.bookmarks.remove(${JSON.stringify(bookmark.id)})`);}catch(e){failures.push(e);}
 if(historyURL&&api)try{await api(`chrome.history.deleteUrl({url:${JSON.stringify(historyURL)}})`);}catch(e){failures.push(e);}
 if(wid&&api)try{await api(`chrome.windows.remove(${wid})`);}catch(e){failures.push(e);}
 b.close();if(failures.length)throw new AggregateError(failures,'Qualification cleanup failed');
}
fs.writeFileSync('.local/destinations-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
