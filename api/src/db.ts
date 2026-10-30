import { enableWal } from '@media-compress/db-kit'
import { PrismaClient } from '../generated/prisma'

// No datasource override: a bare PrismaClient resolves the relative
// `file:./prisma/dev.db` against the schema dir (→ prisma/prisma/dev.db),
// the same way the prisma CLI does — so CLI and runtime agree (avoids the
// cwd-vs-schema relative-path mismatch). Prod sets DATABASE_URL absolute.
export const prisma = new PrismaClient()

// Enable WAL + foreign keys for the SQLite file (see @media-compress/db-kit).
// Graceful shutdown (prisma.$disconnect) is handled by index.ts's own SIGTERM/
// SIGINT hook, not db-kit's gracefulShutdown (which would process.exit and race
// the worker drain).
export async function initDb(): Promise<void> {
  await enableWal(prisma)
}
