import { test, expect, type Page } from '@playwright/test'

/**
 * Freighter is a browser extension, so these tests stub its message protocol
 * instead of driving a real install. `@stellar/freighter-api` posts a
 * `FREIGHTER_EXTERNAL_MSG_REQUEST` window message and waits for a
 * `FREIGHTER_EXTERNAL_MSG_RESPONSE` with a matching `messagedId`.
 */

const REQUEST_SOURCE = 'FREIGHTER_EXTERNAL_MSG_REQUEST'
const RESPONSE_SOURCE = 'FREIGHTER_EXTERNAL_MSG_RESPONSE'

const TEST_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF2'
const TEST_NETWORK = 'TESTNET'
const TEST_PASSPHRASE = 'Test SDF Network ; September 2015'

type WalletMode = 'unavailable' | 'connected'

interface StubOptions {
  mode: WalletMode
  address: string
  network: string
  passphrase: string
}

async function stubFreighter(page: Page, mode: WalletMode = 'unavailable') {
  await page.addInitScript(
    (options: StubOptions) => {
      const { mode: walletMode, address, network, passphrase } = options
      const connected = walletMode === 'connected'
      const requests: string[] = []
      ;(window as unknown as { __freighterRequests: string[] }).__freighterRequests = requests

      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data
        if (!data || data.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return

        requests.push(data.type)

        const respond = (payload: Record<string, unknown>) => {
          window.postMessage(
            { source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: data.messageId, ...payload },
            window.location.origin,
          )
        }

        switch (data.type) {
          case 'REQUEST_CONNECTION_STATUS':
            respond({ isConnected: connected })
            break
          case 'REQUEST_PUBLIC_KEY':
            respond({ publicKey: connected ? address : '' })
            break
          case 'REQUEST_ACCESS':
            respond(
              connected
                ? { publicKey: address }
                : { publicKey: '', error: { code: -1, message: 'User declined access' } },
            )
            break
          case 'REQUEST_NETWORK':
            respond(
              connected
                ? { network, networkPassphrase: passphrase }
                : { network: '', networkPassphrase: '' },
            )
            break
          case 'REQUEST_NETWORK_DETAILS':
            respond(
              connected
                ? { network, networkUrl: '', networkPassphrase: passphrase, sorobanRpcUrl: '' }
                : { network: '', networkUrl: '', networkPassphrase: '', sorobanRpcUrl: '' },
            )
            break
          default:
            respond({})
        }
      })
    },
    { mode, address: TEST_ADDRESS, network: TEST_NETWORK, passphrase: TEST_PASSPHRASE } satisfies StubOptions,
  )
}

test.describe('StellarSearch', () => {
  test('loads the search page and prompts to connect a wallet', async ({ page }) => {
    await stubFreighter(page)
    await page.goto('/')

    await expect(page.locator('h1')).toContainText('SEARCH')
    await expect(page.getByLabel('Search query')).toBeVisible()
    await expect(page.getByText('Connect Freighter wallet to search')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /CONNECT FREIGHTER TO SEARCH/i }),
    ).toBeVisible()
  })

  test('navigates between the search, docs and dashboard pages', async ({ page }) => {
    await stubFreighter(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'HOW IT WORKS', exact: true }).click()
    await expect(page.locator('h1')).toHaveText('HOW IT WORKS')
    await expect(page.getByRole('heading', { name: 'Payment flow' })).toBeVisible()

    await page.getByRole('button', { name: 'DASHBOARD', exact: true }).click()
    await expect(page.locator('h1')).toHaveText('DASHBOARD')
    await expect(
      page.getByText('Connect your Freighter wallet to see live account data'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'SEARCH', exact: true }).click()
    await expect(page.locator('h1')).toContainText('SEARCH')
  })

  test('blocks a search without a wallet and prompts to connect', async ({ page }) => {
    await stubFreighter(page)
    await page.goto('/')

    const input = page.getByLabel('Search query')
    await input.fill('stellar blockchain')
    await page.getByRole('button', { name: /0\.001 USDC/ }).click()

    // The app must ask for a wallet instead of starting a paid search.
    await expect(page.getByText('Connect Freighter wallet to search')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /CONNECT FREIGHTER TO SEARCH/i }),
    ).toBeVisible()
    await expect(input).toHaveValue('stellar blockchain')
    await expect(page.getByText('NEW SEARCH')).toHaveCount(0)

    const requests = await page.evaluate(
      () => (window as unknown as { __freighterRequests: string[] }).__freighterRequests,
    )
    expect(requests).toContain('REQUEST_CONNECTION_STATUS')
  })

  test('connects with a stubbed wallet and surfaces the zero-balance prompt', async ({ page }) => {
    await page.route(/horizon-testnet\.stellar\.org/, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ status: 404, title: 'Resource Missing' }),
      }),
    )

    await stubFreighter(page, 'connected')
    await page.goto('/')

    const shortened = `${TEST_ADDRESS.slice(0, 6)}...${TEST_ADDRESS.slice(-4)}`
    await expect(page.getByText(shortened)).toBeVisible()
    await expect(page.getByText('You need testnet USDC to search.')).toBeVisible()
  })
})
