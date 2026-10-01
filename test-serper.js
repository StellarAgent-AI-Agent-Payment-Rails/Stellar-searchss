// Simple test to verify Serper.dev API integration
// `node-fetch` is not a dependency; Node 18+ provides a global `fetch`.
async function testSerper() {
  const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
  
  if (!SERPER_API_KEY) {
    console.log('❌ Set SERPER_API_KEY in the environment to run this check');
    return;
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
    });

    if (!response.ok) {
      console.log('❌ Serper API error:', response.status, await response.text());
      return;
    }

    const data = await response.json();
    console.log('✅ Serper.dev API working!');
    console.log('Results:', data.organic?.length || 0);
    
    if (data.organic && data.organic.length > 0) {
      console.log('\nFirst result:');
      console.log('Title:', data.organic[0].title);
      console.log('URL:', data.organic[0].link);
      console.log('Snippet:', data.organic[0].snippet?.substring(0, 100) + '...');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testSerper();