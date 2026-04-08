export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { creatorName, creatorHandle, creatorEmail, discountCode, creatorLink } = req.body

  if (!creatorName || !creatorEmail) {
    return res.status(400).json({ error: 'Creator name and email are required' })
  }

  const pandaKey = process.env.PANDADOC_API_KEY
  const briefTemplateId = process.env.PANDADOC_BRIEF_TEMPLATE_ID
  const agreementTemplateId = process.env.PANDADOC_AGREEMENT_TEMPLATE_ID

  const today = new Date()
  const monthYear = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const effectiveDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const recipients = [
    {
      email: creatorEmail,
      first_name: creatorName.split(' ')[0],
      last_name: creatorName.split(' ').slice(1).join(' ') || '',
      role: 'Creator'
    }
  ]

  const tokens = [
    { name: 'creator_name', value: creatorName },
    { name: 'creator_handle', value: creatorHandle || '' },
    { name: 'creator_email', value: creatorEmail },
    { name: 'discount_code', value: discountCode || '' },
    { name: 'creator_link', value: creatorLink || '' },
    { name: 'month_year', value: monthYear },
    { name: 'effective_date', value: effectiveDate }
  ]

  try {
    // Create brief document
    const briefRes = await fetch('https://api.pandadoc.com/public/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `kāre Creator Brief — ${creatorName}`,
        template_uuid: briefTemplateId,
        recipients,
        tokens
      })
    })
    const briefDoc = await briefRes.json()
    console.log('Brief created:', briefDoc.id, briefDoc.status)
    if (briefDoc.detail) throw new Error('Brief error: ' + briefDoc.detail)

    // Wait for document to be ready
    await new Promise(r => setTimeout(r, 3000))

    // Send brief
    const briefSendRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${briefDoc.id}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Hi ${creatorName.split(' ')[0]}! Attached is your kāre creator brief. It covers everything you need to create content — two tracks, ten scripts, filming guidelines, and b-roll suggestions. Your voice leads — the brief just gives you the framework. Questions? Just reply. — Danny, kāre`,
        silent: false
      })
    })
    const briefSendData = await briefSendRes.json()
    console.log('Brief sent:', briefSendData)

    // Create agreement document
    const agreementRes = await fetch('https://api.pandadoc.com/public/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `kāre Whitelisting Agreement — ${creatorName}`,
        template_uuid: agreementTemplateId,
        recipients,
        tokens
      })
    })
    const agreementDoc = await agreementRes.json()
    console.log('Agreement created:', agreementDoc.id, agreementDoc.status)
    if (agreementDoc.detail) throw new Error('Agreement error: ' + agreementDoc.detail)

    // Wait for document to be ready
    await new Promise(r => setTimeout(r, 3000))

    // Send agreement
    const agreementSendRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${agreementDoc.id}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Hi ${creatorName.split(' ')[0]}! Please review and sign your kāre Whitelisting & Affiliate Agreement. Once signed we'll get your campaign set up. — Danny, kāre`,
        silent: false
      })
    })
    const agreementSendData = await agreementSendRes.json()
    console.log('Agreement sent:', agreementSendData)

    res.json({
      success: true,
      briefId: briefDoc.id,
      agreementId: agreementDoc.id,
      message: `Brief and agreement sent to ${creatorEmail}`
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
