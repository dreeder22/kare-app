import { useState, useRef } from 'react'
import { getRecords, createRecords } from '../lib/airtable'

// Parse CSV respecting quoted fields that may contain commas/newlines.
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

// Map flexible header names to our fields.
const HEADER_MAP = {
  handle: 'handle', username: 'handle', ig: 'handle', instagram: 'handle',
  name: 'name', fullname: 'name', 'full name': 'name',
  followers: 'followers', follower: 'followers', followercount: 'followers', 'follower count': 'followers',
  niche: 'niche', category: 'niche', tier: 'niche',
  bio: 'bio', description: 'bio', why: 'bio', whyfit: 'bio', 'why fit': 'bio',
  url: 'url', link: 'url', profile: 'url',
  location: 'location', city: 'location'
}

function normalizeHeader(h) {
  const key = String(h || '').trim().toLowerCase()
  return HEADER_MAP[key] || null
}

export default function CsvImport({ onClose, onDone }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setFileName(file.name)
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.length < 2) {
        setError('CSV looks empty — need a header row plus data rows.')
        setRows([])
        return
      }
      const headers = parsed[0].map(normalizeHeader)
      if (!headers.includes('handle')) {
        setError('Could not find a handle column. Expected a header like "handle" or "username".')
        setRows([])
        return
      }
      const data = parsed.slice(1).map(cells => {
        const obj = {}
        headers.forEach((key, i) => {
          if (key && cells[i] !== undefined) obj[key] = String(cells[i]).trim()
        })
        return obj
      }).filter(r => r.handle)
      setRows(data)
    } catch {
      setError('Could not read that file.')
      setRows([])
    }
  }

  const doImport = async () => {
    setError('')
    setImporting(true)
    try {
      // Dedup against existing leads
      setProgress('Checking for duplicates…')
      const existing = await getRecords('Leads', 'fields[]=Handle')
      const seen = new Set(existing.map(r => String(r.fields?.Handle || '').toLowerCase()))
      const fresh = rows.filter(r => {
        const h = String(r.handle).replace(/^@/, '').toLowerCase()
        if (seen.has(h)) return false
        seen.add(h)
        return true
      })
      const skipped = rows.length - fresh.length
      if (fresh.length === 0) {
        setProgress('')
        setError(skipped > 0 ? `All ${skipped} rows are already in your leads.` : 'Nothing to import.')
        setImporting(false)
        return
      }
      const today = new Date().toISOString().split('T')[0]
      let done = 0
      for (let i = 0; i < fresh.length; i += 100) {
        const chunk = fresh.slice(i, i + 100)
        setProgress(`Importing ${done + 1}–${done + chunk.length} of ${fresh.length}…`)
        await createRecords('Leads', chunk.map(r => ({
          'Handle': String(r.handle).replace(/^@/, '').trim(),
          'Full Name': r.name || '',
          'Bio': [r.bio, r.niche ? `Niche: ${r.niche}` : ''].filter(Boolean).join(' | ').slice(0, 500),
          'Followers': parseInt(String(r.followers || '').replace(/[^0-9]/g, ''), 10) || 0,
          'Platform': 'Instagram',
          'Location': r.location || '',
          'Outreach Status': 'Pending',
          'How Discovered': 'CSV Import',
          'Date Added': today
        })))
        done += chunk.length
      }
      setProgress('')
      onDone(`Imported ${fresh.length} leads${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}.`)
      onClose()
    } catch (err) {
      setProgress('')
      setError(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
      <h3 className="font-semibold mb-1">Import leads from CSV</h3>
      <p className="text-xs text-gray-500 mb-4">
        Columns: handle (required), name, followers, niche, bio, url, location. Duplicates are skipped automatically.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-400 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700 file:cursor-pointer"
      />

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {progress && <p className="text-sm text-gray-300 mb-4">{progress}</p>}

      {rows.length > 0 && !importing && (
        <>
          <p className="text-sm text-gray-300 mb-2">
            {fileName} — <span className="font-semibold text-white">{rows.length}</span> leads ready
            {rows[0]?.followers ? ` · sample: @${rows[0].handle} (${rows[0].followers} followers)` : ` · sample: @${rows[0].handle}`}
          </p>
          <div className="max-h-48 overflow-auto border border-gray-800 rounded-lg mb-4">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="text-left text-gray-400">
                  <th className="px-3 py-2">Handle</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Followers</th>
                  <th className="px-3 py-2">Niche</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="px-3 py-1.5 text-white">@{String(r.handle).replace(/^@/, '')}</td>
                    <td className="px-3 py-1.5 text-gray-400">{r.name || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-400">{r.followers || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-400">{r.niche || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <p className="text-xs text-gray-500 px-3 py-2">…and {rows.length - 10} more</p>}
          </div>
        </>
      )}

      <div className="flex gap-3">
        <button
          onClick={doImport}
          disabled={rows.length === 0 || importing}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50"
          style={{ backgroundColor: '#B8963E' }}
        >
          {importing ? 'Importing…' : `Import ${rows.length} leads`}
        </button>
        <button onClick={onClose} disabled={importing} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  )
}
