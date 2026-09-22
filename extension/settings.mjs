export const defaults=Object.freeze({theme:'system',revealDelayMs:150,keys:Object.freeze({left:'h',down:'j',up:'k',right:'l',toggle:'b',new:'t',edit:';',copy:'c',back:'Backspace'})});
export function normalizeSettings(value){
 if(!value||!Number.isInteger(value.revealDelayMs)||value.revealDelayMs<0||value.revealDelayMs>2000)throw Error('Reveal delay must be a whole number from 0 to 2000 ms.');
 const keys={},used=new Set();
 for(const action of Object.keys(defaults.keys)){
  const key=value.keys?.[action];
  if(typeof key!=='string'||!(/^[a-z]$/.test(key)||(action==='edit'&&key===';')||(action==='back'&&key==='Backspace')))throw Error('Choose one lowercase letter. URL editing also accepts ;, and Back accepts Backspace.');
  if(/^[wm]$/.test(key))throw Error('W and M are reserved for closing and muting tabs.');
  if(action!=='copy'&&/^[acvxz]$/.test(key))throw Error('A, C, V, X and Z remain available for ordinary editing.');
  if(used.has(key))throw Error('Each action needs a different key.');used.add(key);keys[action]=key;
 }
 const theme=value.theme??'system';if(!['system','light','dark'].includes(theme))throw Error('Choose system, light or dark theme.');
 return {theme,revealDelayMs:value.revealDelayMs,keys};
}

// Preserve old custom settings when newly reserved candidate-action keys collide.
export function migrateSettings(value){
 if(!value||!value.keys)return normalizeSettings(value);
 const migrated={...value,keys:{...value.keys}};
 const used=new Set(Object.values(value.keys).filter(k=>k!=='w'&&k!=='m'));
 for(const action of Object.keys(defaults.keys))if(['w','m'].includes(migrated.keys[action])){
  const preferred=defaults.keys[action];
  const key=!used.has(preferred)?preferred:[...'bdefghijklno pqrstu y'.replaceAll(' ','')].find(k=>!used.has(k));
  migrated.keys[action]=key;used.add(key);
 }
 return normalizeSettings(migrated);
}
