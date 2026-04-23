/**
 * Airtable proxy handler — server-side only.
 *
 * Security posture (Phase 1):
 *   - Airtable token lives server-side only (AIRTABLE_TOKEN env var)
 *   - CORS restricts the proxy to kare production origins + localhost dev
 *   - NO per-request authentication — any caller from allowed origin can
 *     read/write the entire Airtable base
 *
 * This is a meaningful improvement over the previous state (VITE_ prefix
 * exposing the token in every client JS bundle) but is not yet safe for
 * multi-tenant SaaS. Per-user session auth must be added before the app
 * is shared with any non-owner user.
 */

// Used by:
//   - api/airtable/records.js  (Vercel serverless function)
//   - server.js                (local dev Express routes)
// Both wrappers pass { method, query, body } in and forward the returned
// { status, body } to the HTTP response.

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0'

// --- env resolution (once at module load) ---
const TOKEN = process.env.AIRTABLE_TOKEN || process.env.VITE_AIRTABLE_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID

if (!process.env.AIRTABLE_TOKEN && process.env.VITE_AIRTABLE_TOKEN) {
  console.warn('airtable-proxy: using VITE_AIRTABLE_TOKEN fallback — rotate to AIRTABLE_TOKEN (Phase 3)')
}
if (!process.env.AIRTABLE_BASE_ID && process.env.VITE_AIRTABLE_BASE_ID) {
  console.warn('airtable-proxy: using VITE_AIRTABLE_BASE_ID fallback — rename to AIRTABLE_BASE_ID (Phase 3)')
}

export async function handleAirtableProxy({ method, query, body }) {
  if (!TOKEN || !BASE_ID) {
    return {
      status: 500,
      body: { success: false, error: 'Server misconfigured: Airtable env vars missing' }
    }
  }

  switch (method) {
    case 'GET':    return handleGet(query)
    case 'POST':   return handlePost(body)
    case 'PATCH':  return handlePatch(query, body)
    case 'DELETE': return handleDelete(query)
    default:
      return { status: 405, body: { success: false, error: `Method not allowed: ${method}` } }
  }
}

// ---------- GET: list with auto-pagination ----------

async function handleGet(query) {
  const table = query.get('table')
  if (!table) {
    return { status: 400, body: { success: false, error: 'Missing required query param: table' } }
  }

  // Build forwarded params — everything except `table` and `id`.
  const forwarded = new URLSearchParams()
  for (const [k, v] of query.entries()) {
    if (k === 'table' || k === 'id') continue
    forwarded.append(k, v)
  }

  const allRecords = []
  let offset = null

  try {
    do {
      if (offset) forwarded.set('offset', offset)
      else forwarded.delete('offset')

      const qs = forwarded.toString()
      const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
      })

      if (!res.ok) {
        const errBody = await readErrorBody(res)
        console.error('airtable-proxy: GET', table, res.status, errBody)
        return {
          status: res.status,
          body: { success: false, error: errBody }
        }
      }

      const data = await res.json()
      if (data.records) allRecords.push(...data.records)
      offset = data.offset || null
    } while (offset)

    return { status: 200, body: { records: allRecords } }
  } catch (err) {
    console.error('airtable-proxy: GET', table, 'network error:', err)
    return { status: 502, body: { success: false, error: `Airtable network error: ${err.message}` } }
  }
}

// ---------- POST: create single record ----------

async function handlePost(body) {
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { success: false, error: 'Request body must be a JSON object' } }
  }
  const { table, fields } = body
  if (!table) {
    return { status: 400, body: { success: false, error: 'Missing required field: table' } }
  }
  if (!fields || typeof fields !== 'object') {
    return { status: 400, body: { success: false, error: 'Missing or invalid field: fields' } }
  }

  try {
    const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${encodeURIComponent(table)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    })

    if (!res.ok) {
      const errBody = await readErrorBody(res)
      console.error('airtable-proxy: POST', table, res.status, errBody)
      return { status: res.status, body: { success: false, error: errBody } }
    }

    const record = await res.json()
    return { status: 200, body: record }
  } catch (err) {
    console.error('airtable-proxy: POST', table, 'network error:', err)
    return { status: 502, body: { success: false, error: `Airtable network error: ${err.message}` } }
  }
}

// ---------- PATCH: update single record ----------

async function handlePatch(query, body) {
  const table = query.get('table')
  const id = query.get('id')
  if (!table) return { status: 400, body: { success: false, error: 'Missing required query param: table' } }
  if (!id) return { status: 400, body: { success: false, error: 'Missing required query param: id' } }

  if (!body || typeof body !== 'object') {
    return { status: 400, body: { success: false, error: 'Request body must be a JSON object' } }
  }
  const { fields } = body
  if (!fields || typeof fields !== 'object') {
    return { status: 400, body: { success: false, error: 'Missing or invalid field: fields' } }
  }

  try {
    const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    })

    if (!res.ok) {
      const errBody = await readErrorBody(res)
      console.error('airtable-proxy: PATCH', table, id, res.status, errBody)
      return { status: res.status, body: { success: false, error: errBody } }
    }

    const record = await res.json()
    return { status: 200, body: record }
  } catch (err) {
    console.error('airtable-proxy: PATCH', table, id, 'network error:', err)
    return { status: 502, body: { success: false, error: `Airtable network error: ${err.message}` } }
  }
}

// ---------- DELETE: delete single record ----------

async function handleDelete(query) {
  const table = query.get('table')
  const id = query.get('id')
  if (!table) return { status: 400, body: { success: false, error: 'Missing required query param: table' } }
  if (!id) return { status: 400, body: { success: false, error: 'Missing required query param: id' } }

  try {
    const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    })

    if (!res.ok) {
      const errBody = await readErrorBody(res)
      console.error('airtable-proxy: DELETE', table, id, res.status, errBody)
      return { status: res.status, body: { success: false, error: errBody } }
    }

    return { status: 200, body: { deleted: true, id } }
  } catch (err) {
    console.error('airtable-proxy: DELETE', table, id, 'network error:', err)
    return { status: 502, body: { success: false, error: `Airtable network error: ${err.message}` } }
  }
}

// ---------- helpers ----------

async function readErrorBody(res) {
  try {
    const text = await res.text()
    try { return JSON.parse(text) } catch { return text.slice(0, 500) }
  } catch {
    return `HTTP ${res.status}`
  }
}
