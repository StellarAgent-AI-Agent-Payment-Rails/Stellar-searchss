# Stellar and x402 glossary

This glossary defines the terms used by StellarSearch's payment flow and contributor documentation.

## Payments and x402

| Term | Meaning |
|---|---|
| **x402** | An HTTP payment protocol. A server can return `402 Payment Required` with payment requirements; a client then pays and retries the request with proof of payment. |
| **HTTP 402** | The HTTP status used by x402 to say that a resource requires payment. The response includes the amount, asset, network, recipient, and payment scheme needed by a client. |
| **Payment requirements** | The structured details a server returns for an unpaid request, including the network, asset, amount, recipient, and timeout. |
| **Scheme** | The method used to construct and verify a payment. StellarSearch uses the `exact` scheme, where the client pays the stated amount to the stated recipient. |
| **Facilitator** | A service used by the server to verify a payment and submit its settlement to Stellar. It lets an application accept x402 payments without operating its own payment-verification service. |
| **Settlement** | The point at which a payment is submitted and recorded on the selected Stellar network. Verification checks whether the payment is valid; settlement carries it out. |
| **X-PAYMENT** | The HTTP request header carrying the client's signed payment payload when it retries a request after receiving HTTP 402. |
| **USDC** | A token issued by Circle. On Stellar, a classic USDC asset is identified by both its code (`USDC`) and its issuer account. |
| **Issuer** | The Stellar account that creates and manages a classic asset. The asset code alone does not uniquely identify an asset; the issuer is part of its identity. |

## Stellar network terms

| Term | Meaning |
|---|---|
| **Stellar** | The public network that records accounts, assets, transactions, and smart-contract activity. StellarSearch currently configures a testnet or mainnet network. |
| **Soroban** | Stellar's smart-contract platform. A Soroban contract call is authorized and executed through a Stellar transaction. |
| **Soroban authorization entry (auth entry)** | The structured authorization data that describes the contract action a wallet is being asked to approve. Freighter signs the entry so an application does not need the wallet's secret key. |
| **Stroop** | A base unit used for Stellar amounts. Stellar assets have seven decimal places: `1` USDC is `10,000,000` stroops, so StellarSearch's `0.001` USDC price is `10,000` stroops. The smallest unit depends on the asset's decimal precision. |
| **Trustline** | An account's ledger entry that allows it to hold a particular classic asset from a particular issuer. A destination account generally needs an authorized trustline before it can receive that asset. |
| **Horizon** | Stellar's REST API for account, asset, and transaction information, including indexed history. StellarSearch uses it for account balances and transaction history. |
| **Soroban RPC / Stellar RPC** | The RPC API for simulating and submitting Soroban transactions, and for reading contract events and ledger state. It is distinct from Horizon's indexed REST endpoints. |
| **Network passphrase** | A public string that identifies a Stellar network and is included in transaction hashing and signing. Testnet and mainnet have different passphrases; it is not a secret. |
| **Testnet / mainnet** | The public Stellar test network for development and the production network for real assets, respectively. Testnet assets have no mainnet value. |
| **Wallet public key / secret key** | The public key identifies a Stellar account and can be shared. The secret key authorizes actions and must stay private in the user's wallet. |

## How the services fit together

1. The client requests a paid search. The server returns HTTP 402 and x402 payment requirements.
2. The client uses the requirements and Stellar wallet to prepare and sign a Soroban authorization entry. The signed payment is sent in `X-PAYMENT` on the retry.
3. The server asks the facilitator to verify and settle the payment on the selected network.
4. The app can use Horizon to read indexed account and transaction information. Soroban RPC is used for contract simulation, submission, and contract events/state. These APIs provide different views of the same Stellar network.

For payment and network details, see the [API reference](api.md), the [Stellar x402 guide](https://developers.stellar.org/docs/build/agentic-payments/x402), and the [Stellar RPC introduction](https://developers.stellar.org/docs/data/apis/rpc).
