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
      body: JSON.stringify({
        error: "Method not allowed"
      })
    };
  }


  // =========================================================
  // PROCESS DDEVI WEBHOOK
  // =========================================================
  try {

    // Parse incoming webhook data
    const payload = JSON.parse(event.body || "{}");


    // =======================================================
    // LOG COMPLETE WEBHOOK FOR DEBUGGING
    // =======================================================
    console.log(
      "Received DDEVI webhook:",
      JSON.stringify(payload, null, 2)
    );


    // =======================================================
    // VALIDATE WEBHOOK
    // =======================================================
    if (
      !payload.id ||
      !payload.type ||
      !payload.items
    ) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Invalid webhook payload structure"
        })
      };
    }


    // =======================================================
    // PROCESS LEADS
    // =======================================================
    const leads = payload.items.map(item => ({

      id: item.id || null,

      provider: item.provider || null,

      url: item.url || null,

      authorName: item.authorName || null,

      authorProfileUrl:
        item.authorProfileUrl || null,

      authorProfilePicture:
        item.authorProfilePicture || null,

      content: item.content || null,

      keywords: item.keywords || [],

      likes: item.likes || 0,

      postedAt: item.postedAt || null,

      groupId:
        item.groupId || null,

      groupName:
        item.groupName || null,

      groupUrl:
        item.groupUrl || null,

      authorSecondaryText:
        item.authorSecondaryText || null

    }));


    // =======================================================
        // APPEND LEADS TO NOTION DATABASE
        // =======================================================
        const notionResult = await appendLeadsToNotion(leads, payload);
        console.log("Notion append result:", notionResult);


        // =======================================================
        // LOG PROCESSED LEADS
        // =======================================================
        console.log(
          `Processed ${leads.length} leads from ${payload.type} webhook`
        );


        // =======================================================
        // SUCCESS RESPONSE
        // =======================================================
        return {

          statusCode: 200,

          headers: corsHeaders,

          body: JSON.stringify({

            success: true,

            message:
              `Webhook received and processed ${leads.length} leads`,

            webhookId:
              payload.id,

            type:
              payload.type,

            leadCount:
              leads.length,

            liveMode:
              payload.liveMode,

            notionAppended: notionResult.success,
            notionError: notionResult.error || null

          })

        };


      } catch (error) {

        // =======================================================
        // ERROR HANDLING
        // =======================================================
        console.error(
          "DDEVI webhook processing error:",
          error
        );


        return {

          statusCode: 500,

          headers: corsHeaders,

          body: JSON.stringify({

            error:
              "Internal server error",

            message:
              error.message

          })

        };

      }

    };


    // =========================================================
    // NOTION INTEGRATION
    // =========================================================
    async function appendLeadsToNotion(leads, payload) {
      try {
        const notionToken = "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";
        const databaseId = "3eb7161c-21a6-810f-a22d-db093a6bda31";

        if (!notionToken) {
          console.warn("Notion token not configured - skipping Notion append");
          return { success: false, error: "Notion token not configured" };
        }

        const notionUrl = `https://api.notion.com/v1/pages`;
        const notionHeaders = {
          "Authorization": `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28"
        };

        const results = [];
        const errors = [];

        // Process each lead
        for (const lead of leads) {
          try {
            // Build content string with all lead details
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
            if (payload.liveMode) contentParts.push(`Live Mode: true`);

            const notionData = {
              parent: { database_id: databaseId },
              properties: {
                "Name": {
                  title: [
                    {
                      text: {
                        content: lead.authorName || "Unknown Author"
                      }
                    }
                  ]
                }
              }
            };

            // Add content as child blocks if we have content
            if (contentParts.length > 0) {
              notionData.children = contentParts.map(part => ({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{
                    type: "text",
                    text: { content: part }
                  }]
                }
              }));
            }

            const response = await fetch(notionUrl, {
              method: "POST",
              headers: notionHeaders,
              body: JSON.stringify(notionData)
            });

            if (!response.ok) {
              const errorText = await response.text();
              errors.push({ lead: lead.id, error: `Notion API error: ${response.status} - ${errorText}` });
              console.error("Notion API error:", response.status, errorText);
            } else {
              const result = await response.json();
              results.push(result);
              console.log(`Successfully appended lead ${lead.id} to Notion`);
            }
          } catch (leadError) {
            errors.push({ lead: lead.id, error: leadError.message });
            console.error("Error processing lead:", leadError);
          }
        }

        if (errors.length > 0) {
          return { 
            success: false, 
            error: `Failed to append ${errors.length} leads`, 
            errors: errors,
            appended: results.length
          };
        }

        return { 
          success: true, 
          databaseId: databaseId,
          leadsAppended: results.length,
          results: results
        };

      } catch (error) {
        console.error("Notion append error:", error);
        return { success: false, error: error.message };
      }
    }