exports.handler = async function (event, context) {
  // =========================================================
  // CORS SETTINGS
  // =========================================================
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // =========================================================
  // HANDLE CORS PREFLIGHT REQUEST
  // =========================================================
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    };
  }

  // =========================================================
  // ONLY ACCEPT POST REQUESTS
  // =========================================================
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  // =========================================================
  // PROCESS DDEVI WEBHOOK - STORE IN BLOB QUEUE VIA REST API
  // =========================================================
  try {
    const payload = JSON.parse(event.body || "{}");

    // =======================================================
    // VALIDATE WEBHOOK
    // =======================================================
    if (!payload.id || !payload.type || !payload.items) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid webhook payload structure" })
      };
    }

    // =======================================================
    // STORE IN NETLIFY BLOBS QUEUE VIA REST API
    // =======================================================
    const siteID = process.env.SITE_ID;
    const blobUrl = `https://api.netlify.com/api/v1/blobs/${siteID}/devi-leads-queue/entries/queue`;

    const queueEntry = {
      id: payload.id,
      type: payload.type,
      created: payload.created,
      liveMode: payload.liveMode,
      items: payload.items,
      receivedAt: new Date().toISOString()
    };

    // Read existing queue
    let queue = [];
    try {
      const response = await fetch(`https://api.netlify.com/api/v1/blobs/${siteID}/devi-leads-queue/entries/queue`, {
        headers: {
          "Authorization": `Bearer ${process.env.NETLIFY_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      });
      if (response.ok) {
        const data = await response.json();
        queue = data.entries || [];
      }
    } catch (e) {
      // Queue doesn't exist yet, start fresh
    }

    // Add new entry
    queue.push(queueEntry);

    // Save updated queue
    await fetch(`https://api.netlify.com/api/v1/blobs/${siteID}/devi-leads-queue/entries/queue`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${process.env.NETLIFY_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ entries: queue })
    });

    // =======================================================
    // INSTANT RESPONSE
    // =======================================================
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Webhook received and queued ${payload.items.length} leads`,
        webhookId: payload.id,
        type: payload.type,
        leadCount: payload.items.length,
        liveMode: payload.liveMode,
        queued: true
      })
    };

  } catch (error) {
    console.error("DDEVI webhook queue error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message
      })
    };
  }
};
