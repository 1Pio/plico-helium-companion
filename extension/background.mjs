import {VERSION,validateCommit,destination} from './model.mjs';
const icons=new Map(),iconPending=new Set();
function requestIcons(tabs){
 if(!chrome.runtime.getURL)return;
 for(const t of tabs.slice(0,128)){
  if(!t.url||iconPending.has(t.url))continue;
  if(icons.has(t.url)){send({type:'icon',url:t.url,data:icons.get(t.url)});continue;}
  iconPending.add(t.url);
  const url=new URL(chrome.runtime.getURL('/_favicon/'));url.searchParams.set('pageUrl',t.url);url.searchParams.set('size','32');
  fetch(url,{signal:AbortSignal.timeout(3000)}).then(r=>r.arrayBuffer()).then(buffer=>{if(buffer.byteLength>32768)return;const data=btoa(String.fromCharCode(...new Uint8Array(buffer)));if(icons.size>=128)icons.delete(icons.keys().next().value);icons.set(t.url,data);send({type:'icon',url:t.url,data});}).catch(()=>{}).finally(()=>iconPending.delete(t.url));
 }
}
const HOST='cc.helwig.plico.companion', PREFIX='plico:';
let snapshotTimer=null,lastIconFingerprint='';
let port=null, epoch='', revision=0, fingerprint='', chain=Promise.resolve(), recent=[], last=Array(10).fill(null), lastWindow=null, status='Disconnected', seen=new Set();
function send(data){port?.postMessage({v:VERSION,epoch,...data});}
function scheduleSnapshot(){if(!port||snapshotTimer)return;snapshotTimer=setTimeout(()=>{snapshotTimer=null;queue(snapshot);},25);}
function queue(fn){chain=chain.then(fn).catch(e=>{status=e.message;console.warn(e);});return chain;}
async function snapshot(responseFor=null){
 const wins=await chrome.windows.getAll({windowTypes:['normal']});
 const win=wins.find(w=>w.focused)||wins.find(w=>w.id===lastWindow)||wins[0];
 if(!win){send({type:'inactive'});return null;}
 lastWindow=win.id;
 const tabs=await chrome.tabs.query({windowId:win.id});
 const groups=await chrome.tabGroups.query({windowId:win.id});
 const slots=new Map(groups.filter(g=>/^plico:(?:[1-9]|10)$/.test(g.title)).map(g=>[g.id,Number(g.title.slice(PREFIX.length))-1]));
 const loose=[],stacks=Array.from({length:10},()=>[]);
 for(const t of tabs)(slots.has(t.groupId)?stacks[slots.get(t.groupId)]:loose).push(t.id);
 const active=tabs.find(t=>t.active)?.id;
 const fp=JSON.stringify([win.id,active,tabs.map(t=>[t.id,t.index,t.groupId]),groups.map(g=>[g.id,g.title])]);
 if(fp!==fingerprint){revision++;fingerprint=fp;}
 recent=recent.filter(id=>tabs.some(t=>t.id===id));
 for(const t of tabs)if(!recent.includes(t.id))recent.push(t.id);
 for(let s=0;s<10;s++){if(stacks[s].includes(active))last[s]=active;if(!stacks[s].includes(last[s]))last[s]=stacks[s][0]??null;}
 const iconFingerprint=JSON.stringify(tabs.map(t=>[t.id,t.url,t.favIconUrl]));
 const state={type:'snapshot',responseFor,revision,window:{id:win.id,focused:win.focused,left:win.left,top:win.top,width:win.width,height:win.height},active,loose,stacks,last,recent,tabs:tabs.map(t=>({id:t.id,title:t.title||'Untitled',url:t.url||'',audible:!!t.audible,discarded:!!t.discarded,pinned:!!t.pinned,groupId:t.groupId}))};
 send(state);if(iconFingerprint!==lastIconFingerprint){lastIconFingerprint=iconFingerprint;requestIcons(tabs);}return {state,tabs,groups};
}
async function handle(m){
 if(!m||m.v!==VERSION||m.epoch!==epoch||typeof m.request!=='string'||m.request.length>80||seen.has(m.request))return;
 seen.add(m.request);if(seen.size>256)seen.delete(seen.values().next().value);
 try{
  const current=await snapshot();if(!current)throw Error('No browser window');
  if(m.window!==current.state.window.id)throw Error('Window changed');
  if(m.type==='commit'){
   if(m.revision!==current.state.revision)throw Error('Browser changed; draft canceled');
   const order=validateCommit(m,current.tabs);
   let expected=current.tabs.map(t=>({id:t.id,groupId:t.groupId,active:t.active}));
   async function verify(){
    if(!port||m.epoch!==epoch)throw Error('Disconnected; remaining operations canceled');
    const actual=await chrome.tabs.query({windowId:m.window});
    if(JSON.stringify(actual.map(t=>({id:t.id,groupId:t.groupId,active:t.active})))!==JSON.stringify(expected))throw Error('Tabs changed during commit; remaining operations canceled');
   }
   const wantedChanged=JSON.stringify([m.loose,m.stacks])!==JSON.stringify([current.state.loose,current.state.stacks]);
   if(wantedChanged){
    if(current.tabs.some(t=>t.pinned))throw Error('Unpin tabs before rearranging this window');
    if(current.groups.some(g=>!/^plico:(?:[1-9]|10)$/.test(g.title)))throw Error('This window contains non-Plico groups; arrangement preserved');
    const grouped=current.tabs.filter(t=>t.groupId!==-1).map(t=>t.id);
    await verify();
    if(grouped.length){await chrome.tabs.ungroup(grouped);expected=expected.map(t=>({...t,groupId:-1}));}
    await verify();
    await chrome.tabs.move(order,{windowId:m.window,index:0});
    expected=order.map(id=>expected.find(t=>t.id===id));
    for(let s=0;s<10;s++)if(m.stacks[s].length){
     await verify();
     const id=await chrome.tabs.group({tabIds:m.stacks[s],createProperties:{windowId:m.window}});
     expected=expected.map(t=>m.stacks[s].includes(t.id)?{...t,groupId:id}:t);
     await verify();
     await chrome.tabGroups.update(id,{title:PREFIX+(s+1),color:'grey',collapsed:true});
    }
   }
   await verify();
   await chrome.tabs.update(m.activate,{active:true});
  }else if(m.type==='search'){
   if(typeof m.query!=='string'||m.query.length>8192)throw Error('Invalid query');
   const [history,bookmarks]=m.query.trim()?await Promise.all([chrome.history.search({text:m.query,maxResults:8}),chrome.bookmarks.search(m.query)]):[[],[]];
   const q=m.query.toLowerCase();
   const rows=current.state.tabs.filter(t=>(t.title+' '+t.url).toLowerCase().includes(q)).slice(0,12).map(t=>({kind:'tab',id:t.id,title:t.title,url:t.url,location:current.state.stacks.some(s=>s.includes(t.id))?'Stack '+(current.state.stacks.findIndex(s=>s.includes(t.id))+1):'Loose'}));
   rows.push(...history.filter(t=>t.url).map(t=>({kind:'url',title:t.title||t.url,url:t.url,location:'History'})),...bookmarks.filter(t=>t.url).slice(0,8).map(t=>({kind:'url',title:t.title||t.url,url:t.url,location:'Bookmark'})));
   send({type:'results',request:m.request,query:m.query,rows});
  }else if(m.type==='open'){
   if(m.tab!=null){if(!current.tabs.some(t=>t.id===m.tab))throw Error('Tab closed');await chrome.tabs.update(m.tab,{active:true});}
   else {
    const d=destination(m.text??'');
    if(m.edit){if(!current.tabs.some(t=>t.id===m.edit))throw Error('Tab closed');if(d.url)await chrome.tabs.update(m.edit,{url:d.url});else await chrome.search.query({text:d.query,tabId:m.edit});}
    else if(d.url)await chrome.tabs.create({windowId:m.window,url:d.url});
    else {const t=await chrome.tabs.create({windowId:m.window,url:'about:blank'});await chrome.search.query({text:d.query,tabId:t.id});}
   }
  }else if(m.type==='back'){
   const t=current.tabs.find(t=>t.id===current.state.active);
   try{await chrome.tabs.goBack(t.id);}catch(e){if(t.openerTabId&&current.tabs.some(x=>x.id===t.openerTabId)){await chrome.tabs.update(t.openerTabId,{active:true});await chrome.tabs.remove(t.id);}else throw e;}
  }else if(m.type!=='refresh')throw Error('Unknown request');
  send({type:'ack',request:m.request});await snapshot(m.request);
 }catch(e){send({type:'error',request:m.request,message:e.message});await snapshot(m.request);}
}
async function connect(){
 if(port)return;
 epoch=crypto.randomUUID();revision=0;fingerprint='';lastIconFingerprint='';seen.clear();
 port=chrome.runtime.connectNative(HOST);status='Connecting';
 port.onMessage.addListener(m=>queue(()=>handle(m)));
 port.onDisconnect.addListener(()=>{status=chrome.runtime.lastError?.message||'Disconnected';port=null;});
 status='Connected';await snapshot();
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(s.id!==chrome.runtime.id)return;
 if(m.type==='connect')queue(connect).then(()=>reply({status}));
 else if(m.type==='disconnect'){port?.disconnect();port=null;status='Disconnected';reply({status});}
 else if(m.type==='status')reply({status,connected:!!port});
 else return;
 return true;
});
chrome.tabs.onActivated.addListener(({tabId})=>{recent=[tabId,...recent.filter(id=>id!==tabId)];scheduleSnapshot();});
for(const event of [chrome.tabs.onCreated,chrome.tabs.onRemoved,chrome.tabs.onMoved,chrome.tabs.onAttached,chrome.tabs.onDetached,chrome.tabs.onUpdated,chrome.tabGroups.onCreated,chrome.tabGroups.onUpdated,chrome.tabGroups.onRemoved,chrome.windows.onFocusChanged,chrome.windows.onBoundsChanged])event.addListener(scheduleSnapshot);
chrome.runtime.onInstalled.addListener(()=>queue(connect));
chrome.runtime.onStartup.addListener(()=>queue(connect));
