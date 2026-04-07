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
        messages: [{
          role: 'user',
          content: `Generate a list of 25 realistic Instagram creator profiles that would be ideal partners for kāre, a premium New Zealand bovine colostrum supplement brand targeting health-conscious adults 30+, athletes, and longevity seekers.

Create profiles for micro to mid-tier influencers (5,000-250,000 followers) in these niches: wellness, gut health, fitness, longevity, nutrition, anti-aging, sports performance, immunity, clean eating, biohacking, yoga, pilates, running, crossfit, hyrox, motherhood, mens health, womens health, hair skin nails. US-based.

Use realistic Instagram handle formats and authentic-sounding bios. Mix different follower sizes and niches.

Return ONLY a valid JSON array starting with [ and ending with ], no other text:
[
  {
    "handle": "@username",
    "fullName": "First Last",
    "bio": "their bio",
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
      return res.status(500).json({ error: 'No text response from Claude', content: data.content?.map(c => c.type) })
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
