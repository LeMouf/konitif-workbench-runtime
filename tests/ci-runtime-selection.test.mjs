import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const script = fileURLToPath(new URL('../scripts/select-ci-runtime.sh', import.meta.url)).replaceAll('\\', '/');
const unavailable = process.platform === 'win32' && !existsSync(bash);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'package-ci-runtime-')).replaceAll('\\', '/');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pathFile = join(root, 'github-path');
  writeFileSync(pathFile, '');
  return {
    add(version, npm = true) {
      const bin = `${root}/node/${version}/x64/bin`;
      mkdirSync(bin, { recursive: true });
      for (const [name, value] of [['node', `v${version}`], ...(npm ? [['npm', '11.6.0']] : [])]) {
        const path = `${bin}/${name}`;
        writeFileSync(path, `#!/usr/bin/env bash\nprintf '%s\\n' '${value}'\n`);
        chmodSync(path, 0o755);
      }
      return bin;
    },
    run() {
      return spawnSync(bash, [script], {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TOOL_CACHE: root, GITHUB_PATH: pathFile.replaceAll('\\', '/') }
      });
    },
    selected() { return readFileSync(pathFile, 'utf8').trim(); }
  };
}

test('CI selects the newest available Node 24 rather than a fixed patch', { skip: unavailable }, t => {
  const f = fixture(t);
  f.add('22.23.3');
  f.add('24.9.0');
  const newest = f.add('24.21.0');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.selected(), newest);
  assert.match(result.stdout, /Selected Node v24\.21\.0/);
});

test('CI skips a cached runtime without npm', { skip: unavailable }, t => {
  const f = fixture(t);
  const usable = f.add('24.19.0');
  f.add('24.21.0', false);
  assert.equal(f.run().status, 0);
  assert.equal(f.selected(), usable);
});

test('CI fails explicitly without silently using Node 22', { skip: unavailable }, t => {
  const f = fixture(t);
  f.add('22.23.3');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No usable Node 24 runtime/);
  assert.equal(f.selected(), '');
});
