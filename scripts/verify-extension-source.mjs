// Assert the code actually executing in the isolated worker, not fetched disk text.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function verifyExtensionSource(client, sessionId) {
  const scripts = [];
  const off = client.on('Debugger.scriptParsed', (p, s) => {
    if (s === sessionId) scripts.push(p);
  });
  try {
    await client.call('Debugger.enable', {}, sessionId);
    for (const name of [
      'background.mjs',
      'model.mjs',
      'window-memory.mjs',
      'back.mjs',
      'settings.mjs',
      'debugger-status.mjs',
      'group-slots.mjs',
    ]) {
      const script = scripts.find((s) => s.url.endsWith('/' + name));
      if (!script) throw Error('Worker has not loaded ' + name + '; reload the isolated extension');
      const { scriptSource } = await client.call(
        'Debugger.getScriptSource',
        { scriptId: script.scriptId },
        sessionId,
      );
      if (scriptSource !== fs.readFileSync(path.join(root, 'extension', name), 'utf8'))
        throw Error('Worker is running stale ' + name + '; reload the isolated extension');
    }
  } finally {
    off();
    await client.call('Debugger.disable', {}, sessionId);
  }
}
