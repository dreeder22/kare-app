import { useEffect, useState } from 'react'

const inputCls = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-600'

export default function Team() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'outreach' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resetEmail, setResetEmail] = useState(null)
  const [resetPw, setResetPw] = useState('')
  const [resetting, setResetting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth?action=users', { credentials: 'include' })
      const data = await res.json()
      if (data.success) setUsers(data.users || [])
      else setError(data.error || 'Could not load logins')
    } catch {
      setError('Could not load logins')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const res = await fetch('/api/auth?action=create-user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Could not create the login')
      } else {
        setNotice(`Login created for ${form.email} — share the email and password with them directly.`)
        setForm({ name: '', email: '', password: '', role: 'outreach' })
        load()
      }
    } catch {
      setError('Could not create the login')
    } finally {
      setSaving(false)
    }
  }

  const doReset = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setResetting(true)
    try {
      const res = await fetch('/api/auth?action=set-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, password: resetPw })
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Could not reset the password')
      } else {
        setNotice(`Password reset for ${resetEmail} — share the new password with them directly.`)
        setResetEmail(null)
        setResetPw('')
      }
    } catch {
      setError('Could not reset the password')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-semibold text-white mb-1">Team logins</h2>
      <p className="text-sm text-gray-400 mb-6">
        Owners see everything. Outreach logins only see the creator pipeline —
        no ad spend, ROAS, or revenue.
      </p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {notice && <p className="text-sm text-green-400 mb-4">{notice}</p>}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-medium text-white mb-4">Add a login</h3>
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className={inputCls}
            placeholder="Full name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Temporary password (min 8 characters)"
            type="text"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
          <select
            className={inputCls}
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
          >
            <option value="outreach">Outreach — creator pipeline only</option>
            <option value="owner">Owner — full access</option>
          </select>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-black disabled:opacity-50"
              style={{ backgroundColor: '#B8963E' }}
            >
              {saving ? 'Creating…' : 'Create login'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No logins yet.</td></tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-3 text-white">{u.name}</td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${u.role === 'owner' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-gray-800 text-gray-300'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {resetEmail === u.email ? (
                      <form onSubmit={doReset} className="flex items-center justify-end gap-2">
                        <input
                          className={inputCls + ' !w-44'}
                          placeholder="New password (min 8)"
                          type="text"
                          value={resetPw}
                          onChange={e => setResetPw(e.target.value)}
                          required
                          minLength={8}
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={resetting}
                          className="px-3 py-2 rounded-lg text-xs font-medium text-black disabled:opacity-50"
                          style={{ backgroundColor: '#B8963E' }}
                        >
                          {resetting ? 'Setting…' : 'Set'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setResetEmail(null); setResetPw('') }}
                          className="px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setResetEmail(u.email); setResetPw(''); setError(''); setNotice('') }}
                        className="text-xs text-gray-400 hover:text-white underline underline-offset-2"
                      >
                        Reset password
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
