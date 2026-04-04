// Follow instructions to deploy to Supabase Edge Functions
// Command: supabase functions deploy analyze

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { summaries } = await req.json();

    const prompt = `
    You are an expert Manufacturing Data Scientist. Analyze the following Excel sheet structures 
    and provide high-level insights for a General Manager.
    
    DATA SUMMARIES:
    ${JSON.stringify(summaries, null, 2)}
    
    RESPONSE FORMAT (JSON):
    {
      "executiveSummary": "2-sentence summary of overall performance.",
      "kpis": {
        "rejectionRate": { "value": 0.0, "trend": 0.0, "context": "..." },
        "totalOutput": { "value": 0, "trend": 0.0, "context": "..." },
        "downtime": { "value": 0, "trend": 0.0, "context": "..." },
        "qualityScore": { "value": 0.0, "trend": 0.0, "context": "..." }
      },
      "insights": ["...", "...", "...", "...", "..."],
      "recommendations": ["...", "...", "...", "..."],
      "charts": [
        { "title": "Efficiency Trend", "type": "line", "data": { ... } },
        { "title": "Resource Utilization", "type": "bar", "data": { ... } }
      ],
      "alerts": [{ "message": "...", "type": "danger|warning" }]
    }
    `;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        system: "Respond ONLY with a valid JSON object matching the requested format.",
        temperature: 0.1
      }),
    });

    const aiResult = await response.json();
    const resultJson = JSON.parse(aiResult.content[0].text);

    return new Response(JSON.stringify(resultJson), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
