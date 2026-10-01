import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
)

export default defineConfig({
  // `vitest.config.ts` fully replaces `vite.config.ts`, so the plugins and
  // defines the tests rely on must be repeated here.
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: { buffer: 'buffer' },
  },
  test: {
    // Server and API tests need the real Node environment; only the frontend
    // component tests need a DOM. `environmentMatchGlobs` keeps both in one
    // run so `npm test` is a single command (and a single CI signal).
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
      ['tests/**/*.test.tsx', 'jsdom'],
    ],
    // Vitest-only. Files written against `node:test` are excluded here and run
    // by the separate `npm run test:node` script, because Vitest reports them as
    // "No test suite found" rather than executing their assertions.
    //
    // tests/parity.test.ts is likewise excluded: it imports `server/app.ts`,
    // which does not exist, and CI invokes it directly via tsx.
    include: [
      'server/**/*.test.ts',
      'api/**/*.test.ts',
      'test/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'server/health.test.ts',
      'server/index.test.ts',
      'server/ratelimit.test.ts',
      'server/urlSummary.test.ts',
      'tests/parity.test.ts',
    ],
    // test/setup.ts pins the server env (fake keys, NODE_ENV) and
    // src/test/setup.ts registers jest-dom matchers plus RTL cleanup.
    setupFiles: ['./test/setup.ts', './src/test/setup.ts'],
    clearMocks: true,
    env: {
      // server/index.ts skips app.listen() for NODE_ENV 'production' and 'test',
      // so this keeps the port free while the app is imported by the tests.
      // 'test' rather than 'production' so React resolves its development build;
      // forcing 'production' breaks jsxDEV in every component test.
      NODE_ENV: 'test',
      // Small windows keep the integration tests fast. The per-route maxima are
      // set above the number of requests each suite makes, so a suite never
      // rate-limits itself into a false failure: server/chat.test.ts alone
      // issues four /ai/chat calls.
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_GLOBAL_MAX: '200',
      RATE_LIMIT_SEARCH_MAX: '50',
      RATE_LIMIT_IMAGES_MAX: '50',
      RATE_LIMIT_NEWS_MAX: '50',
      RATE_LIMIT_AI_CHAT_MAX: '50',
      RATE_LIMIT_HEALTH_MAX: '50',
    },
  },
})