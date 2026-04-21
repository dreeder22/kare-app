import { handleSendProduct } from '../lib/send-product-handler.js'

// POST /api/send-product
//
// Vercel serverless wrapper around the shared handler in lib/send-product-handler.js.
// Mirrored by an Express route in server.js for local dev — both must behave identically.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
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
