// Shared handler for the creator-seeding "Send Product" flow.
//
// Used by:
//   - api/send-product.js  (Vercel serverless function)
//   - server.js            (local dev Express route)
//
// Both wrappers pass the parsed JSON body in and forward the returned
// { status, body } to the HTTP response. Keeping the logic in one place
// guarantees Vercel and local dev behave identically.
//
// Shopify Admin API version: 2025-01
// Store: takingkare.myshopify.com
// Token env var: SHOPIFY_DRAFT_ORDER_TOKEN (populated via OAuth flow; separate
// from SHOPIFY_ACCESS_TOKEN which is owned by sync-orders.js).

const SHOPIFY_API_VERSION = '2025-01'
const SHOPIFY_STORE_HANDLE = 'takingkare' // for admin URL
const SHOPIFY_STORE_DOMAIN = 'takingkare.myshopify.com'

const VARIANT_JAR_GID = 'gid://shopify/ProductVariant/49177566019888'
const VARIANT_STICKS_GID = 'gid://shopify/ProductVariant/50250684498224'

const DRAFT_ORDER_CREATE_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id name }
      userErrors { field message }
    }
  }
`

const DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        id
        order {
          id
          name
          legacyResourceId
        }
      }
      userErrors { field message }
    }
  }
`

/**
 * Main handler. Pure async function — wrappers supply the body, we return
 * { status, body }. Does not touch the HTTP layer directly.
 */
export async function handleSendProduct(body) {
  // --- 1. Validate payload ---
  const validationError = validatePayload(body)
  if (validationError) {
    return { status: 400, body: { success: false, error: validationError } }
  }

  const draftToken = process.env.SHOPIFY_DRAFT_ORDER_TOKEN
  if (!draftToken) {
    return {
      status: 500,
      body: {
        success: false,
        error: 'Server misconfigured: SHOPIFY_DRAFT_ORDER_TOKEN is not set. Complete the Shopify OAuth install at /api/auth/shopify/install first.'
      }
    }
  }

  const airtableToken = process.env.VITE_AIRTABLE_TOKEN
  const airtableBaseId = process.env.VITE_AIRTABLE_BASE_ID
  if (!airtableToken || !airtableBaseId) {
    return {
      status: 500,
      body: { success: false, error: 'Server misconfigured: Airtable env vars missing' }
    }
  }

  // --- 2. Build line items from variant ---
  const lineItems = buildLineItems(body.variant, body.quantity)

  // --- 3. Build draftOrderCreate input ---
  const draftInput = {
    email: body.email,
    note: `Creator seeding: ${body.creatorHandle}`,
    tags: ['creator-seeding', body.creatorHandle],
    lineItems,
    shippingAddress: {
      firstName: body.firstName,
      lastName: body.lastName,
      address1: body.address,
      address2: body.address2 || '',
      city: body.city,
      provinceCode: body.state.toUpperCase(),
      zip: body.zip,
      countryCode: 'US'
    },
    appliedDiscount: {
      valueType: 'PERCENTAGE',
      value: 100,
      title: 'Creator Seeding',
      description: '100% discount applied for creator seeding'
    },
    shippingLine: {
      title: 'Free Economy Shipping',
      price: '0.00'
    }
  }

  // --- 4. draftOrderCreate ---
  let createResult
  try {
    createResult = await shopifyGraphQL(
      draftToken,
      DRAFT_ORDER_CREATE_MUTATION,
      { input: draftInput }
    )
  } catch (err) {
    console.error('draftOrderCreate network error:', err)
    return { status: 502, body: { success: false, error: `Shopify network error: ${err.message}` } }
  }

  const createData = createResult?.data?.draftOrderCreate
  const createTopErrors = createResult?.errors
  if (createTopErrors?.length) {
    console.error('draftOrderCreate GraphQL errors:', createTopErrors)
    return {
      status: 502,
      body: {
        success: false,
        error: `Shopify GraphQL error: ${createTopErrors.map(e => e.message).join('; ')}`
      }
    }
  }
  if (!createData) {
    return { status: 502, body: { success: false, error: 'Shopify returned no draftOrderCreate data' } }
  }
  if (createData.userErrors?.length) {
    const msg = createData.userErrors
      .map(e => `${(e.field || []).join('.') || 'input'}: ${e.message}`)
      .join('; ')
    return { status: 502, body: { success: false, error: `Draft order create failed: ${msg}` } }
  }
  const draftOrderId = createData.draftOrder?.id
  if (!draftOrderId) {
    return { status: 502, body: { success: false, error: 'Draft order create returned no id' } }
  }

  // --- 5. draftOrderComplete ---
  let completeResult
  try {
    completeResult = await shopifyGraphQL(
      draftToken,
      DRAFT_ORDER_COMPLETE_MUTATION,
      { id: draftOrderId, paymentPending: false }
    )
  } catch (err) {
    console.error('draftOrderComplete network error:', err)
    return {
      status: 502,
      body: {
        success: false,
        error: `Draft order created (${draftOrderId}) but completion failed: ${err.message}. Complete it manually in Shopify admin.`
      }
    }
  }

  const completeData = completeResult?.data?.draftOrderComplete
  const completeTopErrors = completeResult?.errors
  if (completeTopErrors?.length) {
    return {
      status: 502,
      body: {
        success: false,
        error: `Draft order created (${draftOrderId}) but complete returned GraphQL errors: ${completeTopErrors.map(e => e.message).join('; ')}`
      }
    }
  }
  if (!completeData) {
    return { status: 502, body: { success: false, error: 'Shopify returned no draftOrderComplete data' } }
  }
  if (completeData.userErrors?.length) {
    const msg = completeData.userErrors
      .map(e => `${(e.field || []).join('.') || 'input'}: ${e.message}`)
      .join('; ')
    return {
      status: 502,
      body: {
        success: false,
        error: `Draft order ${draftOrderId} complete failed: ${msg}`
      }
    }
  }

  const order = completeData.draftOrder?.order
  if (!order?.name || !order?.legacyResourceId) {
    return {
      status: 502,
      body: {
        success: false,
        error: 'Draft order completed but no order data returned'
      }
    }
  }

  const orderNumber = order.name
  const orderUrl = `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/orders/${order.legacyResourceId}`

  // --- 6. Update Airtable Leads record ---
  // If this fails, we STILL return success because the Shopify order was placed.
  // Surfacing the failure as a warning lets the operator fix the drift manually.
  const today = new Date()
  const followUpDate = new Date(today)
  followUpDate.setDate(today.getDate() + 14)

  const airtableFields = {
    'Outreach Status': 'Sample Sent',
    'Sample Sent Date': toIsoDate(today),
    'Sample Follow-Up Due Date': toIsoDate(followUpDate),
    'Shopify Order Number': orderNumber,
    'Shopify Order URL': orderUrl
  }

  let airtableWarning = null
  try {
    const atRes = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId}/Leads/${encodeURIComponent(body.leadRecordId)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: airtableFields })
      }
    )
    if (!atRes.ok) {
      const errBody = await atRes.text()
      airtableWarning = `Airtable update failed (${atRes.status}): ${errBody.slice(0, 300)}. Shopify order ${orderNumber} was still placed.`
      console.error(airtableWarning)
    }
  } catch (err) {
    airtableWarning = `Airtable update threw: ${err.message}. Shopify order ${orderNumber} was still placed.`
    console.error(airtableWarning)
  }

  return {
    status: 200,
    body: {
      success: true,
      orderNumber,
      orderUrl,
      airtableWarning
    }
  }
}

// ---------- helpers ----------

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object'

  const requiredStrings = ['firstName', 'lastName', 'email', 'address', 'city', 'state', 'zip', 'creatorHandle', 'leadRecordId']
  for (const field of requiredStrings) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return `Missing or invalid field: ${field}`
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return 'Invalid email format'
  }

  if (!/^[A-Za-z]{2}$/.test(body.state.trim())) {
    return 'state must be a 2-letter US state code'
  }

  if (!['jar', 'sticks', 'both'].includes(body.variant)) {
    return 'variant must be one of: jar, sticks, both'
  }

  if (body.variant !== 'both') {
    const q = Number(body.quantity)
    if (!Number.isInteger(q) || q < 1 || q > 10) {
      return 'quantity must be an integer between 1 and 10 for jar/sticks variants'
    }
  }

  return null
}

function buildLineItems(variant, quantity) {
  if (variant === 'jar') {
    return [{ variantId: VARIANT_JAR_GID, quantity: Number(quantity) }]
  }
  if (variant === 'sticks') {
    return [{ variantId: VARIANT_STICKS_GID, quantity: Number(quantity) }]
  }
  // 'both' — quantity intentionally ignored
  return [
    { variantId: VARIANT_JAR_GID, quantity: 1 },
    { variantId: VARIANT_STICKS_GID, quantity: 1 }
  ]
}

async function shopifyGraphQL(token, query, variables) {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Shopify HTTP ${res.status}: ${txt.slice(0, 500)}`)
  }
  return res.json()
}

function toIsoDate(d) {
  return d.toISOString().split('T')[0]
}
