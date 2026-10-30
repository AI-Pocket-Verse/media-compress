import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // env.ts validates process.env at module load; supply the minimum so any
    // service module under test can be imported without a real .env file.
    env: { NODE_ENV: 'development', DATABASE_URL: 'file:./test.db' },
  },
})
