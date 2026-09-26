// Reload only the marked qualification profile's copied unpacked extension.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {browser} from './cdp.mjs';import {verifyExtensionSource} from './verify-extension-source.mjs';
if(process.env.PLICO_QUALIFICATION!=='1')throw Error('Requires explicit qualification profile');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(root,'.local/qualification-extension');
if(!fs.existsSync(path.join(root,'.local/helium-qualification-profile/.plico-isolated')))throw Error('Unmarked profile');
for(const name of fs.readdirSync(path.join(root,'extension')))if(name!=='manifest.json'&&fs.statSync(path.join(root,'extension',name)).isFile())fs.copyFileSync(path.join(root,'extension',name),path.join(folder,name));
// Keep the test-only worker entry while updating the rest of the manifest.
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));manifest.background.service_worker='qualification-worker.mjs';fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const client=await browser();let created;
try{
 const all=(await client.call('Target.getTargets')).targetInfos;
 const previous=all.find(t=>t.type==='service_worker'&&t.url.includes('baedceam'));if(!previous)throw Error('Qualification worker not running');
 const {sessionId}=await client.call('Target.attachToTarget',{targetId:previous.targetId,flatten:true});
 await client.call('Runtime.evaluate',{expression:'setTimeout(()=>chrome.runtime.reload(),50);true',returnByValue:true},sessionId);
 let worker;for(let i=0;i<20;i++){worker=(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes('baedceam')&&t.targetId!==previous.targetId);if(worker)break;await new Promise(r=>setTimeout(r,100));}
 if(!worker)throw Error('Reloaded worker did not start');
 const w=await client.call('Target.attachToTarget',{targetId:worker.targetId,flatten:true});let ready=false;for(let i=0;i<20;i++){const r=await client.call('Runtime.evaluate',{expression:'!!globalThis.__plicoQualification',returnByValue:true},w.sessionId);if(r.result.value){ready=true;break;}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Worker initialization incomplete');await verifyExtensionSource(client,w.sessionId);console.log('Current extension modules verified in the running isolated worker');
}finally{if(created)await client.call('Target.closeTarget',{targetId:created});client.close();}
