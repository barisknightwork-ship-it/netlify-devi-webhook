const { Client } = require("@notionhq/client");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DEVI_LEADS_DB = "3eb7161c-21a6-810f-a22d-db093a6bda31";
const LOCAL_RUNNER_URL = "https://produce-floral-unworthy.ngrok-free.dev";

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
    // TRIGGER LOCAL RUNNER (Shom + Koom)
    // =======================================================
    console.log("10-minute window elapsed. Triggering local runner (Shom + Koom)...");
    
    // Call local runner via ngrok - runs both Shom and Koom
    const runnerResponse = await fetch(`${LOCAL_RUNNER_URL}/run-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "auto", source: "scheduled" })
    });

    const runnerResult = await runnerResponse.json();
    console.log("Local runner result:", runnerResult);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: "Auto-analysis triggered via local runner",
        triggered: true,
        minutesSinceLastLead: minutesSinceLastLead.toFixed(1),
        result: runnerResult
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