import ts from 'typescript';
import { defineConfig, type Plugin } from 'vitest/config';

// Vitest's default transformer drops `emitDecoratorMetadata`, so Nest constructs
// services with undefined dependencies. Compile API sources with tsc first.
function emitDecoratorMetadata(): Plugin {
  return {
    name: 'emit-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      const filename = id.split('?')[0] ?? id;
      if (filename.includes('node_modules')) return null;
      if (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) return null;
      const result = ts.transpileModule(code, {
        fileName: filename,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          sourceMap: true,
        },
      });
      return { code: result.outputText, map: result.sourceMapText };
    },
  };
}

export default defineConfig({
  plugins: [emitDecoratorMetadata()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    fileParallelism: false,
    setupFiles: ['src/test/env.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
