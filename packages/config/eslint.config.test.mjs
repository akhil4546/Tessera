import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ESLint } from 'eslint';

const root = path.resolve(import.meta.dirname, '../..');

const badHook = `import { useState } from 'react';

export function BadHook(): number {
  if (globalThis.Number.isFinite(1)) {
    const [value] = useState(0);
    return value;
  }
  return 0;
}
`;

const missingAlt = `export function MissingAlt() {
  return <img src="/tile.png" />;
}
`;

const decorativeAlt = `export function Decorative() {
  return <img src="/tile.png" alt="" />;
}
`;

function workspacePackages() {
  const found = [];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(path.join(root, group))) {
      const file = path.join(root, group, name, 'package.json');
      try {
        found.push(JSON.parse(readFileSync(file, 'utf8')));
      } catch {
        // not a workspace package
      }
    }
  }
  return found;
}

function ruleIds(results) {
  return results.flatMap((result) => result.messages.map((message) => message.ruleId));
}

function assertRule(results, ruleId) {
  const fatal = results.flatMap((result) =>
    result.messages.filter((message) => message.fatal).map((message) => message.message),
  );
  assert.deepEqual(fatal, [], fatal.join('\n'));
  assert.ok(
    ruleIds(results).includes(ruleId),
    `expected ${ruleId}, got ${ruleIds(results).filter(Boolean).join(', ') || '(no rules)'}`,
  );
}

function assertNoRule(results, ruleId) {
  const fatal = results.flatMap((result) =>
    result.messages.filter((message) => message.fatal).map((message) => message.message),
  );
  assert.deepEqual(fatal, [], fatal.join('\n'));
  assert.equal(ruleIds(results).includes(ruleId), false, `did not expect ${ruleId}`);
}

describe('eslint', { concurrency: false }, () => {
  /** @type {ESLint | undefined} */
  let eslint;

  it('points every workspace lint script at eslint with zero warnings', () => {
    const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.match(rootPkg.scripts.lint, /\beslint\b/);
    assert.match(rootPkg.scripts.lint, /--max-warnings 0/);
    for (const pkg of workspacePackages()) {
      assert.match(pkg.scripts.lint, /\beslint\b/, pkg.name);
      assert.match(pkg.scripts.lint, /--max-warnings 0/, pkg.name);
      assert.doesNotMatch(pkg.scripts.lint, /\becho\b/, pkg.name);
    }
  });

  it('rejects a package importing from apps', { timeout: 120_000 }, async () => {
    eslint ??= new ESLint({ cwd: root });
    const filePath = path.join(root, 'packages/config/eslint-fixtures/boundary.ts');
    const jsImport = await eslint.lintText(
      `import '../../../apps/mobile/metro.config.js';\nexport const boundary = true;\n`,
      { filePath },
    );
    assertRule(jsImport, 'import/no-restricted-paths');

    const tsImport = await eslint.lintText(`import '../../../apps/api/src/main.ts';\n`, {
      filePath,
    });
    assertRule(tsImport, 'import/no-restricted-paths');

    const allowed = await eslint.lintText(
      `import { z } from 'zod';\nexport const name = z.string();\n`,
      {
        filePath: path.join(root, 'apps/api/src/eslint-fixtures/uses-zod.ts'),
      },
    );
    assertNoRule(allowed, 'import/no-restricted-paths');
  });

  it('enforces hooks and jsx-a11y on web, admin, and ui', { timeout: 120_000 }, async () => {
    eslint ??= new ESLint({ cwd: root });
    for (const rel of [
      'apps/web/src/eslint-fixtures/hooks.tsx',
      'apps/admin/src/eslint-fixtures/hooks.tsx',
      'packages/ui/src/eslint-fixtures/hooks.tsx',
    ]) {
      const filePath = path.join(root, rel);
      assertRule(await eslint.lintText(badHook, { filePath }), 'react-hooks/rules-of-hooks');
      assertRule(await eslint.lintText(missingAlt, { filePath }), 'jsx-a11y/alt-text');
      assertNoRule(await eslint.lintText(decorativeAlt, { filePath }), 'jsx-a11y/alt-text');
    }

    const mobilePath = path.join(root, 'apps/mobile/src/eslint-fixtures/hooks.tsx');
    assertNoRule(
      await eslint.lintText(badHook, { filePath: mobilePath }),
      'react-hooks/rules-of-hooks',
    );
    assertNoRule(await eslint.lintText(missingAlt, { filePath: mobilePath }), 'jsx-a11y/alt-text');
  });

  it('reports a floating promise in the Nest API', { timeout: 180_000 }, async () => {
    eslint ??= new ESLint({ cwd: root });
    const dir = mkdtempSync(path.join(root, 'apps/api/src/lintfix-'));
    const filePath = path.join(dir, 'float.ts');
    writeFileSync(
      filePath,
      `export async function later(): Promise<void> {\n  await Promise.resolve();\n}\n\nexport function caller(): void {\n  later();\n}\n`,
    );
    try {
      assertRule(await eslint.lintFiles([filePath]), '@typescript-eslint/no-floating-promises');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
