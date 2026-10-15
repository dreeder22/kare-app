// Frontend Airtable client — talks to the backend proxy at /api/airtable/records,
// which holds the Airtable token server-side. No secrets in this file.
//
// Relative /api/* paths resolve to the same origin in production and to the
// Express dev server via the Vite proxy in vite.config.js during local dev.
//
// Every request carries credentials: 'include' so the session cookie is sent.

const PROXY_URL = '/api/airtable/records'
const CREDS = { credentials: 'include' }

export async function getRecords(table, params = '') {
  const extra = params.startsWith('?') ? params.slice(1) : params
  const qs = `table=${encodeURIComponent(table)}${extra ? `&${extra}` : ''}`
  const res = await fetch(`${PROXY_URL}?${qs}`, CREDS)
  if (!res.ok) throw new Error(await extractError(res))
  const data = await res.json()
  return data.records || []
}

export async function createRecord(table, fields) {
  const res = await fetch(PROXY_URL, {
    ...CREDS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, fields })
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}

// Batch create: array of field-objects, up to 100 per call (server chunks to Airtable's 10 limit)
export async function createRecords(table, fieldsArray) {
  const res = await fetch(PROXY_URL, {
    ...CREDS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, records: fieldsArray.map(fields => ({ fields })) })
  })
  if (!res.ok) throw new Error(await extractError(res))
  const data = await res.json()
  return data.records || []
}

export async function updateRecord(table, id, fields) {
  const url = `${PROXY_URL}?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`
  const res = await fetch(url, {
    ...CREDS,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}

export async function deleteRecord(table, id) {
  const url = `${PROXY_URL}?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`
  const res = await fetch(url, { ...CREDS, method: 'DELETE' })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}

async function extractError(res) {
  try {
    const data = await res.json()
    const err = data?.error
    if (err == null) return `HTTP ${res.status}`
    return typeof err === 'string' ? err : JSON.stringify(err)
  } catch {
    return `HTTP ${res.status}`
  }
}
