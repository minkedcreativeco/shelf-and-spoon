exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // ── GET /test — diagnose API key and connectivity ────────────────────────
  if (event.httpMethod === "GET") {
    const keyPresent = !!process.env.ANTHROPIC_API_KEY;
    const keyPreview = keyPresent
      ? process.env.ANTHROPIC_API_KEY.slice(0, 12) + "..."
      : "NOT SET";

    // Try a minimal Claude call to verify the key works
    let claudeStatus = "not tested";
    if (keyPresent) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 10,
            messages: [{ role: "user", content: "Say OK" }],
          }),
        });
        const data = await res.json();
        claudeStatus = res.ok ? "✅ API key works" : `❌ HTTP ${res.status}: ${JSON.stringify(data)}`;
      } catch (err) {
        claudeStatus = `❌ fetch error: ${err.message}`;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ keyPresent, keyPreview, claudeStatus }, null, 2),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON", detail: e.message }) };
  }

  // ── ISBN lookup ──────────────────────────────────────────────────────────
  if (body.action === "isbn_lookup") {
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${body.isbn}&format=json&jscmd=data`
      );
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } catch (err) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Open Library failed", detail: err.message }) };
    }
  }

  // ── Claude call ──────────────────────────────────────────────────────────
  if (body.action === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not set" }) };
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: body.model || "claude-haiku-4-5-20251001",
          max_tokens: body.max_tokens || 800,
          messages: body.messages,
          ...(body.system ? { system: body.system } : {}),
        }),
      });
      const data = await res.json();
      return { statusCode: res.status, headers, body: JSON.stringify(data) };
    } catch (err) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Claude fetch failed", detail: err.message }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
};
