// Freighter returns Buffer, x402 expects string format
signAuthEntry: async (entryXdr, opts) => {
const result = await signAuthEntry(entryXdr, opts)
return {
signedAuthEntry: result.signedAuthEntry.toString('base64'),
signerAddress: result.signerAddress,
}
}
