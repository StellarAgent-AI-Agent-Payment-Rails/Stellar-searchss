/**
 * Visual regression tests for StellarSearch key pages.
 *
 * Strategy
 * --------
 * The UI relies heavily on gradients, glows and Framer Motion animations.
 * To keep snapshots stable we:
 *
 *  1. Set `reducedMotion: 'reduce'` in playwright.config.ts — this stops the
 *     CSS `animate-ticker` on LiveTicker and the Framer Motion page transitions.
 *
 *  2. Freeze time with `page.clock.install()` so Date-based values rendered by
 *     DashboardPage (formatTimeAgo, etc.) are deterministic.
 *
 *  3. Hide the canvas-based AnimatedBackground with `mask` — the canvas pixel
 *     output depends on `Math.random()` seeds and requestAnimationFrame timing,
 *     making it inherently non-deterministic even with reduced motion.
 *
 *  4. Mock the `/health` endpoint so StatsGrid shows fixed numbers instead of
 *     live server stats.
 *
 *  5. Capture full-page screenshots at 1280 × 800 (desktop) and 375 × 812
 *     (mobile) so layout regressions at both breakpoints are caught.
 *
 * Updating baselines
 * ------------------
 * When a visual change is intentional, run:
 *
 *   npm run test:visual:update
 *
 * Then commit the updated files in e2e/snapshots/.
 * See CONTRIBUTING.md → "Visual regression tests" for the full workflow.
 */

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed health response — keeps StatsGrid deterministic. */
const MOCK_HEALTH = {
  status: 'ok',
  network: 'stellar:testnet',
  pricePerQuery: '0.001 USDC',
  protocol: 'x402',
  facilitator: 'https://www.x402.org/facilitator',
  totalQueries: 1234,
  totalUsdcSettled: '1.2340',
  avgLatencyMs: 812,
  uptime: '2h',
  serperApiConfigured: true,
  groqApiConfigured: true,
  receivingAddressConfigured: true,
}

/** CSS selectors for elements that must be masked in every snapshot. */
const ALWAYS_MASK = [
  // Canvas particle / matrix animation — non-deterministic pixel output.
  'canvas',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Prepare a page for a stable snapshot:
 *  - Intercept /health so StatsGrid shows fixed numbers.
 *  - Freeze the clock so any formatted timestamps are deterministic.
 *  - Wait for fonts and images to finish loading.
 */
async function preparePage(page: Page) {
  // Freeze the clock at an arbitrary but fixed point in time.
  await page.clock.install({ time: new Date('2026-01-15T12:00:00.000Z') })

  // Stub /health before any navigation so the first XHR is already mocked.
  await page.route('**/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_HEALTH),
    }),
  )

  // Stub Horizon API calls made by useFreighterWallet (balance + tx history).
  // Return a minimal 404-like "account not found" response — the hook handles
  // this gracefully and shows "--" for balances, which is what we want.
  await page.route('**/horizon**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'https://stellar.org/horizon-errors/not_found' }),
    }),
  )
}

/**
 * Return a Playwright `mask` array for the locators that must be blacked out
 * in every snapshot, plus any caller-supplied extras.
 */
function buildMasks(page: Page, extras: string[] = []) {
  return [...ALWAYS_MASK, ...extras].map((sel) => page.locator(sel))
}

/**
 * Navigate to a hash-based page and wait until network is idle and the page
 * has settled (no pending XHR, no pending raf callbacks).
 */
async function goTo(page: Page, hash: '' | '#docs' | '#dashboard') {
  await page.goto(`/${hash}`)
  // Wait for in-flight XHR (e.g. StatsGrid polling /health) to settle.
  await page.waitForLoadState('networkidle')
  // Extra beat so CSS transitions triggered on mount finish.
  await page.waitForTimeout(300)
}

// ---------------------------------------------------------------------------
// Desktop snapshots (1280 × 800)
// ---------------------------------------------------------------------------

test.describe('desktop (1280 × 800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await preparePage(page)
  })

  test('search page — idle state', async ({ page }) => {
    await goTo(page, '')

    // The spinning icon in the hero section uses Framer Motion rotate. With
    // reducedMotion: 'reduce', Framer Motion skips animations but still renders
    // the element. Mask the icon wrapper so any sub-pixel position drift is
    // invisible to the snapshot comparison.
    const masks = buildMasks(page, [
      // Spinning icon container in SearchPage idle hero
      '.w-20.h-20',
    ])

    await expect(page).toHaveScreenshot('search-idle-desktop.png', {
      fullPage: true,
      mask: masks,
    })
  })

  test('docs page', async ({ page }) => {
    await goTo(page, '#docs')

    await expect(page).toHaveScreenshot('docs-desktop.png', {
      fullPage: true,
      mask: buildMasks(page),
    })
  })

  test('dashboard page — no wallet connected', async ({ page }) => {
    await goTo(page, '#dashboard')

    // Mask any "time ago" text that could change between runs even with a frozen
    // clock (e.g. if a component formats relative to Date.now() directly).
    const masks = buildMasks(page, [
      '[data-testid="tx-timestamp"]',
      '[data-testid="balance"]',
    ])

    await expect(page).toHaveScreenshot('dashboard-no-wallet-desktop.png', {
      fullPage: true,
      mask: masks,
    })
  })
})

// ---------------------------------------------------------------------------
// Mobile snapshots (375 × 812  — iPhone SE viewport)
// ---------------------------------------------------------------------------

test.describe('mobile (375 × 812)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await preparePage(page)
  })

  test('search page — idle state', async ({ page }) => {
    await goTo(page, '')

    await expect(page).toHaveScreenshot('search-idle-mobile.png', {
      fullPage: true,
      mask: buildMasks(page, ['.w-20.h-20']),
    })
  })

  test('docs page', async ({ page }) => {
    await goTo(page, '#docs')

    await expect(page).toHaveScreenshot('docs-mobile.png', {
      fullPage: true,
      mask: buildMasks(page),
    })
  })

  test('dashboard page — no wallet connected', async ({ page }) => {
    await goTo(page, '#dashboard')

    await expect(page).toHaveScreenshot('dashboard-no-wallet-mobile.png', {
      fullPage: true,
      mask: buildMasks(page, [
        '[data-testid="tx-timestamp"]',
        '[data-testid="balance"]',
      ]),
    })
  })
})

// ---------------------------------------------------------------------------
// Focused component snapshots
// ---------------------------------------------------------------------------

test.describe('components', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await preparePage(page)
  })

  test('navbar — disconnected wallet', async ({ page }) => {
    await goTo(page, '')

    const navbar = page.locator('nav').first()
    await expect(navbar).toHaveScreenshot('navbar-disconnected.png', {
      mask: buildMasks(page),
    })
  })

  test('live ticker — static content', async ({ page }) => {
    await goTo(page, '')

    // The ticker uses CSS `animate-ticker`. reducedMotion:reduce pauses it, so
    // the first copy of the items is always visible at position 0.
    const ticker = page.locator('[class*="animate-ticker"]').first()
    await expect(ticker).toHaveScreenshot('live-ticker.png', {
      mask: buildMasks(page),
    })
  })

  test('stats grid — mocked health data', async ({ page }) => {
    await goTo(page, '')

    // StatsGrid renders inside the SearchPage. Locate it by its data-testid if
    // present, or fall back to the first grid that contains stat cards.
    const statsGrid =
      (await page.locator('[data-testid="stats-grid"]').count()) > 0
        ? page.locator('[data-testid="stats-grid"]')
        : page.locator('.grid').first()

    await expect(statsGrid).toHaveScreenshot('stats-grid.png', {
      mask: buildMasks(page),
    })
  })

  test('footer', async ({ page }) => {
    await goTo(page, '')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(150)

    const footer = page.locator('footer').first()
    await expect(footer).toHaveScreenshot('footer.png', {
      mask: buildMasks(page),
    })
  })
})
