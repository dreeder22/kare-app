import {
  findUserByEmail, countUsers, createUser,
  hashPassword, verifyPassword, signSession,
  setSessionCookie, isSecureRequest
} from '../../lib/auth.js'

// POST /api/auth/login
// Body: { email, password }                       -> normal login
// Body: { email, password, name, setup: true }    -> first-run owner creation
//        (only allowed when the Users table is empty or missing)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { email, password, name, setup } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' })
  }

  try {
    let userCount = 0
    try {
      userCount = await countUsers()
    } catch (e) {
      // Missing Users table counts as first run (table gets created in Airtable UI).
      if (!/TABLE_NOT_FOUND|NOT_FOUND/i.test(e.message)) throw e
      userCount = 0
    }

    if (userCount === 0) {
      // First run: create the owner account.
      if (!setup || !name) {
        return res.status(403).json({ success: false, error: 'No users exist yet — create the owner account first', setupNeeded: true })
      }
      if (String(password).length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
      }
      const created = await createUser({
        name: String(name).slice(0, 100),
        email: String(email).toLowerCase().trim(),
        passwordHash: hashPassword(String(password)),
        role: 'owner'
      })
      const session = signSession({
        uid: created.id, email: String(email).toLowerCase().trim(),
        name: String(name).slice(0, 100), role: 'owner'
      })
      setSessionCookie(res, session, { secure: isSecureRequest(req) })
      return res.json({ success: true, user: { email: String(email).toLowerCase().trim(), name: String(name).slice(0, 100), role: 'owner' } })
    }

    const user = await findUserByEmail(email)
    if (!user || !verifyPassword(String(password), user.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' })
    }

    const session = signSession({ uid: user.id, email: user.email, name: user.name, role: user.role })
    setSessionCookie(res, session, { secure: isSecureRequest(req) })
    return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role } })
  } catch (err) {
    console.error('login error:', err)
    return res.status(500).json({ success: false, error: 'Login failed — please try again' })
  }
}
