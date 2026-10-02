const { spawn } = require("child_process");
const path = require("path");

exports.handler = async function (event, context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  return new Promise((resolve) => {
    const pythonPath = process.platform === "win32" ? "python" : "python3";
    const scriptPath = path.join(__dirname, "..", "..", "koom_processor.py");
    
    const proc = spawn(pythonPath, [scriptPath], {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      cwd: path.dirname(scriptPath)
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error("Koom processor error:", stderr);
        resolve({
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Koom processor failed", stderr: stderr.slice(-500) })
        });
        return;
      }

      // Parse summary from output
      const savedMatch = stdout.match(/Saved:\s*(\d+)/);
      const excludedMatch = stdout.match(/Excluded:\s*(\d+)/);
      const processedMatch = stdout.match(/Processed:\s*(\d+)/);

      resolve({
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: "Koom analysis completed",
          saved: savedMatch ? parseInt(savedMatch[1]) : 0,
          excluded: excludedMatch ? parseInt(excludedMatch[1]) : 0,
          processed: processedMatch ? parseInt(processedMatch[1]) : 0,
          output: stdout.slice(-2000)
        })
      });
    });
  });
};