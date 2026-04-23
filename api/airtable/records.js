import { handleAirtableProxy } from '../../lib/airtable-proxy-handler.js'

// /api/airtable/records
//
// Vercel serverless wrapper around the shared Airtable proxy handler.
// Mirrored by Express routes in server.js for local dev — both must behave
// identically.
//
// CORS is enforced here (not in the shared handler — that's transport-agnostic).

const ALLOWED_ORIGINS = new Set([
  'https://app.takingkare.net',
  'https://takingkare.net',
  'https://www.takingkare.net'
])

function applyCors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Parse query from raw URL so Airtable's bracket syntax (sort[0][field]=X)
  // survives intact — framework query parsers otherwise turn it into nested objects.
  const query = extractQuery(req.url)

  try {
    const { status, body } = await handleAirtableProxy({
      method: req.method,
      query,
      body: req.body
    })
    return res.status(status).json(body)
  } catch (err) {
    console.error('airtable-proxy wrapper threw:', err)
    return res.status(500).json({ success: false, error: `Unhandled server error: ${err.message}` })
  }
}

function extractQuery(url) {
  const qIndex = (url || '').indexOf('?')
  return new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '')
}
