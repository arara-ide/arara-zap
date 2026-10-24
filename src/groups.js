import { readFile, rename, writeFile } from 'node:fs/promises';
import { GROUP_JID } from './security.js';

export async function groupStore(path) {
  let ids = [];
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (Array.isArray(value)) ids = value.filter(id => typeof id === 'string' && GROUP_JID.test(id)).slice(-50);
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const set = new Set(ids);
  return {
    has: id => set.has(id),
    list: () => [...set],
    async add(id) {
      if (!GROUP_JID.test(id) || set.has(id)) return;
      set.add(id);
      while (set.size > 50) set.delete(set.values().next().value);
      await writeFile(`${path}.tmp`, JSON.stringify([...set]), { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    },
  };
}
