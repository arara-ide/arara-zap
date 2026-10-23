import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateInstallation, newer, latestRelease, SOURCE } from '../src/update.mjs';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zap-update-')); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'arara-zap');
  await mkdir(join(directory, 'src'), { recursive: true });
  await writeFile(join(directory, 'src/index.js'), '// old');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'arara-zap', version: '0.1.0' }));
  await writeFile(join(directory, '.env'), 'ZAP_PASSWORD=private\n');
  const calls = [], reports = [];
  const options = { directory, dataDirectory: join(root, 'data'), locale: 'pt', signal: new AbortController().signal,
    fetchImpl: async () => new Response(JSON.stringify({ tag_name: 'v0.2.0', draft: false, prerelease: false })),
    report: message => reports.push(message),
    run: async (cmd, args, cwd) => {
      calls.push({ cmd, args, cwd });
      if (args[0] === 'get-url' || args[0] === 'remote' && args[1] === 'get-url') return SOURCE;
      if (args[0] === 'status') return '';
      if (args[0] === 'checkout') { await mkdir(join(cwd, 'src')); await writeFile(join(cwd, 'src/index.js'), '// new'); await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'arara-zap', version: '0.2.0' })); }
      return '';
    } };
  return { options, root, calls, reports };
}
test('semantic versions reject prereleases, injection and downgrades', () => {
  assert.ok(newer('v1.10.0', '1.9.9')); assert.ok(newer('0.2.0', '0.1.0'));
  for (const version of ['0.1.0', '0.0.9', 'v0.3.0-beta', 'v0.2.0;id', '01.2.0']) assert.equal(newer(version, '0.1.0'), false);
});
test('upgrades from official release after npm verification, preserves env and recoverable backup', async t => {
  const f = await fixture(t), result = await updateInstallation(f.options);
  assert.equal(result.updated, true); assert.equal(result.version, '0.2.0');
  assert.equal(await readFile(join(f.options.directory, '.env'), 'utf8'), 'ZAP_PASSWORD=private\n');
  assert.equal(await readFile(join(result.backup, 'src/index.js'), 'utf8'), '// old');
  assert.ok(f.calls.some(c => c.cmd === 'git' && c.args[0] === 'fetch' && c.args.includes('refs/tags/v0.2.0')));
  assert.ok(f.calls.some(c => c.cmd === 'npm' && c.args.includes('--ignore-scripts')));
  assert.equal((await readdir(f.root)).some(name => name.includes('update-') || name.endsWith('update-lock')), false);
});
test('same version and older release never run mutation commands', async t => {
  for (const tag of ['v0.1.0', 'v0.0.9']) {
    const f = await fixture(t); f.options.fetchImpl = async () => new Response(JSON.stringify({ tag_name: tag }));
    assert.equal((await updateInstallation(f.options)).reason, 'current'); assert.equal(f.calls.length, 0);
  }
});
test('404/no release, offline, API rate limit and malformed release preserve the current install', async t => {
  for (const fetchImpl of [async () => new Response('', { status: 404 }), async () => { throw Error('offline'); }, async () => new Response('', { status: 429 }), async () => new Response(JSON.stringify({ tag_name: '../../evil' }))]) {
    const f = await fixture(t); f.options.fetchImpl = fetchImpl;
    assert.equal((await updateInstallation(f.options)).updated, false);
    assert.equal(await readFile(join(f.options.directory, 'src/index.js'), 'utf8'), '// old'); assert.equal(f.calls.length, 0);
  }
});
test('dirty and nonofficial installations are never overwritten', async t => {
  for (const dirty of [true, false]) {
    const f = await fixture(t), run = f.options.run;
    f.options.run = async (...args) => args[1][0] === 'status' && dirty ? ' M src/index.js' : args[1][0] === 'remote' && !dirty ? 'https://example.com/other.git' : run(...args);
    assert.equal((await updateInstallation(f.options)).reason, 'dirty'); assert.equal(f.calls.some(c => c.cmd === 'npm'), false);
  }
});
test('dependency failure cleans staging and leaves installed source and env untouched', async t => {
  const f = await fixture(t), run = f.options.run;
  f.options.run = async (...args) => { if (args[0] === 'npm') throw Error('failed npm'); return run(...args); };
  await assert.rejects(updateInstallation(f.options), /instalação anterior/);
  assert.equal(await readFile(join(f.options.directory, 'src/index.js'), 'utf8'), '// old');
  assert.deepEqual(await readdir(f.root), ['arara-zap']);
});
test('release/package version mismatch is rejected before npm or directory replacement', async t => {
  const f = await fixture(t), run = f.options.run;
  f.options.run = async (...args) => { const result = await run(...args); if (args[1][0] === 'checkout') await writeFile(join(args[2], 'package.json'), JSON.stringify({ name: 'arara-zap', version: '9.0.0' })); return result; };
  await assert.rejects(updateInstallation(f.options)); assert.equal(f.calls.some(c => c.cmd === 'npm'), false);
});
test('failed directory swap rolls back the old installation', async t => {
  const f = await fixture(t); let swaps = 0;
  f.options.move = async (...args) => { if (++swaps === 2) throw Error('swap failed'); return rename(...args); };
  await assert.rejects(updateInstallation(f.options)); assert.equal(swaps, 3);
  assert.equal(await readFile(join(f.options.directory, 'src/index.js'), 'utf8'), '// old'); assert.deepEqual(await readdir(f.root), ['arara-zap']);
});
test('edits made while downloading abort the swap', async t => {
  const f = await fixture(t), run = f.options.run; let status = 0;
  f.options.run = async (...args) => args[1][0] === 'status' && ++status === 2 ? ' M src/index.js' : run(...args);
  await assert.rejects(updateInstallation(f.options)); assert.equal(await readFile(join(f.options.directory, 'src/index.js'), 'utf8'), '// old');
});
test('cancellation, live service and concurrent updater prevent replacement', async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(updateInstallation({ ...f.options, signal: controller.signal }));
  await mkdir(f.options.dataDirectory); await writeFile(join(f.options.dataDirectory, 'process.lock'), String(process.pid));
  await assert.rejects(updateInstallation(f.options), /execução/); assert.equal(f.calls.length, 0);
  await rm(f.options.dataDirectory, { recursive: true }); await writeFile(`${f.options.directory}.update-lock`, 'other');
  await assert.rejects(updateInstallation(f.options), /execução/);
});
test('Docker checks for new image and does not self-modify', async t => {
  const f = await fixture(t); assert.equal((await updateInstallation({ ...f.options, docker: true })).reason, 'docker'); assert.equal(f.calls.length, 0); assert.ok(f.reports.some(r => r.includes('Docker')));
});
test('API request uses fixed GitHub endpoint and disallows redirects', async () => {
  const signal = new AbortController().signal;
  await latestRelease({ signal, fetchImpl: async (url, options) => { assert.equal(url, 'https://api.github.com/repos/arara-ide/arara-zap/releases/latest'); assert.equal(options.redirect, 'error'); return new Response('', { status: 404 }); } });
});
test('real Git checkout and npm ci replace source, preserve env and start the newly installed entry point', async t => {
  const { runCommand } = await import('../src/update.mjs');
  const { copyFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'zap-real-update-')); t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, 'origin'), directory = join(root, 'installed'), signal = AbortSignal.timeout(30000);
  await mkdir(repository); await runCommand('git', ['init', '--initial-branch=main', '--template=', repository], root, signal);
  await mkdir(join(repository, 'src'));
  for (const name of ['run.js', 'i18n.mjs', 'update.mjs', 'process-lock.mjs']) await copyFile(new URL(`../src/${name}`, import.meta.url), join(repository, 'src', name));
  await mkdir(join(repository, 'src/locales'));
  for (const locale of ['en', 'pt', 'es']) await copyFile(new URL(`../src/locales/${locale}.json`, import.meta.url), join(repository, 'src/locales', `${locale}.json`));
  await writeFile(join(repository, '.gitignore'), '.env\nnode_modules/\n');
  const files = async version => {
    await writeFile(join(repository, 'package.json'), JSON.stringify({ name: 'arara-zap', version, type: 'module' }));
    await writeFile(join(repository, 'package-lock.json'), JSON.stringify({ name: 'arara-zap', version, lockfileVersion: 3, packages: { '': { name: 'arara-zap', version } } }));
    await writeFile(join(repository, 'src/index.js'), `console.log('loaded-${version}:' + process.env.ZAP_LANG);`);
    await runCommand('git', ['add', '.'], repository, signal);
    await runCommand('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', version], repository, signal);
  };
  await files('0.1.0'); await runCommand('git', ['clone', '--no-hardlinks', repository, directory], root, signal);
  await runCommand('git', ['remote', 'set-url', 'origin', SOURCE], directory, signal);
  await writeFile(join(directory, '.env'), 'ZAP_LANG=es\nZAP_SKIP_UPDATE=1\n');
  await files('0.2.0'); await runCommand('git', ['tag', 'v0.2.0'], repository, signal);
  const result = await updateInstallation({ directory, dataDirectory: join(root, 'data'), signal, fetchImpl: async () => new Response(JSON.stringify({ tag_name: 'v0.2.0' })), run: (cmd, args, cwd, cancel) => runCommand(cmd, cmd === 'git' && args[0] === 'fetch' ? args.map(v => v === 'origin' ? repository : v) : args, cwd, cancel) });
  assert.equal(result.updated, true);
  assert.equal(await runCommand('node', ['--env-file-if-exists=.env', 'src/run.js'], directory, signal), 'loaded-0.2.0:es');
  assert.equal(await readFile(join(result.backup, '.env'), 'utf8'), 'ZAP_LANG=es\nZAP_SKIP_UPDATE=1\n');
});
test('ignored local session files survive update without overwriting shipped source', async t => {
  const f = await fixture(t), run = f.options.run;
  await writeFile(join(f.options.directory, 'session.enc'), 'encrypted session', { mode: 0o600 });
  f.options.run = (...args) => args[1][0] === 'ls-files' ? Promise.resolve('session.enc\0') : run(...args);
  await updateInstallation(f.options); assert.equal(await readFile(join(f.options.directory, 'session.enc'), 'utf8'), 'encrypted session');
});
