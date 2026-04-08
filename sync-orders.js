const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const AIRTABLE_TOKEN = process.env.VITE_AIRTABLE_TOKEN
const BASE_ID = process.env.VITE_AIRTABLE_BASE_ID

async function getAllOrders() {
  let orders = []
  let url = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&limit=250`

  while (url) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    })
    const data = await res.json()
    orders = [...orders, ...(data.orders || [])]
    console.log(`Fetched ${orders.length} orders so far...`)

    const linkHeader = res.headers.get('Link')
    const nextMatch = linkHeader?.match(/<([^>]+)>; rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return orders
}

async function syncToAirtable(orders) {
  let synced = 0
  for (const order of orders) {
    const fields = {
      'Order ID': order.admin_graphql_api_id || String(order.id),
      'Email': order.email || '',
      'Total Price': parseFloat(order.total_price) || 0,
      'Created At': order.created_at?.split('T')[0] || '',
      'Product Names': order.line_items?.map(i => i.name).join(', ') || '',
      'Order Status': order.fulfillment_status || 'unfulfilled',
      'Financial Status': order.financial_status || ''
    }

    await fetch(`https://api.airtable.com/v0/${BASE_ID}/Orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    })

    synced++
    if (synced % 10 === 0) console.log(`Synced ${synced}/${orders.length} orders...`)
    await new Promise(r => setTimeout(r, 200))
  }
  console.log(`Done! Synced ${synced} orders.`)
}

const orders = await getAllOrders()
console.log(`Total orders found: ${orders.length}`)
await syncToAirtable(orders)
