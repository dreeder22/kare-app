import crypto from 'crypto'

// GET /api/auth/shopify/install
//
// Kicks off the Shopify OAuth install flow. Redirects the browser to
// Shopify's consent screen. The `state` param is an HMAC-signed timestamp
// so callback.js can verify it statelessly (Vercel serverless = no shared memory).
//
// Optional query params:
//   ?shop=<shop>.myshopify.com   (defaults to SHOPIFY_STORE env var)
export default function handler(req, res) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  const appUrl = process.env.SHOPIFY_APP_URL
  const defaultShop = process.env.SHOPIFY_STORE
  const scopes = process.env.SHOPIFY_SCOPES ||
    'read_customers,write_customers,read_draft_orders,write_draft_orders,read_orders,write_orders'

  if (!clientId || !clientSecret || !appUrl) {
    return res.status(500).json({
      error: 'Missing required env vars: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_APP_URL'
    })
  }

  const shop = (req.query.shop || defaultShop || '').toLowerCase()
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).json({ error: 'Invalid or missing shop parameter' })
  }

  // Stateless CSRF-safe state param: base64url(timestamp).base64url(hmac)
  // Verified in callback.js against SHOPIFY_CLIENT_SECRET and a 10-min TTL.
  const timestamp = Date.now().toString()
  const hmac = crypto.createHmac('sha256', clientSecret).update(timestamp).digest()
  const state =
    Buffer.from(timestamp).toString('base64url') +
    '.' +
    hmac.toString('base64url')

  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/shopify/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    'grant_options[]': '' // offline (long-lived) token by default when empty
  })

  const consentUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`
  res.writeHead(302, { Location: consentUrl })
  res.end()
}
