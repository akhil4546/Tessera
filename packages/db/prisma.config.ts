import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../.env') });
loadEnv({ path: path.resolve(here, '../../apps/api/.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx ../../scripts/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://tessera:tessera@localhost:5432/tessera',
  },
});
