import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAuth } from '../middleware/auth';

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

// GET /api/signals
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const {
      status, topic_area, technology_area, source_type, signal_type, search,
      page = '1', limit = '20', sort = 'created_at', order = 'desc'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const allowedSorts: Record<string, string> = {
      created_at: 'created_at', potential_impact: 'potential_impact',
      confidence_level: 'confidence_level', publication_date: 'publication_date', novelty: 'novelty'
    };
    const sortCol = allowedSorts[sort] || 'created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (status) { conditions.push(`status = $${values.length + 1}`); values.push(status); }
    if (topic_area) { conditions.push(`topic_area = $${values.length + 1}`); values.push(topic_area); }
    if (technology_area) { conditions.push(`technology_area = $${values.length + 1}`); values.push(technology_area); }
    if (source_type) { conditions.push(`source_type = $${values.length + 1}`); values.push(source_type); }
    if (signal_type) { conditions.push(`signal_type = $${values.length + 1}`); values.push(signal_type); }
    if (search) {
      conditions.push(`(title ILIKE $${values.length + 1} OR summary ILIKE $${values.length + 1})`);
      values.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) as total FROM signals ${where}`, values);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT * FROM signals ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limitNum, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('Error listing signals:', err);
    res.status(500).json({ error: 'Failed to retrieve signals' });
  }
});

// GET /api/signals/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT * FROM signals WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Signal not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error getting signal:', err);
    res.status(500).json({ error: 'Failed to retrieve signal' });
  }
});

// POST /api/signals
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const body = req.body;
    if (!body.title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await pool.query(`
      INSERT INTO signals (
        title, summary, source_name, source_type, url, publication_date, scan_date,
        topic_area, focus_area, technology_area, driver_trend, signal_type,
        geographic_relevance, industry_relevance, confidence_level, novelty,
        potential_impact, time_horizon, status, tags, analyst_notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING *
    `, [
      body.title, body.summary || null, body.source_name || null, body.source_type || null,
      body.url || null, body.publication_date || null, body.scan_date || null,
      body.topic_area || null, body.focus_area || null, body.technology_area || null,
      body.driver_trend || null, body.signal_type || null,
      body.geographic_relevance || null, body.industry_relevance || null,
      body.confidence_level || null, body.novelty || null, body.potential_impact || null,
      body.time_horizon || null, body.status || 'new',
      typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []),
      body.analyst_notes || null
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating signal:', err);
    res.status(500).json({ error: 'Failed to create signal' });
  }
});

// PUT /api/signals/:id
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows: existing } = await pool.query('SELECT id FROM signals WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Signal not found' });

    const body = req.body;
    const { rows } = await pool.query(`
      UPDATE signals SET
        title=$1, summary=$2, source_name=$3, source_type=$4, url=$5,
        publication_date=$6, scan_date=$7, topic_area=$8, focus_area=$9,
        technology_area=$10, driver_trend=$11, signal_type=$12,
        geographic_relevance=$13, industry_relevance=$14, confidence_level=$15,
        novelty=$16, potential_impact=$17, time_horizon=$18, status=$19,
        tags=$20, analyst_notes=$21, updated_at=NOW()
      WHERE id=$22
      RETURNING *
    `, [
      body.title, body.summary || null, body.source_name || null, body.source_type || null,
      body.url || null, body.publication_date || null, body.scan_date || null,
      body.topic_area || null, body.focus_area || null, body.technology_area || null,
      body.driver_trend || null, body.signal_type || null,
      body.geographic_relevance || null, body.industry_relevance || null,
      body.confidence_level || null, body.novelty || null, body.potential_impact || null,
      body.time_horizon || null, body.status || 'new',
      typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags || []),
      body.analyst_notes || null,
      req.params.id
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating signal:', err);
    res.status(500).json({ error: 'Failed to update signal' });
  }
});

// POST /api/signals/:id/ai-enrich
router.post('/:id/ai-enrich', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT * FROM signals WHERE id = $1', [req.params.id]);
    const existing = rows[0] as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: 'Signal not found' });

    const suggestion = await generateAiSignalMetadata(existing);
    const shouldApply = req.body?.apply !== false;

    if (!shouldApply) {
      return res.json({ applied: false, suggestion });
    }

    const { rows: updated } = await pool.query(`
      UPDATE signals SET
        summary=$1, topic_area=$2, focus_area=$3, technology_area=$4, driver_trend=$5,
        signal_type=$6, geographic_relevance=$7, industry_relevance=$8,
        confidence_level=$9, novelty=$10, potential_impact=$11, relevance_score=$12,
        relevance_narrative=$13, tags=$14, analyst_notes=$15, updated_at=NOW()
      WHERE id=$16
      RETURNING *
    `, [
      suggestion.summary || existing.summary || null,
      suggestion.topic_area || existing.topic_area || null,
      suggestion.focus_area || existing.focus_area || null,
      suggestion.technology_area || existing.technology_area || null,
      suggestion.driver_trend || existing.driver_trend || null,
      suggestion.signal_type || existing.signal_type || null,
      suggestion.geographic_relevance || existing.geographic_relevance || null,
      suggestion.industry_relevance || existing.industry_relevance || null,
      suggestion.confidence_level ?? existing.confidence_level ?? null,
      suggestion.novelty ?? existing.novelty ?? null,
      suggestion.potential_impact ?? existing.potential_impact ?? null,
      suggestion.relevance_score ?? existing.relevance_score ?? null,
      suggestion.relevance_narrative || existing.relevance_narrative || null,
      suggestion.tags || existing.tags || '[]',
      suggestion.analyst_notes || existing.analyst_notes || null,
      req.params.id
    ]);

    return res.json({ applied: true, suggestion, signal: updated[0] });
  } catch (err) {
    console.error('Error generating AI enrichment:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate AI enrichment';
    return res.status(500).json({ error: message });
  }
});

// DELETE /api/signals/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT id FROM signals WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Signal not found' });

    await pool.query(`
      UPDATE news_search_results
      SET imported_signal_id = NULL, review_status = 'new', updated_at = NOW()
      WHERE imported_signal_id = $1
    `, [req.params.id]);

    await pool.query('DELETE FROM signals WHERE id = $1', [req.params.id]);
    res.json({ message: 'Signal deleted successfully' });
  } catch (err) {
    console.error('Error deleting signal:', err);
    res.status(500).json({ error: 'Failed to delete signal' });
  }
});

export default router;
