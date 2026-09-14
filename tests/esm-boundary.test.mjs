import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

test('every emitted relative specifier targets explicit JavaScript', () => {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) files.push(path);
    }
  }
  walk(root);
  assert.equal(files.length, 54);
  for (const file of files) {
    for (const imported of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
      if (!imported.fileName.startsWith('.')) continue;
      assert.ok(imported.fileName.endsWith('.js'), `${file}: ${imported.fileName}`);
      assert.ok(existsSync(resolve(dirname(file), imported.fileName)), `${file}: ${imported.fileName}`);
    }
  }
});
