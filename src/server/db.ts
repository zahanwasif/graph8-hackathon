import 'server-only';

import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Neon's serverless driver speaks Postgres over a WebSocket, and Node has no global
// `WebSocket` on every runtime we deploy to, so inject one.
neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

// The Neon driver only talks to a Neon WebSocket endpoint. A plain local Postgres
// (or any non-Neon host) can't answer that, so drive those over TCP with node-postgres.
function isNeonHost(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const adapter = isNeonHost(connectionString)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// One client per process. In dev, hot reload re-evaluates this module, so park the client on
// globalThis rather than opening a new pool on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Created lazily so a build without DATABASE_URL (e.g. a preview with no DB) still compiles. */
export function db(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
