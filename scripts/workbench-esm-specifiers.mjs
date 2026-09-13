import ts from 'typescript';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

// Adapt encodings only: resolve the original module, then retain its identity
// in emitted ESM and declarations. Never rewrite arbitrary string values.
export function rewriteEmittedSpecifiers(text, sourceFile, exists = existsSync) {
  const ast = ts.createSourceFile(sourceFile, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isStringLiteral(node) && node.text.startsWith('.')) {
      const p = node.parent;
      const isModule = ((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node)
        || (ts.isLiteralTypeNode(p) && ts.isImportTypeNode(p.parent))
        || (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword && p.arguments[0] === node);
      if (isModule) {
        const base = resolve(dirname(sourceFile), node.text);
        const target = [`${base}.ts`, `${base}/index.ts`].find(exists);
        if (target) {
          let specifier = relative(dirname(sourceFile), target).replaceAll('\\', '/').replace(/\.ts$/, '.js');
          if (!specifier.startsWith('.')) specifier = `./${specifier}`;
          edits.push({ start: node.getStart(ast), end: node.end, text: JSON.stringify(specifier) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}
