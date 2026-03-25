import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

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

// DELETE /api/signals/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM signals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Signal not found' });
    db.prepare('DELETE FROM signals WHERE id = ?').run(req.params.id);
    res.json({ message: 'Signal deleted successfully' });
  } catch (err) {
    console.error('Error deleting signal:', err);
    res.status(500).json({ error: 'Failed to delete signal' });
  }
});

export default router;
