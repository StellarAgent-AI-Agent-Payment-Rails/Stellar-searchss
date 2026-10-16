import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

const analyze = process.env.ANALYZE === '1'

// Read version from package.json at build time so the frontend bundle always
// reflects the version without an extra runtime fetch.
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
)

export default defineConfig({
  plugins: [
    react(),
    analyze &&
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
  ],
  // Required for @stellar/stellar-sdk and @stellar/freighter-api in browser
  define: {
    global: 'globalThis',
    // Exposed as __APP_VERSION__ in all frontend source files.
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      // Some Stellar SDK internals use 'buffer'
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    rollupOptions: {
      // Treat actionable Rollup warnings as hard errors so CI catches broken
      // imports, missing assets, and circular dependencies before deployment.
      onwarn(warning, defaultHandler) {
        const fatalCodes = [
          'UNRESOLVED_IMPORT',   // missing module — would break at runtime
          'MISSING_EXPORT',      // exported name doesn't exist in the source
          'INVALID_ANNOTATION',  // malformed /*#__PURE__*/ comment
        ]
        if (fatalCodes.includes(warning.code ?? '')) {
          throw new Error(`Build warning treated as error [${warning.code}]: ${warning.message}`)
        }
        defaultHandler(warning)
      },
      output: {
        manualChunks(id) {
          if (!id) return
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts'
          }
          if (id.includes('node_modules/@stellar')) {
            return 'vendor-stellar'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer-motion'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to backend during dev (avoids CORS)
      '/search': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ai': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
})
