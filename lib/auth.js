/**
 * Shared session auth for the kare Command Center.
 *
 * Used by:
 *   - api/auth/login.js, api/auth/logout.js, api/auth/me.js (Vercel)
 *   - server.js (Express, local dev + Railway)
 *
 * Design:
 *   - Users live in the Airtable `Users` table: Name, Email, PasswordHash, Role.
 *   - Sessions are stateless HMAC-signed cookies (no server session store,
 *     works on serverless). Cookie: base64url(payload) + '.' + hex(hmac).
 *   - Roles: 'owner' (everything) and 'outreach' (creator pipeline only —
 *     no Orders, ad stats, or revenue tables).
 *
 * Env:
 *   SESSION_SECRET — required in production for signing cookies.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'kare_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Tables the outreach role may touch. Owner may touch everything.
// NOTE: 'Users' is never exposed through the generic records proxy.
const OUTREACH_TABLES = new Set([
  'Leads',
  'Outreach Queue',
  'Creators',
  'Creator Campaigns',
  'Blocked Handles'
])

export function tableAllowedForRole(table, role) {
  if (table === 'Users') return false
  if (role === 'owner') return true
  if (role === 'outreach') return OUTREACH_TABLES.has(table)
  return false
}

function sessionSecret() {
  const s = process.env.SESSION_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Server misconfigured: SESSION_SECRET env var missing')
    }
    return 'dev-only-insecure-secret'
  }
  return s
}

function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

function b64urlDecode(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'))
}

export function signSession({ uid, email, name, role }) {
  const payload = b64urlEncode({
    uid, email, name, role,
    exp: Date.now() + SESSION_TTL_MS
  })
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifySession(cookieValue) {
  try {
    if (!cookieValue || typeof cookieValue !== 'string') return null
    const dot = cookieValue.lastIndexOf('.')
    if (dot < 0) return null
    const payload = cookieValue.slice(0, dot)
    const sig = cookieValue.slice(dot + 1)
    const expected = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const data = b64urlDecode(payload)
    if (!data.exp || data.exp < Date.now()) return null
    if (data.role !== 'owner' && data.role !== 'outreach') return null
    return data
  } catch {
    return null
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':')
    if (!salt || !hash) return false
    const derived = scryptSync(password, salt, 64).toString('hex')
    const a = Buffer.from(derived, 'hex')
    const b = Buffer.from(hash, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function getSessionCookie(req) {
  const header = req.headers?.cookie || ''
  const pair = header.split(';').map(s => s.trim()).find(s => s.startsWith(SESSION_COOKIE + '='))
  if (!pair) return null
  return decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1))
}

export function setSessionCookie(res, sessionValue, { secure }) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(res, { secure }) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

// Express/Vercel-style guard. Returns the session or sends 401/403 and returns null.
export function requireSession(req, res, roles) {
  const session = verifySession(getSessionCookie(req))
  if (!session) {
    res.status(401).json({ success: false, error: 'Not signed in' })
    return null
  }
  if (roles && !roles.includes(session.role)) {
    res.status(403).json({ success: false, error: 'Not permitted for your role' })
    return null
  }
  return session
}

export function isSecureRequest(req) {
  const proto = req.headers?.['x-forwarded-proto']
  if (proto) return proto === 'https'
  return process.env.NODE_ENV === 'production'
}

// --- Airtable Users table access (server-side only) ---

function airtableEnv() {
  const token = process.env.AIRTABLE_TOKEN || process.env.VITE_AIRTABLE_TOKEN
  const baseId = process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID
  if (!token || !baseId) throw new Error('Server misconfigured: Airtable env vars missing')
  return { token, baseId }
}

export async function airtableFetch(path, options = {}) {
  const { token, baseId } = airtableEnv()
  const res = await fetch(`https://api.airtable.com/v0/${baseId}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Airtable ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

export async function findUserByEmail(email) {
  const formula = `LOWER({Email})='${String(email).toLowerCase().replace(/'/g, "\\'")}'`
  const data = await airtableFetch(`/Users?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`)
  const rec = (data.records || [])[0]
  if (!rec) return null
  return {
    id: rec.id,
    name: rec.fields['Name'] || '',
    email: rec.fields['Email'] || '',
    passwordHash: rec.fields['PasswordHash'] || '',
    role: rec.fields['Role'] || 'outreach'
  }
}

export async function countUsers() {
  const data = await airtableFetch('/Users?maxRecords=1&fields[]=Email')
  // Ask for the total via a second lightweight call is unreliable; instead
  // fetch one page and treat "any record" as non-empty. For exactness on
  // first-run detection this is sufficient (empty table => first run).
  return (data.records || []).length
}

export async function createUser({ name, email, passwordHash, role }) {
  const data = await airtableFetch('/Users', {
    method: 'POST',
    body: JSON.stringify({
      fields: { 'Name': name, 'Email': email, 'PasswordHash': passwordHash, 'Role': role }
    })
  })
  return data
}
