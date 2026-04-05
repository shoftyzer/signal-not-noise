const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ALLOWED_SIGNAL_TYPES = new Set(['weak', 'strong', 'emerging', 'established']);

function clampRating(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function normalizeTags(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((v) => String(v).trim()).filter(Boolean));
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return '[]';
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return JSON.stringify(parsed.map((v) => String(v).trim()).filter(Boolean));
        }
      } catch {
        return JSON.stringify(raw.split(',').map((v) => v.trim()).filter(Boolean));
      }
    }
    return JSON.stringify(raw.split(',').map((v) => v.trim()).filter(Boolean));
  }
  return '[]';
}

function extractJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('Invalid JSON returned by AI');
  }
}

export async function generateAiSignalMetadata(signal: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const inputPayload = {
    title: signal.title, summary: signal.summary, source_name: signal.source_name,
    source_type: signal.source_type, url: signal.url, publication_date: signal.publication_date,
    topic_area: signal.topic_area, focus_area: signal.focus_area,
    technology_area: signal.technology_area, driver_trend: signal.driver_trend,
    geographic_relevance: signal.geographic_relevance, industry_relevance: signal.industry_relevance,
    signal_type: signal.signal_type, analyst_notes: signal.analyst_notes
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a strategic intelligence analyst. Return only JSON with these fields: summary, topic_area, focus_area, technology_area, driver_trend, signal_type, geographic_relevance, industry_relevance, confidence_level, novelty, potential_impact, relevance_score, relevance_narrative, tags, analyst_notes. Use concise professional language. summary must be 2-4 sentences. confidence_level/novelty/potential_impact/relevance_score must be integers 1-5. relevance_narrative must be 1-2 sentences explaining the relevance to the watchlist. tags must be an array of 3-8 short tags. signal_type must be one of weak,strong,emerging,established.'
        },
        { role: 'user', content: JSON.stringify(inputPayload) }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${bodyText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response');

  const parsed = extractJsonObject(content);
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : null,
    topic_area: typeof parsed.topic_area === 'string' ? parsed.topic_area.trim() : null,
    focus_area: typeof parsed.focus_area === 'string' ? parsed.focus_area.trim() : null,
    technology_area: typeof parsed.technology_area === 'string' ? parsed.technology_area.trim() : null,
    driver_trend: typeof parsed.driver_trend === 'string' ? parsed.driver_trend.trim() : null,
    signal_type: typeof parsed.signal_type === 'string' && ALLOWED_SIGNAL_TYPES.has(parsed.signal_type) ? parsed.signal_type : null,
    geographic_relevance: typeof parsed.geographic_relevance === 'string' ? parsed.geographic_relevance.trim() : null,
    industry_relevance: typeof parsed.industry_relevance === 'string' ? parsed.industry_relevance.trim() : null,
    confidence_level: clampRating(parsed.confidence_level),
    novelty: clampRating(parsed.novelty),
    potential_impact: clampRating(parsed.potential_impact),
    relevance_score: clampRating(parsed.relevance_score),
    relevance_narrative: typeof parsed.relevance_narrative === 'string' ? parsed.relevance_narrative.trim() : null,
    tags: normalizeTags(parsed.tags),
    analyst_notes: typeof parsed.analyst_notes === 'string' ? parsed.analyst_notes.trim() : null
  };
}
