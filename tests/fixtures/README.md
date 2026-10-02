# Test Fixtures

Shared, really-captured payloads for tests that touch payments. Every fixture is testnet data with sensitive fields redacted.

## What's in here

| File | Description |
| --- | --- |
| `funded_account.json` | Horizon `Account` response for a funded testnet account with a USDC trustline. |
| `unfunded_404.json` | Horizon 404 error body for an account that has not been funded. |
| `no_usdc_trustline.json` | Horizon `Account` response for a funded account without a USDC trustline. |
| `operations_page.json` | Horizon operations page (`/accounts/{account}/operations`) with a paging cursor. |
| `x402_payment_payload.json` | x402 payment payload for a testnet USDC transfer. |

## Redaction rules

- All data is from Stellar testnet only. Never use mainnet captures.
- Account IDs are kept as they appear on testnet; they are not secrets.
- Any signed transaction envelopes, authorization headers, API keys, or secret keys are removed before committing.
- The x402 payload uses a placeholder signature and a nonce that is not reusable on network.

## Regenerating

Fixtures are captured from Horizon testnet with `curl` and then redacted. To regenerate them:

1. Pick the testnet accounts you want to use. You need one funded account with a USDC trustline, one funded account without one, and one unfunded account.

2. Capture the account responses:

   ```sh
   curl -s "https://horizon-testnet.stellar.org/accounts/<FUNDED_ACCOUNT_WITH_USDC>" | jq . > tests/fixtures/funded_account.json
   curl -s "https://horizon-testnet.stellar.org/accounts/<FUNDED_ACCOUNT_WITHOUT_USDC>" | jq . > tests/fixtures/no_usdc_trustline.json
   curl -s "https://horizon-testnet.stellar.org/accounts/<UNFUNDED_ACCOUNT>" | jq . > tests/fixtures/unfunded_404.json
   ```

   The unfunded capture must return HTTP 404 and an error body with `"status": 404`.

3. Capture an operations page:

   ```sh
   curl -s "https://horizon-testnet.stellar.org/accounts/<FUNDED_ACCOUNT_WITH_USDC>/operations?order=desc&limit=2" | jq . > tests/fixtures/operations_page.json
   ```

4. Capture the x402 payload from the server that issues the payment challenge. Save the JSON body to `tests/fixtures/x402_payment_payload.json`.

5. Redact before committing:

   - Remove any `signature`, `signed_tx`, `authorization`, or `api_key` fields.
   - Replace the x402 signature with a placeholder value and ensure the nonce is not one that was already submitted.
   - Keep the shape of the payload intact so tests exercise the real code paths.

6. Verify the fixtures still parse:

   ```sh
   for f in tests/fixtures/*.json; do jq empty "$f" || echo "invalid: $f"; done
   ```

## Usage

Read the fixtures with the common test helper so the path and parsing live in one place:

```go
data, err := os.ReadFile(filepath.Join("tests", "fixtures", "funded_account.json"))
if err != nil {
    t.Fatal(err)
}
```

Use the fixture that matches the Horizon state your test needs. Do not mock Horizon when a fixture already covers the state.
