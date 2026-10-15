import {
  findUserByEmail, countUsers, createUser,
  hashPassword, verifyPassword, signSession, verifySession,
  getSessionCookie, setSessionCookie, clearSessionCookie, isSecureRequest
} from '../lib/auth.js'

// Single auth function (keeps Vercel's serverless-function count under the
// Hobby plan limit). Routes by ?action=:
//   GET  /api/auth?action=setup -> { needed }
//   GET  /api/auth?action=me    -> { user } or 401
//   POST /api/auth?action=login -> { email, password[, name, setup] }
//   POST /api/auth?action=logout

async function handleSetup(req, res) {
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

function handleMe(req, res) {
  const session = verifySession(getSessionCookie(req))
  if (!session) return res.status(401).json({ success: false, error: 'Not signed in' })
  return res.json({ success: true, user: { email: session.email, name: session.name, role: session.role } })
}

async function handleLogin(req, res) {
  const { email, password, name, setup } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' })
  }
  try {
    let userCount = 0
    try {
      userCount = await countUsers()
    } catch (e) {
      if (!/TABLE_NOT_FOUND|NOT_FOUND/i.test(e.message)) throw e
      userCount = 0
    }

    if (userCount === 0) {
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

function handleLogout(req, res) {
  clearSessionCookie(res, { secure: isSecureRequest(req) })
  return res.json({ success: true })
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const action = url.searchParams.get('action') || req.query?.action

  if (req.method === 'GET' && action === 'setup') return handleSetup(req, res)
  if (req.method === 'GET' && action === 'me') return handleMe(req, res)
  if (req.method === 'POST' && action === 'login') return handleLogin(req, res)
  if (req.method === 'POST' && action === 'logout') return handleLogout(req, res)
  return res.status(400).json({ success: false, error: 'Unknown auth action' })
}
