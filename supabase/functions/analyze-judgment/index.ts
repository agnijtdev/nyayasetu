// @ts-nocheck
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { judgmentText } = await req.json();
    if (!judgmentText || typeof judgmentText !== "string") {
      return new Response(JSON.stringify({ error: "judgmentText required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
 
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summaryPrompt = `Read this court judgment and return a JSON object with exactly these fields:
- "case_title": Case name/title
- "court": Name of the court
- "case_number": Case number if mentioned, else "Not mentioned"
- "judgment_date": Date of judgment if mentioned, else "Not mentioned"
- "case_type": Type of case (Civil Suit, Writ Petition, Criminal Appeal, etc.)
- "brief_summary": 2-3 sentence plain English summary of what the judgment decided
- "total_parties": Number of distinct parties involved

Return ONLY valid JSON. No preamble, no markdown backticks, no explanation.

Judgment:
${judgmentText.slice(0, 4000)}`;

    const actionsPrompt = `You are a legal AI assistant specializing in Indian court judgments.

Carefully read the following court judgment and extract EVERY actionable directive — things that a party, the registry, or a lower court must DO as a result of this order.

For each action item, return a JSON object with these exact fields:
- "action": A clear 1-2 sentence plain-English description of what must be done
- "party": Who must do it — MUST be one of: "Petitioner", "Respondent", "Registry", "Lower Court", "Both Parties", "Other"
- "deadline": The exact deadline mentioned (e.g., "Within 4 weeks", "On or before 15 January 2025", "Next hearing date", "Immediately", "Not specified")
- "action_type": One of: "File Document", "Appear in Court", "Notify/Inform", "Pay Amount", "Produce Record", "Take Administrative Action", "Other"
- "source_sentence": The EXACT sentence or phrase from the judgment that contains this directive (keep it under 200 characters)
- "confidence": A number from 0.6 to 1.0 indicating your confidence this is a genuine action item
- "priority": One of: "High", "Medium", "Low"

Rules:
- Only extract genuine directives/orders, not background facts or arguments
- Include ALL parties obligations — petitioner, respondent, registry, lower court
- If a deadline is relative keep it as stated
- Return ONLY a valid JSON array. No explanation, no preamble, no markdown backticks.

Judgment text:
${judgmentText.slice(0, 12000)}`;

    const callAI = async (prompt: string) => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`AI gateway ${r.status}: ${t}`);
      }
      const j = await r.json();
      return (j.choices?.[0]?.message?.content || "").trim();
    };

    const parseJSON = (raw: string, fallback: any) => {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      try { return JSON.parse(cleaned); } catch {}
      const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      return fallback;
    };

    const [summaryRaw, actionsRaw] = await Promise.all([
      callAI(summaryPrompt),
      callAI(actionsPrompt),
    ]);

    const summary = parseJSON(summaryRaw, {
      case_title: "Unable to extract", court: "—", case_number: "—",
      judgment_date: "—", case_type: "—",
      brief_summary: "Summary extraction failed. Please review manually.",
      total_parties: "—",
    });
    const actionItems = parseJSON(actionsRaw, []);

    return new Response(JSON.stringify({ summary, actionItems }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
