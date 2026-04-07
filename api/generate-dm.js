export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lead, brandSettings } = req.body

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
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are writing influencer outreach messages for kāre, a premium New Zealand bovine colostrum supplement brand.

BRAND INFO:
- Name: ${brandSettings['Brand Name']}
- Tone: ${brandSettings['Tone']}
- Products: ${brandSettings['Products']}
- Primary Audience: ${brandSettings['Primary Audience']}
- Ideal Creators: ${brandSettings['Ideal Creators']}
- Commission: ${brandSettings['Commission Rate']}

CREATOR INFO:
- Handle: ${lead.handle}
- Bio: ${lead.bio}
- Followers: ${lead.followers}
- Platform: ${lead.platform}
- Location: ${lead.location}
- Niche Tags: ${lead.nicheTags}

Search the web for ${lead.handle} on ${lead.platform} and analyze their recent posts, content style, brands they work with, and topics they cover. Use specific details from their actual content to make the messages feel genuine and personal. If you cannot find specific content, use their bio and niche tags.

IMPORTANT: Always return the JSON object regardless of whether you found web search results.

Write 5 messages. Your response must end with a valid JSON object:
{
  "initialDM": "...",
  "comment": "...",
  "followUp1": "...",
  "followUp2": "...",
  "reEngage": "..."
}

RULES:
- Initial DM: 3-4 sentences max, reference something specific from their content or niche, mention kāre naturally, offer free product, no hard sell
- Comment: 1 sentence, genuine reaction relevant to their niche, no mention of kāre
- Follow-up 1: 2-3 sentences, light bump, add a specific benefit relevant to their niche
- Follow-up 2: 2 sentences, final message, keep door open
- Re-engage: 2-3 sentences, re-open conversation after 90 days
- Never use words like "synergy", "collab", "partnership", "brand ambassador"
- Always sound like a real person, not a marketing team
- Match kāre tone: warm, confident, witty, quiet confidence
- ALWAYS end your response with the JSON object`
        }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    })

    const data = await response.json()
    const textBlocks = data.content?.filter(c => c.type === 'text')
    const textContent = textBlocks?.[textBlocks.length - 1]

    if (!textContent) throw new Error('No text response')

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const messages = JSON.parse(jsonMatch[0])
    res.json(messages)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
