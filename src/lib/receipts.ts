import { RECEIPTS_STORAGE_KEY as PRIVACY_RECEIPTS_KEY } from './searchPrivacy'

const LEGACY_RECEIPTS_STORAGE_KEY = 'stellar-receipts'

export function clearReceipts(): void {
  try {
    localStorage.removeItem(PRIVACY_RECEIPTS_KEY)
    localStorage.removeItem(LEGACY_RECEIPTS_STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode, quota); nothing to clear.
  }
}
