import { paymentMiddlewareFromConfig } from '@x402/express'
import { ExactStellarScheme } from '@x402/stellar/exact/server'
import { HTTPFacilitatorClient, type RoutesConfig } from '@x402/core/server'
import { AMOUNT_STROOPS, STELLAR_NETWORK, USDC_CONTRACT } from '../shared/constants.js'

export function createPaymentMiddleware(descriptions: Record<string, string>) {
  const network = STELLAR_NETWORK as 'stellar:testnet' | 'stellar:mainnet'
  const routes: RoutesConfig = Object.fromEntries(
    Object.entries(descriptions).map(([route, description]) => [route, {
      accepts: [{
        scheme: 'exact',
        price: { amount: AMOUNT_STROOPS, asset: USDC_CONTRACT },
        network,
        payTo: process.env.STELLAR_RECEIVING_ADDRESS!,
        maxTimeoutSeconds: 300,
      }],
      description,
      mimeType: 'application/json',
    }]),
  )
  return paymentMiddlewareFromConfig(
    routes,
    new HTTPFacilitatorClient({
      url: process.env.FACILITATOR_URL || 'https://www.x402.org/facilitator',
    }),
    [{ network, server: new ExactStellarScheme() }],
  )
}
