const { Client } = require("@notionhq/client");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DEVI_LEADS_DB = "3eb7161c-21a6-810f-a22d-db093a6bda31";

const notion = new Client({ auth: NOTION_TOKEN });

exports.handler = async function (event, context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    // =======================================================
    // CHECK FOR PENDING LEADS IN DEVI LEADS DB
    // =======================================================
    const response = await notion.databases.query({
      database_id: DEVI_LEADS_DB,
      filter: {
        property: "Analysis Status",
        select: { equals: "pending" }
      },
      sorts: [{ property: "Received At (IST)", direction: "descending" }],
      page_size: 1
    });

    const pendingLeads = response.results;

    if (pendingLeads.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: "No pending leads to analyze",
          triggered: false
        })
      };
    }

    // =======================================================
    // CHECK TIME SINCE LAST LEAD (10 MINUTES = 600,000ms)
    // =======================================================
    const lastLead = pendingLeads[0];
    const receivedAtStr = lastLead.properties["Received At (IST)"]?.rich_text?.[0]?.text?.content;
    
    if (!receivedAtStr) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: "Pending leads found but no timestamp",
          triggered: false
        })
      };
    }

    const receivedAt = new Date(receivedAtStr);
    const now = new Date();
    const minutesSinceLastLead = (now - receivedAt) / (1000 * 60);

    if (minutesSinceLastLead < 10) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: `Waiting for 10-minute window (${minutesSinceLastLead.toFixed(1)} min since last lead)`,
          triggered: false,
          minutesSinceLastLead: minutesSinceLastLead.toFixed(1)
        })
      };
    }

    // =======================================================
    // TRIGGER SHOM PROCESSOR
    // =======================================================
    console.log("10-minute window elapsed. Triggering Shom processor...");
    
    // Call Shom processor endpoint (we'll create this as a Netlify function)
    const shomResponse = await fetch(`${process.env.URL}/.netlify/functions/run-shom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "auto", source: "scheduled" })
    });

    const shomResult = await shomResponse.json();
    console.log("Shom result:", shomResult);

    // =======================================================
    // TRIGGER KOOM PROCESSOR (after Shom completes)
    // =======================================================
    console.log("Triggering Koom processor...");
    
    const koomResponse = await fetch(`${process.env.URL}/.netlify/functions/run-koom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "auto", source: "scheduled" })
    });

    const koomResult = await koomResponse.json();
    console.log("Koom result:", koomResult);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: "Auto-analysis triggered",
        triggered: true,
        minutesSinceLastLead: minutesSinceLastLead.toFixed(1),
        shom: shomResult,
        koom: koomResult
      })
    };

  } catch (error) {
    console.error("Trigger analysis error:", error);
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