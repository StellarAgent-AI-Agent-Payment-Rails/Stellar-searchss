import { defineConfig } from 'vitest/config'

export default defineConfig({
  // JSX is compiled by esbuild here rather than @vitejs/plugin-react. The
  // dev-runtime transform (`jsxDEV`) is unavailable in the vitest worker and
  // fails with "jsxDEV is not a function", so force the production runtime.
  esbuild: { jsx: 'automatic', jsxDev: false },
  test: {
    // Server/api suites run in Node. Only the DOM-rendering suites need jsdom,
    // and they are exactly the .tsx files under src/ and tests/.
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
      ['tests/**/*.test.tsx', 'jsdom'],
    ],
    include: [
      'server/**/*.test.{ts,tsx}',
      'api/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
    ],
    // These suites are written for node:test (`node --test`) rather than
    // vitest. Vitest cannot collect them — it reports "No test suite found"
    // and fails the whole run. They run via `npm run test:server`.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'server/health.test.ts',
      'server/ratelimit.test.ts',
      'server/urlSummary.test.ts',
    ],
    // Server tests need the stubbed API keys and NODE_ENV=production so
    // importing server/index.ts does not bind a port; component tests need
    // jest-dom matchers and automatic unmounting.
    setupFiles: ['./test/setup.ts', './src/test/setup.ts'],
    clearMocks: true,
    env: {
      // See test/setup.ts for why this must be 'test' and not 'production'.
      NODE_ENV: 'test',
    },
  },
})
