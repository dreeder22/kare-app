import { useEffect, useState } from 'react'
import { getRecords, createRecord, updateRecord } from '../lib/airtable'

const OUTREACH_STATUSES = ['Pending', 'Ready to Contact', 'DM Sent', 'Follow-up 1', 'Follow-up 2', 'Accepted', 'Declined', 'Re-engage']
const TIERS = ['Elite', 'Core', 'Rising']
const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Multi']

export default function Influencers() {
  const [tab, setTab] = useState('leads')
  const [leads, setLeads] = useState([])
  const [creators, setCreators] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [outreach, setOutreach] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [newLead, setNewLead] = useState({ handle: '', fullName: '', bio: '', followers: '', platform: 'Instagram', location: '', nicheTags: '' })
  const [generating, setGenerating] = useState(null)
  const [expandedOutreach, setExpandedOutreach] = useState(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [monthlyStats, setMonthlyStats] = useState([])
  const [syncMonth, setSyncMonth] = useState(new Date().getMonth() + 1)
  const [syncYear, setSyncYear] = useState(new Date().getFullYear())
  const [sending, setSending] = useState(null)
  const [findingLeads, setFindingLeads] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [l, c, camp, o, ms] = await Promise.all([
        getRecords('Leads'),
        getRecords('Creators'),
        getRecords('Creator Campaigns'),
        getRecords('Outreach Queue'),
        getRecords('Creator Monthly Stats')
      ])
      setLeads(l)
      setCreators(c)
      setCampaigns(camp)
      setOutreach(o)
      setMonthlyStats(ms)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function sendBriefAndContract(camp) {
    const creatorId = camp.fields['Linked Creator']?.[0]
    const creator = creators.find(c => c.id === creatorId)
    if (!creator) return alert('No linked creator found for this campaign')

    const creatorName = creator.fields['Full Name'] || creator.fields['Handle'] || ''
    const creatorEmail = creator.fields['Email'] || ''
    if (!creatorEmail) return alert(`No email found for ${creatorName}`)

    setSending(camp.id)
    try {
      const res = await fetch('/api/send-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorName,
          creatorHandle: creator.fields['Handle'] || '',
          creatorEmail,
          discountCode: creator.fields['Discount Code'] || '',
          creatorLink: creator.fields['Creator Link'] || ''
        })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Brief & agreement sent to ${creatorEmail}`)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (err) {
      alert(`Failed to send: ${err.message}`)
    } finally {
      setSending(null)
    }
  }

  async function addLead() {
    if (!newLead.handle) return
    await createRecord('Leads', {
      'Handle': newLead.handle,
      'Full Name': newLead.fullName,
      'Bio': newLead.bio,
      'Followers': parseInt(newLead.followers) || 0,
      'Platform': newLead.platform,
      'Location': newLead.location,
      'Outreach Status': 'Pending',
      'How Discovered': 'Manual',
      'Date Added': new Date().toISOString().split('T')[0]
    })
    setNewLead({ handle: '', fullName: '', bio: '', followers: '', platform: 'Instagram', location: '', nicheTags: '' })
    setShowAddLead(false)
    fetchAll()
  }

  async function updateLeadStatus(id, status) {
    await updateRecord('Leads', id, { 'Outreach Status': status })
    fetchAll()
  }

  async function generateDM(lead) {
    const handle = lead.fields['Handle']
    const bio = lead.fields['Bio'] || ''
    const followers = lead.fields['Followers'] || 0
    const platform = lead.fields['Platform'] || 'Instagram'
    const location = lead.fields['Location'] || ''
    const nicheTags = lead.fields['Niche Tags'] || []

    const brandSettingsRecords = await getRecords('Brand Settings')
    const brandSettings = {}
    brandSettingsRecords.forEach(r => { brandSettings[r.fields['Setting Name']] = r.fields['Value'] })

    setGenerating(lead.id)

    try {
      const response = await fetch('/api/generate-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: {
            handle,
            bio,
            followers: followers.toLocaleString(),
            platform,
            location,
            nicheTags: Array.isArray(nicheTags) ? nicheTags.join(', ') : nicheTags
          },
          brandSettings
        })
      })

      const messages = await response.json()
      if (messages.error) throw new Error(messages.error)

      await createRecord('Outreach Queue', {
        'Handle': handle,
        'Linked Lead': [lead.id],
        'Initial DM': messages.initialDM,
        'Comment Text': messages.comment,
        'Follow-up 1': messages.followUp1,
        'Follow-up 2': messages.followUp2,
        'Re-engage Message': messages.reEngage,
        'Date Generated': new Date().toISOString().split('T')[0]
      })

      await updateRecord('Leads', lead.id, { 'Outreach Status': 'Ready to Contact' })

      // Set follow-up reminder dates
      const today = new Date()
      const followUp1Date = new Date(today)
      followUp1Date.setDate(today.getDate() + 4)
      const followUp2Date = new Date(today)
      followUp2Date.setDate(today.getDate() + 10)
      const reEngageDate = new Date(today)
      reEngageDate.setDate(today.getDate() + 60)

      await fetch(`https://api.airtable.com/v0/${import.meta.env.VITE_AIRTABLE_BASE_ID}/Leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Follow Up 1 Date': followUp1Date.toISOString().split('T')[0],
            'Follow Up 2 Date': followUp2Date.toISOString().split('T')[0],
            'Re-Engage Date': reEngageDate.toISOString().split('T')[0]
          }
        })
      })

      fetchAll()
    } catch (err) {
      console.error('DM generation error:', err)
    } finally {
      setGenerating(null)
    }
  }

  async function deleteLead(leadId) {
    if (!confirm('Delete this lead?')) return
    try {
      await fetch(`https://api.airtable.com/v0/${import.meta.env.VITE_AIRTABLE_BASE_ID}/Leads/${leadId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_AIRTABLE_TOKEN}` }
      })
      fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  async function findLeads() {
    setFindingLeads(true)
    try {
      const res = await fetch('https://kare-app-production.up.railway.app/api/find-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.error) {
        alert('Error: ' + data.error)
      } else {
        // Save leads to Airtable
        let saved = 0
        for (const lead of data.leads) {
          await fetch(`https://api.airtable.com/v0/${import.meta.env.VITE_AIRTABLE_BASE_ID}/Leads`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_AIRTABLE_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                'Handle': lead.handle,
                'Full Name': lead.fullName,
                'Bio': lead.bio,
                'Followers': lead.followers,
                'Platform': lead.platform || 'Instagram',
                'Location': lead.location,
                'Outreach Status': 'Pending',
                'How Discovered': 'AI Daily',
                'Date Added': new Date().toISOString().split('T')[0]
              }
            })
          })
          saved++
        }
        alert(`Found ${data.count} new leads (${data.skipped} duplicates skipped). ${saved} saved.`)
        fetchAll()
      }
    } catch (err) {
      alert('Could not connect to local server. Make sure npm run dev:all is running.')
    } finally {
      setFindingLeads(false)
    }
  }

  async function lookupHandle(handle) {
    if (!handle) return alert('Enter a handle first')
    // Clean handle from URL if pasted
    const cleanHandle = '@' + handle.replace('https://www.instagram.com/', '').replace('@', '').replace(/\//g, '').replace('#', '').trim()
    if (cleanHandle !== handle) setNewLead(prev => ({...prev, handle: cleanHandle}))
    setLookingUp(true)
    try {
      const res = await fetch('https://kare-app-production.up.railway.app/api/lookup-handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle })
      })
      const data = await res.json()
      if (data.error) return alert('Error: ' + data.error)
      setNewLead(prev => ({
        ...prev,
        fullName: data.fullName || prev.fullName,
        bio: data.bio || prev.bio,
        followers: data.followers || prev.followers,
        location: data.location || prev.location,
        nicheTags: data.nicheTags?.join(', ') || prev.nicheTags
      }))
    } catch (err) {
      alert('Could not connect to server')
    } finally {
      setLookingUp(false)
    }
  }

  async function syncAllHistory() {
    setSyncingAll(true)
    try {
      const res = await fetch('/api/goaffpro-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      alert(`Full sync complete — Creators: ${data.updated + data.created}, Monthly records: ${data.monthlyAdded}`)
      fetchAll()
    } catch (err) {
      alert('Sync failed — check server is running')
    } finally {
      setSyncingAll(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">Influencers</h2>
          <p className="text-gray-400">Manage leads, outreach, creators and campaigns</p>
        </div>
        {tab === 'leads' && (
          <div className="flex gap-2">
            <button
              onClick={findLeads}
              disabled={findingLeads}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50"
              style={{backgroundColor: '#2C2C2A', color: '#B8963E', border: '1px solid #B8963E'}}
            >
              {findingLeads ? 'Finding Leads...' : 'Find Leads'}
            </button>
            <button
              onClick={() => setShowAddLead(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-black"
              style={{backgroundColor: '#B8963E'}}
            >
              + Add Lead
            </button>
          </div>
        )}
        {tab === 'creators' && (
          <div className="flex items-center gap-3">
            <select
              value={syncMonth}
              onChange={e => setSyncMonth(parseInt(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-600"
            >
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={syncYear}
              onChange={e => setSyncYear(parseInt(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-600"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={syncAllHistory}
              disabled={syncingAll}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50"
              style={{backgroundColor: '#2C2C2A', color: '#B8963E', border: '1px solid #B8963E'}}
            >
              {syncingAll ? 'Syncing...' : 'Sync All History'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-800">
        {['leads', 'outreach', 'creators', 'campaigns'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-yellow-600 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            {t === 'campaigns' ? 'Creator Campaigns' : t}
            <span className="ml-2 text-xs text-gray-600">
              {t === 'leads' ? leads.length : t === 'outreach' ? outreach.length : t === 'creators' ? creators.length : campaigns.length}
            </span>
          </button>
        ))}
      </div>

      {showAddLead && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="font-semibold mb-4">Add New Lead</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Handle *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="@username"
                        value={newLead.handle}
                        onChange={e => setNewLead({...newLead, handle: e.target.value})}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-600"
                      />
                      <button
                        onClick={() => lookupHandle(newLead.handle)}
                        disabled={lookingUp}
                        className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                        style={{backgroundColor: '#B8963E', color: 'black'}}
                      >
                        {lookingUp ? 'Looking up...' : 'Lookup'}
                      </button>
                    </div>
                  </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name</label>
              <input value={newLead.fullName} onChange={e => setNewLead(n => ({...n, fullName: e.target.value}))} placeholder="Full name" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Followers</label>
              <input value={newLead.followers} onChange={e => setNewLead(n => ({...n, followers: e.target.value}))} placeholder="e.g. 25000" type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Platform</label>
              <select value={newLead.platform} onChange={e => setNewLead(n => ({...n, platform: e.target.value}))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-600">
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Location</label>
              <input value={newLead.location} onChange={e => setNewLead(n => ({...n, location: e.target.value}))} placeholder="e.g. Austin TX" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bio</label>
              <input value={newLead.bio} onChange={e => setNewLead(n => ({...n, bio: e.target.value}))} placeholder="Paste their bio" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={addLead} className="px-4 py-2 rounded-lg text-sm font-semibold text-black" style={{backgroundColor: '#B8963E'}}>Save Lead</button>
            <button onClick={() => setShowAddLead(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Handle</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Followers</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Platform</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Discovered</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => {
                  const followUp1 = lead.fields['Follow Up 1 Date']
                  const followUp2 = lead.fields['Follow Up 2 Date']
                  const reEngage = lead.fields['Re-Engage Date']
                  const todayStr = new Date().toISOString().split('T')[0]
                  const status = lead.fields['Outreach Status']

                  let followUpBadge = null
                  let rowHighlight = ''

                  if (status === 'Contacted' && followUp1 && followUp1 <= todayStr) {
                    followUpBadge = 'Follow Up 1'
                    rowHighlight = 'bg-yellow-900 bg-opacity-20'
                  } else if (status === 'Follow Up 1 Sent' && followUp2 && followUp2 <= todayStr) {
                    followUpBadge = 'Follow Up 2'
                    rowHighlight = 'bg-orange-900 bg-opacity-20'
                  } else if (status === 'Follow Up 2 Sent' && reEngage && reEngage <= todayStr) {
                    followUpBadge = 'Re-Engage'
                    rowHighlight = 'bg-blue-900 bg-opacity-20'
                  }

                  return (
                <tr key={lead.id} className={`border-b border-gray-800 hover:bg-gray-800 transition-colors ${rowHighlight}`}>
                  <td className="px-4 py-3 font-medium">
                    {lead.fields['Handle'] ? (
                      <a
                        href={`https://www.instagram.com/${lead.fields['Handle'].replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{color: '#B8963E'}}
                      >
                        {lead.fields['Handle']}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{lead.fields['Full Name'] || '—'}</td>
                  <td className="px-4 py-3">{(lead.fields['Followers'] || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">{lead.fields['Platform'] || '—'}</td>
                  <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-400 text-xs">{lead.fields['Outreach Status'] || 'Pending'}</span>
                        {followUpBadge && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-600 text-black w-fit">
                            {followUpBadge} Due
                          </span>
                        )}
                      </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{lead.fields['How Discovered'] || '—'}</td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <select
                      value={lead.fields['Outreach Status'] || 'Pending'}
                      onChange={e => updateLeadStatus(lead.id, e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      {OUTREACH_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => generateDM(lead)}
                      disabled={generating === lead.id}
                      className="px-3 py-1 rounded text-xs font-semibold text-black disabled:opacity-50"
                      style={{backgroundColor: '#B8963E'}}
                    >
                      {generating === lead.id ? 'Generating...' : 'Generate DM'}
                    </button>
                    <button
                      onClick={() => deleteLead(lead.id)}
                      className="px-3 py-1 rounded text-xs font-semibold text-white bg-gray-700 hover:bg-red-900 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                  )
              })}
            </tbody>
          </table>
          {leads.length === 0 && <div className="p-8 text-center text-gray-500">No leads yet — add one manually or wait for AI discovery.</div>}
        </div>
      )}

      {tab === 'outreach' && (
        <div className="space-y-2">
          {outreach.map(o => (
            <div key={o.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedOutreach(expandedOutreach === o.id ? null : o.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{o.fields['Handle']}</span>
                  {o.fields['Full Name (from Linked Lead)'] && (
                    <span className="text-gray-400 text-sm">{o.fields['Full Name (from Linked Lead)']}</span>
                  )}
                  <span className="text-xs text-gray-500">{o.fields['Date Generated']}</span>
                </div>
                <span className="text-gray-400">{expandedOutreach === o.id ? '▲' : '▼'}</span>
              </button>
              {expandedOutreach === o.id && (
                <div className="px-6 pb-6 space-y-3 border-t border-gray-800 pt-4">
                  {[
                    { label: 'Initial DM', field: 'Initial DM' },
                    { label: 'Comment', field: 'Comment Text' },
                    { label: 'Follow-up 1', field: 'Follow-up 1' },
                    { label: 'Follow-up 2', field: 'Follow-up 2' },
                    { label: 'Re-engage', field: 'Re-engage Message' }
                  ].map(({ label, field }) => (
                    <div key={field} className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(o.fields[field] || '')
                            alert(`${label} copied!`)
                          }}
                          className="text-xs px-3 py-1 rounded font-semibold text-black"
                          style={{backgroundColor: '#B8963E'}}
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{o.fields[field] || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {outreach.length === 0 && <div className="p-8 text-center text-gray-500 bg-gray-900 border border-gray-800 rounded-xl">No outreach generated yet.</div>}
        </div>
      )}

      {tab === 'creators' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Handle</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Tier</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Discount Code</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Whitelist</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap border-l border-gray-700">All-Time Sales</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">All-Time Comm.</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">All-Time Units</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap border-l border-gray-700">Monthly Sales</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Monthly Comm.</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Monthly Units</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Period</th>
              </tr>
            </thead>
            <tbody>
              {[...creators].sort((a, b) => (b.fields['Total Sales'] || 0) - (a.fields['Total Sales'] || 0)).map(creator => {
                const periodLabel = `${String(syncMonth).padStart(2, '0')}/${syncYear}`
                const monthly = monthlyStats.find(ms =>
                  ms.fields['Period'] === periodLabel &&
                  ms.fields['Linked Creator']?.[0] === creator.id
                )
                return (
                  <tr key={creator.id} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 font-medium">{creator.fields['Handle']}</td>
                    <td className="px-4 py-3 text-gray-400">{creator.fields['Full Name'] || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        creator.fields['Tier'] === 'Elite' ? 'bg-yellow-900 text-yellow-400' :
                        creator.fields['Tier'] === 'Core' ? 'bg-blue-900 text-blue-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {creator.fields['Tier'] || 'Rising'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        creator.fields['Status'] === 'Active' ? 'bg-green-900 text-green-400' :
                        creator.fields['Status'] === 'Churned' ? 'bg-red-900 text-red-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {creator.fields['Status'] || 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{creator.fields['Discount Code'] || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          const handle = creator.fields['Handle'] || creator.fields['Full Name'] || 'creator'
                          const link = `https://app.leadsie.com/whitelist/kare?customUserId=${encodeURIComponent(handle)}`
                          navigator.clipboard.writeText(link)
                          alert(`Leadsie link copied for ${handle}`)
                        }}
                        className="px-3 py-1 rounded text-xs font-semibold text-black whitespace-nowrap"
                        style={{backgroundColor: '#B8963E'}}
                      >
                        Copy Link
                      </button>
                    </td>
                    <td className="px-4 py-3 border-l border-gray-700">${(creator.fields['Total Sales'] || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">${(creator.fields['Total Commissions'] || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{creator.fields['Total Units'] || 0}</td>
                    <td className="px-4 py-3 border-l border-gray-700">${(monthly?.fields['Sales'] || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">${(monthly?.fields['Commissions'] || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{monthly?.fields['Units'] || 0}</td>
                    <td className="px-4 py-3 text-gray-400">{periodLabel}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {creators.length === 0 && <div className="p-8 text-center text-gray-500">No creators yet — leads move here when accepted.</div>}
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Campaign</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Creator</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Content Type</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Stage</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Deadline</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Revenue</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Rating</th>
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs">Send</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(camp => {
                const creatorId = camp.fields['Linked Creator']?.[0]
                const creator = creators.find(c => c.id === creatorId)
                const creatorName = creator?.fields['Full Name'] || creator?.fields['Handle'] || '—'
                return (
                  <tr key={camp.id} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 font-medium">{camp.fields['Campaign Name']}</td>
                    <td className="px-4 py-3 text-gray-400">{creatorName}</td>
                    <td className="px-4 py-3 text-gray-400">{camp.fields['Content Type'] || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        camp.fields['Pipeline Stage'] === 'Posted' ? 'bg-green-900 text-green-400' :
                        camp.fields['Pipeline Stage'] === 'Review Content' ? 'bg-yellow-900 text-yellow-400' :
                        camp.fields['Pipeline Stage'] === 'Awaiting Content' ? 'bg-blue-900 text-blue-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {camp.fields['Pipeline Stage'] || 'Needs Brief'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{camp.fields['Posting Deadline'] || '—'}</td>
                    <td className="px-4 py-3">${(camp.fields['Revenue Generated'] || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-400">{camp.fields['Rating'] || '—'}</td>
                    <td className="px-4 py-3">
                      {camp.fields['Pipeline Stage'] === 'Needs Brief' && (
                        <button
                          onClick={() => sendBriefAndContract(camp)}
                          disabled={sending === camp.id}
                          className="px-3 py-1 rounded text-xs font-semibold text-black disabled:opacity-50 whitespace-nowrap"
                          style={{backgroundColor: '#B8963E'}}
                        >
                          {sending === camp.id ? 'Sending...' : 'Send Brief & Contract'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {campaigns.length === 0 && <div className="p-8 text-center text-gray-500">No creator campaigns yet.</div>}
        </div>
      )}
    </div>
  )
}
