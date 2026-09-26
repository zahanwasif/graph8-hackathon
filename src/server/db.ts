import 'server-only';

import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Neon's serverless driver speaks Postgres over a WebSocket, and Node has no global
// `WebSocket` on every runtime we deploy to, so inject one.
neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

// One client per process. In dev, hot reload re-evaluates this module, so park the client on
// globalThis rather than opening a new pool on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Created lazily so a build without DATABASE_URL (e.g. a preview with no DB) still compiles. */
export function db(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
