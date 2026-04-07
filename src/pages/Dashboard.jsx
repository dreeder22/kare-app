import { useEffect, useState } from 'react'
import { getRecords } from '../lib/airtable'

export default function Dashboard() {
  const [stats, setStats] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

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
  const todayStats = stats.filter(ad => ad.fields['Date'] === today)
  const totalSpend = todayStats.reduce((sum, ad) => sum + (ad.fields.Spend || 0), 0)
  const totalConversions = todayStats.reduce((sum, ad) => sum + (ad.fields.Conversions || 0), 0)
  const totalImpressions = todayStats.reduce((sum, ad) => sum + (ad.fields.Impressions || 0), 0)
  const avgROAS = todayStats.length ? (todayStats.reduce((sum, ad) => sum + (ad.fields.ROAS || 0), 0) / todayStats.length).toFixed(2) : 0
  const activeAds = todayStats.filter(ad => ad.fields['Ad Status'] === 'ACTIVE').length
  const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
  const todayRevenue = orders.filter(o => o.fields['Created At']?.startsWith(todayFormatted))
  const totalRevenue = todayRevenue.reduce((sum, o) => sum + (o.fields['Total Price'] || 0), 0)
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
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ads Running</p>
          <p className="text-2xl font-bold">{todayStats.length}</p>
        </div>
      </div>
    </div>
  )
}
