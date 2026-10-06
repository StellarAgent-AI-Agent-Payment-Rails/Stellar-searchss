/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS debug script */
// Simple test to verify Serper.dev API integration and validate the response schema.
const fetch = require('node-fetch')

// Expected Serper response fields. If Serper renames a field, the contract test below fails.
const SERPER_SCHEMA = {
  organic: ['title', 'link', 'snippet'],
  images: ['title', 'imageUrl', 'imageWidth', 'imageHeight'],
  news: ['title', 'link', 'snippet', 'date'],
}

function warnMissingFields(section, items) {
  const expected = SERPER_SCHEMA[section]
  if (!expected) return
  if (!Array.isArray(items)) {
    console.warn(`⚠️ Serper response missing expected array "${section}"`)
    return
  }
  items.forEach((item, idx) => {
    expected.forEach((field) => {
      if (item[field] === undefined) {
        console.warn(
          `⚠️ Serper field absent: ${section}[${idx}].${field} -- results may silently be blank. ` +
            `Refer to tests/fixtures/serper/ and update the mapping.`,
        )
      }
    })
  })
}

function validateSerperResponse(data) {
  const sections = ['organic', 'images', 'news']
  let ok = true
  for (const section of sections) {
    if (data[section] === undefined) {
      console.warn(`⚠️ Serper response missing "${section}" section`)
      continue
    }
    const items = data[section]
    if (!Array.isArray(items)) {
      console.warn(`⚠️ Serper "${section}" is not an array`)
      ok = false
      continue
    }
    const expected = SERPER_SCHEMA[section]
    for (const item of items) {
      for (const field of expected) {
        if (item[field] === undefined) ok = false
      }
    }
    warnMissingFields(section, items)
  }
  return ok
}

async function testSerper() {
  const SERPER_API_KEY = process.env.SERPER_API_KEY

  if (!SERPER_API_KEY) {
    console.log('❌ Please set SERPER_API_KEY environment variable')
    process.exitCode = 1
    return
  }

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: 'Stellar blockchain',
        num: 5,
      }),
    })

    if (!response.ok) {
      console.log('❌ Serper API error:', response.status, await response.text())
      process.exitCode = 1
      return
    }

    const data = await response.json()
    console.log('✅ Serper.dev API working!')
    console.log('Results:', data.organic?.length || 0)

    const valid = validateSerperResponse(data)
    if (!valid) {
      console.log('❌ Serper response schema validation failed')
      process.exitCode = 1
      return
    }

    if (data.organic && data.organic.length > 0) {
      console.log('\nFirst result:')
      console.log('Title:', data.organic[0].title)
      console.log('URL:', data.organic[0].link)
      console.log('Snippet:', data.organic[0].snippet?.substring(0, 100) + '...')
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
    process.exitCode = 1
  }
}

module.exports = { SERPER_SCHEMA, validateSerperResponse, warnMissingFields }

if (require.main === module) {
  testSerper()
}
