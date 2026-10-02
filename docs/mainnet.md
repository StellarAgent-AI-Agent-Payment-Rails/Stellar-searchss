# Moving from Testnet to Mainnet

This guide provides a step-by-step checklist to safely transition your Stellar-searchss application from the Stellar Testnet to Mainnet.

> **⚠️ WARNING - CRITICAL RISKS**
>
> - **Real Money:** Mainnet operations involve real funds. Mistakes, such as transferring to the wrong address, can result in permanent financial loss.
> - **Different Assets:** Testnet USDC is **not** the same as Mainnet USDC. You must use actual USDC on the Stellar Mainnet.
> - **Irreversible Actions:** Blockchain transactions cannot be reversed once confirmed.

---

## 1. Prerequisites and Account Setup

Before switching your environment variables, ensure your Mainnet accounts are fully prepared.

- [ ] **Create a Mainnet Account:** Generate a new keypair (or use a hardware wallet) specifically for Mainnet.
- [ ] **Fund Your Account:** Send at least the minimum required XLM (usually ~1.5 - 2 XLM to cover base reserves and initial trustlines) to your new Mainnet address to activate it.
- [ ] **Establish Trustlines:** Create a trustline for the Mainnet USDC asset. Without this, your account cannot hold or receive USDC.
  - _USDC Mainnet Issuer:_ `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5REANYONOEQ`

---

## 2. Infrastructure & Configuration

Testnet and Mainnet rely on completely different smart contracts and RPC endpoints.

- [ ] **Update `.env` Variables:**
  - Change `STELLAR_NETWORK` (or equivalent) to `mainnet`.
  - Update `RPC_URL` to point to a reliable Mainnet Soroban RPC provider.
  - Replace testnet secret keys with your secured Mainnet secret keys.
- [ ] **Mainnet Contract Addresses:**
  - Locate the official Mainnet Soroban contract addresses for the services you are interacting with. Testnet contract IDs will fail on Mainnet.
- [ ] **Facilitator Requirements:**
  - Verify that the transaction facilitator/sponsor you are using supports Mainnet operations and has sufficient XLM/USDC balances.

---

## 3. Pre-flight Verification

Before running the application, double-check your environment.

- [ ] **Verify Balances:** Ensure your Mainnet account has enough XLM for transaction fees and the correct balance of Mainnet USDC.
- [ ] **Simulate Transactions:** If possible, use Soroban simulation endpoints on Mainnet to verify that transactions will succeed without actually submitting them.
- [ ] **Check Environment:** Ensure no Testnet URLs, contract IDs, or keys have leaked into your Mainnet `.env` file or configuration.

---

## 4. Post-Switch Validation

Once the application is running on Mainnet, perform minimal validation.

- [ ] **Execute a Small Test Transaction:** Perform a very small value transfer (e.g., $0.01 USDC) to verify end-to-end functionality.
- [ ] **Monitor Logs:** Watch your application logs for errors related to network connectivity, fee failures, or signature rejections.
- [ ] **Check Blockchain Explorer:** Verify on a block explorer (like Stellar Expert) that your test transaction was processed on the Mainnet and the correct assets were moved.
