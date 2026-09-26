export const defaultSlots=Object.freeze(Array.from({length:10},(_,i)=>i<9?Object.freeze({key:String(i+1),modifiers:1}):null));
export const defaults=Object.freeze({slots:defaultSlots,theme:'system',revealDelayMs:150,keys:Object.freeze({left:'h',down:'j',up:'k',right:'l',toggle:'b',new:'t',edit:';',copy:'c',back:'Backspace'})});
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
 const source=value.slots===undefined?defaultSlots:value.slots;
 if(!Array.isArray(source)||source.length!==10)throw Error('Configure exactly ten stack slots.');
 const chords=new Set();const slots=source.map(binding=>{
  if(binding===null)return null;
  if(!binding||typeof binding!=='object'||typeof binding.key!=='string'||!/^[0-9]$/.test(binding.key)||!Number.isInteger(binding.modifiers)||binding.modifiers<1||binding.modifiers>11||(binding.modifiers&~11))throw Error('Stack shortcuts need a digit and Command, Control or Option. Shift is reserved for sorting.');
  if(binding.key==='0'&&binding.modifiers===1)throw Error('Command+0 is reserved for Helium zoom reset.');
  const chord=binding.modifiers+':'+binding.key;if(chords.has(chord))throw Error('Each stack needs a different shortcut.');chords.add(chord);
  return {key:binding.key,modifiers:binding.modifiers};
 });
 return {theme,revealDelayMs:value.revealDelayMs,keys,slots};
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
