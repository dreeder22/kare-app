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
          content: `Search Instagram and the web to find 25 real Instagram creators who would be a great fit for kāre, a premium New Zealand bovine colostrum supplement brand targeting health-conscious adults 30+, athletes, and longevity seekers.

Find creators in these niches: wellness, gut health, fitness, longevity, nutrition, anti-aging, sports performance, immunity, clean eating, biohacking, yoga, pilates, running, crossfit, hyrox, motherhood, mens health, womens health, hair skin nails.

Requirements:
- 5,000 to 250,000 followers
- Primarily US-based
- Real, verifiable Instagram accounts
- Authentic health/wellness content
- Mix of different niches and follower sizes

Your final response must be ONLY a valid JSON array with no text before or after:
[
  {
    "handle": "@realusername",
    "fullName": "Real Name",
    "bio": "their actual bio or description",
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
    console.log('Content blocks:', data.content?.map(c => c.type))

    const textBlocks = data.content?.filter(c => c.type === 'text')
    const lastText = textBlocks?.[textBlocks.length - 1]?.text

    if (!lastText) {
      return res.status(500).json({ error: 'No text response from Claude' })
    }

    const jsonMatch = lastText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return res.status(500).json({ error: 'No JSON array found', raw: lastText })
    }

    const leads = JSON.parse(jsonMatch[0])
    res.json({ leads, count: leads.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
