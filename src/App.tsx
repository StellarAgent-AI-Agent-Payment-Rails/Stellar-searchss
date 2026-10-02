import { useState, useEffect, useMemo }         from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { AnimatedBackground, Navbar, LiveTicker, Footer } from './components/layout'
import { GroqAssistant }                       from './components/ai'
import { SearchPage, DocsPage, DashboardPage } from './pages'
import { useFreighterWallet, useSearch }       from './hooks'
import { Toaster }                             from 'sonner'

type Page = 'search' | 'docs' | 'dashboard'

// The app is a SPA without a router: keep the current page in the URL hash so
// deep links like #docs work on load and browser back/forward keeps working
// (issue #94 links users here from the zero-balance banner).
const getPageFromHash = (): Page => {
  const hash = window.location.hash.replace('#', '')
  return hash === 'docs' || hash === 'dashboard' ? (hash as Page) : 'search'
}

export default function App() {
  const [page, setPage] = useState<Page>(getPageFromHash)

  const navigate = (p: Page, anchor?: string) => {
    setPage(p)
    window.history.pushState(null, '', p === 'search' ? window.location.pathname : `#${p}`)
    if (anchor) {
      // Wait for the new page to mount, then scroll to the section anchor.
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

  const {
    wallet, transactions, txLoading,
    connect, disconnect, refresh,
  } = useFreighterWallet()

  // Lifted so the floating GroqAssistant can read the last completed search
  // and pre-populate context (issue #57).
  const { session, search, reset, retry } = useSearch(
    wallet.connected ? wallet.publicKey : null
  )

  const lastSearch = useMemo(
    () => session.status === 'complete' && session.results.length
      ? { query: session.query, results: session.results }
      : null,
    [session.status, session.query, session.results],
  )

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen relative text-white">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {/* Canvas particle / matrix background */}
      <AnimatedBackground />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Top navigation bar */}
        <Navbar
          page={page}
          onNavigate={navigate}
          wallet={wallet}
          transactions={transactions}
          txLoading={txLoading}
          onConnect={connect}
          onDisconnect={disconnect}
          onRefresh={refresh}
        />

        {/* Scrolling stats ticker */}
        <LiveTicker walletConnected={wallet.connected} />

        {/* Page content */}
        <main id="main-content" className="flex-1" tabIndex={-1}>
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
        </main>

        {/* Footer */}
        <Footer />
      </div>

      {/* Floating Groq AI assistant */}
      <GroqAssistant lastSearch={lastSearch} />

      {/* Accessible Live Regions for persistent state so toast isn't the only surface */}
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
