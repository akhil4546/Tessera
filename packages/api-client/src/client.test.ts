import { describe, expect, it } from 'vitest';
import { createClient } from './client';

describe('createClient', () => {
  it('parses a healthy response', async () => {
    const client = createClient({
      baseUrl: 'http://tessera.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 'ok', service: 'tessera-api' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    });

    await expect(client.getHealth()).resolves.toEqual({
      status: 'ok',
      service: 'tessera-api',
    });
  });
});
