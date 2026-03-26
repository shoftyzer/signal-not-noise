import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

function actor(req: Request): string {
  const h = req.header('x-user') || req.header('x-actor');
  return h && h.trim() ? h.trim() : 'system';
}

function normalizeTags(input: unknown): string {
  if (Array.isArray(input)) return JSON.stringify(input.map((v) => String(v).trim()).filter(Boolean));
  if (typeof input === 'string') {
    const value = input.trim();
    if (!value) return '[]';
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return JSON.stringify(parsed.map((v) => String(v).trim()).filter(Boolean));
      } catch { return JSON.stringify(value.split(',').map((v) => v.trim()).filter(Boolean)); }
    }
    return JSON.stringify(value.split(',').map((v) => v.trim()).filter(Boolean));
  }
  return '[]';
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

// GET /api/watchlist
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { status, topic_area, focus_area, technology_area, driver_trend, search, limit = '200' } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (status) { conditions.push(`status = $${values.length + 1}`); values.push(status); }
    if (topic_area) { conditions.push(`topic_area = $${values.length + 1}`); values.push(topic_area); }
    if (focus_area) { conditions.push(`focus_area = $${values.length + 1}`); values.push(focus_area); }
    if (technology_area) { conditions.push(`technology_area = $${values.length + 1}`); values.push(technology_area); }
    if (driver_trend) { conditions.push(`driver_trend = $${values.length + 1}`); values.push(driver_trend); }
    if (search) {
      conditions.push(`(name ILIKE $${values.length + 1} OR search_query ILIKE $${values.length + 1} OR description ILIKE $${values.length + 1} OR notes ILIKE $${values.length + 1})`);
      values.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    values.push(limitNum);

    const { rows } = await pool.query(`
      SELECT * FROM watch_list_entries
      ${where}
      ORDER BY
        CASE status WHEN 'active' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
        priority DESC,
        updated_at DESC
      LIMIT $${values.length}
    `, values);

    res.json({ data: rows });
  } catch (err) {
    console.error('Error listing watchlist entries:', err);
    res.status(500).json({ error: 'Failed to list watchlist entries' });
  }
});

// GET /api/watchlist/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT * FROM watch_list_entries WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Watchlist entry not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error getting watchlist entry:', err);
    res.status(500).json({ error: 'Failed to get watchlist entry' });
  }
});

// POST /api/watchlist
router.post('/', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const body = req.body || {};
    const createdBy = toNullableString(body.created_by) || actor(req);

    if (!toNullableString(body.name)) return res.status(400).json({ error: 'name is required' });
    if (!toNullableString(body.search_query)) return res.status(400).json({ error: 'search_query is required' });

    const { rows } = await pool.query(`
      INSERT INTO watch_list_entries (
        name, search_query, description,
        topic_area, focus_area, technology_area, driver_trend,
        geographic_relevance, industry_relevance,
        language, source_filter, from_date, to_date, sort_by,
        priority, status, tags, notes, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `, [
      toNullableString(body.name), toNullableString(body.search_query), toNullableString(body.description),
      toNullableString(body.topic_area), toNullableString(body.focus_area), toNullableString(body.technology_area),
      toNullableString(body.driver_trend), toNullableString(body.geographic_relevance), toNullableString(body.industry_relevance),
      toNullableString(body.language), toNullableString(body.source_filter),
      toNullableString(body.from_date), toNullableString(body.to_date),
      toNullableString(body.sort_by) || 'publishedAt',
      Math.min(5, Math.max(1, parseInt(String(body.priority || 3), 10) || 3)),
      ['active', 'paused', 'archived'].includes(String(body.status)) ? body.status : 'active',
      normalizeTags(body.tags), toNullableString(body.notes),
      createdBy, createdBy
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to create watchlist entry' });
  }
});

// PUT /api/watchlist/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows: existing } = await pool.query('SELECT * FROM watch_list_entries WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Watchlist entry not found' });

    const body = req.body || {};
    const { rows } = await pool.query(`
      UPDATE watch_list_entries SET
        name=$1, search_query=$2, description=$3,
        topic_area=$4, focus_area=$5, technology_area=$6, driver_trend=$7,
        geographic_relevance=$8, industry_relevance=$9,
        language=$10, source_filter=$11, from_date=$12, to_date=$13, sort_by=$14,
        priority=$15, status=$16, tags=$17, notes=$18,
        updated_by=$19, updated_at=NOW()
      WHERE id=$20
      RETURNING *
    `, [
      toNullableString(body.name) || existing[0].name,
      toNullableString(body.search_query) || existing[0].search_query,
      toNullableString(body.description),
      toNullableString(body.topic_area), toNullableString(body.focus_area),
      toNullableString(body.technology_area), toNullableString(body.driver_trend),
      toNullableString(body.geographic_relevance), toNullableString(body.industry_relevance),
      toNullableString(body.language), toNullableString(body.source_filter),
      toNullableString(body.from_date), toNullableString(body.to_date),
      toNullableString(body.sort_by) || 'publishedAt',
      Math.min(5, Math.max(1, parseInt(String(body.priority || existing[0].priority || 3), 10) || 3)),
      ['active', 'paused', 'archived'].includes(String(body.status)) ? body.status : existing[0].status,
      normalizeTags(body.tags), toNullableString(body.notes),
      toNullableString(body.updated_by) || actor(req),
      req.params.id
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to update watchlist entry' });
  }
});

// PATCH /api/watchlist/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'paused', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status must be one of active, paused, archived' });
    }
    const { rows: existing } = await pool.query('SELECT id FROM watch_list_entries WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Watchlist entry not found' });

    const { rows } = await pool.query(
      'UPDATE watch_list_entries SET status=$1, updated_by=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, actor(req), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating watchlist status:', err);
    res.status(500).json({ error: 'Failed to update watchlist status' });
  }
});

// POST /api/watchlist/:id/activate
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows: existing } = await pool.query('SELECT id FROM watch_list_entries WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Watchlist entry not found' });
    const { rows } = await pool.query(
      "UPDATE watch_list_entries SET status='active', updated_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [actor(req), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error activating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to activate watchlist entry' });
  }
});

// POST /api/watchlist/:id/deactivate
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows: existing } = await pool.query('SELECT id FROM watch_list_entries WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Watchlist entry not found' });
    const { rows } = await pool.query(
      "UPDATE watch_list_entries SET status='paused', updated_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [actor(req), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error deactivating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to deactivate watchlist entry' });
  }
});

// DELETE /api/watchlist/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT id FROM watch_list_entries WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Watchlist entry not found' });
    await pool.query('DELETE FROM watch_list_entries WHERE id = $1', [req.params.id]);
    res.json({ message: 'Watchlist entry deleted' });
  } catch (err) {
    console.error('Error deleting watchlist entry:', err);
    res.status(500).json({ error: 'Failed to delete watchlist entry' });
  }
});

export default router;
