import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { AnimatedBackground, Navbar, LiveTicker, Footer } from './components/layout'
import { GroqAssistant } from './components/ai'
import { useFreighterWallet, useSearch } from './hooks'
import { clearReceipts } from './lib/receipts'
import { Toaster } from 'sonner'

const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const DocsPage = lazy(() => import('./pages/DocsPage').then((m) => ({ default: m.DocsPage })))
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

type Page = 'search' | 'docs' | 'dashboard'

// The app is a SPA without a router: keep the current page in the URL hash so
// deep links like #docs work on load and browser back/forward keeps working
const getPageFromHash = (): Page => {
  const hash = window.location.hash.replace('#', '')
  return hash === 'docs' || hash === 'dashboard' ? (hash as Page) : 'search'
}

function PageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-6 animate-pulse">
      <div className="h-10 w-1/3 bg-white/10 rounded-xl" />
      <div className="h-48 w-full bg-white/5 rounded-2xl border border-white/5" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>(getPageFromHash)

  const navigate = (p: Page, anchor?: string) => {
    setPage(p)
    window.history.pushState(null, '', p === 'search' ? window.location.pathname : `#${p}`)
    if (anchor) {
      requestAnimationFrame(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
      })
    } else {
      window.scrollTo({ top: 0 })
    }
  }

  useEffect(() => {
    const onPopState = () => setPage(getPageFromHash())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const { wallet, transactions, txLoading, connect, disconnect, refresh } = useFreighterWallet()

  const { session, search, reset, retry } = useSearch(wallet.connected ? wallet.publicKey : null)

  const prefetchPage = (p: Page) => {
    if (p === 'search') import('./pages/SearchPage')
    if (p === 'docs') import('./pages/DocsPage')
    if (p === 'dashboard') import('./pages/DashboardPage')
  }

  const lastSearch = useMemo(
    () =>
      session.status === 'complete' && session.results.length
        ? { query: session.query, results: session.results }
        : null,
    [session.status, session.query, session.results],
  )

  // Disconnect must not leave account-specific data behind on a shared
  // machine. Reset the search session, then explicitly ask the user whether
  // to also clear the localStorage receipts (issue: disconnect leaves
  // receipts and session data behind).
  const handleDisconnect = () => {
    reset()
    disconnect()
    const shouldClear = window.confirm('Also clear stored payment receipts from this device?')
    if (shouldClear) {
      clearReceipts()
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen relative text-white">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AnimatedBackground />

        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar
            page={page}
            onNavigate={navigate}
            onPrefetch={prefetchPage}
            wallet={wallet}
            transactions={transactions}
            txLoading={txLoading}
            onConnect={connect}
            onDisconnect={handleDisconnect}
            onRefresh={refresh}
          />

          <LiveTicker walletConnected={wallet.connected} />

          <main id="main-content" className="flex-1" tabIndex={-1}>
            <Suspense fallback={<PageSkeleton />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={page}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {page === 'search' && (
                    <SearchPage
                      wallet={wallet}
                      onConnectWallet={connect}
                      session={session}
                      search={search}
                      reset={reset}
                      retry={retry}
                      onNavigateFundingGuide={() => navigate('docs', 'get-testnet-usdc')}
                    />
                  )}
                  {page === 'docs' && <DocsPage />}
                  {page === 'dashboard' && (
                    <DashboardPage
                      transactions={transactions}
                      txLoading={txLoading}
                      publicKey={wallet.publicKey}
                      usdcBalance={wallet.usdcBalance}
                      xlmBalance={wallet.xlmBalance}
                      onRefresh={refresh}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </main>

          <Footer />
        </div>

        <GroqAssistant lastSearch={lastSearch} />

        <div className="sr-only" aria-live="assertive" role="alert">
          {session.status === 'error' ? `Error: ${session.error}` : ''}
        </div>
        <div className="sr-only" aria-live="polite" role="status">
          {session.status === 'complete' && session.txHash
            ? `Payment settled: ${session.paidAmount || '0.001'} USDC`
            : ''}
        </div>

        <Toaster position="bottom-right" theme="dark" duration={4000} richColors />
      </div>
    </MotionConfig>
  )
}
