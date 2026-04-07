const token = process.env.VITE_GOAFFPRO_TOKEN

fetch('https://api.goaffpro.com/v1/admin/orders?fields=id,affiliate_id,total,commission,status,created_at&count=5', {
  headers: {
    'X-GOAFFPRO-ACCESS-TOKEN': token
  }
})
.then(r => r.json())
.then(data => {
  data.orders.forEach(o => {
    const date = new Date(o.created_at)
    console.log(`Order ${o.id}: created_at=${o.created_at}, year=${date.getFullYear()}, month=${date.getMonth() + 1}`)
  })
})
.catch(err => console.error(err))
