import { requireSession } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireSession(req, res)) return

  const { lead } = req.body || {}
  if (!lead || !lead.handle) return res.status(400).json({ error: 'Missing lead.handle' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        tool_choice: { type: 'auto' },
        messages: [{
          role: 'user',
          content: `You write Instagram DM outreach for kāre, a premium grass-fed New Zealand colostrum brand. An operator will copy-paste your messages manually — they must read like a real person texting, not a marketing team.

CREATOR:
- Handle: @${lead.handle}
- Name: ${lead.name || ''}
- Bio: ${lead.bio || ''}
- Followers: ${lead.followers || ''}
- Niche: ${lead.niche || ''}

STEP 1 — RESEARCH: Use web search to find this creator's MOST RECENT Instagram post(s). Note what the post is about and their first name (use the natural short form, e.g. "Lindz" for Lindsey).

STEP 2 — WRITE 4 messages. Your response must end with a valid JSON object and nothing else:
{"message1": "...", "message2": "...", "followUp1": "...", "followUp2": "..."}

MESSAGE 1 — follow this exact structure, personalizing the bracketed parts:
"Hey {first name}! {One specific, genuine observation about their most recent post — what it was about, what you liked about it. Never generic flattery.} {One sentence connecting their honest/relatable/authentic style to being a great fit for authentic creator-led wellness ads.} I work with kāre and we'd love to partner with you. We run paid ads through creators' accounts (your face, our ad spend) and pay you for it. Want me to send you the details?"

Reference example (do NOT copy it — write a fresh one for THIS creator):
"Hey Lindz! I love your reminder to give yourself grace when life gets overwhelming instead of beating yourself up over fitness goals. Your honest, relatable approach to balancing wellness, family, and everyday life feels like a great fit for authentic creator-led wellness ads. I work with kāre and we'd love to partner with you. We run paid ads through creators' accounts (your face, our ad spend) and pay you for it. Want me to send you the details?"

MESSAGE 2 — the details message, sent when they say yes. Use this copy nearly verbatim (light personalization of the greeting only):
"Amazing! Here's how it works. It's called whitelisting — we run paid ads through your Instagram handle.

Your face and voice, our ad budget. Here's what you get:
• 10% commission on all sales driven by your whitelisted ads + lifetime commissions on all subscriptions.
• Free product sent to you.
• An easy content brief so you know exactly what to film.
• Our team edits everything, so it's low effort for you, or feel free to edit it yourself.
• You don't even have to post it to your own feed."

FOLLOW-UP 1 — 3-4 days after message 1 if no reply. 2 sentences max, light bump referencing the first message, human and warm.

FOLLOW-UP 2 — final bump about a week later. 2 sentences max, keep the door open, zero pressure.

RULES:
- Never use "synergy", "collab", "partnership", "brand ambassador", or exclamation-mark spam.
- Message 1 MUST reference something specific from their recent content. If you cannot find their recent posts, use a specific detail from their bio/niche instead — never invent a post.
- Every message must fit on a phone screen.
- ALWAYS end your response with the JSON object.`
        }]
      })
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData?.error?.message || `Anthropic API returned HTTP ${response.status}`)
    }

    const data = await response.json()
    const textBlocks = (data.content || []).filter(c => c.type === 'text')
    const textContent = textBlocks[textBlocks.length - 1]
    if (!textContent?.text) throw new Error('No text response')

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const messages = JSON.parse(jsonMatch[0])
    if (!messages.message1 || !messages.message2) throw new Error('Incomplete messages returned')
    res.json(messages)
  } catch (err) {
    console.error('generate-dm:', err.message)
    res.status(500).json({ error: err.message })
  }
}
