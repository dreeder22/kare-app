import { useState } from 'react'
import { createRecord } from '../lib/airtable'

const OBJECTIVES = [
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
  'OUTCOME_LEADS',
  'OUTCOME_ENGAGEMENT'
]

export default function Launcher() {
  const [form, setForm] = useState({
    campaignName: '',
    objective: 'OUTCOME_SALES',
    dailyBudget: '',
    audience: '',
    isWhitelisted: false,
    creatorPageId: '',
    startDate: '',
    primaryText: '',
    headline: '',
    creativeUrl: '',
    altText: '',
    urlParams: '',
    instagramActorId: '',
    postId: ''
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async () => {
    if (!form.campaignName || !form.dailyBudget) {
      setError('Campaign name and daily budget are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await createRecord('Campaigns', {
        'Campaign Name': form.campaignName,
        'Objective': form.objective,
        'Daily Budget': parseInt(form.dailyBudget) * 100,
        'Audience': form.audience,
        'Campaign Status': 'LAUNCH',
        'Is Whitelisted': form.isWhitelisted,
        'Creator Page ID': form.creatorPageId,
        'Start Date': form.startDate || null,
        'Primary Text': form.primaryText,
        'Headline': form.headline,
        'Creative URL': form.creativeUrl,
        'Alt Text': form.altText,
        'URL Parameters': form.urlParams,
        'Instagram Actor ID': form.instagramActorId,
        'Post ID': form.postId
      })
      setSuccess(true)
      setForm({
        campaignName: '',
        objective: 'OUTCOME_SALES',
        dailyBudget: '',
        audience: '',
        isWhitelisted: false,
        creatorPageId: '',
        startDate: '',
        primaryText: '',
        headline: '',
        creativeUrl: '',
        altText: '',
        urlParams: '',
        instagramActorId: '',
        postId: ''
      })
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold mb-2">Campaign Launcher</h2>
      <p className="text-gray-400 mb-8">Fill out the details and hit Launch — Make.com builds it in Meta automatically.</p>

      {success && (
        <div className="bg-green-900 border border-green-700 text-green-300 rounded-xl p-4 mb-6">
          Campaign sent to Airtable — Make.com will build it in Meta within minutes.
        </div>
      )}

      {error && (
        <div className="bg-red-900 border border-red-700 text-red-300 rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
          <input
            name="campaignName"
            value={form.campaignName}
            onChange={handleChange}
            placeholder="e.g. kāre — Gut Health — ASC"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Objective</label>
          <select
            name="objective"
            value={form.objective}
            onChange={handleChange}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-600"
          >
            {OBJECTIVES.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Daily Budget (USD)</label>
          <input
            name="dailyBudget"
            value={form.dailyBudget}
            onChange={handleChange}
            type="number"
            placeholder="e.g. 50"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600"
          />
          <p className="text-xs text-gray-600 mt-1">Enter in dollars — converted to cents automatically</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Audience Notes (optional)</label>
          <textarea
            name="audience"
            value={form.audience}
            onChange={handleChange}
            placeholder="e.g. US, 30-65, health conscious, broad"
            rows={3}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Start Date (optional)</label>
          <input
            name="startDate"
            value={form.startDate}
            onChange={handleChange}
            type="date"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-600"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            name="isWhitelisted"
            checked={form.isWhitelisted}
            onChange={handleChange}
            type="checkbox"
            className="w-4 h-4 accent-yellow-600"
          />
          <label className="text-sm text-gray-400">Whitelisted creator ad</label>
        </div>

        {form.isWhitelisted && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Creator Page ID</label>
            <input
              name="creatorPageId"
              value={form.creatorPageId}
              onChange={handleChange}
              placeholder="Meta Page ID of the creator"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600"
            />
          </div>
        )}

        {form.isWhitelisted && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Instagram Actor ID</label>
            <input
              name="instagramActorId"
              value={form.instagramActorId}
              onChange={handleChange}
              placeholder="Creator's Instagram account ID"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600"
            />
          </div>
        )}

        {form.isWhitelisted && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Post ID (optional)</label>
            <input
              name="postId"
              value={form.postId}
              onChange={handleChange}
              placeholder="Existing post ID to whitelist"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-600"
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{backgroundColor: '#B8963E'}}
        >
          {loading ? 'Launching...' : 'Launch Campaign'}
        </button>
      </div>
    </div>
  )
}
