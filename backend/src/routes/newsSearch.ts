import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { SerpApiProvider } from '../services/searchProviders/serpApiProvider';
import {
  runExternalSearch,
  listReviewCandidates,
  importSearchResultToSignals,
  dismissSearchResult
} from '../services/searchService';

const router = Router();

function actor(req: Request): string {
  const headerActor = req.header('x-user') || req.header('x-actor');
  return headerActor && headerActor.trim() ? headerActor.trim() : 'system';
}

function getProvider(): SerpApiProvider {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured');
  }
  return new SerpApiProvider(apiKey);
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
}

function boolFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

async function executeSearch(req: Request, res: Response, params: {
  searchTerm: string;
  watchlistEntryId?: number;
  sourceFilter?: string;
  fromDate?: string;
  toDate?: string;
  language?: string;
  sortBy?: string;
  autoIngest?: boolean;
}) {
  try {
    const provider = getProvider();
    const result = await runExternalSearch({
      provider,
      searchTerm: params.searchTerm,
      watchlistEntryId: params.watchlistEntryId,
      sourceFilter: params.sourceFilter,
      fromDate: params.fromDate,
      toDate: params.toDate,
      language: params.language,
      sortBy: params.sortBy,
      autoIngest: params.autoIngest,
      importStatus: 'new',
      createdBy: actor(req)
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isRateLimit = /429|rate/i.test(message);
    const statusCode = message.includes('SERPAPI_API_KEY') ? 500 : (isRateLimit ? 429 : 400);
    res.status(statusCode).json({
      error: message,
      retryable: isRateLimit
    });
  }
}

// POST /api/news/search
router.post('/search', async (req: Request, res: Response) => {
  const searchTerm = toOptionalString(req.body?.searchTerm || req.body?.query);
  if (!searchTerm) {
    return res.status(400).json({ error: 'searchTerm is required' });
  }

  await executeSearch(req, res, {
    searchTerm,
    sourceFilter: toOptionalString(req.body?.sourceFilter),
    fromDate: toOptionalString(req.body?.fromDate),
    toDate: toOptionalString(req.body?.toDate),
    language: toOptionalString(req.body?.language),
    sortBy: toOptionalString(req.body?.sortBy),
    autoIngest: boolFlag(req.body?.autoIngest)
  });
});

// POST /api/news/search/watchlist/:id
router.post('/search/watchlist/:id', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT * FROM watch_list_entries WHERE id = $1', [req.params.id]);
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: 'Watchlist entry not found' });

    if (entry.status !== 'active') {
      return res.status(400).json({ error: 'Watchlist entry must be active to run scheduled scan' });
    }

    await executeSearch(req, res, {
      searchTerm: entry.search_query,
      watchlistEntryId: entry.id,
      sourceFilter: entry.source_filter || undefined,
      fromDate: entry.from_date || undefined,
      toDate: entry.to_date || undefined,
      language: entry.language || undefined,
      sortBy: entry.sort_by || undefined,
      autoIngest: boolFlag(req.body?.autoIngest)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/news/search/watchlist-active
router.post('/search/watchlist-active', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const { rows: entries } = await pool.query("SELECT * FROM watch_list_entries WHERE status = 'active' ORDER BY priority DESC, updated_at DESC");

    const maxRuns = Math.min(25, Math.max(1, parseInt(String(req.body?.maxRuns || entries.length), 10) || entries.length));
    const runEntries = entries.slice(0, maxRuns);

    const runs: any[] = [];
    for (const entry of runEntries) {
      try {
        const provider = getProvider();
        const result = await runExternalSearch({
          provider,
          searchTerm: entry.search_query,
          watchlistEntryId: entry.id,
          sourceFilter: entry.source_filter || undefined,
          fromDate: entry.from_date || undefined,
          toDate: entry.to_date || undefined,
          language: entry.language || undefined,
          sortBy: entry.sort_by || undefined,
          autoIngest: boolFlag(req.body?.autoIngest),
          importStatus: 'new',
          createdBy: actor(req)
        });
        runs.push({ watchlistId: entry.id, name: entry.name, ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        runs.push({ watchlistId: entry.id, name: entry.name, ok: false, error: message });
      }
    }

    res.json({
      requested: maxRuns,
      executed: runEntries.length,
      success: runs.filter((r) => r.ok).length,
      failed: runs.filter((r) => !r.ok).length,
      runs
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/news/review
router.get('/review', async (req: Request, res: Response) => {
  try {
    const reviewStatus = toOptionalString(req.query.review_status);
    const watchlistEntryId = toOptionalString(req.query.watchlist_entry_id);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

    const rows = await listReviewCandidates({
      reviewStatus,
      watchlistEntryId: watchlistEntryId ? parseInt(watchlistEntryId, 10) : undefined,
      limit
    });

    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/news/review/:id/import
router.post('/review/:id/import', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await importSearchResultToSignals(id, {
      importedBy: actor(req),
      status: toOptionalString(req.body?.status) || 'new'
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found')) return res.status(404).json({ error: message });
    res.status(500).json({ error: message });
  }
});

// POST /api/news/review/:id/dismiss
router.post('/review/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dismissSearchResult(id);
    res.json({ dismissed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/news/scans
router.get('/scans', async (req: Request, res: Response) => {
  try {
    const pool = getDb();
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

    const { rows } = await pool.query(`
      SELECT
        s.id, s.provider, s.search_term, s.scan_timestamp, s.status, s.error_message,
        s.watchlist_entry_id, wl.name AS watchlist_name
      FROM news_search_scans s
      LEFT JOIN watch_list_entries wl ON wl.id = s.watchlist_entry_id
      ORDER BY s.scan_timestamp DESC
      LIMIT $1
    `, [limit]);

    res.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
