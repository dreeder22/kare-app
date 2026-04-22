import { Fragment, useEffect, useRef, useState } from 'react'
import { getRecords, createRecord, updateRecord } from '../lib/airtable'

const OUTREACH_STATUSES = ['Pending', 'Ready to Contact', 'DM Sent', 'Follow-up 1', 'Follow-up 2', 'Declined', 'Re-engage']

// Tab keys (internal) → user-facing labels.
const TAB_LABELS = {
  'leads': 'Leads',
  'warm-leads': 'Warm Leads',
  'creators': 'Creators',
  'campaigns': 'Creator Campaigns'
}

// Sort group index for the locked Leads-tab order. Lower index = higher in list.
//   0–5  → active pipeline stages (chronological flow)
//   50   → unknown / unmapped status (visible middle, won't disappear silently)
//   99   → terminal Declined (always at bottom)
// Future edits: keep terminal/dead-end statuses ≥ 90 and active pipeline ≤ 9
// so the unknown bucket at 50 stays a clear safe-fail visual signal.
const STATUS_SORT_GROUP = {
  'Pending': 0,
  'Ready to Contact': 1,
  'DM Sent': 2,
  'Follow-up 1': 3,
  'Follow-up 2': 4,
  'Re-engage': 5,
  'Declined': 99
}

// Statuses visible on the Leads tab (Sample Sent and unknowns are excluded).
const LEADS_TAB_STATUSES = new Set([
  'Pending', 'Ready to Contact', 'DM Sent', 'Follow-up 1', 'Follow-up 2', 'Re-engage', 'Declined'
])

// Status → sent-date field on Leads. Used both for stamping on advancement
// and for rendering "[stage] sent on [date]" in the collapsed-stage header.
const STAGE_SENT_DATE_FIELD = {
  initial: 'DM Sent Date',
  fu1: 'Follow-up 1 Sent Date',
  fu2: 'Follow-up 2 Sent Date',
  reengage: 'Re-engage Sent Date'
}

// Status → set of stages already sent (drives card-vs-header rendering).
const STATUS_TO_SENT_STAGES = {
  'Ready to Contact': new Set(),
  'DM Sent': new Set(['initial']),
  'Follow-up 1': new Set(['initial', 'fu1']),
  'Follow-up 2': new Set(['initial', 'fu1', 'fu2']),
  'Re-engage': new Set(['initial', 'fu1', 'fu2', 'reengage'])
}

// Forward transition for the Copy+confirm flow.
const NEXT_STATUS = {
  'Ready to Contact': 'DM Sent',
  'DM Sent': 'Follow-up 1',
  'Follow-up 1': 'Follow-up 2',
  'Follow-up 2': 'Re-engage'
}

// Stage metadata for the 5 message slots in the expanded row.
// `stage` keys map to STAGE_SENT_DATE_FIELD / STATUS_TO_SENT_STAGES.
// Comment is special-cased: gated=false means it's always active (no modal).
const STAGE_DEFS = [
  { stage: 'initial',  label: 'Initial DM',  field: 'Initial DM',         gated: true,  prevStage: null },
  { stage: 'comment',  label: 'Comment',     field: 'Comment Text',       gated: false, prevStage: null },
  { stage: 'fu1',      label: 'Follow-up 1', field: 'Follow-up 1',        gated: true,  prevStage: 'initial' },
  { stage: 'fu2',      label: 'Follow-up 2', field: 'Follow-up 2',        gated: true,  prevStage: 'fu1' },
  { stage: 'reengage', label: 'Re-engage',   field: 'Re-engage Message',  gated: true,  prevStage: 'fu2' }
]

function formatDateHuman(isoStr) {
  if (!isoStr) return ''
  // isoStr is "YYYY-MM-DD" from Airtable date fields. Parse as local date to
  // avoid timezone shifts that would display the wrong day in some zones.
  const [y, m, d] = isoStr.split('-').map(Number)
  if (!y || !m || !d) return isoStr
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysSince(isoStr) {
  if (!isoStr) return null
  const [y, m, d] = isoStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const then = new Date(y, m - 1, d)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.floor((now - then) / 86400000)
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}
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
  // Single expand-state used for both Leads tab (lead.id) and Warm Leads tab (lead.id).
  // A lead's row is expanded iff its id === expandedLead.
  const [expandedLead, setExpandedLead] = useState(null)
  // Copy+confirm modal state. null when closed; { stage, leadId, outreachId, handle, prevSentDate } when open.
  const [confirmSend, setConfirmSend] = useState(null)
  // Locked sort order for Leads tab. Rebuilt only on fetchAll(); status changes
  // mid-session mutate leads in place but do NOT re-sort. Forces operator to refresh
  // if they want to see reordered results.
  const sortMapRef = useRef(new Map())
  const [syncingAll, setSyncingAll] = useState(false)
  const [monthlyStats, setMonthlyStats] = useState([])
  const [syncMonth, setSyncMonth] = useState(new Date().getMonth() + 1)
  const [syncYear, setSyncYear] = useState(new Date().getFullYear())
  const [sending, setSending] = useState(null)
  const [findingLeads, setFindingLeads] = useState(false)
  const [leadSearch, setLeadSearch] = useState('')
  const [sendingProduct, setSendingProduct] = useState(null)
  const [showProductForm, setShowProductForm] = useState(null)
  const [productAddress, setProductAddress] = useState({
    firstName: '', lastName: '', email: '', address: '', address2: '', city: '', state: '', zip: '', variant: '', quantity: 1, creatorHandle: ''
  })

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

      // Rebuild the locked sort map from the freshly-fetched leads.
      // Key: lead.id. Value: a composite sort key where the high bits are
      // status group (from STATUS_SORT_GROUP) and the low bits are the
      // inverted Date Added epoch so newer leads come first within a group.
      const map = new Map()
      for (const lead of l) {
        const status = lead.fields['Outreach Status']
        const group = STATUS_SORT_GROUP[status] ?? 50
        const dateAdded = lead.fields['Date Added']
        const epoch = dateAdded ? Date.parse(dateAdded) : 0
        const invertedEpoch = Number.MAX_SAFE_INTEGER - (epoch || 0)
        map.set(lead.id, group * 1e13 + invertedEpoch)
      }
      sortMapRef.current = map
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
        await updateRecord('Creator Campaigns', camp.id, { 'Pipeline Stage': 'Brief/Contract Sent' })
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

  async function createCampaign(creator) {
    const campaignName = `${creator.fields['Handle']} — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    try {
      await fetch(`https://api.airtable.com/v0/${import.meta.env.VITE_AIRTABLE_BASE_ID}/Creator Campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Campaign Name': campaignName,
            'Linked Creator': [creator.id],
            'Pipeline Stage': 'Needs Brief'
          }
        })
      })
      alert(`Campaign created for ${creator.fields['Handle']}`)
      fetchAll()
    } catch (err) {
      alert('Error creating campaign')
      console.error(err)
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

      const messageFields = {
        'Handle': handle,
        'Initial DM': messages.initialDM,
        'Comment Text': messages.comment,
        'Follow-up 1': messages.followUp1,
        'Follow-up 2': messages.followUp2,
        'Re-engage Message': messages.reEngage,
        'Date Generated': new Date().toISOString().split('T')[0]
      }

      // Regenerate: if an Outreach Queue record already exists for this lead,
      // overwrite it in place rather than creating a duplicate. Do NOT reset
      // Outreach Status or follow-up due dates — regeneration refreshes copy only.
      const existing = outreach.find(o => o.fields['Linked Lead']?.[0] === lead.id)
      if (existing) {
        await updateRecord('Outreach Queue', existing.id, messageFields)
      } else {
        await createRecord('Outreach Queue', {
          ...messageFields,
          'Linked Lead': [lead.id]
        })

        await updateRecord('Leads', lead.id, { 'Outreach Status': 'Ready to Contact' })

        // Set follow-up reminder dates (first-generation only)
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
        .then(r => r.json())
        .then(d => console.log('Follow-up dates set:', d))
        .catch(err => console.error('Follow-up date error:', err))
      }

      await fetchAll()
      // Auto-expand the row so the operator sees the freshly generated messages.
      setExpandedLead(lead.id)
    } catch (err) {
      console.error('DM generation error:', err)
    } finally {
      setGenerating(null)
    }
  }

  async function deleteLead(leadId) {
    if (!confirm('Delete this lead?')) return
    try {
      // Block the handle from future AI discovery BEFORE deletion (non-fatal if it fails).
      const lead = leads.find(l => l.id === leadId)
      const handle = lead?.fields['Handle']
      if (handle) {
        await addToBlocklist(handle, 'Deleted from Leads')
      }
      await fetch(`https://api.airtable.com/v0/${import.meta.env.VITE_AIRTABLE_BASE_ID}/Leads/${leadId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_AIRTABLE_TOKEN}` }
      })
      fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  // Non-fatal: logs but does not throw. Caller always proceeds with deletion even
  // if blocklist insert fails — orphan deleted leads are recoverable; blocked undeletes aren't.
  async function addToBlocklist(handle, reason) {
    try {
      await createRecord('Blocked Handles', {
        'Handle': handle,
        'Blocked Date': todayIso(),
        'Reason': reason
      })
    } catch (err) {
      console.error('Blocklist insert failed (continuing anyway):', err)
    }
  }

  async function declineWarmLead(lead) {
    const handle = lead.fields['Handle']
    if (!confirm(`Decline ${handle}? They'll be removed from Warm Leads and added to your AI-discovery blocklist. This can't be undone through the app.`)) return
    try {
      if (handle) {
        await addToBlocklist(handle, 'Declined from Warm Leads')
      }
      await fetch(`https://api.airtable.com/v0/${import.meta.env.VITE_AIRTABLE_BASE_ID}/Leads/${lead.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_AIRTABLE_TOKEN}` }
      })
      fetchAll()
    } catch (err) {
      console.error(err)
      alert(`Failed to decline: ${err.message}`)
    }
  }

  async function sendProduct(lead) {
    setShowProductForm(lead.id)
    setProductAddress({
      firstName: '',
      lastName: '',
      email: '',
      address: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      variant: '',
      quantity: 1,
      creatorHandle: lead.fields['Handle'] || ''
    })
  }

  async function submitProductOrder() {
    setSendingProduct(showProductForm)
    try {
      // Build payload. Omit `quantity` when variant is 'both' — the server
      // computes line items (1 jar + 1 stick pack) from the variant alone.
      const payload = {
        firstName: productAddress.firstName,
        lastName: productAddress.lastName,
        email: productAddress.email,
        address: productAddress.address,
        address2: productAddress.address2,
        city: productAddress.city,
        state: productAddress.state,
        zip: productAddress.zip,
        variant: productAddress.variant,
        creatorHandle: productAddress.creatorHandle,
        leadRecordId: showProductForm
      }
      if (productAddress.variant !== 'both') {
        payload.quantity = productAddress.quantity
      }

      const res = await fetch('/api/send-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success) {
        const warningSuffix = data.airtableWarning ? `\n\n⚠️ ${data.airtableWarning}` : ''
        alert(`Order ${data.orderNumber} created!\nView: ${data.orderUrl}${warningSuffix}`)
        setShowProductForm(null)
        // Server already set Outreach Status = 'Sample Sent' on the lead.
        // fetchAll() refreshes local state so the lead disappears from the
        // Leads tab and appears on the Warm Leads tab via the per-tab filter.
        fetchAll()
      } else {
        alert(`Error creating order: ${data.error || `HTTP ${res.status}`}`)
      }
    } catch (err) {
      alert(`Failed to create order: ${err.message}`)
    } finally {
      setSendingProduct(null)
    }
  }

  // Advances status + stamps the corresponding sent-date on the Leads record.
  // Mutates local state (no refetch) so the locked sort order is preserved —
  // operator must refresh to see reordered pipeline.
  async function confirmSendAdvance() {
    if (!confirmSend) return
    const lead = leads.find(l => l.id === confirmSend.leadId)
    if (!lead) { setConfirmSend(null); return }
    const currentStatus = lead.fields['Outreach Status']
    const nextStatus = NEXT_STATUS[currentStatus]
    if (!nextStatus) { setConfirmSend(null); return }
    const sentField = STAGE_SENT_DATE_FIELD[confirmSend.stage]
    const today = todayIso()
    const fieldsPatch = {
      'Outreach Status': nextStatus,
      [sentField]: today
    }
    try {
      await updateRecord('Leads', lead.id, fieldsPatch)
      // Local in-place mutation — preserves sortMapRef ordering.
      setLeads(prev => prev.map(l =>
        l.id === lead.id
          ? { ...l, fields: { ...l.fields, ...fieldsPatch } }
          : l
      ))
    } catch (err) {
      console.error('Status advance failed:', err)
      alert(`Failed to advance status: ${err.message}`)
    } finally {
      setConfirmSend(null)
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

  // Build a per-lead lookup of the associated Outreach Queue record (if any).
  // Recomputed on every render — cheap for normal list sizes (<500 leads).
  const outreachByLeadId = new Map()
  for (const o of outreach) {
    const leadId = o.fields['Linked Lead']?.[0]
    if (leadId) outreachByLeadId.set(leadId, o)
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
        {['leads', 'warm-leads', 'creators', 'campaigns'].map(t => {
          // Leads tab count excludes Sample Sent + unknown statuses; Warm Leads = Sample Sent only.
          const count =
            t === 'leads' ? leads.filter(l => LEADS_TAB_STATUSES.has(l.fields['Outreach Status'])).length :
            t === 'warm-leads' ? leads.filter(l => l.fields['Outreach Status'] === 'Sample Sent').length :
            t === 'creators' ? creators.length :
            campaigns.length
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-yellow-600 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              {TAB_LABELS[t]}
              <span className="ml-2 text-xs text-gray-600">{count}</span>
            </button>
          )
        })}
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
        <>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search leads by handle, name, or bio..."
              value={leadSearch}
              onChange={e => setLeadSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-yellow-600"
            />
          </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="w-8"></th>
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
              {leads
                .filter(lead => LEADS_TAB_STATUSES.has(lead.fields['Outreach Status']))
                .filter(lead => {
                  if (!leadSearch) return true
                  const search = leadSearch.toLowerCase()
                  return (
                    lead.fields['Handle']?.toLowerCase().includes(search) ||
                    lead.fields['Full Name']?.toLowerCase().includes(search) ||
                    lead.fields['Bio']?.toLowerCase().includes(search) ||
                    lead.fields['Location']?.toLowerCase().includes(search)
                  )
                })
                .sort((a, b) => {
                  // Locked sort. Leads created mid-session (not in sortMapRef) go to the end.
                  const aKey = sortMapRef.current.get(a.id) ?? Number.MAX_SAFE_INTEGER
                  const bKey = sortMapRef.current.get(b.id) ?? Number.MAX_SAFE_INTEGER
                  return aKey - bKey
                })
                .map(lead => {
                  const followUp1 = lead.fields['Follow Up 1 Date']
                  const followUp2 = lead.fields['Follow Up 2 Date']
                  const reEngage = lead.fields['Re-Engage Date']
                  const todayStr = new Date().toISOString().split('T')[0]
                  const status = lead.fields['Outreach Status']

                  let followUpBadge = null
                  let rowHighlight = ''

                  if (status === 'DM Sent' && followUp1 && followUp1 <= todayStr) {
                    followUpBadge = 'Follow Up 1'
                    rowHighlight = 'bg-yellow-900 bg-opacity-20'
                  } else if (status === 'Follow-up 1' && followUp2 && followUp2 <= todayStr) {
                    followUpBadge = 'Follow Up 2'
                    rowHighlight = 'bg-orange-900 bg-opacity-20'
                  } else if (status === 'Follow-up 2' && reEngage && reEngage <= todayStr) {
                    followUpBadge = 'Re-Engage'
                    rowHighlight = 'bg-blue-900 bg-opacity-20'
                  }

                  const outreachRec = outreachByLeadId.get(lead.id)
                  const isExpanded = expandedLead === lead.id
                  const sentStages = STATUS_TO_SENT_STAGES[status] || new Set()

                  return (
                <Fragment key={lead.id}>
                <tr className={`border-b border-gray-800 hover:bg-gray-800 transition-colors ${rowHighlight}`}>
                  <td className="px-2 py-3 text-center">
                    {outreachRec ? (
                      <button
                        onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                        className="text-gray-400 hover:text-white text-xs w-6 h-6"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    ) : null}
                  </td>
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
                    <button
                      onClick={() => sendProduct(lead)}
                      className="px-3 py-1 rounded text-xs font-semibold text-black whitespace-nowrap"
                      style={{backgroundColor: '#B8963E'}}
                    >
                      Send Product
                    </button>
                  </td>
                </tr>
                {isExpanded && outreachRec && (
                  <tr className="border-b border-gray-800 bg-gray-950">
                    <td></td>
                    <td colSpan={7} className="px-4 py-4">
                      <div className="space-y-3">
                        {STAGE_DEFS.map(def => {
                          const msg = outreachRec.fields[def.field] || ''
                          const handle = lead.fields['Handle'] || ''
                          // Comment is ungated — always a full card, no modal.
                          if (!def.gated) {
                            return (
                              <div key={def.stage} className="bg-gray-800 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-gray-400 uppercase tracking-wide">{def.label}</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(msg)
                                      alert(`${def.label} copied!`)
                                    }}
                                    className="text-xs px-3 py-1 rounded font-semibold text-black"
                                    style={{backgroundColor: '#B8963E'}}
                                  >
                                    Copy
                                  </button>
                                </div>
                                <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg || '—'}</p>
                              </div>
                            )
                          }
                          // Gated stage — either already sent (compact header) or active (full card + Copy+confirm).
                          const alreadySent = sentStages.has(def.stage)
                          if (alreadySent) {
                            const sentDateIso = lead.fields[STAGE_SENT_DATE_FIELD[def.stage]]
                            const sentLabel = sentDateIso
                              ? `sent on ${formatDateHuman(sentDateIso)}`
                              : 'sent (date not recorded)'
                            return (
                              <div key={def.stage} className="bg-gray-800 bg-opacity-40 rounded-lg px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
                                <span className="uppercase tracking-wide">{def.label}</span>
                                <span>{sentLabel}</span>
                              </div>
                            )
                          }
                          return (
                            <div key={def.stage} className="bg-gray-800 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-400 uppercase tracking-wide">{def.label}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg)
                                    // Previous-stage sent-date, used to render "sent X days ago" clause
                                    // in the modal. Null when no previous stage OR previous stage's
                                    // sent-date is missing (same fall-through for both edge cases).
                                    const prevSentDate = def.prevStage
                                      ? lead.fields[STAGE_SENT_DATE_FIELD[def.prevStage]] || null
                                      : null
                                    setConfirmSend({
                                      stage: def.stage,
                                      label: def.label,
                                      leadId: lead.id,
                                      handle,
                                      prevStageLabel: def.prevStage
                                        ? STAGE_DEFS.find(s => s.stage === def.prevStage)?.label
                                        : null,
                                      prevSentDate
                                    })
                                  }}
                                  className="text-xs px-3 py-1 rounded font-semibold text-black"
                                  style={{backgroundColor: '#B8963E'}}
                                >
                                  Copy
                                </button>
                              </div>
                              <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg || '—'}</p>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                  )
              })}
            </tbody>
          </table>
          {leads.length === 0 && <div className="p-8 text-center text-gray-500">No leads yet — add one manually or wait for AI discovery.</div>}
        </div>
          {showProductForm && (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
                <h3 className="text-lg font-bold mb-4">Send Product</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">First Name</label>
                    <input type="text" value={productAddress.firstName} onChange={e => setProductAddress({...productAddress, firstName: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Last Name</label>
                    <input type="text" value={productAddress.lastName} onChange={e => setProductAddress({...productAddress, lastName: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Email</label>
                    <input type="text" value={productAddress.email} onChange={e => setProductAddress({...productAddress, email: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Address</label>
                    <input type="text" value={productAddress.address} onChange={e => setProductAddress({...productAddress, address: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Address 2 (optional)</label>
                    <input type="text" value={productAddress.address2} onChange={e => setProductAddress({...productAddress, address2: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">City</label>
                    <input type="text" value={productAddress.city} onChange={e => setProductAddress({...productAddress, city: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">State</label>
                    <input type="text" placeholder="UT" value={productAddress.state} onChange={e => setProductAddress({...productAddress, state: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Zip</label>
                    <input type="text" value={productAddress.zip} onChange={e => setProductAddress({...productAddress, zip: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Variant</label>
                    <select
                      value={productAddress.variant}
                      onChange={e => setProductAddress({...productAddress, variant: e.target.value})}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-600"
                    >
                      <option value="" disabled>— Select —</option>
                      <option value="jar">Jar</option>
                      <option value="sticks">Stick Packs</option>
                      <option value="both">Both (1 jar + 1 stick pack)</option>
                    </select>
                  </div>
                  {productAddress.variant !== 'both' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                      <input type="number" min="1" max="5" value={productAddress.quantity} onChange={e => setProductAddress({...productAddress, quantity: parseInt(e.target.value)})} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none" />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setShowProductForm(null)} className="flex-1 px-4 py-2 rounded-lg text-sm bg-gray-700 text-white">Cancel</button>
                  <button onClick={submitProductOrder} disabled={sendingProduct || !productAddress.variant} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50" style={{backgroundColor: '#B8963E'}}>
                    {sendingProduct ? 'Creating Order...' : 'Create Order'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'warm-leads' && (() => {
        // Warm Leads = leads the product has been shipped to. Filtered by status
        // (Sample Sent). Sorted ascending by Sample Follow-Up Due Date so the most
        // overdue creators bubble to the top. Leads with no due date go to the end.
        const warmLeads = leads
          .filter(l => l.fields['Outreach Status'] === 'Sample Sent')
          .sort((a, b) => {
            const aDue = a.fields['Sample Follow-Up Due Date'] || '9999-12-31'
            const bDue = b.fields['Sample Follow-Up Due Date'] || '9999-12-31'
            return aDue.localeCompare(bDue)
          })
        return (
          <div className="space-y-2">
            {warmLeads.map(lead => {
              const isExpanded = expandedLead === lead.id
              const shipDate = lead.fields['Sample Sent Date']
              const dueDate = lead.fields['Sample Follow-Up Due Date']
              const daysUntil = dueDate ? -daysSince(dueDate) : null // negative = overdue
              const orderNum = lead.fields['Shopify Order Number']
              const orderUrl = lead.fields['Shopify Order URL']
              let dueBadge = null
              if (daysUntil !== null) {
                if (daysUntil < 0) {
                  dueBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900 text-red-200">{Math.abs(daysUntil)}d overdue</span>
                } else if (daysUntil === 0) {
                  dueBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-700 text-yellow-100">due today</span>
                } else {
                  dueBadge = <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300">{daysUntil}d</span>
                }
              }
              return (
                <div key={lead.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{lead.fields['Handle']}</span>
                      {lead.fields['Full Name'] && (
                        <span className="text-gray-400 text-sm">{lead.fields['Full Name']}</span>
                      )}
                      {dueBadge}
                    </div>
                    <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-6 space-y-4 border-t border-gray-800 pt-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ship Date</div>
                          <div className="text-gray-200">{shipDate ? formatDateHuman(shipDate) : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Follow-Up Due</div>
                          <div className="text-gray-200">{dueDate ? formatDateHuman(dueDate) : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Shopify Order</div>
                          <div className="text-gray-200">
                            {orderUrl ? (
                              <a href={orderUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{color: '#B8963E'}}>
                                {orderNum || 'View order'}
                              </a>
                            ) : (orderNum || '—')}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</div>
                        {/* Saves to Airtable on blur. Local state mutated in-place to avoid refetch (preserves sort order). */}
                        <textarea
                          defaultValue={lead.fields['Notes'] || ''}
                          onBlur={async (e) => {
                            const newNotes = e.target.value
                            if (newNotes === (lead.fields['Notes'] || '')) return
                            try {
                              await updateRecord('Leads', lead.id, { 'Notes': newNotes })
                              setLeads(prev => prev.map(l =>
                                l.id === lead.id
                                  ? { ...l, fields: { ...l.fields, 'Notes': newNotes } }
                                  : l
                              ))
                            } catch (err) {
                              console.error('Notes save failed:', err)
                              alert(`Failed to save notes: ${err.message}`)
                            }
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-yellow-600 min-h-[80px]"
                          placeholder="Shipping confirmation, feedback, reply status..."
                        />
                      </div>
                      <div>
                        <button
                          onClick={() => declineWarmLead(lead)}
                          className="px-3 py-1 rounded text-xs font-semibold text-white bg-gray-700 hover:bg-red-900 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {warmLeads.length === 0 && (
              <div className="p-8 text-center text-gray-500 bg-gray-900 border border-gray-800 rounded-xl">
                No warm leads yet — product samples you send will appear here.
              </div>
            )}
          </div>
        )
      })()}

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
                <th className="text-left px-4 py-3 text-gray-400 uppercase tracking-wide text-xs whitespace-nowrap">Campaign</th>
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
                        onClick={async () => {
                          const handle = creator.fields['Handle'] || creator.fields['Full Name'] || 'creator'
                          const link = `https://app.leadsie.com/whitelist/kare?customUserId=${encodeURIComponent(handle)}`
                          navigator.clipboard.writeText(link)
                          alert(`Leadsie link copied for ${handle}`)
                          // Find linked campaign and update stage to Leadsie Sent
                          const creatorCampaign = campaigns.find(c => c.fields['Linked Creator']?.[0] === creator.id && c.fields['Pipeline Stage'] === 'Brief/Contract Received')
                          if (creatorCampaign) {
                            await updateRecord('Creator Campaigns', creatorCampaign.id, { 'Pipeline Stage': 'Leadsie Sent' })
                            fetchAll()
                          }
                        }}
                        className="px-3 py-1 rounded text-xs font-semibold text-black whitespace-nowrap"
                        style={{backgroundColor: '#B8963E'}}
                      >
                        Copy Link
                      </button>
                    </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => createCampaign(creator)}
                      className="px-3 py-1 rounded text-xs font-semibold whitespace-nowrap"
                      style={{backgroundColor: '#2C2C2A', color: '#B8963E', border: '1px solid #B8963E'}}
                    >
                      + Campaign
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
                      <select
                        value={camp.fields['Pipeline Stage'] || 'Needs Brief'}
                        onChange={async (e) => {
                          await updateRecord('Creator Campaigns', camp.id, { 'Pipeline Stage': e.target.value })
                          fetchAll()
                        }}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-600"
                      >
                        <option>Needs Brief</option>
                        <option>Brief/Contract Sent</option>
                        <option>Brief/Contract Received</option>
                        <option>Leadsie Sent</option>
                        <option>Waiting for Content</option>
                        <option>Content Received</option>
                        <option>Ad Running</option>
                        <option>Completed</option>
                      </select>
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

      {/* Copy+confirm modal. Clipboard write already happened on button click;
          this modal only controls whether we advance status + stamp sent-date. */}
      {confirmSend && (() => {
        const daysAgo = daysSince(confirmSend.prevSentDate)
        const hasPrevClause = confirmSend.prevStageLabel && daysAgo !== null
        return (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-3">Confirm send to Instagram</h3>
              <p className="text-sm text-gray-300 mb-2">
                You're copying <span className="font-semibold">{confirmSend.label}</span> for <span className="font-semibold">{confirmSend.handle}</span>.
              </p>
              {hasPrevClause && (
                <p className="text-sm text-gray-400 mb-2">
                  {confirmSend.prevStageLabel} was sent {daysAgo} {daysAgo === 1 ? 'day' : 'days'} ago.
                </p>
              )}
              <p className="text-sm text-gray-300 mb-4">
                Confirm you've actually sent {confirmSend.label} on Instagram?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmSend(null)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm bg-gray-700 text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSendAdvance}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-black"
                  style={{backgroundColor: '#B8963E'}}
                >
                  Yes, I sent {confirmSend.label}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
