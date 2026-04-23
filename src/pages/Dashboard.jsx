import { useCallback, useEffect, useState } from 'react'
import { getRecords } from '../lib/airtable'

const BUSINESS_START_YEAR = 2024

export default function Dashboard() {
  const [stats, setStats] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [revenueYear, setRevenueYear] = useState('All')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [now, setNow] = useState(Date.now())

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsData, ordersData] = await Promise.all([
        getRecords('Daily Ad Stats'),
        getRecords('Orders')
      ])
      setStats(statsData)
      setOrders(ordersData)
      setLastUpdatedAt(Date.now())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Tick once a minute so the "Updated N min ago" label stays honest.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // --- date anchors (all local) ---
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const d = today.getDate()
  const todayLocalISO = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const monthPrefix = todayLocalISO.slice(0, 7)

  // --- today's ad stats (Date may arrive as M/D/YYYY or YYYY-MM-DD) ---
  const todayStats = stats.filter(ad => {
    const date = ad.fields['Date'] || ''
    if (!date) return false
    if (date.includes('/')) {
      const parts = date.split('/')
      if (parts.length < 3) return false
      return parseInt(parts[0]) === m && parseInt(parts[1]) === d && parseInt(parts[2]) === y
    }
    return date === todayLocalISO
  })

  const totalSpend = todayStats.reduce((s, ad) => s + (ad.fields.Spend || 0), 0)
  const totalConversions = todayStats.reduce((s, ad) => s + (ad.fields.Conversions || 0), 0)
  const totalClicks = todayStats.reduce((s, ad) => s + (ad.fields.Clicks || 0), 0)
  const totalImpressions = todayStats.reduce((s, ad) => s + (ad.fields.Impressions || 0), 0)
  const totalAdRevenue = todayStats.reduce((s, ad) => s + (ad.fields.Spend || 0) * (ad.fields.ROAS || 0), 0)
  const activeAds = todayStats.filter(ad => ad.fields['Ad Status'] === 'ACTIVE').length
  // Weighted by spend / impressions — unweighted means were misleading when one
  // low-spend ad had a freak ROAS or CTR.
  const blendedROAS = totalSpend > 0 ? totalAdRevenue / totalSpend : null
  const weightedCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null

  // --- revenue (local date) ---
  const todayRevenue = orders
    .filter(o => o.fields['Created At'] === todayLocalISO)
    .reduce((s, o) => s + (o.fields['Total Price'] || 0), 0)
  const monthlyRevenue = orders
    .filter(o => o.fields['Created At']?.startsWith(monthPrefix))
    .reduce((s, o) => s + (o.fields['Total Price'] || 0), 0)

  // Ad-attributed revenue as a share of total revenue (hidden when no revenue).
  const adRevenuePct = todayRevenue > 0 ? (totalAdRevenue / todayRevenue) * 100 : null

  // Year dropdown: business started 2024, so always offer every year from then.
  const years = []
  for (let yr = BUSINESS_START_YEAR; yr <= y; yr++) years.push(String(yr))
  const filteredOrders = revenueYear === 'All'
    ? orders
    : orders.filter(o => o.fields['Created At']?.startsWith(revenueYear))
  const allTimeRevenue = filteredOrders.reduce((s, o) => s + (o.fields['Total Price'] || 0), 0)

  // Loading gate only on the very first fetch. Refreshes don't blank the page.
  if (loading && !lastUpdatedAt) return <div className="p-8 text-gray-400">Loading...</div>

  const dateLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-gray-400 text-sm mt-1">Today · {dateLabel}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span title={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : ''}>
            Updated {formatUpdatedLabel(lastUpdatedAt, now)}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            title="Refresh"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-800 hover:bg-gray-800 disabled:opacity-50 text-gray-300"
          >
            <span className={loading ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* --- Hero row --- */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today's Revenue</p>
          <p className="text-3xl font-bold">${todayRevenue.toFixed(2)}</p>
          {adRevenuePct != null && (
            <p className="text-xs text-green-400 mt-2">{adRevenuePct.toFixed(0)}% from ads</p>
          )}
        </div>
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today's Spend</p>
          <p className="text-3xl font-bold">${totalSpend.toFixed(2)}</p>
        </div>

        {/* --- Context row --- */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Blended ROAS</p>
          <p className="text-2xl font-bold">{blendedROAS != null ? `${blendedROAS.toFixed(2)}x` : '—'}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active Ads</p>
          <p className="text-2xl font-bold">{activeAds}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Conversions</p>
          <p className="text-2xl font-bold">{totalConversions}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg CTR</p>
          <p className="text-2xl font-bold">{weightedCTR != null ? `${weightedCTR.toFixed(2)}%` : '—'}</p>
        </div>

        {/* --- Historical row --- */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">This Month</p>
          <p className="text-2xl font-bold">${monthlyRevenue.toFixed(2)}</p>
        </div>
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide">All-Time</p>
            <select
              value={revenueYear}
              onChange={e => setRevenueYear(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            >
              <option value="All">All Time</option>
              {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>
          <p className="text-2xl font-bold">${allTimeRevenue.toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}

function formatUpdatedLabel(then, now) {
  if (!then) return 'never'
  const mins = Math.floor((now - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  return `${mins} min ago`
}
