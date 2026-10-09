import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.join(process.cwd(), 'src/app/dashboard');
function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}
// Deliberate global-only entry points; new pages/actions require a scope by default.
const globalPages = new Set(['projects/page.tsx', 'on-page/page.tsx']);
const globalActions = new Set(['actions.ts', 'projects/actions.ts']);
const entries = filesUnder(root).filter(file => /\/(page\.tsx|actions\.ts)$/.test(file));
const hasModifier = (node: ts.FunctionDeclaration, kind: ts.SyntaxKind) => node.modifiers?.some(m => m.kind === kind);

describe('project scope entry-point coverage', () => {
  for (const file of entries) {
    const relative = path.relative(root, file);
    if (globalPages.has(relative) || globalActions.has(relative)) continue;
    it(`${relative} establishes a scope before doing work`, () => {
      const text = fs.readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      expect(text).not.toMatch(/\bgetActiveProject\b/);
      if (file.endsWith('/page.tsx')) {
        const exported = source.statements.find(ts.isExportAssignment);
        expect(exported).toBeDefined();
        const expression = exported!.expression;
        expect(ts.isCallExpression(expression)).toBe(true);
        if (!ts.isCallExpression(expression)) return;
        expect(expression.expression.getText(source)).toBe('withProjectScope');
        expect(expression.arguments).toHaveLength(1);
        // Wrapping must invoke the page inside the scope, not pass its already-started promise.
        expect(ts.isIdentifier(expression.arguments[0])).toBe(true);
      } else {
        const actions = source.statements.filter(ts.isFunctionDeclaration)
          .filter(node => hasModifier(node, ts.SyntaxKind.ExportKeyword));
        expect(actions.length).toBeGreaterThan(0);
        for (const action of actions) {
          expect(hasModifier(action, ts.SyntaxKind.AsyncKeyword)).toBe(true);
          expect(action.body?.statements).toHaveLength(1);
          const first = action.body!.statements[0];
          expect(ts.isReturnStatement(first)).toBe(true);
          if (!ts.isReturnStatement(first) || !first.expression) continue;
          expect(ts.isCallExpression(first.expression)).toBe(true);
          if (!ts.isCallExpression(first.expression)) continue;
          expect(first.expression.expression.getText(source)).toBe('runWithCurrentProject');
          expect(ts.isArrowFunction(first.expression.arguments[0])).toBe(true);
        }
      }
    });
  }
});
