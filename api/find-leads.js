import { requireSession } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireSession(req, res, ['owner'])) return

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
    const leadsCount = existingHandles.size

    // Also dedup against Blocked Handles — deleted/declined leads must not be
    // re-suggested by AI discovery. Manual Add Lead bypasses this check.
    let blockedOffset = null
    do {
      const url = `https://api.airtable.com/v0/${baseId}/Blocked%20Handles?fields[]=Handle${blockedOffset ? `&offset=${blockedOffset}` : ''}`
      const blocked = await fetch(url, {
        headers: { 'Authorization': `Bearer ${airtableToken}` }
      })
      const blockedData = await blocked.json()
      blockedData.records?.forEach(r => {
        if (r.fields['Handle']) existingHandles.add(r.fields['Handle'].toLowerCase())
      })
      blockedOffset = blockedData.offset || null
    } while (blockedOffset)
    console.log(`Dedup set: ${leadsCount} existing leads + ${existingHandles.size - leadsCount} blocked handles = ${existingHandles.size} total`)

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
    const deduped = allLeads.filter(lead =>
      lead.handle && !existingHandles.has(String(lead.handle).toLowerCase())
    )
    const skippedDupes = allLeads.length - deduped.length

    // --- Instagram verification gate ---
    // Claude invents plausible-sounding handles; only real, existing accounts
    // get saved. A real profile page embeds "username":"<handle>" in its
    // structured data; a nonexistent handle serves a 404 page
    // (show_lox_redesigned_404_page) where the handle appears only in the URL.
    const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

    async function handleExists(rawHandle) {
      const handle = String(rawHandle).replace(/^@/, '').trim()
      if (!HANDLE_RE.test(handle)) return false
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 7000)
        const resp = await fetch(`https://www.instagram.com/${handle}/`, {
          headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
          signal: ctrl.signal
        })
        clearTimeout(timer)
        if (!resp.ok) return false
        const html = await resp.text()
        const lower = html.toLowerCase()
        const h = handle.toLowerCase()
        // 404 marker OR missing structured username = not a real account
        if (lower.includes('show_lox_redesigned_404_page')) return false
        return lower.includes(`"username":"${h}"`)
      } catch {
        return false
      }
    }

    async function verifyBatch(leads, concurrency = 8) {
      const verified = []
      for (let i = 0; i < leads.length; i += concurrency) {
        const chunk = leads.slice(i, i + concurrency)
        const results = await Promise.all(chunk.map(async (lead) => {
          const clean = String(lead.handle).replace(/^@/, '').trim()
          const ok = await handleExists(clean)
          return ok ? { ...lead, handle: clean } : null
        }))
        for (const r of results) if (r) verified.push(r)
      }
      return verified
    }

    const newLeads = await verifyBatch(deduped)
    const rejected = deduped.length - newLeads.length

    res.json({
      leads: newLeads,
      count: newLeads.length,
      skipped: skippedDupes,
      rejected,
      note: rejected > 0 ? `${rejected} AI-suggested handle(s) did not exist on Instagram and were dropped` : undefined
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
