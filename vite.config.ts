import { defineConfig } from 'vite'
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
        gazzle: true,
        broli: true,
        template: 'trememap',
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
    // Split large vendor libs into their own chunks so the landing bundle
    // doesn't pay for them on first paint and they can be cached independently.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id) return
          if (id.includes('node_modules')) {
            if (id.match(/[\\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/)) {
              return 'vendor-react'
            }
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-framer-motion'
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide'
            }
            if (id.includes('node_modules/@stellar')) {
              return 'vendor-stellar'
            }
            return 'vendor'
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
})
