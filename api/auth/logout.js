import { clearSessionCookie, isSecureRequest } from '../../lib/auth.js'

// POST /api/auth/logout
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  clearSessionCookie(res, { secure: isSecureRequest(req) })
  return res.json({ success: true })
}
