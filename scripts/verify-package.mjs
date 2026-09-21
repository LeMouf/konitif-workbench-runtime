import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCompiledPackageFiles } from './compiled-package-files.mjs';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const evidence = mkdtempSync(join(tmpdir(), 'konitif-workbench-runtime-package-'));
const cache = join(evidence, 'npm-cache');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

assert.equal(manifest.name, '@konitif/workbench-runtime');
assert.equal(manifest.version, '0.284.4');
assert.equal(manifest.private, false);
assert.deepEqual(manifest.dependencies, {
  '@konitif/workbench': '0.285.2',
  svelte: '^4.2.18',
});

const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, npm_config_offline: 'true', npm_config_cache: cache },
});

const packArgs = ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', evidence];
let output;
if (process.platform === 'win32') {
  const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  assert.ok(existsSync(npmCli), `Installed npm CLI required at ${npmCli}`);
  output = run(process.execPath, [npmCli, ...packArgs]);
} else {
  output = run('npm', packArgs);
}

const [packed] = JSON.parse(output);
const files = packed.files.map(file => file.path).sort();
assert.deepEqual(checkCompiledPackageFiles(files), { unexpected: [], missing: [] });
assert.equal(files.length, 64);

const archive = join(evidence, packed.filename);
const bytes = readFileSync(archive);
assert.equal(packed.integrity, `sha512-${createHash('sha512').update(bytes).digest('base64')}`);

const consumer = join(evidence, 'consumer');
const packageRoot = join(consumer, 'node_modules', '@konitif', 'workbench-runtime');
mkdirSync(packageRoot, { recursive: true });
run('tar', ['-xzf', archive, '-C', packageRoot, '--strip-components=1']);

const privateProductPattern = /@maxtronics\/|maxtronics|behavior-studio|Behavior Studio|\bnao(?:qi)?\b|aldebaran|softbank/i;
for (const file of files) {
  const source = readFileSync(join(packageRoot, file), 'utf8');
  assert.doesNotMatch(source, privateProductPattern, `Private product reference in archive: ${file}`);
}

for (const name of Object.keys(manifest.dependencies)) {
  const source = realpathSync(join(root, 'node_modules', name));
  const target = join(consumer, 'node_modules', name);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, 'junction');
}

cpSync(join(root, 'tests', 'consumer.mts'), join(consumer, 'consumer.mts'));
run(process.execPath, [
  join(root, 'node_modules/typescript/bin/tsc'),
  '--noEmit',
  '--strict',
  '--target',
  'ES2022',
  '--module',
  'NodeNext',
  '--moduleResolution',
  'NodeNext',
  'consumer.mts',
], consumer);

run(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { get } from 'svelte/store';
  import { createWorkspace } from '@konitif/workbench/workspace-contracts';
  import { createWorkbenchStore } from '@konitif/workbench-runtime';
  import { createWorkbenchStoreRuntime } from '@konitif/workbench-runtime/runtime';
  import { createCoherentWorkbenchStore } from '@konitif/workbench-runtime/runtime';
  assert.equal(typeof createWorkbenchStore, 'function');
  assert.equal(typeof createCoherentWorkbenchStore, 'function');
  const workspace = createWorkspace();
  let saves = 0;
  let unsubscribes = 0;
  const runtime = createWorkbenchStoreRuntime({
    initialToolId: 'missing',
    persistenceKey: 'archive-proof',
    hostEvents: null,
    detachedWindows: null,
    toolCatalog: { getDefinition: () => undefined },
    shellWidgetCatalog: { getDefinition: () => undefined },
    workspacePersistence: { load: () => workspace, save: () => { saves += 1; } },
    shellPersistence: { load: fallback => fallback, save() {}, serialize: JSON.stringify, normalize: (_, fallback) => fallback },
    focusPersistence: { load: (_, fallback) => fallback, save() {}, serialize: JSON.stringify, normalize: (_, __, fallback) => fallback },
    workspaceSync: {
      publish() {},
      subscribe: () => () => { unsubscribes += 1; },
      dispose() { throw new Error('A supplied shared provider must not be disposed'); },
    },
  });
  assert.deepEqual(get(runtime.workspaceStore).workspace, workspace);
  runtime.flushPersistence();
  assert.equal(saves, 1);
  runtime.dispose();
  runtime.dispose();
  assert.equal(unsubscribes, 1);
`], consumer);

console.log(JSON.stringify({
  status: 'passed',
  name: manifest.name,
  version: manifest.version,
  integrity: packed.integrity,
  sha1: createHash('sha1').update(bytes).digest('hex'),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  files: files.length,
  exports: Object.keys(manifest.exports),
  dependencies: manifest.dependencies,
  consumer: 'isolated native ESM, NodeNext declarations, persistence and idempotent disposal',
  evidence,
  archive,
}, null, 2));
