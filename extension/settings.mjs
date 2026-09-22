export const defaults=Object.freeze({revealDelayMs:150,keys:Object.freeze({left:'h',down:'j',up:'k',right:'l',toggle:'b',new:'t',edit:';',copy:'c',back:'Backspace'})});
export function normalizeSettings(value){
 if(!value||!Number.isInteger(value.revealDelayMs)||value.revealDelayMs<0||value.revealDelayMs>2000)throw Error('Reveal delay must be a whole number from 0 to 2000 ms.');
 const keys={},used=new Set();
 for(const action of Object.keys(defaults.keys)){
  const key=value.keys?.[action];
  if(typeof key!=='string'||!(/^[a-z]$/.test(key)||(action==='edit'&&key===';')||(action==='back'&&key==='Backspace')))throw Error('Choose one lowercase letter. URL editing also accepts ;, and Back accepts Backspace.');
  if(action!=='copy'&&/^[acvxz]$/.test(key))throw Error('A, C, V, X and Z remain available for ordinary editing.');
  if(used.has(key))throw Error('Each action needs a different key.');used.add(key);keys[action]=key;
 }
 return {revealDelayMs:value.revealDelayMs,keys};
}
