import crypto from 'crypto'

// GET /api/auth/shopify/callback
//
// Shopify redirects here after the merchant approves the install. We:
//   1. Verify the `state` param (HMAC-signed timestamp from install.js, 10-min TTL)
//   2. Verify the `hmac` param (Shopify's HMAC over the other query params)
//   3. Verify `shop` matches *.myshopify.com
//   4. Exchange `code` for a permanent Admin API access token
//   5. Log the token to console so it can be pasted into Vercel env as
//      SHOPIFY_DRAFT_ORDER_TOKEN (single-tenant v1 — no .env/DB writes possible
//      on Vercel serverless; filesystem is read-only)
//
// The token is NEVER echoed to the browser — only console logs.
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export default async function handler(req, res) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res
      .status(500)
      .send('Server misconfigured: missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET')
  }

  const { hmac, state, shop, code, host, timestamp } = req.query

  if (!hmac || !state || !shop || !code) {
    return res.status(400).send('Missing required callback parameters')
  }

  // --- 1. Verify state (our own HMAC-signed timestamp) ---
  if (!verifyState(state, clientSecret)) {
    return res.status(403).send('Invalid or expired state parameter')
  }

  // --- 2. Verify Shopify's HMAC over the other query params ---
  if (!verifyShopifyHmac(req.query, clientSecret)) {
    return res.status(403).send('HMAC verification failed')
  }

  // --- 3. Verify shop hostname ---
  const shopStr = String(shop).toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopStr)) {
    return res.status(400).send('Invalid shop domain')
  }

  // --- 4. Exchange code for access token ---
  let tokenData
  try {
    const tokenRes = await fetch(`https://${shopStr}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('Shopify token exchange failed:', tokenRes.status, errBody)
      return res.status(502).send('Token exchange with Shopify failed')
    }

    tokenData = await tokenRes.json()
  } catch (err) {
    console.error('Shopify token exchange error:', err)
    return res.status(502).send('Network error during token exchange')
  }

  const accessToken = tokenData.access_token
  const grantedScopes = tokenData.scope

  if (!accessToken) {
    console.error('Shopify did not return access_token:', tokenData)
    return res.status(502).send('Shopify did not return an access token')
  }

  // --- 5. Log the token for manual paste into Vercel env ---
  // Vercel function logs are visible in the Vercel dashboard → Deployments → Logs.
  // This is v1 (single-tenant). Do not echo the token to the browser.
  console.log('==================================================================')
  console.log('SHOPIFY OAUTH SUCCESS')
  console.log('Shop:   ', shopStr)
  console.log('Scopes: ', grantedScopes)
  console.log('COPY THIS TOKEN TO VERCEL ENV:')
  console.log(`SHOPIFY_DRAFT_ORDER_TOKEN=${accessToken}`)
  console.log('Then redeploy so the new env var is available to /api/send-product.')
  console.log('==================================================================')

  // Success page — no token on the page itself.
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>kāre · Shopify Install Complete</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0f0f0f; color: #e5e5e5; padding: 40px; max-width: 640px; margin: 0 auto; }
  h1 { color: #B8963E; }
  code { background: #1f1f1f; padding: 2px 6px; border-radius: 4px; color: #B8963E; }
  .box { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; margin-top: 20px; }
</style>
</head>
<body>
  <h1>Install complete ✓</h1>
  <p>kāre is now connected to <code>${escapeHtml(shopStr)}</code>.</p>
  <div class="box">
    <p><strong>Next step:</strong> Copy the access token from the Vercel function logs and paste it into the Vercel project's environment variables as <code>SHOPIFY_DRAFT_ORDER_TOKEN</code>, then redeploy.</p>
    <p>Granted scopes: <code>${escapeHtml(grantedScopes || '')}</code></p>
  </div>
</body>
</html>`)
}

// ---------- helpers ----------

function verifyState(state, secret) {
  if (typeof state !== 'string' || !state.includes('.')) return false
  const [tsPart, hmacPart] = state.split('.')
  let timestamp, providedHmac
  try {
    timestamp = Buffer.from(tsPart, 'base64url').toString('utf8')
    providedHmac = Buffer.from(hmacPart, 'base64url')
  } catch {
    return false
  }

  const age = Date.now() - Number(timestamp)
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return false

  const expected = crypto.createHmac('sha256', secret).update(timestamp).digest()
  if (expected.length !== providedHmac.length) return false
  try {
    return crypto.timingSafeEqual(expected, providedHmac)
  } catch {
    return false
  }
}

// Shopify signs all the callback query params (except `hmac` and, historically,
// `signature`) by joining them as a URL-encoded, key-sorted query string and
// HMAC-SHA256-ing with the app's client secret.
//
// Reference: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
function verifyShopifyHmac(query, secret) {
  const { hmac, signature, ...rest } = query
  if (typeof hmac !== 'string') return false

  const message = Object.keys(rest)
    .sort()
    .map(key => `${encodeParam(key)}=${encodeParam(rest[key])}`)
    .join('&')

  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex')

  if (expected.length !== hmac.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hmac, 'utf8'))
  } catch {
    return false
  }
}

function encodeParam(v) {
  return encodeURIComponent(String(v)).replace(/%20/g, '+')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
