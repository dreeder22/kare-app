import { useEffect, useState } from 'react'
import { getRecords } from '../lib/airtable'

export default function Dashboard() {
  const [stats, setStats] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [revenueYear, setRevenueYear] = useState('All')

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsData, ordersData] = await Promise.all([
          getRecords('Daily Ad Stats'),
          getRecords('Orders')
        ])
        setStats(statsData)
        console.log('Stats loaded:', statsData.length, statsData[0]?.fields)
        setOrders(ordersData)
        console.log('Order sample:', ordersData[0]?.fields, 'Created At value:', ordersData[0]?.fields['Created At'])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const today = new Date().toISOString().split('T')[0]
  console.log('Today formatted:', today, 'Sample date from stats:', stats[0]?.fields['Date'])
  console.log('Stats sample:', stats[0]?.fields, 'Today:', today)
  const now = new Date()
  const todayStats = stats.filter(ad => {
    const date = ad.fields['Date'] || ''
    if (!date) return false
    if (date.includes('/')) {
      const parts = date.split('/')
      if (parts.length < 3) return false
      return parseInt(parts[0]) === now.getMonth() + 1 &&
             parseInt(parts[1]) === now.getDate() &&
             parseInt(parts[2]) === now.getFullYear()
    }
    return date === today
  })
  const totalSpend = todayStats.reduce((sum, ad) => sum + (ad.fields.Spend || 0), 0)
  const totalConversions = todayStats.reduce((sum, ad) => sum + (ad.fields.Conversions || 0), 0)
  const totalImpressions = todayStats.reduce((sum, ad) => sum + (ad.fields.Impressions || 0), 0)
  const avgROAS = todayStats.length ? (todayStats.reduce((sum, ad) => sum + (ad.fields.ROAS || 0), 0) / todayStats.length).toFixed(2) : 0
  const activeAds = todayStats.filter(ad => ad.fields['Ad Status'] === 'ACTIVE').length
  const todayISO = new Date().toISOString().split('T')[0]
  const monthPrefix = todayISO.substring(0, 7)
  const todayRevenue = orders.filter(o => o.fields['Created At'] === todayISO)
  const totalRevenue = todayRevenue.reduce((sum, o) => sum + (o.fields['Total Price'] || 0), 0)
  const monthlyRevenue = orders.filter(o => o.fields['Created At']?.startsWith(monthPrefix)).reduce((sum, o) => sum + (o.fields['Total Price'] || 0), 0)
  const years = [...new Set(orders.map(o => o.fields['Created At']?.substring(0, 4)).filter(Boolean))].sort().reverse()
  const filteredOrders = revenueYear === 'All' ? orders : orders.filter(o => o.fields['Created At']?.startsWith(revenueYear))
  const allTimeRevenue = filteredOrders.reduce((sum, o) => sum + (o.fields['Total Price'] || 0), 0)
  const avgCTR = todayStats.length ? (todayStats.reduce((sum, ad) => sum + (ad.fields.CTR || 0), 0) / todayStats.length).toFixed(2) : 0

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!stats.length) return <div className="p-8 text-yellow-400">No stats loaded. Stats array is empty.</div>

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
      <p className="text-gray-400 mb-8">Today's performance — updated daily at 7:30am</p>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today's Spend</p>
          <p className="text-2xl font-bold">${totalSpend.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg ROAS</p>
          <p className="text-2xl font-bold">{avgROAS}x</p>
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
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Impressions</p>
          <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg CTR</p>
          <p className="text-2xl font-bold">{avgCTR}%</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Revenue</p>
          <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Revenue</p>
          <p className="text-2xl font-bold">${monthlyRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Revenue</p>
            <select
              value={revenueYear}
              onChange={e => setRevenueYear(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            >
              <option value="All">All Time</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <p className="text-2xl font-bold">${allTimeRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ads Running</p>
          <p className="text-2xl font-bold">{todayStats.length}</p>
        </div>
      </div>
    </div>
  )
}
