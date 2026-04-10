import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())
app.use((req, res, next) => { console.log(`${req.method} ${req.path}`); next() })

app.post('/api/generate-dm', async (req, res) => {
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

Search the web for ${lead.handle} on ${lead.platform} and analyze their recent posts, content style, brands they work with, and topics they cover. If you cannot find specific content for this account, use their bio, niche tags, and follower count to craft messages that feel personal and relevant to their content area.

IMPORTANT: Always return the JSON object regardless of whether you found web search results. Never ask for more information — always produce the 5 messages using whatever information is available.

Write 5 messages in JSON format only. Your response must end with a valid JSON object:
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
- Re-engage: 2-3 sentences, reference something new from their content or kāre, re-open conversation after 90 days
- Never use words like "synergy", "collab", "partnership", "brand ambassador"
- Always sound like a real person, not a marketing team
- Match kāre tone: warm, confident, witty, quiet confidence
- ALWAYS end your response with the JSON object, no exceptions`
        }],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search'
        }]
      })
    })

    const data = await response.json()
    console.log('Response content blocks:', JSON.stringify(data.content?.map(c => c.type), null, 2))

    const textBlocks = data.content?.filter(c => c.type === 'text')
    const textContent = textBlocks?.[textBlocks.length - 1]
    if (!textContent) {
      console.log('Full response:', JSON.stringify(data, null, 2))
      throw new Error('No text response found')
    }

    console.log('Claude raw response:', textContent.text)
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const messages = JSON.parse(jsonMatch[0])
    res.json(messages)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/goaffpro-sync', async (req, res) => {
  try {
    const { month, year } = req.body
    const goaffproToken = process.env.VITE_GOAFFPRO_TOKEN
    const airtableToken = process.env.VITE_AIRTABLE_TOKEN
    const baseId = process.env.VITE_AIRTABLE_BASE_ID

    // Step 1: Get all affiliates
    const affRes = await fetch('https://api.goaffpro.com/v1/admin/affiliates?fields=id,name,email,ref_code,coupon,status&count=200', {
      headers: { 'X-GOAFFPRO-ACCESS-TOKEN': goaffproToken }
    })
    const affData = await affRes.json()
    const affiliates = affData.affiliates || []
    console.log('Affiliates fetched:', affiliates.length)

    // Step 2: Get all orders with pagination
    let allOrders = []
    let ordPage = 1
    let hasMore = true
    while (hasMore) {
      const ordRes = await fetch(`https://api.goaffpro.com/v1/admin/orders?fields=id,affiliate_id,total,commission,status,created_at,quantity&count=250&page=${ordPage}`, {
        headers: { 'X-GOAFFPRO-ACCESS-TOKEN': goaffproToken }
      })
      const ordData = await ordRes.json()
      const pageOrders = ordData.orders || []
      allOrders = [...allOrders, ...pageOrders]
      hasMore = pageOrders.length === 250
      ordPage++
    }
    console.log('Total orders fetched:', allOrders.length)

    // Step 3: Calculate stats helper
    function calcStats(orders) {
      const stats = {}
      orders.forEach(order => {
        if (order.status === 'approved') {
          if (!stats[order.affiliate_id]) {
            stats[order.affiliate_id] = { totalSales: 0, totalCommissions: 0, totalOrders: 0, totalUnits: 0 }
          }
          stats[order.affiliate_id].totalSales += parseFloat(order.total) || 0
          stats[order.affiliate_id].totalCommissions += parseFloat(order.commission) || 0
          stats[order.affiliate_id].totalOrders += 1
          stats[order.affiliate_id].totalUnits += parseInt(order.quantity) || 1
        }
      })
      return stats
    }

    // Step 4: Calculate all-time stats
    const allTimeStats = calcStats(allOrders)

    // Step 5: Get existing Creators from Airtable
    const creatorsRes = await fetch(`https://api.airtable.com/v0/${baseId}/Creators`, {
      headers: { 'Authorization': `Bearer ${airtableToken}` }
    })
    const creatorsData = await creatorsRes.json()
    const creators = creatorsData.records || []
    console.log('Existing creators:', creators.length)

    // Step 6: Update/create creator records with all-time stats
    const results = { updated: 0, created: 0, monthlyAdded: 0 }
    const creatorIdMap = {}

    for (const affiliate of affiliates) {
      if (affiliate.status !== 'approved') continue

      const allTime = allTimeStats[affiliate.id] || { totalSales: 0, totalCommissions: 0, totalOrders: 0, totalUnits: 0 }

      const fields = {
        'GoAffPro ID': String(affiliate.id),
        'Discount Code': affiliate.coupon?.code || affiliate.ref_code || '',
        'Total Sales': allTime.totalSales,
        'Total Commissions': allTime.totalCommissions,
        'Total Orders': allTime.totalOrders,
        'Total Units': allTime.totalUnits
      }

      const existing = creators.find(c =>
        c.fields['Email'] === affiliate.email ||
        c.fields['Discount Code'] === affiliate.coupon?.code
      )

      let creatorRecordId
      if (existing) {
        await fetch(`https://api.airtable.com/v0/${baseId}/Creators/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        })
        creatorRecordId = existing.id
        results.updated++
      } else {
        const createRes = await fetch(`https://api.airtable.com/v0/${baseId}/Creators`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              ...fields,
              'Handle': affiliate.coupon?.code || affiliate.ref_code || affiliate.name,
              'Full Name': affiliate.name,
              'Email': affiliate.email,
              'Status': 'Active',
              'Tier': 'Rising',
              'Date Joined': new Date().toISOString().split('T')[0]
            }
          })
        })
        const createJson = await createRes.json()
        creatorRecordId = createJson.id
        results.created++
      }

      if (creatorRecordId) {
        creatorIdMap[affiliate.id] = creatorRecordId
        console.log('Creator ID mapped:', affiliate.id, '->', creatorRecordId)
      }
    }

    // Step 7: Get months to sync - if month/year provided sync just that month, otherwise sync all months
    const monthsToSync = []
    if (month && year) {
      monthsToSync.push({ month, year })
    } else {
      // Build list of all months from Nov 2024 to current
      const startYear = 2024
      const startMonth = 11
      const now = new Date()
      let m = startMonth
      let y = startYear
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
        monthsToSync.push({ month: m, year: y })
        m++
        if (m > 12) { m = 1; y++ }
      }
    }

    // Step 8: Get existing monthly stats records
    const monthlyRes = await fetch(`https://api.airtable.com/v0/${baseId}/Creator%20Monthly%20Stats`, {
      headers: { 'Authorization': `Bearer ${airtableToken}` }
    })
    const monthlyData = await monthlyRes.json()
    const existingMonthly = monthlyData.records || []

    // Step 9: For each month, calculate and store stats
    for (const { month: m, year: y } of monthsToSync) {
      const periodLabel = `${String(m).padStart(2, '0')}/${y}`
      const monthOrders = allOrders.filter(order => {
        const date = new Date(order.created_at)
        return date.getFullYear() === y && date.getMonth() + 1 === m
      })
      const monthStats = calcStats(monthOrders)

      for (const affiliate of affiliates) {
        if (affiliate.status !== 'approved') continue
        const creatorRecordId = creatorIdMap[affiliate.id]
        if (!creatorRecordId) continue

        const stats = monthStats[affiliate.id] || { totalSales: 0, totalCommissions: 0, totalOrders: 0, totalUnits: 0 }
        if (stats.totalOrders === 0) continue // skip months with no activity

        const existingRecord = existingMonthly.find(r =>
          r.fields['Period'] === periodLabel &&
          r.fields['Linked Creator']?.[0] === creatorRecordId
        )

        if (existingRecord) {
          await fetch(`https://api.airtable.com/v0/${baseId}/Creator%20Monthly%20Stats/${existingRecord.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                'Sales': stats.totalSales,
                'Commissions': stats.totalCommissions,
                'Orders': stats.totalOrders,
                'Units': stats.totalUnits
              }
            })
          })
        } else {
          await fetch(`https://api.airtable.com/v0/${baseId}/Creator%20Monthly%20Stats`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                'Period': periodLabel,
                'Linked Creator': [creatorRecordId],
                'Sales': stats.totalSales,
                'Commissions': stats.totalCommissions,
                'Orders': stats.totalOrders,
                'Units': stats.totalUnits
              }
            })
          })
          results.monthlyAdded++
        }
      }
    }

    console.log('Results:', results)
    res.json({ success: true, ...results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/find-leads', async (req, res) => {
  try {
    // Get existing handles from Airtable to deduplicate
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

    console.log(`Found ${existingHandles.size} existing leads to deduplicate against`)

    const niches = [
      'gut health nutritionist instagram micro influencer 10000 50000 followers',
      'wellness instagram micro influencer under 100k followers',
      'fitness nutrition instagram creator 5000 50000 followers',
      'yoga pilates instagram micro influencer small account',
      'running crossfit hyrox instagram athlete micro influencer',
      'anti-aging longevity instagram micro influencer',
      'clean eating motherhood instagram micro influencer under 100k',
      'immune health supplement instagram creator micro influencer'
    ]

    const allLeads = []

    for (const niche of niches) {
      console.log(`Searching: ${niche}`)

      const messages = [{
        role: 'user',
        content: `Search for "${niche}".

Find 3-5 real US-based Instagram accounts that are micro-influencers with between 2,500 and 500,000 followers. Must be based in the United States. Avoid celebrities or anyone with over 500k followers. Look for everyday health creators, not famous people.

Return ONLY a valid JSON array. Start with [ end with ]. No backticks. No trailing commas:
[{"handle":"@realhandle","fullName":"Real Name","bio":"their bio","followers":25000,"platform":"Instagram","location":"City, State","nicheTags":["wellness"]}]`
      }]

      let response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          tool_choice: { type: 'auto' },
          messages
        })
      })

      let data = await response.json()
      let attempts = 0

      while (data.stop_reason === 'tool_use' && attempts < 3) {
        attempts++
        const toolResults = data.content
          .filter(c => c.type === 'tool_use')
          .map(c => ({
            type: 'tool_result',
            tool_use_id: c.id,
            content: 'Search completed'
          }))

        messages.push({ role: 'assistant', content: data.content })
        messages.push({ role: 'user', content: toolResults })

        const nextRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            tool_choice: { type: 'auto' },
            messages
          })
        })
        data = await nextRes.json()
      }

      let currentData = null
      // If no text after tool use, ask Claude to summarize
      if (data.stop_reason !== 'end_turn' || !data.content?.some(c => c.type === 'text')) {
        messages.push({ role: 'assistant', content: data.content })
        messages.push({ role: 'user', content: [{ type: 'text', text: 'Now return the JSON array of Instagram accounts you found. Start with [ and end with ]. No backticks. No other text.' }] })

        const finalRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages
          })
        })
        const finalData = await finalRes.json()
        console.log('Final response:', JSON.stringify(finalData).substring(0, 500))
        currentData = finalData
      }

      const finalContent = currentData || data
      const textBlocks = finalContent.content?.filter(c => c.type === 'text') || []
      const lastText = textBlocks[textBlocks.length - 1]?.text

      if (lastText) {
        console.log('Response preview:', lastText.substring(0, 300))
        const jsonMatch = lastText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          try {
            const leads = JSON.parse(jsonMatch[0])
            const filtered = leads.filter(l =>
              l.followers >= 2500 &&
              l.followers <= 500000 &&
              !existingHandles.has(l.handle?.toLowerCase())
            )
            allLeads.push(...filtered)
            console.log(`Found ${leads.length} leads, ${filtered.length} in follower range`)
          } catch (e) {
            console.log('JSON parse failed:', jsonMatch[0].substring(0, 200))
          }
        } else {
          console.log('No JSON match found in response')
        }
      } else {
        console.log('No text block returned')
      }

      // Small delay between searches
      await new Promise(r => setTimeout(r, 1000))
    }

    // Deduplicate within this run
    const seen = new Set()
    const dedupedLeads = allLeads.filter(lead => {
      const handle = lead.handle?.toLowerCase()
      if (!handle || seen.has(handle)) return false
      seen.add(handle)
      return true
    })

    console.log(`Total leads found: ${allLeads.length}, after dedup: ${dedupedLeads.length}`)
    res.json({ leads: dedupedLeads, count: dedupedLeads.length, skipped: allLeads.length - dedupedLeads.length })
  } catch (err) {
    console.error('Find leads error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => console.log('kāre API server running on port 3001'))
