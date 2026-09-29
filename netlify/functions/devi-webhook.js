exports.handler = async function(event, context) {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  try {
    // Parse the incoming webhook payload
    const payload = JSON.parse(event.body);
    
    // Log the received webhook for debugging
    console.log('Received Devi webhook:', JSON.stringify(payload, null, 2));
    
    // Validate the webhook structure
    if (!payload.id || !payload.type || !payload.items) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid webhook payload structure' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
    
    // Process each lead item
    const leads = payload.items.map(item => ({
      id: item.id,
      provider: item.provider,
      url: item.url,
      authorName: item.authorName,
      authorProfileUrl: item.authorProfileUrl,
      authorProfilePicture: item.authorProfilePicture,
      content: item.content,
      keywords: item.keywords,
      likes: item.likes,
      postedAt: item.postedAt,
      groupId: item.groupId || null,
      groupName: item.groupName || null,
      groupUrl: item.groupUrl || null,
      authorSecondaryText: item.authorSecondaryText || null
    }));
    
    // Here you can add your processing logic:
    // - Save to database
    // - Send to another service
    // - Trigger notifications
    // - etc.
    
    console.log(`Processed ${leads.length} leads from ${payload.type} webhook`);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: `Webhook received and processed ${leads.length} leads`,
        webhookId: payload.id,
        type: payload.type,
        leadCount: leads.length,
        liveMode: payload.liveMode
      }),
      headers: { 'Content-Type': 'application/json' }
    };
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};