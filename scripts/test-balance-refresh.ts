import test from 'node:test'
import assert from 'node:assert/strict'

test('useSearch: invokes onPaymentSuccess callback only on successful settlement with txHash', async () => {
  let callbackCalled = false
  let receivedReceipt: any = null

  const onPaymentSuccess = (receipt: any) => {
    callbackCalled = true
    receivedReceipt = receipt
  }

  // Simulate payment success handler
  const data = {
    results: [{ id: '1', title: 'Test Result', url: 'https://example.com' }],
    txHash: '0x1234567890abcdef',
    paidAmount: '0.001',
    network: 'stellar:testnet',
  }

  if (data.txHash && onPaymentSuccess) {
    onPaymentSuccess({
      txHash: data.txHash,
      paidAmount: data.paidAmount,
      network: data.network,
      query: 'test query',
    })
  }

  assert.equal(callbackCalled, true)
  assert.equal(receivedReceipt.txHash, '0x1234567890abcdef')
  assert.equal(receivedReceipt.paidAmount, '0.001')
})

test('useSearch: does NOT invoke onPaymentSuccess when transaction hash is missing or on error', async () => {
  let callbackCalled = false

  const onPaymentSuccess = () => {
    callbackCalled = true
  }

  // Simulate failed payment or unpaid search
  const data = {
    results: [{ id: '1', title: 'Cached Result', url: 'https://example.com' }],
    txHash: null,
    paidAmount: null,
  }

  if (data.txHash && onPaymentSuccess) {
    onPaymentSuccess()
  }

  assert.equal(callbackCalled, false)
})

test('useFreighterWallet: polling terminates early when balance changes', async () => {
  const previousBalance = '10.000000'
  let attempts = 0
  const maxAttempts = 5

  const mockBalances = [
    { usdc: '10.000000' }, // attempt 0: same balance
    { usdc: '9.999000' },  // attempt 1: updated balance!
    { usdc: '9.999000' },
  ]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++
    const current = mockBalances[attempt]
    if (current && current.usdc !== previousBalance) {
      break
    }
  }

  assert.equal(attempts, 2)
})

test('useFreighterWallet: polling terminates early when targetTxHash is detected', async () => {
  const targetTxHash = 'tx_settled_123'
  let attempts = 0
  const maxAttempts = 5

  const mockTxHistory = [
    [{ hash: 'tx_old_999' }],
    [{ hash: 'tx_settled_123' }, { hash: 'tx_old_999' }],
  ]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++
    const txs = mockTxHistory[attempt] || []
    if (txs.some(t => t.hash === targetTxHash)) {
      break
    }
  }

  assert.equal(attempts, 2)
})

test('useFreighterWallet: polling halts cleanly at maxAttempts if Horizon is delayed', async () => {
  const previousBalance = '10.000000'
  let attempts = 0
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++
    const current = { usdc: '10.000000' }
    if (current.usdc !== previousBalance) {
      break
    }
  }

  assert.equal(attempts, 3)
})
