import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';

const router = Router();

function actor(req: Request): string {
  const headerActor = req.header('x-user') || req.header('x-actor');
  return headerActor && headerActor.trim() ? headerActor.trim() : 'system';
}

function normalizeTags(input: unknown): string {
  if (Array.isArray(input)) {
    return JSON.stringify(input.map((v) => String(v).trim()).filter(Boolean));
  }
  if (typeof input === 'string') {
    const value = input.trim();
    if (!value) return '[]';
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return JSON.stringify(parsed.map((v) => String(v).trim()).filter(Boolean));
        }
      } catch {
        return JSON.stringify(value.split(',').map((v) => v.trim()).filter(Boolean));
      }
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
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const {
      status,
      topic_area,
      focus_area,
      technology_area,
      driver_trend,
      search,
      limit = '200'
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {
      limit: Math.min(500, Math.max(1, parseInt(limit, 10) || 200))
    };

    if (status) { conditions.push('status = @status'); params.status = status; }
    if (topic_area) { conditions.push('topic_area = @topic_area'); params.topic_area = topic_area; }
    if (focus_area) { conditions.push('focus_area = @focus_area'); params.focus_area = focus_area; }
    if (technology_area) { conditions.push('technology_area = @technology_area'); params.technology_area = technology_area; }
    if (driver_trend) { conditions.push('driver_trend = @driver_trend'); params.driver_trend = driver_trend; }
    if (search) {
      conditions.push('(name LIKE @search OR search_query LIKE @search OR description LIKE @search OR notes LIKE @search)');
      params.search = `%${search}%`;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT *
      FROM watch_list_entries
      ${where}
      ORDER BY
        CASE status
          WHEN 'active' THEN 1
          WHEN 'paused' THEN 2
          ELSE 3
        END,
        priority DESC,
        updated_at DESC
      LIMIT @limit
    `).all(params);

    res.json({ data: rows });
  } catch (err) {
    console.error('Error listing watchlist entries:', err);
    res.status(500).json({ error: 'Failed to list watchlist entries' });
  }
});

// GET /api/watchlist/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Watchlist entry not found' });
    res.json(row);
  } catch (err) {
    console.error('Error getting watchlist entry:', err);
    res.status(500).json({ error: 'Failed to get watchlist entry' });
  }
});

// POST /api/watchlist
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const body = req.body || {};
    const now = new Date().toISOString();
    const createdBy = toNullableString(body.created_by) || actor(req);

    if (!toNullableString(body.name)) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!toNullableString(body.search_query)) {
      return res.status(400).json({ error: 'search_query is required' });
    }

    const result = db.prepare(`
      INSERT INTO watch_list_entries (
        name, search_query, description,
        topic_area, focus_area, technology_area, driver_trend,
        geographic_relevance, industry_relevance,
        language, source_filter, from_date, to_date, sort_by,
        priority, status, tags, notes,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        @name, @search_query, @description,
        @topic_area, @focus_area, @technology_area, @driver_trend,
        @geographic_relevance, @industry_relevance,
        @language, @source_filter, @from_date, @to_date, @sort_by,
        @priority, @status, @tags, @notes,
        @created_by, @updated_by, @created_at, @updated_at
      )
    `).run({
      name: toNullableString(body.name),
      search_query: toNullableString(body.search_query),
      description: toNullableString(body.description),
      topic_area: toNullableString(body.topic_area),
      focus_area: toNullableString(body.focus_area),
      technology_area: toNullableString(body.technology_area),
      driver_trend: toNullableString(body.driver_trend),
      geographic_relevance: toNullableString(body.geographic_relevance),
      industry_relevance: toNullableString(body.industry_relevance),
      language: toNullableString(body.language),
      source_filter: toNullableString(body.source_filter),
      from_date: toNullableString(body.from_date),
      to_date: toNullableString(body.to_date),
      sort_by: toNullableString(body.sort_by) || 'publishedAt',
      priority: Math.min(5, Math.max(1, parseInt(String(body.priority || 3), 10) || 3)),
      status: ['active', 'paused', 'archived'].includes(String(body.status)) ? body.status : 'active',
      tags: normalizeTags(body.tags),
      notes: toNullableString(body.notes),
      created_by: createdBy,
      updated_by: createdBy,
      created_at: now,
      updated_at: now
    });

    const created = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to create watchlist entry' });
  }
});

// PUT /api/watchlist/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Watchlist entry not found' });

    const body = req.body || {};
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE watch_list_entries SET
        name = @name,
        search_query = @search_query,
        description = @description,
        topic_area = @topic_area,
        focus_area = @focus_area,
        technology_area = @technology_area,
        driver_trend = @driver_trend,
        geographic_relevance = @geographic_relevance,
        industry_relevance = @industry_relevance,
        language = @language,
        source_filter = @source_filter,
        from_date = @from_date,
        to_date = @to_date,
        sort_by = @sort_by,
        priority = @priority,
        status = @status,
        tags = @tags,
        notes = @notes,
        updated_by = @updated_by,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: req.params.id,
      name: toNullableString(body.name) || (existing as any).name,
      search_query: toNullableString(body.search_query) || (existing as any).search_query,
      description: toNullableString(body.description),
      topic_area: toNullableString(body.topic_area),
      focus_area: toNullableString(body.focus_area),
      technology_area: toNullableString(body.technology_area),
      driver_trend: toNullableString(body.driver_trend),
      geographic_relevance: toNullableString(body.geographic_relevance),
      industry_relevance: toNullableString(body.industry_relevance),
      language: toNullableString(body.language),
      source_filter: toNullableString(body.source_filter),
      from_date: toNullableString(body.from_date),
      to_date: toNullableString(body.to_date),
      sort_by: toNullableString(body.sort_by) || 'publishedAt',
      priority: Math.min(5, Math.max(1, parseInt(String(body.priority || (existing as any).priority || 3), 10) || 3)),
      status: ['active', 'paused', 'archived'].includes(String(body.status)) ? body.status : (existing as any).status,
      tags: normalizeTags(body.tags),
      notes: toNullableString(body.notes),
      updated_by: toNullableString(body.updated_by) || actor(req),
      updated_at: now
    });

    const updated = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to update watchlist entry' });
  }
});

// PATCH /api/watchlist/:id/status
router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'paused', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status must be one of active, paused, archived' });
    }

    const existing = db.prepare('SELECT id FROM watch_list_entries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Watchlist entry not found' });

    db.prepare(`
      UPDATE watch_list_entries
      SET status = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(status, actor(req), new Date().toISOString(), req.params.id);

    const updated = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating watchlist status:', err);
    res.status(500).json({ error: 'Failed to update watchlist status' });
  }
});

// POST /api/watchlist/:id/activate
router.post('/:id/activate', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM watch_list_entries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Watchlist entry not found' });

    db.prepare(`
      UPDATE watch_list_entries
      SET status = 'active', updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(actor(req), new Date().toISOString(), req.params.id);

    const updated = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error activating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to activate watchlist entry' });
  }
});

// POST /api/watchlist/:id/deactivate
router.post('/:id/deactivate', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM watch_list_entries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Watchlist entry not found' });

    db.prepare(`
      UPDATE watch_list_entries
      SET status = 'paused', updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(actor(req), new Date().toISOString(), req.params.id);

    const updated = db.prepare('SELECT * FROM watch_list_entries WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error deactivating watchlist entry:', err);
    res.status(500).json({ error: 'Failed to deactivate watchlist entry' });
  }
});

// DELETE /api/watchlist/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM watch_list_entries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Watchlist entry not found' });

    db.prepare('DELETE FROM watch_list_entries WHERE id = ?').run(req.params.id);
    res.json({ message: 'Watchlist entry deleted' });
  } catch (err) {
    console.error('Error deleting watchlist entry:', err);
    res.status(500).json({ error: 'Failed to delete watchlist entry' });
  }
});

export default router;
