const token = process.env.VITE_GOAFFPRO_TOKEN

fetch('https://api.goaffpro.com/v1/admin/affiliates?fields=id,name,email,ref_code,coupon,status,instagram,social,website,handle,username&count=3', {
  headers: {
    'X-GOAFFPRO-ACCESS-TOKEN': token
  }
})
.then(r => r.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err))
