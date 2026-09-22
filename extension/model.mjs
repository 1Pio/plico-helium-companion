export const VERSION = 1;
export function validateCommit(message, tabs) {
  const ids = tabs.map(t => t.id);
  const {loose, stacks, activate} = message;
  if (!Array.isArray(loose) || !Array.isArray(stacks) || stacks.length !== 10 || stacks.some(s => !Array.isArray(s))) throw Error('Invalid layout');
  const flat = [...loose, ...stacks.flat()];
  if (flat.some(id => !Number.isSafeInteger(id)) || new Set(flat).size !== flat.length || flat.length !== ids.length || flat.some(id => !ids.includes(id)) || !ids.includes(activate)) throw Error('Tab set changed; draft canceled');
  if (flat.length > 1000) throw Error('Too many tabs');
  return flat;
}
export function destination(text) {
  text = text.trim();
  if (!text || text.length > 8192) throw Error('Enter a destination');
  if (/^(https?:\/\/|file:\/\/|chrome:\/\/|helium:\/\/|about:)/i.test(text)) return {url:text};
  if (/^[\w.-]+(?::\d+)(?:\/\S*)?$/.test(text) || /^localhost(?:\/\S*)?$/.test(text)) return {url:'http://'+text};
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]\S*)?$/i.test(text)) return {url:'https://'+text};
  return {query:text};
}
