const key = process.env.PANDADOC_API_KEY

fetch('https://api.pandadoc.com/public/v1/templates?count=10', {
  headers: {
    'Authorization': `API-Key ${key}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
.catch(err => console.error(err))
