export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search the web for Instagram influencers and content creators in health and wellness niches. Search for terms like "wellness instagram influencer", "gut health instagram creator", "fitness nutrition instagram", "longevity biohacking instagram", "clean eating instagram influencer".

Find 25 real Instagram accounts that match these criteria:
- 5,000 to 250,000 followers
- Post about: wellness, gut health, fitness, longevity, nutrition, anti-aging, sports performance, immunity, clean eating, biohacking, yoga, pilates, running, crossfit, hyrox, motherhood, mens health, womens health, hair skin nails
- Primarily US-based
- Authentic content creators (not celebrities)

For each creator you find, include their actual Instagram handle, name, and a brief description of their content.

Return ONLY a JSON array, nothing else, starting with [ and ending with ]:
[
  {
    "handle": "@actualusername",
    "fullName": "Real Name",
    "bio": "brief description of their content",
    "followers": 25000,
    "platform": "Instagram",
    "location": "City, State",
    "nicheTags": ["wellness", "gut_health"]
  }
]`
        }]
      })
    })

    const data = await response.json()
    const textBlocks = data.content?.filter(c => c.type === 'text')
    const lastText = textBlocks?.[textBlocks.length - 1]?.text

    if (!lastText) {
      return res.status(500).json({ error: 'No text response from Claude' })
    }

    const jsonMatch = lastText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return res.status(500).json({ error: 'No JSON array found', raw: lastText.substring(0, 500) })
    }

    const leads = JSON.parse(jsonMatch[0])
    res.json({ leads, count: leads.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
