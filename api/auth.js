import {
  findUserByEmail, countUsers, createUser, listUsers, updateUserPassword,
  hashPassword, verifyPassword, signSession, verifySession,
  getSessionCookie, setSessionCookie, clearSessionCookie, isSecureRequest,
  requireSession
} from '../lib/auth.js'

// Single auth function (keeps Vercel's serverless-function count under the
// Hobby plan limit). Routes by ?action=:
//   GET  /api/auth?action=setup      -> { needed }
//   GET  /api/auth?action=me         -> { user } or 401
//   GET  /api/auth?action=users      -> owner only, list users
//   POST /api/auth?action=login      -> { email, password[, name, setup] }
//   POST /api/auth?action=logout
//   POST /api/auth?action=create-user -> owner only { name, email, password, role }
//   POST /api/auth?action=set-password -> owner only { email, password }

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

async function handleListUsers(req, res) {
  const session = requireSession(req, res, ['owner'])
  if (!session) return
  try {
    const users = await listUsers()
    return res.json({ success: true, users })
  } catch (err) {
    console.error('list users error:', err)
    return res.status(500).json({ success: false, error: 'Could not load users' })
  }
}

async function handleCreateUser(req, res) {
  const session = requireSession(req, res, ['owner'])
  if (!session) return
  const { name, email, password, role } = req.body || {}
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email and password are required' })
  }
  if (role !== 'owner' && role !== 'outreach') {
    return res.status(400).json({ success: false, error: 'Role must be owner or outreach' })
  }
  if (String(password).length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
  }
  const cleanEmail = String(email).toLowerCase().trim()
  try {
    const existing = await findUserByEmail(cleanEmail)
    if (existing) {
      return res.status(409).json({ success: false, error: 'That email already has a login' })
    }
    await createUser({
      name: String(name).slice(0, 100),
      email: cleanEmail,
      passwordHash: hashPassword(String(password)),
      role
    })
    return res.json({ success: true })
  } catch (err) {
    console.error('create user error:', err)
    return res.status(500).json({ success: false, error: 'Could not create the login' })
  }
}

async function handleSetPassword(req, res) {
  const session = requireSession(req, res, ['owner'])
  if (!session) return
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and new password are required' })
  }
  if (String(password).length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
  }
  try {
    const user = await findUserByEmail(String(email).toLowerCase().trim())
    if (!user) {
      return res.status(404).json({ success: false, error: 'No login found for that email' })
    }
    await updateUserPassword(user.id, hashPassword(String(password)))
    return res.json({ success: true })
  } catch (err) {
    console.error('set password error:', err)
    return res.status(500).json({ success: false, error: 'Could not reset the password' })
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const action = url.searchParams.get('action') || req.query?.action

  if (req.method === 'GET' && action === 'setup') return handleSetup(req, res)
  if (req.method === 'GET' && action === 'me') return handleMe(req, res)
  if (req.method === 'GET' && action === 'users') return handleListUsers(req, res)
  if (req.method === 'POST' && action === 'login') return handleLogin(req, res)
  if (req.method === 'POST' && action === 'logout') return handleLogout(req, res)
  if (req.method === 'POST' && action === 'create-user') return handleCreateUser(req, res)
  if (req.method === 'POST' && action === 'set-password') return handleSetPassword(req, res)
  return res.status(400).json({ success: false, error: 'Unknown auth action' })
}
