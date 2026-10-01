/**
 * funding.ts — Testnet funding constants shared by the ZeroBalanceBanner,
 * DocsPage and the funding guide in README.md. Keep URLs in sync with
 * the "Get testnet USDC" section in README.md.
 */

// Stellar Lab moved from laboratory.stellar.org to lab.stellar.org — this is
// the current URL for both account creation and funding (Friendbot XLM).
export const FUNDING_URLS = {
  fundXlm: 'https://lab.stellar.org/account/fund',
  usdcFaucet: 'https://faucet.circle.com',
  trustlineDocs:
    'https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts#trustlines',
  trustlineQuickstart:
    'https://developers.circle.com/stablecoins/quickstart-setup-usdc-trustline-stellar',
} as const
