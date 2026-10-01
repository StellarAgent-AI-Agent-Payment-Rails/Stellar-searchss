export const RECEIPTS_STORAGE_KEY = 'stellarsearch_receipts'
export const STORE_SEARCH_QUERY_KEY = 'stellarsearch_store_query_text'

/** Query text is private by default; users must explicitly opt in to persist it. */
export function isSearchQueryStorageEnabled(): boolean {
  try {
    return localStorage.getItem(STORE_SEARCH_QUERY_KEY) === 'true'
  } catch {
    return false
  }
}

/** Save the user's preference and erase query text already saved in receipts when disabled. */
export function setSearchQueryStorageEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(STORE_SEARCH_QUERY_KEY, 'true')
      return
    }

    localStorage.removeItem(STORE_SEARCH_QUERY_KEY)
    const rawReceipts = localStorage.getItem(RECEIPTS_STORAGE_KEY)
    if (!rawReceipts) return

    const receipts: unknown = JSON.parse(rawReceipts)
    if (!Array.isArray(receipts)) return

    localStorage.setItem(
      RECEIPTS_STORAGE_KEY,
      JSON.stringify(receipts.map((receipt) => ({ ...receipt, query: '' }))),
    )
  } catch (error) {
    console.warn('Unable to update local search privacy settings:', error)
  }
}
