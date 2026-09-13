import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('manifest is public, compiled and independent from workspace locators', () => {
  assert.equal(manifest.name, '@konitif/workbench-runtime');
  assert.equal(manifest.private, false);
  assert.equal(manifest.repository.url, 'git+https://github.com/LeMouf/konitif-workbench-runtime.git');
  assert.deepEqual(manifest.publishConfig, { access: 'public', registry: 'https://registry.npmjs.org/' });
  assert.deepEqual(manifest.dependencies, {
    '@konitif/workbench': '0.284.1',
    svelte: '^4.2.18',
  });
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const version of Object.values(manifest[field] ?? {})) {
      assert.doesNotMatch(version, /^(?:workspace:|file:|link:|\.\.?[\\/])/);
    }
  }
  assert.deepEqual(manifest.files, ['dist', 'LICENSE.md', 'README.md', 'package.json', 'reference']);
});

test('sources contain no application or partner namespace', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
  }
  walk(root);
  assert.equal(files.length, 29);
  const privateProductPattern = /@maxtronics\/|packages\/maxtronics-|behavior-studio|Behavior Studio|\bapps\/|\bnao(?:qi)?\b|aldebaran|softbank/i;
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), privateProductPattern, file);
  }
});
