export function checkCompiledPackageFiles(files) {
  const required = [
    'package.json',
    'LICENSE.md',
    'README.md',
    'reference/README.md',
    'reference/catalog.json',
    'reference/diagrams.json',
  ];
  const unexpected = files.filter(file => !required.includes(file)
    && !/^dist\/(?!.*(?:^|\/)\.\.\/).+\.(?:js|d\.ts)$/.test(file));
  const missing = required.filter(file => !files.includes(file));
  if (!files.some(file => file.startsWith('dist/') && file.endsWith('.js'))) missing.push('dist JavaScript');
  if (!files.some(file => file.startsWith('dist/') && file.endsWith('.d.ts'))) missing.push('dist declarations');
  return { unexpected, missing };
}
