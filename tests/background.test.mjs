import {test} from 'node:test';import assert from 'node:assert/strict';
const event=()=>({listeners:[],addListener(f){this.listeners.push(f)},emit(...args){for(const f of this.listeners)f(...args)}});
const wait=()=>new Promise(r=>setImmediate(r));
async function settle(){for(let i=0;i<30;i++)await wait();}
async function harness({race=false}={}){
 let tabs=[{id:1,index:0,groupId:5,active:true,windowId:7,title:'One',url:'https://example.org/1'},{id:2,index:1,groupId:5,active:false,windowId:7,title:'Two',url:'https://example.org/2'}];
 let groups=[{id:5,title:'plico:1'}],moveCalls=0,messages=[];
 const port={onMessage:event(),onDisconnect:event(),postMessage(m){messages.push(m)},disconnect(){}};
 const api={
  runtime:{id:'test',onMessage:event(),onInstalled:event(),onStartup:event(),connectNative(){return port}},
  windows:{async getAll(){return [{id:7,focused:true,left:0,top:0,width:1000,height:700}]},onFocusChanged:event(),onBoundsChanged:event()},
  tabs:{async query(q){return structuredClone(tabs.filter(t=>t.windowId===q.windowId))},async ungroup(ids){for(const t of tabs)if(ids.includes(t.id))t.groupId=-1;if(race)tabs[1].windowId=8;},async move(ids,{windowId}){moveCalls++;tabs=ids.map((id,index)=>({...tabs.find(t=>t.id===id),index,windowId}));},async group({tabIds}){let id=groups.length+10;for(const t of tabs)if(tabIds.includes(t.id))t.groupId=id;groups.push({id,title:''});return id;},async update(id,props){for(const t of tabs)if(props.active)t.active=t.id===id;return tabs.find(t=>t.id===id);}},
  tabGroups:{async query(){return structuredClone(groups)},async update(id,props){Object.assign(groups.find(g=>g.id===id),props);},onCreated:event(),onUpdated:event(),onRemoved:event()},
  history:{async search(){return []}},bookmarks:{async search(){return []}},search:{async query(){}}
 };
 for(const k of ['onActivated','onCreated','onRemoved','onMoved','onAttached','onDetached','onUpdated'])api.tabs[k]=event();
 globalThis.chrome=api;
 await import('../extension/background.mjs?test='+crypto.randomUUID());
 api.runtime.onInstalled.emit();await settle();
 return {port,messages,get tabs(){return tabs},get moveCalls(){return moveCalls}};
}
test('actual bridge commits only exact live tab sets and acknowledges',async()=>{
 const h=await harness();const s=h.messages.find(m=>m.type==='snapshot');
 h.port.onMessage.emit({v:1,epoch:s.epoch,request:'commit-1',window:7,revision:s.revision,type:'commit',activate:2,loose:[2,1],stacks:Array.from({length:10},()=>[])});await settle();
 assert.equal(h.moveCalls,1);assert.deepEqual(h.tabs.map(t=>t.id),[2,1]);assert.equal(h.tabs.find(t=>t.active).id,2);assert(h.messages.some(m=>m.type==='ack'&&m.request==='commit-1'));
 h.port.onMessage.emit({v:1,epoch:s.epoch,request:'commit-1',window:7,type:'commit'});await settle();assert.equal(h.moveCalls,1);
});
test('external cross-window movement during ungroup aborts without pulling tab back',async()=>{
 const h=await harness({race:true});const s=h.messages.find(m=>m.type==='snapshot');
 h.port.onMessage.emit({v:1,epoch:s.epoch,request:'race',window:7,revision:s.revision,type:'commit',activate:2,loose:[2,1],stacks:Array.from({length:10},()=>[])});await settle();
 assert.equal(h.moveCalls,0);assert.equal(h.tabs.find(t=>t.id===2).windowId,8);assert(h.messages.some(m=>m.type==='error'&&m.request==='race'));
});
test('stale revision cannot mutate tabs',async()=>{
 const h=await harness();const s=h.messages.find(m=>m.type==='snapshot');
 h.port.onMessage.emit({v:1,epoch:s.epoch,request:'stale',window:7,revision:s.revision-1,type:'commit',activate:2,loose:[2,1],stacks:Array.from({length:10},()=>[])});await settle();
 assert.equal(h.moveCalls,0);assert(h.messages.some(m=>m.type==='error'&&m.request==='stale'));
});
