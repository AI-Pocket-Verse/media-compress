import path from 'node:path'

import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4010),
  HOST: z.string().default('0.0.0.0'),

  // SQLite via Prisma. No default: a missing value means the env file wasn't
  // loaded (start via `pnpm dev` / `pnpm start`); fail fast instead of writing
  // to a phantom DB. Prod sets an absolute `file:` path.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — start via `pnpm dev` (.env.dev) or `pnpm start` (.env.prod)'),

  // All storage paths derive from BASE_DIR unless overridden individually.
  BASE_DIR: z.string().default('./data'),
  UPLOAD_DIR: z.string().optional(),
  OUTPUT_DIR: z.string().optional(),
  THUMBNAIL_DIR: z.string().optional(),
  CLEANER_LOG: z.string().optional(),

  // Worker
  WORKER_COUNT: z.coerce.number().int().min(1).default(1),

  // Limits — mirror original Python config defaults
  MAX_STORAGE_BYTES: z.coerce.number().default(5 * 1024 ** 3), // 5 GB
  MAX_AGE_DAYS: z.coerce.number().int().default(180),
  LRU_CLEANUP_BYTES: z.coerce.number().default(1024 ** 3), // 1 GB
  PROTECTION_DAYS: z.coerce.number().int().default(30),
  MAX_UPLOAD_BYTES: z.coerce.number().default(2 * 1024 ** 3), // 2 GB
  FFMPEG_TIMEOUT_MS: z.coerce.number().default(10 * 60 * 1000), // 10 min

  // FFmpeg binaries
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),

  // Optional SSO: the feishu-sso whoami endpoint. Unset or empty → local single-user mode.
  WHOAMI_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  // Same-origin reverse proxy → leave empty; for direct cross-origin browser access set explicit allowlist.
  CORS_ORIGINS: z.string().default(''),
})

const raw = Env.parse(process.env)

export const env = {
  ...raw,
  UPLOAD_DIR: raw.UPLOAD_DIR ?? path.join(raw.BASE_DIR, 'uploads'),
  OUTPUT_DIR: raw.OUTPUT_DIR ?? path.join(raw.BASE_DIR, 'outputs'),
  THUMBNAIL_DIR: raw.THUMBNAIL_DIR ?? path.join(raw.BASE_DIR, 'thumbnails'),
  CLEANER_LOG: raw.CLEANER_LOG ?? path.join(raw.BASE_DIR, 'cleaner.log'),
}
export type Env = typeof env
