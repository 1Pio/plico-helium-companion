// Qualification utility. Connects only to the marked project test profile.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=path.join(root,'.local/helium-profile');
export async function browser(){
 if(!fs.existsSync(path.join(profile,'.plico-isolated')))throw Error('Unmarked profile');
 const [port,endpoint]=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split('\n');
 if(!/^\d+$/.test(port)||!endpoint.startsWith('/devtools/browser/'))throw Error('Invalid endpoint');
 return connect(`ws://127.0.0.1:${port}${endpoint}`);
}
async function connect(url){
 const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let next=0;const pending=new Map();
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Disconnected'));}pending.clear();};
 return {call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout'))},5000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});},close(){ws.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const client=await browser();try{
  if(process.argv[2]==='close')await client.call('Browser.close');
  else console.log(JSON.stringify(await client.call('Target.getTargets'),null,2));
 }finally{client.close();}
}
