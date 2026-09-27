import { verifyExtensionSource } from './verify-extension-source.mjs';
// Real extension API qualification, restricted by cdp.mjs to our marked profile.
// Does not establish native keyboard, rendering, or pointer acceptance.
import assert from 'node:assert/strict';
import { browser } from './cdp.mjs';
const b = await browser();
try {
  const { targetInfos } = await b.call('Target.getTargets');
  const worker = targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes('baedceamflgfanjingjiinnhmhfjopbk'),
  );
  assert(worker, 'Plico worker must be running');
  const { sessionId } = await b.call('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  await verifyExtensionSource(b, sessionId);
  const result = await b.call(
    'Runtime.evaluate',
    {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
 const m=globalThis.__plicoQualification;if(!m)throw Error('Launch with --qualify-bridge');
 const fixture=await chrome.windows.create({url:['https://example.com/','https://example.org/'],focused:true});
 const report=[];const check=(v,name)=>{if(!v)throw Error(name);report.push(name);};
 let initial;
 for(let i=0;i<15;i++){initial=await m.queue(()=>m.snapshot());if(initial.state.window.id===fixture.id&&initial.tabs.length===2&&initial.tabs.every(t=>['https://example.com/','https://example.org/'].includes(t.url)))break;await new Promise(r=>setTimeout(r,100));}
 if(initial.tabs.length!==2||initial.tabs.some(t=>!['https://example.com/','https://example.org/'].includes(t.url)||t.groupId!==-1))throw Error('Requires exactly two loose example fixture tabs');
 check(!!m.connectionEpoch(),'real extension connection epoch established');
 // Read the epoch from the same module instance as the real native connection.
 const epoch=m.connectionEpoch();
 const request=async(type,data={})=>{const {state}=await m.queue(()=>m.snapshot());await m.queue(()=>m.handle({v:1,epoch,request:crypto.randomUUID(),window:state.window.id,revision:state.revision,type,...data}));return (await m.queue(()=>m.snapshot())).state;};
 const ids=initial.tabs.map(t=>t.id),empty=()=>Array.from({length:10},()=>[]);
 let s=await request('commit',{activate:ids[1],loose:ids,stacks:empty()});check(s.active===ids[1],'selection commits to real tab');
 s=await request('commit',{activate:ids[1],loose:[ids[1],ids[0]],stacks:empty()});check(s.loose[0]===ids[1],'real loose-tab reorder');
 let stacks=empty();stacks[2]=[ids[1],ids[0]];
 s=await request('commit',{activate:ids[0],loose:[],stacks});check(s.stacks[2].join()===stacks[2].join(),'fixed third stack created');
 stacks[2]=[ids[1]];stacks[9]=[ids[0]];
 s=await request('commit',{activate:ids[1],loose:[],stacks});check(s.stacks[2].length===1&&s.stacks[9][0]===ids[0],'singleton and stack ten retained');
 const before=JSON.stringify(s.stacks);
 s=await request('commit',{revision:-1,activate:ids[0],loose:ids,stacks:empty()});check(JSON.stringify(s.stacks)===before,'stale real commit refused');
 s=await request('search',{query:'example'});check(s.tabs.length===2,'search allocates no browser tab');
 s=await request('commit',{activate:initial.state.active,loose:ids,stacks:empty()});check(s.loose.join()===ids.join(),'fixture arrangement restored');
 for(let i=0;i<40;i++){const q=await m.queue(m.snapshot);check(q.state.responseFor===null,'queue snapshot '+i+' remains bounded');}
 await chrome.windows.remove(fixture.id);
 return {passed:report.length,checks:report.filter(x=>!x.startsWith('queue snapshot')),boundedSnapshots:40};
})()`,
    },
    sessionId,
  );
  if (result.exceptionDetails)
    throw Error(
      result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails),
    );
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  b.close();
}
