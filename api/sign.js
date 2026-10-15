import { airtableFetch } from '../lib/auth.js'
import { buildAgreement, AGREEMENT_VERSION } from '../lib/agreement-template.js'

// Public e-sign endpoints (no login — the creator opens a private link).
//
// GET  /api/sign?campaign=<recordId>  -> agreement text + status
// POST /api/sign?campaign=<recordId>  -> { signatureName } records the signature
//
// Writes to Creator Campaigns fields:
//   Contract Status, Contract Sent At, Contract Signed At,
//   Signature Name, Signature IP, Agreement Text

async function getCampaign(id) {
  const data = await airtableFetch(`/Creator%20Campaigns/${id}`)
  return data
}

export default async function handler(req, res) {
  const campaignId = req.query?.campaign || new URL(req.url, 'http://x').searchParams.get('campaign')
  if (!campaignId) {
    return res.status(400).json({ success: false, error: 'Missing campaign id' })
  }

  try {
    if (req.method === 'GET') {
      const rec = await getCampaign(campaignId)
      const f = rec.fields || {}
      return res.json({
        success: true,
        campaignName: f['Campaign Name'] || '',
        contractStatus: f['Contract Status'] || 'Draft',
        agreementText: f['Agreement Text'] || '',
        signedAt: f['Contract Signed At'] || null,
        version: AGREEMENT_VERSION
      })
    }

    if (req.method === 'POST') {
      const { signatureName } = req.body || {}
      if (!signatureName || String(signatureName).trim().length < 2) {
        return res.status(400).json({ success: false, error: 'Please type your full name to sign' })
      }
      const rec = await getCampaign(campaignId)
      const f = rec.fields || {}
      if (f['Contract Status'] === 'Signed') {
        return res.status(409).json({ success: false, error: 'This agreement is already signed' })
      }

      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
      const signedAt = new Date().toISOString().split('T')[0]
      const name = String(signatureName).trim().slice(0, 120)
      const existing = f['Agreement Text'] || ''
      const signatureBlock = `\n\n--- SIGNED ---\nSigned by: ${name}\nDate: ${signedAt}\nIP: ${ip}\nAgreement version: ${AGREEMENT_VERSION}`

      await airtableFetch(`/Creator%20Campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            'Contract Status': 'Signed',
            'Contract Signed At': signedAt,
            'Signature Name': name,
            'Signature IP': ip,
            'Agreement Text': existing + signatureBlock
          }
        })
      })
      return res.json({ success: true, signedAt })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (err) {
    console.error('sign error:', err)
    return res.status(500).json({ success: false, error: 'Something went wrong — please try again' })
  }
}

export { buildAgreement }
