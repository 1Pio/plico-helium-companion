import assert from 'node:assert/strict';import{browser}from'./cdp.mjs';import{verifyExtensionSource}from'./verify-extension-source.mjs';
const b=await browser();try{
 const worker=(await b.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));
 const{sessionId}=await b.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});await verifyExtensionSource(b,sessionId);
 const r=await b.call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const m=globalThis.__plicoQualification,sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const w=await chrome.windows.create({url:'https://example.com/#plico-back-parent',focused:true});
  try{
   const parent=w.tabs[0].id,child=await chrome.tabs.create({windowId:w.id,openerTabId:parent,url:'https://example.org/#plico-back-child',active:true});
   for(let i=0;i<20;i++){const t=await chrome.tabs.get(child.id);if(t.status==='complete')break;await sleep(100);}
   await sleep(100);
   const s=(await m.queue(m.snapshot)).state;
   if(s.window.id!==w.id||s.active!==child.id)throw Error('Fixture not focused');
   await m.queue(()=>m.handle({v:1,epoch:m.connectionEpoch(),request:crypto.randomUUID(),window:w.id,revision:s.revision,type:'back',tab:child.id}));
   const tabs=await chrome.tabs.query({windowId:w.id});if(tabs.length!==1||tabs[0].id!==parent||!tabs[0].active)throw Error('Opener return failed');
   return {passed:['actual empty-history child closure','same-window opener activation'],keyboardRoute:false};
  }finally{await chrome.windows.remove(w.id)}
 })()`},sessionId);
 assert(!r.exceptionDetails,r.exceptionDetails?.exception?.description);console.log(JSON.stringify(r.result.value,null,2));
}finally{b.close()}
