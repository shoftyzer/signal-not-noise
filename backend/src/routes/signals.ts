import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

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

async function generateAiSignalMetadata(signal: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const inputPayload = {
    title: signal.title,
    summary: signal.summary,
    source_name: signal.source_name,
    source_type: signal.source_type,
    url: signal.url,
    publication_date: signal.publication_date,
    topic_area: signal.topic_area,
    focus_area: signal.focus_area,
    technology_area: signal.technology_area,
    driver_trend: signal.driver_trend,
    geographic_relevance: signal.geographic_relevance,
    industry_relevance: signal.industry_relevance,
    signal_type: signal.signal_type,
    analyst_notes: signal.analyst_notes
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a strategic intelligence analyst. Return only JSON with these fields: summary, topic_area, focus_area, technology_area, driver_trend, signal_type, geographic_relevance, industry_relevance, confidence_level, novelty, potential_impact, relevance_score, relevance_narrative, tags, analyst_notes. Use concise professional language. summary must be 2-4 sentences. confidence_level/novelty/potential_impact/relevance_score must be integers 1-5. relevance_narrative must be 1-2 sentences explaining the relevance to the watchlist. tags must be an array of 3-8 short tags. signal_type must be one of weak,strong,emerging,established.'
        },
        {
          role: 'user',
          content: JSON.stringify(inputPayload)
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${bodyText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  const parsed = extractJsonObject(content);
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : null,
    topic_area: typeof parsed.topic_area === 'string' ? parsed.topic_area.trim() : null,
    focus_area: typeof parsed.focus_area === 'string' ? parsed.focus_area.trim() : null,
    technology_area: typeof parsed.technology_area === 'string' ? parsed.technology_area.trim() : null,
    driver_trend: typeof parsed.driver_trend === 'string' ? parsed.driver_trend.trim() : null,
    signal_type: typeof parsed.signal_type === 'string' && ALLOWED_SIGNAL_TYPES.has(parsed.signal_type)
      ? parsed.signal_type
      : null,
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

// GET /api/signals - list with filters and pagination
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const {
      status,
      topic_area,
      technology_area,
      source_type,
      signal_type,
      search,
      page = '1',
      limit = '20',
      sort = 'created_at',
      order = 'desc'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const allowedSorts: Record<string, string> = {
      created_at: 'created_at',
      potential_impact: 'potential_impact',
      confidence_level: 'confidence_level',
      publication_date: 'publication_date',
      novelty: 'novelty'
    };
    const sortCol = allowedSorts[sort] || 'created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (status) { conditions.push('status = @status'); params.status = status; }
    if (topic_area) { conditions.push('topic_area = @topic_area'); params.topic_area = topic_area; }
    if (technology_area) { conditions.push('technology_area = @technology_area'); params.technology_area = technology_area; }
    if (source_type) { conditions.push('source_type = @source_type'); params.source_type = source_type; }
    if (signal_type) { conditions.push('signal_type = @signal_type'); params.signal_type = signal_type; }
    if (search) {
      conditions.push('(title LIKE @search OR summary LIKE @search)');
      params.search = `%${search}%`;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM signals ${where}`).get(params) as { total: number };
    const total = countRow.total;

    const signals = db.prepare(
      `SELECT * FROM signals ${where} ORDER BY ${sortCol} ${sortDir} LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit: limitNum, offset });

    res.json({
      data: signals,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Error listing signals:', err);
    res.status(500).json({ error: 'Failed to retrieve signals' });
  }
});

// GET /api/signals/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(req.params.id);
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json(signal);
  } catch (err) {
    console.error('Error getting signal:', err);
    res.status(500).json({ error: 'Failed to retrieve signal' });
  }
});

// POST /api/signals
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const body = req.body;

    if (!body.title) return res.status(400).json({ error: 'title is required' });

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO signals (
        title, summary, source_name, source_type, url, publication_date, scan_date,
        topic_area, focus_area, technology_area, driver_trend, signal_type,
        geographic_relevance, industry_relevance, confidence_level, novelty,
        potential_impact, time_horizon, status, tags, analyst_notes,
        created_at, updated_at
      ) VALUES (
        @title, @summary, @source_name, @source_type, @url, @publication_date, @scan_date,
        @topic_area, @focus_area, @technology_area, @driver_trend, @signal_type,
        @geographic_relevance, @industry_relevance, @confidence_level, @novelty,
        @potential_impact, @time_horizon, @status, @tags, @analyst_notes,
        @created_at, @updated_at
      )
    `).run({
      title: body.title,
      summary: body.summary || null,
      source_name: body.source_name || null,
      source_type: body.source_type || null,
      url: body.url || null,
      publication_date: body.publication_date || null,
      scan_date: body.scan_date || null,
      topic_area: body.topic_area || null,
      focus_area: body.focus_area || null,
      technology_area: body.technology_area || null,
      driver_trend: body.driver_trend || null,
      signal_type: body.signal_type || null,
      geographic_relevance: body.geographic_relevance || null,
      industry_relevance: body.industry_relevance || null,
      confidence_level: body.confidence_level || null,
      novelty: body.novelty || null,
      potential_impact: body.potential_impact || null,
      time_horizon: body.time_horizon || null,
      status: body.status || 'new',
      tags: typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []),
      analyst_notes: body.analyst_notes || null,
      created_at: now,
      updated_at: now
    });

    const created = db.prepare('SELECT * FROM signals WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating signal:', err);
    res.status(500).json({ error: 'Failed to create signal' });
  }
});

// PUT /api/signals/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM signals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Signal not found' });

    const body = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE signals SET
        title = @title, summary = @summary, source_name = @source_name,
        source_type = @source_type, url = @url, publication_date = @publication_date,
        scan_date = @scan_date, topic_area = @topic_area, focus_area = @focus_area,
        technology_area = @technology_area, driver_trend = @driver_trend,
        signal_type = @signal_type, geographic_relevance = @geographic_relevance,
        industry_relevance = @industry_relevance, confidence_level = @confidence_level,
        novelty = @novelty, potential_impact = @potential_impact,
        time_horizon = @time_horizon, status = @status, tags = @tags,
        analyst_notes = @analyst_notes, updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: req.params.id,
      title: body.title,
      summary: body.summary || null,
      source_name: body.source_name || null,
      source_type: body.source_type || null,
      url: body.url || null,
      publication_date: body.publication_date || null,
      scan_date: body.scan_date || null,
      topic_area: body.topic_area || null,
      focus_area: body.focus_area || null,
      technology_area: body.technology_area || null,
      driver_trend: body.driver_trend || null,
      signal_type: body.signal_type || null,
      geographic_relevance: body.geographic_relevance || null,
      industry_relevance: body.industry_relevance || null,
      confidence_level: body.confidence_level || null,
      novelty: body.novelty || null,
      potential_impact: body.potential_impact || null,
      time_horizon: body.time_horizon || null,
      status: body.status || 'new',
      tags: typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []),
      analyst_notes: body.analyst_notes || null,
      updated_at: now
    });

    const updated = db.prepare('SELECT * FROM signals WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating signal:', err);
    res.status(500).json({ error: 'Failed to update signal' });
  }
});

// POST /api/signals/:id/ai-enrich
router.post('/:id/ai-enrich', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM signals WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: 'Signal not found' });

    const suggestion = await generateAiSignalMetadata(existing);
    const shouldApply = req.body?.apply !== false;

    if (!shouldApply) {
      return res.json({ applied: false, suggestion });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE signals SET
        summary = @summary,
        topic_area = @topic_area,
        focus_area = @focus_area,
        technology_area = @technology_area,
        driver_trend = @driver_trend,
        signal_type = @signal_type,
        geographic_relevance = @geographic_relevance,
        industry_relevance = @industry_relevance,
        confidence_level = @confidence_level,
        novelty = @novelty,
        potential_impact = @potential_impact,
        relevance_score = @relevance_score,
        relevance_narrative = @relevance_narrative,
        tags = @tags,
        analyst_notes = @analyst_notes,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: req.params.id,
      summary: suggestion.summary || existing.summary || null,
      topic_area: suggestion.topic_area || existing.topic_area || null,
      focus_area: suggestion.focus_area || existing.focus_area || null,
      technology_area: suggestion.technology_area || existing.technology_area || null,
      driver_trend: suggestion.driver_trend || existing.driver_trend || null,
      signal_type: suggestion.signal_type || existing.signal_type || null,
      geographic_relevance: suggestion.geographic_relevance || existing.geographic_relevance || null,
      industry_relevance: suggestion.industry_relevance || existing.industry_relevance || null,
      confidence_level: suggestion.confidence_level ?? existing.confidence_level ?? null,
      novelty: suggestion.novelty ?? existing.novelty ?? null,
      potential_impact: suggestion.potential_impact ?? existing.potential_impact ?? null,
      relevance_score: suggestion.relevance_score ?? existing.relevance_score ?? null,
      relevance_narrative: suggestion.relevance_narrative || existing.relevance_narrative || null,
      tags: suggestion.tags || existing.tags || '[]',
      analyst_notes: suggestion.analyst_notes || existing.analyst_notes || null,
      updated_at: now
    });

    const updated = db.prepare('SELECT * FROM signals WHERE id = ?').get(req.params.id);
    return res.json({ applied: true, suggestion, signal: updated });
  } catch (err) {
    console.error('Error generating AI enrichment:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate AI enrichment';
    return res.status(500).json({ error: message });
  }
});

// DELETE /api/signals/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM signals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Signal not found' });

    // Keep review rows but detach their imported signal reference before deleting.
    db.prepare(`
      UPDATE news_search_results
      SET imported_signal_id = NULL,
          review_status = 'new',
          updated_at = CURRENT_TIMESTAMP
      WHERE imported_signal_id = ?
    `).run(req.params.id);

    db.prepare('DELETE FROM signals WHERE id = ?').run(req.params.id);
    res.json({ message: 'Signal deleted successfully' });
  } catch (err) {
    console.error('Error deleting signal:', err);
    res.status(500).json({ error: 'Failed to delete signal' });
  }
});

export default router;
