export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
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

    const niches = [
      'wellness gut health instagram creator',
      'fitness nutrition instagram influencer',
      'longevity biohacking instagram',
      'clean eating anti-aging instagram creator',
      'sports performance recovery instagram',
      'yoga pilates wellness instagram',
      'running crossfit hyrox instagram creator',
      'motherhood health wellness instagram'
    ]

    const randomNiche = niches[Math.floor(Math.random() * niches.length)]

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
        tool_choice: { type: 'auto' },
        messages: [{
          role: 'user',
          content: `Search the web for "${randomNiche}" and find 35 real Instagram accounts. Look for their actual Instagram handles, follower counts, and bios.

Then return ONLY a JSON array starting with [ and ending with ]. No other text:
[{"handle":"@realusername","fullName":"Real Name","bio":"bio text","followers":25000,"platform":"Instagram","location":"City, State","nicheTags":["wellness"]}]`
        }]
      })
    })

    const data = await response.json()

    // Get the last text block from potentially multi-turn response
    const textBlocks = data.content?.filter(c => c.type === 'text') || []
    const lastText = textBlocks[textBlocks.length - 1]?.text

    if (!lastText) {
      // Claude used tools but didn't finish — extract any partial data
      console.log('No text block, content types:', data.content?.map(c => c.type))
      console.log('Stop reason:', data.stop_reason)
      return res.status(500).json({
        error: 'No text response',
        stopReason: data.stop_reason,
        contentTypes: data.content?.map(c => c.type)
      })
    }

    const jsonMatch = lastText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return res.status(500).json({ error: 'No JSON found', raw: lastText.substring(0, 500) })
    }

    const allLeads = JSON.parse(jsonMatch[0])
    const newLeads = allLeads.filter(lead =>
      !existingHandles.has(lead.handle.toLowerCase())
    )

    res.json({ leads: newLeads, count: newLeads.length, skipped: allLeads.length - newLeads.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
