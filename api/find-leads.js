export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Step 1: Get existing leads from Airtable
    const airtableToken = process.env.VITE_AIRTABLE_TOKEN
    const baseId = process.env.VITE_AIRTABLE_BASE_ID

    let existingHandles = new Set()
    let offset = null
    do {
      const url = `https://api.airtable.com/v0/${baseId}/Leads?fields[]=Handle${offset ? `&offset=${offset}` : ''}`
      const existing = await fetch(url, {
        headers: { 'Authorization': `Bearer ${airtableToken}` }
      })
      const existingData = await existing.json()
      existingData.records?.forEach(r => {
        if (r.fields['Handle']) existingHandles.add(r.fields['Handle'].toLowerCase())
      })
      offset = existingData.offset || null
    } while (offset)

    console.log(`Found ${existingHandles.size} existing leads`)

    // Step 2: Generate new leads with Claude
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
          content: `Generate a list of 35 realistic Instagram creator profiles that would be ideal partners for kāre, a premium New Zealand bovine colostrum supplement brand targeting health-conscious adults 30+, athletes, and longevity seekers.

Create profiles for micro to mid-tier influencers (5,000-250,000 followers) in these niches: wellness, gut health, fitness, longevity, nutrition, anti-aging, sports performance, immunity, clean eating, biohacking, yoga, pilates, running, crossfit, hyrox, motherhood, mens health, womens health, hair skin nails. US-based.

Use realistic Instagram handle formats and authentic-sounding bios. Mix different follower sizes and niches. Make sure all handles are unique and varied.

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
      return res.status(500).json({ error: 'No text response from Claude' })
    }

    const jsonMatch = lastText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return res.status(500).json({ error: 'No JSON array found', raw: lastText.substring(0, 500) })
    }

    const allLeads = JSON.parse(jsonMatch[0])

    // Step 3: Filter out existing leads
    const newLeads = allLeads.filter(lead =>
      !existingHandles.has(lead.handle.toLowerCase())
    )

    console.log(`Generated ${allLeads.length} leads, ${newLeads.length} are new`)
    res.json({ leads: newLeads, count: newLeads.length, skipped: allLeads.length - newLeads.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
