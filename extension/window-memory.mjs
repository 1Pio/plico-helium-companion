// Browser-owned local state. Durable anchors contain hashes and positions, not URLs.
const KEY='plicoNavigationMemoryV1',RESTORE=KEY+'Restore';
const validList=a=>Array.isArray(a)&&a.length<=1000&&a.every(Number.isSafeInteger);
const validLast=a=>Array.isArray(a)&&a.length===10&&a.every(x=>x===null||Number.isSafeInteger(x));
const empty=()=>({recent:[],last:Array(10).fill(null),owner:crypto.randomUUID()});
export class WindowMemory {
 constructor(storage){
  this.storage=storage;this.windows=new Map();this.records=[];this.timer=null;this.restoreWindows=null;this.claimed=new Set();this.pendingActivations=new Map();this.memberships=new Map();
  this.ready=Promise.all([storage?.session?.get(KEY),storage?.local?.get(KEY),storage?.session?.get(RESTORE)]).then(([session,local,restoreSession])=>{
   const entries=session?.[KEY];this.hadSession=entries!==undefined;
   if(entries&&typeof entries==='object')for(const [id,value] of Object.entries(entries))
    if(validList(value?.recent)&&validLast(value.last)){
     this.windows.set(Number(id),{recent:value.recent,last:value.last,active:value.active,owner:typeof value.owner==='string'?value.owner:crypto.randomUUID()});
     if(Array.isArray(value.memberships)&&value.memberships.length===10&&value.memberships.every(validList)&&value.memberships.flat().length<=1000)this.memberships.set(Number(id),value.memberships);
    }
   const records=local?.[KEY];
   if(Array.isArray(records))this.records=records.filter(r=>typeof r.signature==='string'&&/^[a-f0-9]{64}$/.test(r.signature)&&validList(r.recent)&&r.recent.every(x=>x>=0)&&validLast(r.last)&&r.last.every(x=>x===null||x>=0)).slice(-32).map(r=>({...r,owner:typeof r.owner==='string'?r.owner:crypto.randomUUID()}));
   this.restoreRecords=structuredClone(this.records);
   const restore=restoreSession?.[RESTORE];
   if(validList(restore?.windowIds)&&Array.isArray(restore.records)&&restore.records.length<=32&&Array.isArray(restore.claimed)&&restore.claimed.length<=32){
    const records=restore.records.filter(r=>typeof r.signature==='string'&&/^[a-f0-9]{64}$/.test(r.signature)&&typeof r.owner==='string'&&validList(r.recent)&&validLast(r.last));
    this.restoreWindows=new Set(restore.windowIds);this.restoreRecords=records;this.claimed=new Set(restore.claimed.filter(x=>typeof x==='string'));
   }
  }).catch(()=>{this.restoreRecords=[];});
 }
 async beginSession(windowIds){await this.ready;if(this.restoreWindows===null)this.restoreWindows=new Set(this.hadSession?[]:windowIds);}
 async activate(windowId,tabId){
  await this.ready;const memory=this.windows.get(windowId);
  if(memory){memory.recent=[tabId,...memory.recent.filter(id=>id!==tabId)].slice(0,1000);memory.active=tabId;const stacks=this.memberships.get(windowId);if(stacks)for(let i=0;i<10;i++)if(stacks[i].includes(tabId))memory.last[i]=tabId;this.schedule();}
  else {const prior=this.pendingActivations.get(windowId)||[];this.pendingActivations.set(windowId,[tabId,...prior.filter(id=>id!==tabId)].slice(0,1000));}
 }
 async interacted(windowId){await this.ready;this.restoreWindows?.delete(windowId);}
 async reconcile(windowId,tabs,stacks,active){
  await this.beginSession([windowId]);
  const ids=tabs.map(t=>t.id),positions=new Map(ids.map((id,index)=>[id,index]));
  const bytes=new TextEncoder().encode(JSON.stringify([tabs.map(t=>t.url||''),stacks.map(s=>s.map(id=>positions.get(id)))]));
  const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  let memory=this.windows.get(windowId)||empty();const previous=JSON.stringify(memory);
  if(this.restoreWindows.has(windowId)){
   const matches=(this.restoreRecords||[]).filter(r=>r.signature===signature);
   // Identical saved windows are ambiguous: retain independent fallback histories.
   if(matches.length===1&&!this.claimed.has(matches[0].owner)){
    const saved=matches[0];this.records=this.records.filter(r=>r.owner!==memory.owner);this.claimed.add(saved.owner);this.restoreWindows.delete(windowId);
    memory={owner:saved.owner,recent:saved.recent.map(i=>ids[i]).filter(x=>x!==undefined),last:saved.last.map(i=>i===null?null:ids[i]??null)};
   }
  }
  const pending=this.pendingActivations.get(windowId)||[];this.pendingActivations.delete(windowId);
  memory.recent=[...new Set([...pending,...memory.recent].filter(id=>positions.has(id)))];
  for(const id of ids)if(!memory.recent.includes(id))memory.recent.push(id);
  if(memory.active!==active){memory.recent=[active,...memory.recent.filter(id=>id!==active)];memory.active=active;}
  for(let s=0;s<10;s++){if(stacks[s].includes(active))memory.last[s]=active;if(!stacks[s].includes(memory.last[s]))memory.last[s]=stacks[s][0]??null;}
  this.memberships.set(windowId,stacks.map(s=>s.slice()));
  this.windows.set(windowId,memory);
  const record={owner:memory.owner,signature,recent:memory.recent.map(id=>positions.get(id)),last:memory.last.map(id=>id===null?null:positions.get(id)??null)};
  const same=this.records.find(r=>r.owner===memory.owner);
  if(JSON.stringify(same)!==JSON.stringify(record)||previous!==JSON.stringify(memory)){
   this.records=this.records.filter(r=>r.owner!==memory.owner);this.records.push(record);this.records=this.records.slice(-32);this.schedule();
  }
  return memory;
 }
 schedule(){if(this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{});},150);}
 async flush(){if(!this.storage)return;await Promise.all([this.storage.session?.set({[KEY]:Object.fromEntries([...this.windows].map(([id,m])=>[id,{...m,memberships:this.memberships.get(id)}])),[RESTORE]:{windowIds:[...(this.restoreWindows||[])],records:this.restoreRecords,claimed:[...this.claimed]}}),this.storage.local?.set({[KEY]:this.records})]);}
 async forget(windowId){await this.ready;const owner=this.windows.get(windowId)?.owner;if(owner){this.records=this.records.filter(r=>r.owner!==owner);this.restoreRecords=this.restoreRecords.filter(r=>r.owner!==owner);}this.windows.delete(windowId);this.memberships.delete(windowId);this.pendingActivations.delete(windowId);this.restoreWindows?.delete(windowId);this.schedule();}
}
