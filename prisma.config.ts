import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Next.js reads `.env.local` on its own; the Prisma CLI does not, so load it here too.
config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // The Prisma CLI (migrate / studio) needs a DIRECT, non-pooled connection. DATABASE_URL is
    // Neon's pooled runtime URL, which is unsuitable for migrations — so prefer DIRECT_URL and
    // fall back to DATABASE_URL where there is no separate pooler.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
