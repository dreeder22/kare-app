export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { month, year } = req.body
    const goaffproToken = process.env.VITE_GOAFFPRO_TOKEN
    const airtableToken = process.env.VITE_AIRTABLE_TOKEN
    const baseId = process.env.VITE_AIRTABLE_BASE_ID

    // Step 1: Get all affiliates
    const affRes = await fetch('https://api.goaffpro.com/v1/admin/affiliates?fields=id,name,email,ref_code,coupon,status,instagram&count=200', {
      headers: { 'X-GOAFFPRO-ACCESS-TOKEN': goaffproToken }
    })
    const affData = await affRes.json()
    const affiliates = affData.affiliates || []

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

    const allTimeStats = calcStats(allOrders)

    // Step 4: Get existing Creators from Airtable
    let creators = []
    let offset = null
    do {
      const url = `https://api.airtable.com/v0/${baseId}/Creators${offset ? `?offset=${offset}` : ''}`
      const creatorsRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${airtableToken}` }
      })
      const creatorsData = await creatorsRes.json()
      creators = [...creators, ...(creatorsData.records || [])]
      offset = creatorsData.offset || null
    } while (offset)

    const results = { updated: 0, created: 0, monthlyAdded: 0 }
    const creatorIdMap = {}

    for (const affiliate of affiliates) {
      if (affiliate.status !== 'approved') continue

      const allTime = allTimeStats[affiliate.id] || { totalSales: 0, totalCommissions: 0, totalOrders: 0, totalUnits: 0 }

      const fields = {
        'GoAffPro ID': String(affiliate.id),
        'Discount Code': affiliate.coupon?.code || affiliate.ref_code || '',
        'Referral Link': `https://takingkare.com/?ref=${affiliate.ref_code || ''}`,
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
              'Handle': affiliate.instagram ? `@${affiliate.instagram}` : '',
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

      if (creatorRecordId) creatorIdMap[affiliate.id] = creatorRecordId
    }

    // Step 5: Monthly stats
    const monthsToSync = []
    if (month && year) {
      monthsToSync.push({ month, year })
    } else {
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

    let existingMonthly = []
    let monthlyOffset = null
    do {
      const url = `https://api.airtable.com/v0/${baseId}/Creator%20Monthly%20Stats${monthlyOffset ? `?offset=${monthlyOffset}` : ''}`
      const monthlyRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${airtableToken}` }
      })
      const monthlyData = await monthlyRes.json()
      existingMonthly = [...existingMonthly, ...(monthlyData.records || [])]
      monthlyOffset = monthlyData.offset || null
    } while (monthlyOffset)

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
        if (stats.totalOrders === 0) continue

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

    res.json({ success: true, ...results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
