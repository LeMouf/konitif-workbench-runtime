import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { rewriteEmittedSpecifiers } from './workbench-esm-specifiers.mjs';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = join(root, 'src');
const outputRoot = join(root, 'dist');
const entries = ['index.ts', 'runtime.ts'];
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, '@konitif/workbench-runtime');
assert.equal(manifest.private, false);
assert.deepEqual(Object.keys(manifest.exports), ['.', './runtime']);

const program = ts.createProgram(entries.map(file => join(sourceRoot, file)), {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  declaration: true,
  types: [],
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
});
const files = new Map();
const emitted = program.emit(undefined, (file, content) => {
  const emittedRelativePath = relative(sourceRoot, file);
  assert.ok(
    emittedRelativePath !== '..' &&
      !emittedRelativePath.startsWith('../') &&
      !emittedRelativePath.startsWith('..\\') &&
      !isAbsolute(emittedRelativePath),
    `Package escape: ${file}`
  );
  files.set(emittedRelativePath.replaceAll('\\', '/'),
    rewriteEmittedSpecifiers(content, file.replace(/(?:\.d)?\.ts$|\.js$/, '.ts')));
});
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics].map(diagnostic => ({
  file: diagnostic.file?.fileName,
  code: diagnostic.code,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
}));
assert.deepEqual(diagnostics, []);
assert.equal(emitted.emitSkipped, false);

for (const [file, content] of files) {
  for (const imported of ts.preProcessFile(content).importedFiles) {
    if (!imported.fileName.startsWith('.')) continue;
    assert.ok(imported.fileName.endsWith('.js'), `${file}: ${imported.fileName}`);
    const target = relative(outputRoot, resolve(outputRoot, dirname(file), imported.fileName)).replaceAll('\\', '/');
    assert.ok(files.has(target), `Missing emitted target: ${target}`);
  }
}

rmSync(outputRoot, { recursive: true, force: true });
const hashes = [];
for (const [file, content] of [...files].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
  const target = join(outputRoot, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  hashes.push({ file: `dist/${file}`, sha256: createHash('sha256').update(content).digest('hex') });
}
const report = {
  status: 'built',
  compiler: ts.version,
  sourceEntries: entries,
  files: files.size,
  contentDigest: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
};
console.log(JSON.stringify(report, null, 2));
