exports.handler = async function (event, context) {
  // =========================================================
  // QUEUE PROCESSOR - Runs every 5 minutes via Netlify Scheduled Functions
  // =========================================================
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  try {
    const blobs = require("@netlify/blobs");
    const queueBlob = new blobs.Blob("devi-leads-queue", { siteID: process.env.SITE_ID });

    // Read current queue
    let queue = [];
    try {
      const existing = await queueBlob.get("queue", { type: "json" });
      if (existing) queue = existing;
    } catch (e) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: "Queue empty", processed: 0 })
      };
    }

    if (queue.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: "Queue empty", processed: 0 })
      };
    }

    // Process up to 20 entries per run (to stay under 30s limit)
    const batchSize = 20;
    const batch = queue.splice(0, batchSize);
    
    // Save remaining queue
    await queueBlob.set("queue", queue, { type: "json" });

    // Process each entry in batch
    let processed = 0;
    let errors = 0;

    for (const entry of batch) {
      try {
        // Process each lead in the entry
        for (const item of entry.items) {
          const lead = {
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
            groupId: item.groupId,
            groupName: item.groupName,
            groupUrl: item.groupUrl,
            authorSecondaryText: item.authorSecondaryText
          };

          // Build Notion page
          const contentParts = [];
          if (lead.content) contentParts.push(`Content: ${lead.content}`);
          if (lead.provider) contentParts.push(`Provider: ${lead.provider}`);
          if (lead.id) contentParts.push(`Lead ID: ${lead.id}`);
          if (lead.url) contentParts.push(`URL: ${lead.url}`);
          if (lead.authorProfileUrl) contentParts.push(`Author Profile: ${lead.authorProfileUrl}`);
          if (lead.authorProfilePicture) contentParts.push(`Author Picture: ${lead.authorProfilePicture}`);
          if (lead.keywords && lead.keywords.length > 0) contentParts.push(`Keywords: ${lead.keywords.join(", ")}`);
          if (lead.likes > 0) contentParts.push(`Likes: ${lead.likes}`);
          if (lead.postedAt) contentParts.push(`Posted At: ${lead.postedAt}`);
          if (lead.groupId) contentParts.push(`Group ID: ${lead.groupId}`);
          if (lead.groupName) contentParts.push(`Group Name: ${lead.groupName}`);
          if (lead.groupUrl) contentParts.push(`Group URL: ${lead.groupUrl}`);
          if (lead.authorSecondaryText) contentParts.push(`Author Secondary: ${lead.authorSecondaryText}`);

          const notionData = {
            parent: { database_id: "3eb7161c-21a6-810f-a22d-db093a6bda31" },
            properties: {
              "Name": {
                title: [{ text: { content: lead.authorName || "Unknown Author" } }]
              }
            }
          };

          if (contentParts.length > 0) {
            notionData.children = contentParts.map(part => ({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: part } }]
              }
            }));
          }

          const response = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
              "Content-Type": "application/json",
              "Notion-Version": "2022-06-28"
            },
            body: JSON.stringify(notionData)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Notion API error:", response.status, errorText);
            errors++;
          } else {
            processed++;
          }
        }
      } catch (error) {
        console.error("Error processing entry:", error);
        errors++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: `Processed batch`,
        processed,
        errors,
        remainingInQueue: queue.length
      })
    };

  } catch (error) {
    console.error("Queue processor error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", message: error.message })
    };
  }
};
