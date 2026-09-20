import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import { DEFAULT_DATABASE_URL } from './url.ts';

export { DEFAULT_DATABASE_URL };

export function createPrismaClient(connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type TesseraPrisma = ReturnType<typeof createPrismaClient>;
