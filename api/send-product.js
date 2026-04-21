import { handleSendProduct } from '../lib/send-product-handler.js'

// POST /api/send-product
//
// Vercel serverless wrapper around the shared handler in lib/send-product-handler.js.
// Mirrored by an Express route in server.js for local dev — both must behave identically.
//
// CORS is enforced here (not in the shared handler — that's transport-agnostic).
// Allowed origins are the kāre production hosts. Not a public API.

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { status, body } = await handleSendProduct(req.body)
    return res.status(status).json(body)
  } catch (err) {
    console.error('send-product handler threw:', err)
    return res.status(500).json({ success: false, error: `Unhandled server error: ${err.message}` })
  }
}
