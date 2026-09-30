import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'api/**/*.test.ts', 'src/lib/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      // server/index.ts only calls app.listen() when NODE_ENV !== 'production',
      // so this keeps the port free while the app is imported by the tests.
      NODE_ENV: 'production',
    },
  },
})
