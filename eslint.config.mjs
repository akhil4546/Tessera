import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const codeFiles = ['**/*.{js,mjs,cjs,ts,tsx}'];
const tsFiles = ['**/*.{ts,tsx,mts,cts}'];

// React Compiler rules ship inside eslint-plugin-react-hooks v7 recommended.
// Web, admin, and ui are the surfaces the improvement prompt names. Mobile is
// React Native, where jsx-a11y does not match the host widgets.
const reactSurfaces = ['apps/web', 'apps/admin', 'packages/ui'];

function reactSurface(basePath) {
  return {
    name: `react/${basePath}`,
    basePath,
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: '19.2' },
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // JSX event handlers may return a promise. React does not use that return value.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Visible label text is usually a next-intl call, which this rule cannot see as text.
      // A nested control is enough.
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 3 }],
    },
  };
}

function reactPromises(basePath) {
  return {
    name: `promises/${basePath}`,
    basePath,
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  };
}

export default tseslint.config(
  {
    name: 'ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'packages/db/src/generated/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/*.tsbuildinfo',
      '**/next-env.d.ts',
      '**/.tessera-storage/**',
      '**/.tessera-storage-test/**',
    ],
  },
  {
    name: 'javascript',
    files: codeFiles,
    extends: [js.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    name: 'typescript',
    files: tsFiles,
    extends: [tseslint.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    name: 'node-scripts',
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: 'service-worker',
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    name: 'package-boundaries',
    files: codeFiles,
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
        },
        node: {
          extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx'],
        },
      },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: './packages',
              from: './apps',
              message: 'packages/* must not import from apps/*',
            },
          ],
        },
      ],
    },
  },
  ...reactSurfaces.map(reactSurface),
  reactPromises('apps/mobile'),
  {
    name: 'nest-api',
    basePath: 'apps/api',
    files: ['**/*.ts'],
    rules: {
      // Nest returns promises to the framework. Dropping one fails the request quietly.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // These files are outside every package tsconfig include. Type-aware parsing
    // aborts on them; non-type rules still run.
    name: 'outside-typescript-project',
    files: [
      'scripts/**/*.ts',
      'apps/web/e2e/**/*.ts',
      '**/vitest.config.ts',
      '**/playwright.config.ts',
      '**/postcss.config.mjs',
      '**/metro.config.js',
      '**/babel.config.js',
      'packages/db/prisma.config.ts',
      'packages/ui/vitest.setup.ts',
      'packages/config/**/*.mjs',
      'eslint.config.mjs',
      '**/eslint-fixtures/**',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // supertest types response.body as any. These specs assert the payload with expect.
    name: 'supertest-bodies',
    files: ['**/*.int.spec.ts', '**/*.e2e.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    name: 'prettier',
    files: codeFiles,
    rules: eslintConfigPrettier.rules,
  },
);
