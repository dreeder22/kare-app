import { useEffect, useState } from 'react'
import { getRecords } from '../lib/airtable'

export default function Ads() {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('Spend')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getRecords('Daily Ad Stats', '?sort[0][field]=Date&sort[0][direction]=desc')
        setStats(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const sorted = [...stats].sort((a, b) => {
    const av = a.fields[sortField] || 0
    const bv = b.fields[sortField] || 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortField(field); setSortDir('desc') }
  }

  const cols = ['Ad Name', 'Date', 'Ad Status', 'Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Conversions', 'CPA', 'ROAS']

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-2">Ad Performance</h2>
      <p className="text-gray-400 mb-6">Daily snapshot of all running ads</p>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {cols.map(col => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs cursor-pointer hover:text-white whitespace-nowrap"
                >
                  {col} {sortField === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(record => (
              <tr key={record.id} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                <td className="px-4 py-3 font-medium max-w-48 truncate">{record.fields['Ad Name']}</td>
                <td className="px-4 py-3 text-gray-400">{record.fields['Date']}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${record.fields['Ad Status'] === 'ACTIVE' ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                    {record.fields['Ad Status']}
                  </span>
                </td>
                <td className="px-4 py-3">${(record.fields['Spend'] || 0).toFixed(2)}</td>
                <td className="px-4 py-3">{(record.fields['Impressions'] || 0).toLocaleString()}</td>
                <td className="px-4 py-3">{(record.fields['Clicks'] || 0).toLocaleString()}</td>
                <td className="px-4 py-3">{(record.fields['CTR'] || 0).toFixed(2)}%</td>
                <td className="px-4 py-3">${(record.fields['CPC'] || 0).toFixed(2)}</td>
                <td className="px-4 py-3">{record.fields['Conversions'] || 0}</td>
                <td className="px-4 py-3">${(record.fields['CPA'] || 0).toFixed(2)}</td>
                <td className="px-4 py-3">{(record.fields['ROAS'] || 0).toFixed(2)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
        {stats.length === 0 && (
          <div className="p-8 text-center text-gray-500">No data yet — check back after tomorrow's 7:30am run.</div>
        )}
      </div>
    </div>
  )
}
