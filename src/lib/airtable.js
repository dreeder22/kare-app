const TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
}

export async function getRecords(table, params = '') {
  let allRecords = []
  let offset = null

  do {
    const offsetParam = offset ? `${params ? '&' : '?'}offset=${offset}` : ''
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}${params}${offsetParam}`, { headers })
    const data = await res.json()
    allRecords = [...allRecords, ...(data.records || [])]
    offset = data.offset || null
  } while (offset)

  return allRecords
}

export async function createRecord(table, fields) {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields })
  })
  return await res.json()
}

export async function updateRecord(table, id, fields) {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields })
  })
  return await res.json()
}
