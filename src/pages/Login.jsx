import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login, setupNeeded } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login({ email, password, name, setup: setupNeeded || undefined })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-wide" style={{ color: '#B8963E' }}>kāre</h1>
          <p className="text-sm text-gray-500 mt-2">Command Center</p>
        </div>
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            {setupNeeded ? 'Create your owner account' : 'Sign in'}
          </h2>
          {setupNeeded && (
            <p className="text-xs text-gray-400">
              First time here — set up the owner login. You'll add your outreach
              teammate afterwards from inside the app.
            </p>
          )}
          {setupNeeded && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Your name</label>
              <input
                type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-600"
                placeholder="Danny Reeder" autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-600"
              placeholder="you@takingkare.com" autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              minLength={setupNeeded ? 8 : 1}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-600"
              placeholder={setupNeeded ? 'At least 8 characters' : '••••••••'}
              autoComplete={setupNeeded ? 'new-password' : 'current-password'}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {busy ? 'Please wait…' : setupNeeded ? 'Create owner account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
