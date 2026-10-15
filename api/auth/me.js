import { getSessionCookie, verifySession } from '../../lib/auth.js'

// GET /api/auth/me -> { user } or 401
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  const session = verifySession(getSessionCookie(req))
  if (!session) {
    return res.status(401).json({ success: false, error: 'Not signed in' })
  }
  return res.json({
    success: true,
    user: { email: session.email, name: session.name, role: session.role }
  })
}
