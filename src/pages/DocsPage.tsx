import { motion } from 'framer-motion'
import { CheckCircle2, Coins, Droplets, ExternalLink, GitBranch, Globe, KeyRound, Shield, Wallet, Zap, Code2, Server } from 'lucide-react'
import {
  IS_MAINNET, STELLAR_NETWORK, AMOUNT_USDC, STELLAR_EXPERT_URL, HORIZON_URL,
  USDC_ISSUER, USDC_ISSUER_TESTNET, USDC_CONTRACT, explorerAssetUrl, explorerContractUrl,
} from '../lib/stellar'
import { CopyableAddress } from '../components/ui'
import { FUNDING_URLS } from '../lib/funding'

const getSteps = () => [
  {
    num: '01', icon: Globe, color: '#00f5ff',
    title: 'Agent hits /search endpoint',
    desc:  'Any HTTP client sends GET /search?q=query. No API key needed — just a Stellar wallet with USDC.',
    code:  'GET /search?q=AI+agent+payments',
  },
  {
    num: '02', icon: Zap, color: '#ffb800',
    title: 'Server returns HTTP 402',
    desc:  'The @x402/express middleware responds with 402 Payment Required and a payment specification.',
    code:  `HTTP 402 · X-Payment-Required: {"amount":"10000","currency":"USDC","network":"${STELLAR_NETWORK}"}`,
  },
  {
    num: '03', icon: Shield, color: '#7dd3fc',
    title: 'Sign Soroban auth entry',
    desc:  'The x402 client signs a Soroban authorization entry via Freighter — no private key exposure.',
    code:  'signAuthEntry(authEntry) → X-Payment: <base64-sig>',
  },
  {
    num: '04', icon: Server, color: '#39ff14',
    title: 'Settle on Stellar + get results',
    desc:  `OpenZeppelin facilitator verifies the signature, settles ${AMOUNT_USDC} USDC on-chain, and the server returns search results.`,
    code:  'GET /search + X-Payment: <sig> → 200 OK + results',
  },
]

// Issue #94: all links verified live before publishing. Friendbot funds XLM
// only — testnet USDC comes from the Circle faucet, which requires the
// trustline to exist first, hence the strict step order.
const getFundingSteps = () => [
  {
    num: '01', icon: KeyRound, color: '#00f5ff',
    title: 'Create a testnet account',
    desc:  'Generate a keypair with the Freighter browser extension, or use Stellar Lab. Keep the secret key (S…) private — it never needs to leave your device.',
    links: [{ label: 'Stellar Lab — create account', href: FUNDING_URLS.fundXlm }],
    code:  'Keypair.random() → G… (public) / S… (secret)',
  },
  {
    num: '02', icon: Wallet, color: '#ffb800',
    title: 'Fund the account with testnet XLM',
    desc:  'A new account must hold the minimum balance before it can hold assets. Friendbot tops up your account with free testnet XLM in one click.',
    links: [{ label: 'Fund with testnet XLM (Friendbot)', href: FUNDING_URLS.fundXlm }],
    code:  'curl "https://friendbot.stellar.org?addr=G…"',
  },
  {
    num: '03', icon: Coins, color: '#7dd3fc',
    title: 'Add the USDC trustline',
    desc:  `Trust the USDC issuer ${USDC_ISSUER_TESTNET} so your account can hold USDC. Stellar Lab has a button for this on the fund page — or follow Circle's quickstart to submit it with the SDK.`,
    links: [
      { label: 'Stellar Lab — fund page (includes trustline button)', href: FUNDING_URLS.fundXlm },
      { label: 'Circle — USDC trustline quickstart', href: FUNDING_URLS.trustlineQuickstart },
      { label: 'Stellar Docs — how trustlines work', href: FUNDING_URLS.trustlineDocs },
    ],
    code:  `changeTrust({ asset: 'USDC:${USDC_ISSUER_TESTNET}' })`,
  },
  {
    num: '04', icon: Droplets, color: '#39ff14',
    title: 'Claim testnet USDC from the faucet',
    desc:  'Once the trustline exists, Circle\'s public faucet sends free testnet USDC straight to your address. That balance is what pays for searches.',
    links: [{ label: 'Circle testnet faucet', href: FUNDING_URLS.usdcFaucet }],
    code:  `USDC balance → pay ${AMOUNT_USDC} per /search query`,
  },
]

const getStack = () => [
  { label: 'Payment protocol', value: 'x402 (@x402/express + @x402/stellar)',              href: 'https://x402.org' },
  { label: 'Blockchain',       value: IS_MAINNET ? 'Stellar Mainnet' : 'Stellar Testnet',    href: 'https://developers.stellar.org' },
  { label: 'Smart contracts',  value: 'Soroban auth entry signing',                        href: 'https://developers.stellar.org/docs/smart-contracts' },
  { label: 'Facilitator',      value: 'OpenZeppelin x402 (channels.openzeppelin.com)',     href: 'https://docs.openzeppelin.com/relayer/1.4.x/guides/stellar-x402-facilitator-guide' },
  { label: 'Wallet',           value: 'Freighter (@stellar/freighter-api)',                href: 'https://freighter.app' },
  { label: 'Balances / tx',    value: 'Stellar Horizon REST API (live)',                   href: HORIZON_URL },
  { label: 'Search backend',   value: 'Serper.dev API',                                   href: 'https://serper.dev' },
  { label: 'AI assistant',     value: 'Groq (groq-sdk) · Llama 3.3 70B',                  href: 'https://console.groq.com' },
]

export function DocsPage() {
  const STEPS = getSteps()
  const STACK = getStack()
  const FUNDING_STEPS = getFundingSteps()
  const networkLabel = IS_MAINNET ? 'Mainnet' : 'Testnet'

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-16">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <span className="font-display text-xs text-neon-cyan/50 tracking-widest">DOCUMENTATION</span>
        <h1 className="font-display text-3xl sm:text-4xl text-white">HOW IT WORKS</h1>
        <p className="text-white/45 text-lg max-w-2xl leading-relaxed">
          StellarSearch is a pay-per-query search API for autonomous AI agents. It uses the real x402 protocol
          on Stellar — no mock data, no fake payments. Every search costs {AMOUNT_USDC} USDC settled on-chain.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          {[
            { label: 'x402 Docs',        href: 'https://developers.stellar.org/docs/build/agentic-payments/x402' },
            { label: 'GitHub Repo',      href: 'https://github.com/stellar/x402-stellar' },
            { label: 'Stellar glossary', href: 'https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-searchss/blob/main/docs/glossary.md' },
            { label: `${networkLabel} Explorer`, href: STELLAR_EXPERT_URL },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-display text-xs tracking-wider text-white/40 hover:text-neon-cyan transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {label} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </motion.div>

      {/* x402 payment flow */}
      <section className="space-y-5">
        <div>
          <span className="font-display text-xs text-neon-cyan/35 tracking-widest">THE x402 PROTOCOL</span>
          <h2 className="font-display text-2xl text-white mt-1">Payment flow</h2>
        </div>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex gap-5 rounded-xl p-5"
                style={{ background: 'rgba(6,13,20,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex-shrink-0 flex flex-col items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${step.color}15`, border: `1px solid ${step.color}30` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: step.color }} />
                  </div>
                  {i < STEPS.length - 1 && <div className="flex-1 w-px bg-white/5 min-h-4" />}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-display text-xs text-white/20">{step.num}</span>
                    <h3 className="font-display text-sm text-white">{step.title}</h3>
                  </div>
                  <p className="text-white/45 text-sm leading-relaxed mb-3">{step.desc}</p>
                  <div className="py-2 px-3 rounded-lg bg-black/30 border border-white/5">
                    <code className="font-mono text-xs break-all" style={{ color: 'rgba(0,245,255,0.6)' }}>
                      {step.code}
                    </code>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Get testnet USDC — funding guide (issue #94) */}
      <section id="get-testnet-usdc" className="space-y-5 scroll-mt-20">
        <div>
          <span className="font-display text-xs text-neon-cyan/35 tracking-widest">WALLET SETUP</span>
          <h2 className="font-display text-2xl text-white mt-1">Get testnet USDC</h2>
          <p className="text-white/45 text-sm max-w-2xl mt-2 leading-relaxed">
            Every search costs {AMOUNT_USDC} USDC. New wallets start at zero — these four steps take you from
            an empty account to one that can pay for searches. Complete them in order: the faucet only works
            after the trustline exists.
          </p>
        </div>
        <div className="space-y-3">
          {FUNDING_STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex gap-5 rounded-xl p-5"
                style={{ background: 'rgba(6,13,20,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex-shrink-0 flex flex-col items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${step.color}15`, border: `1px solid ${step.color}30` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: step.color }} />
                  </div>
                  {i < FUNDING_STEPS.length - 1 && <div className="flex-1 w-px bg-white/5 min-h-4" />}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-display text-xs text-white/20">{step.num}</span>
                    <h3 className="font-display text-sm text-white">{step.title}</h3>
                  </div>
                  <p className="text-white/45 text-sm leading-relaxed mb-3">{step.desc}</p>
                  <div className="space-y-1.5 mb-3">
                    {step.links.map(({ label, href }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-neon-cyan/70 hover:text-neon-cyan transition-colors w-fit"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        {label}
                      </a>
                    ))}
                  </div>
                  <div className="py-2 px-3 rounded-lg bg-black/30 border border-white/5">
                    <code className="font-mono text-xs break-all" style={{ color: 'rgba(0,245,255,0.6)' }}>
                      {step.code}
                    </code>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6"
          style={{ background: 'rgba(6,13,20,0.7)', border: '1px solid rgba(0,245,255,0.2)' }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.3)' }}
            >
              <CheckCircle2 className="w-5 h-5 text-neon-cyan" />
            </div>
            <div className="space-y-2 min-w-0">
              <h3 className="font-display text-sm text-neon-cyan">TRUST EXACTLY THIS ISSUER</h3>
              <p className="text-white/45 text-sm leading-relaxed">
                If you add a trustline to the wrong issuer, faucet USDC will never arrive. The testnet USDC
                issuer used by this app (and by the faucet) is:
              </p>
              <div className="py-2 px-3 rounded-lg bg-black/30 border border-white/5 overflow-x-auto">
                <code className="font-mono text-xs break-all" style={{ color: 'rgba(0,245,255,0.6)' }}>
                  USDC-{USDC_ISSUER_TESTNET}
                </code>
              </div>
              <a
                href={`https://stellar.expert/explorer/testnet/asset/USDC-${USDC_ISSUER_TESTNET}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-neon-cyan/70 hover:text-neon-cyan transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Verify the issuer on StellarExpert
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Real stack */}
      <section className="space-y-5">
        <div>
          <span className="font-display text-xs text-neon-cyan/35 tracking-widest">REAL STACK — NO MOCKS</span>
          <h2 className="font-display text-2xl text-white mt-1">Technology used</h2>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {STACK.map(({ label, value, href }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center justify-between py-3.5 px-5 group"
              style={{
                borderBottom: i < STACK.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                background: 'rgba(6,13,20,0.5)',
              }}
            >
              <span className="font-display text-white/25 tracking-wider w-44 flex-shrink-0 uppercase" style={{ fontSize: '10px' }}>
                {label}
              </span>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-white/55 hover:text-neon-cyan transition-colors"
              >
                {value}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </a>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Active network assets — verify the exact USDC before signing */}
      <section className="space-y-5">
        <div>
          <span className="font-display text-xs text-neon-cyan/35 tracking-widest">VERIFY WHAT YOU SPEND</span>
          <h2 className="font-display text-2xl text-white mt-1">Active {networkLabel.toLowerCase()} assets</h2>
          <p className="text-white/45 text-sm leading-relaxed max-w-2xl">
            Payments settle in USDC on Stellar {networkLabel.toLowerCase()}. Confirm the exact issuer and Soroban
            contract this deployment is configured with — copy them or open them on Stellar Expert before you sign.
          </p>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div
            className="py-3.5 px-5"
            style={{ background: 'rgba(6,13,20,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
          >
            <CopyableAddress
              label="USDC issuer"
              value={USDC_ISSUER}
              href={explorerAssetUrl('USDC', USDC_ISSUER)}
            />
          </div>
          <div className="py-3.5 px-5" style={{ background: 'rgba(6,13,20,0.5)' }}>
            <CopyableAddress
              label="USDC contract"
              value={USDC_CONTRACT}
              href={explorerContractUrl(USDC_CONTRACT)}
            />
          </div>
        </div>
      {/* Search privacy */}
      <section className="space-y-3" aria-labelledby="search-privacy-heading">
        <div>
          <span className="font-display text-xs text-neon-cyan/35 tracking-widest">LOCAL DATA</span>
          <h2 id="search-privacy-heading" className="font-display text-2xl text-white mt-1">Search history and privacy</h2>
        </div>
        <p className="text-white/45 text-sm leading-relaxed">
          Successful paid searches keep a local receipt in this browser, including the transaction hash, amount, time, and network. Search query text is not stored unless you opt in using the “Save search query text in this browser” control in the Dashboard. Turning the setting off removes query text from existing receipts; you can also clear all local receipts there. Receipts are kept only in this browser’s localStorage and are limited to the 50 most recent searches.
        </p>
      </section>

      {/* Hackathon note */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6"
        style={{ background: 'rgba(6,13,20,0.7)', border: '1px solid rgba(0,245,255,0.2)' }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.3)' }}
          >
            <GitBranch className="w-5 h-5 text-neon-cyan" />
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-sm text-neon-cyan">STELLAR HACKATHON 2026 · AGENTS ON STELLAR</h3>
            <p className="text-white/45 text-sm leading-relaxed">
              Built for the Agents on Stellar hackathon (March 30 – April 13, 2026). Addresses the explicit
              demand signal: pay-per-query web search instead of monthly subscriptions. Uses real x402 protocol,
              real Stellar testnet transactions, real search results, and real Groq AI — zero mock data.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {['x402 Protocol', 'Soroban Auth', 'USDC Micropayments', 'Freighter Wallet', 'Serper.dev', 'Groq AI', 'MCP Server'].map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full font-display"
                  style={{ background: 'rgba(0,245,255,0.08)', color: 'rgba(0,245,255,0.6)', border: '1px solid rgba(0,245,255,0.15)', fontSize: '10px' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
