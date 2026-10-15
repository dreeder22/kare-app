import { requireSession } from '../lib/auth.js'

// POST /api/lookup-handle
// Body: { handle } -> { fullName, bio, followers, location, nicheTags }
// Tries Instagram's public endpoint first, falls back to Claude web search.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireSession(req, res)) return

  const { handle } = req.body || {}
  if (!handle) return res.status(400).json({ error: 'Handle required' })

  try {
    const cleanHandle = String(handle).replace('@', '').replace('https://www.instagram.com/', '').replace(/\//g, '').replace('#', '').trim()

    // Try Instagram's public JSON endpoint for basic profile info
    const oembedRes = await fetch(`https://www.instagram.com/${cleanHandle}/?__a=1&__d=dis`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    })

    if (oembedRes.ok) {
      const text = await oembedRes.text()
      try {
        const data = JSON.parse(text)
        const user = data?.graphql?.user || data?.data?.user
        if (user) {
          return res.json({
            fullName: user.full_name || '',
            bio: user.biography || '',
            followers: user.edge_followed_by?.count || 0,
            location: '',
            nicheTags: []
          })
        }
      } catch { /* fall through to Claude */ }
    }

    // Fallback to Claude web search
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        tool_choice: { type: 'auto' },
        messages: [{
          role: 'user',
          content: `Search for "${cleanHandle} instagram" and return whatever profile information you find. Even partial data is fine.\n\nReturn ONLY a JSON object with whatever you found (use empty string for unknown fields):\n{"fullName":"","bio":"","followers":0,"location":"","nicheTags":[]}`
        }]
      })
    })

    const data = await response.json()
    const textBlocks = data.content?.filter(c => c.type === 'text') || []
    const lastText = textBlocks[textBlocks.length - 1]?.text
    if (!lastText) return res.json({ fullName: '', bio: '', followers: 0, location: '', nicheTags: [] })

    const jsonMatch = lastText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.json({ fullName: '', bio: '', followers: 0, location: '', nicheTags: [] })

    return res.json(JSON.parse(jsonMatch[0]))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
