import { gzipSync } from 'node:zlib'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)

const body = Buffer.concat(chunks)
if (!body.length) {
  console.error('Usage: node scripts/measure-compression.mjs < search-response.json')
  process.exitCode = 1
} else {
  const compressed = gzipSync(body)
  const reduction = ((1 - compressed.length / body.length) * 100).toFixed(1)
  console.log(`Uncompressed: ${body.length} bytes`)
  console.log(`Gzip:         ${compressed.length} bytes`)
  console.log(`Reduction:    ${reduction}%`)
}
