import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'api/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      // server/index.ts only calls app.listen() when NODE_ENV !== 'production',
      // so this keeps the port free while the app is imported by the tests.
      NODE_ENV: 'production',
      // Small windows/limits keep the integration tests fast.
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_GLOBAL_MAX: '20',
      RATE_LIMIT_SEARCH_MAX: '3',
      RATE_LIMIT_IMAGES_MAX: '2',
      RATE_LIMIT_NEWS_MAX: '3',
      RATE_LIMIT_AI_CHAT_MAX: '3',
      RATE_LIMIT_HEALTH_MAX: '3',
    },
  },
})
