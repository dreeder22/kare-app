import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

export default function Sign() {
  const { campaignId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/sign?campaign=${encodeURIComponent(campaignId)}`)
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Could not load the agreement')
        setData(d)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [campaignId])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSigning(true)
    try {
      const res = await fetch(`/api/sign?campaign=${encodeURIComponent(campaignId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureName: name })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Signing failed')
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#B8963E' }}>kāre</h1>
          <p className="text-sm text-gray-500 mt-1">Creator Agreement{data?.campaignName ? ` — ${data.campaignName}` : ''}</p>
        </div>

        {loading && <p className="text-center text-sm text-gray-400">Loading agreement…</p>}
        {error && !done && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {done && (
          <div className="bg-gray-900 border border-green-800 rounded-xl p-8 text-center">
            <p className="text-lg font-semibold text-green-400 mb-2">Signed ✓</p>
            <p className="text-sm text-gray-400">
              Thanks — your signed agreement is on its way to the kāre team.
            </p>
          </div>
        )}

        {data && !done && !error && (
          <>
            {data.contractStatus === 'Signed' ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <p className="text-sm text-gray-400">This agreement was already signed{data.signedAt ? ` on ${data.signedAt}` : ''}.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-5 max-h-96 overflow-auto font-sans">
                  {data.agreementText || 'Agreement text is being prepared — please check back soon.'}
                </pre>
                {data.agreementText && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Type your full legal name to sign
                      </label>
                      <input
                        type="text" required value={name} onChange={e => setName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-600"
                        placeholder="Jane Smith" autoComplete="name"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                        className="mt-0.5" required
                      />
                      I have read this agreement and I agree to its terms. I understand
                      that typing my name below is my legally binding electronic signature.
                    </label>
                    <button
                      type="submit" disabled={signing || !agreed}
                      className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
                    >
                      {signing ? 'Signing…' : 'Sign agreement'}
                    </button>
                  </>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
