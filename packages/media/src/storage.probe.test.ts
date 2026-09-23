import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createObjectStorage } from './storage.ts';

describe('filesystem storage probe', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('resolves when the directory exists and rejects when it does not', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tessera-storage-'));
    roots.push(root);
    const ready = createObjectStorage({ driver: 'fs', fsRoot: root });
    await expect(ready.probe()).resolves.toBeUndefined();

    const missing = createObjectStorage({ driver: 'fs', fsRoot: path.join(root, 'missing') });
    await expect(missing.probe()).rejects.toThrow();
  });
});
