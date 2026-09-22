import assert from'node:assert/strict';import fs from'node:fs';import{browser}from'./cdp.mjs';
const b=await browser();let target,sessionId,previous;
try{
 target=(await b.call('Target.createTarget',{url:'chrome-extension://baedceamflgfanjingjiinnhmhfjopbk/options.html'})).targetId;
 ({sessionId}=await b.call('Target.attachToTarget',{targetId:target,flatten:true}));
 const evaluate=async expression=>{const r=await b.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 for(let i=0;i<30;i++){if(await evaluate("!!document.querySelector('#toggle')"))break;await new Promise(r=>setTimeout(r,50));}
 previous=await evaluate("chrome.storage.local.get('plicoSettings')");
 await evaluate("document.querySelector('#theme').value='dark';document.querySelector('#delay').value='300';document.querySelector('#toggle').value='o';document.querySelector('#settings').requestSubmit()");
 await new Promise(r=>setTimeout(r,150));const stored=await evaluate("chrome.storage.local.get('plicoSettings')");assert.equal(stored.plicoSettings.theme,'dark');assert.equal(stored.plicoSettings.revealDelayMs,300);assert.equal(stored.plicoSettings.keys.toggle,'o');assert.equal(await evaluate("document.querySelector('#status').textContent"),'Saved.');
 await evaluate("document.querySelector('#toggle').value='h';document.querySelector('#settings').requestSubmit()");await new Promise(r=>setTimeout(r,50));assert.match(await evaluate("document.querySelector('#status').textContent"),/different key/);assert.deepEqual(await evaluate("chrome.storage.local.get('plicoSettings')"),stored);
 await evaluate("document.querySelector('#reset').click();document.querySelector('#settings').requestSubmit()");await new Promise(r=>setTimeout(r,100));assert.equal((await evaluate("chrome.storage.local.get('plicoSettings')")).plicoSettings.revealDelayMs,150);
 const capture=await b.call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync('.local/settings.png',Buffer.from(capture.data,'base64'));
 console.log(JSON.stringify({passed:['actual settings form saves theme, delay and shortcut','conflicting update preserves prior settings','defaults reset through form'],nativeApplicationPending:true},null,2));
}finally{
 if(previous&&sessionId)await b.call('Runtime.evaluate',{expression:Object.hasOwn(previous,'plicoSettings')?`chrome.storage.local.set(${JSON.stringify(previous)})`:"chrome.storage.local.remove('plicoSettings')",awaitPromise:true},sessionId).catch(()=>{});
 if(target)await b.call('Target.closeTarget',{targetId:target});b.close();
}
