import { countUsers } from '../../lib/auth.js'

// GET /api/auth/setup -> { needed: true } when no users exist yet
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  try {
    const n = await countUsers()
    return res.json({ success: true, needed: n === 0 })
  } catch (e) {
    if (/TABLE_NOT_FOUND|NOT_FOUND/i.test(e.message)) {
      return res.json({ success: true, needed: true, missingTable: true })
    }
    console.error('setup check error:', e)
    return res.status(500).json({ success: false, error: 'Could not check setup status' })
  }
}
