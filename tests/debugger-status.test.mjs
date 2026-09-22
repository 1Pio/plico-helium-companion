import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {debuggerStatus} from '../extension/debugger-status.mjs';
test('attachment metadata is limited to live page tabs with no control API calls',async()=>{
 let calls=0;const api={async getTargets(){calls++;return [{type:'page',tabId:1,attached:true},{type:'page',tabId:1,attached:true},{type:'page',tabId:2,attached:false},{type:'page',tabId:3,attached:true},{type:'service_worker',tabId:2,attached:true}]},attach(){assert.fail('observer must never attach')},detach(){assert.fail('observer must never detach')},sendCommand(){assert.fail('observer must never control')}};
 assert.deepEqual(await debuggerStatus(api,[{id:1},{id:2}]),{available:true,attached:[1]});assert.equal(calls,1);
});
test('failed query means unavailable, not a negative attachment claim',async()=>{
 assert.deepEqual(await debuggerStatus({getTargets:async()=>{throw Error('unavailable')}},[{id:1}]),{available:false,attached:[]});
});
test('product debugger usage remains observation only',()=>{
 const product=fs.readdirSync('extension').filter(n=>n.endsWith('.mjs')).map(n=>fs.readFileSync('extension/'+n,'utf8')).join('\n');
 assert(!/debugger\s*\.\s*(attach|detach|sendCommand)\s*\(/.test(product));
});
