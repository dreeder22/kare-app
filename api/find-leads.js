export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const airtableToken = process.env.VITE_AIRTABLE_TOKEN
    const baseId = process.env.VITE_AIRTABLE_BASE_ID

    // Get existing handles to deduplicate
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

    // Multi-turn Claude web search
    const messages = [{
      role: 'user',
      content: `Search Instagram for 35 real health and wellness creators. Search for terms like "wellness instagram creator", "gut health influencer instagram", "fitness nutrition creator", "longevity instagram", "clean eating influencer".

For each creator found, return their real Instagram handle, full name, follower count, bio, location and niche.

Requirements:
- 5,000 to 250,000 followers
- Health, wellness, fitness, gut health, longevity, nutrition, anti-aging, sports performance, immunity, clean eating, biohacking, yoga, pilates, running, crossfit, hyrox, motherhood, mens health, womens health niches
- US-based preferred
- Must be real verifiable Instagram accounts

After searching, return ONLY a valid JSON array:
[{"handle":"@realusername","fullName":"Real Name","bio":"their bio","followers":25000,"platform":"Instagram","location":"City, State","nicheTags":["wellness"]}]`
    }]

    let response = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages
      })
    })

    let data = await response.json()

    // Handle multi-turn tool use
    while (data.stop_reason === 'tool_use') {
      const toolUseBlocks = data.content.filter(c => c.type === 'tool_use')
      const toolResults = []

      for (const toolUse of toolUseBlocks) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Search completed'
        })
      }

      messages.push({ role: 'assistant', content: data.content })
      messages.push({ role: 'user', content: toolResults })

      response = await fetch('https://api.anthropic.com/v1/messages', {
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
          messages
        })
      })

      data = await response.json()
    }

    const textBlocks = data.content?.filter(c => c.type === 'text')
    const lastText = textBlocks?.[textBlocks.length - 1]?.text

    if (!lastText) {
      return res.status(500).json({ error: 'No text response', contentTypes: data.content?.map(c => c.type) })
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
