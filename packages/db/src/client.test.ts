import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL } from './url';

describe('DEFAULT_DATABASE_URL', () => {
  it('points at the Compose Postgres from Phase 0', () => {
    expect(DEFAULT_DATABASE_URL).toBe('postgresql://tessera:tessera@localhost:5432/tessera');
  });
});
