import { getDb } from '../db/schema';
import { ExternalSearchProvider, ExternalSearchQuery } from './searchProviders/types';
import { generateAiSignalMetadata } from './aiService';

export interface SearchRunParams {
  provider: ExternalSearchProvider;
  searchTerm: string;
  watchlistEntryId?: number;
  sourceFilter?: string;
  fromDate?: string;
  toDate?: string;
  language?: string;
  sortBy?: string;
  createdBy?: string;
  autoIngest?: boolean;
  importStatus?: string;
  cutoffDate?: string;
}

interface WatchListEntrySummary {
  id: number; name: string; topic_area?: string; focus_area?: string;
  technology_area?: string; driver_trend?: string;
  geographic_relevance?: string; industry_relevance?: string;
}

function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      parsed.searchParams.delete(p);
    }
    return parsed.toString();
  } catch { return raw.trim(); }
}

function buildSignalPayload(article: Record<string, unknown>, watchlist?: WatchListEntrySummary, status = 'new') {
  const now = new Date().toISOString();
  const sourceProvider = String(article.external_source || 'external');
  const tags = watchlist?.name ? [watchlist.name, sourceProvider] : [sourceProvider];
  return {
    title: article.title,
    summary: article.description || null,
    source_name: article.source_name || null,
    source_type: 'article',
    url: article.url,
    publication_date: article.publication_date ? String(article.publication_date).split('T')[0] : null,
    scan_date: now.split('T')[0],
    topic_area: watchlist?.topic_area || null,
    focus_area: watchlist?.focus_area || null,
    technology_area: watchlist?.technology_area || null,
    driver_trend: watchlist?.driver_trend || null,
    geographic_relevance: watchlist?.geographic_relevance || null,
    industry_relevance: watchlist?.industry_relevance || null,
    status,
    tags: JSON.stringify(tags),
    analyst_notes: null,
    external_source: sourceProvider,
    external_id: article.external_id || null,
    search_term_used: article.search_term,
    scan_timestamp: article.scan_timestamp,
    raw_payload: article.raw_payload || null,
    created_at: now,
    updated_at: now
  };
}

export async function runExternalSearch(params: SearchRunParams) {
  const pool = getDb();
  const now = new Date().toISOString();

  const query: ExternalSearchQuery = {
    query: params.searchTerm,
    sources: params.sourceFilter,
    from: params.fromDate,
    to: params.toDate,
    language: params.language,
    sortBy: params.sortBy,
    pageSize: 50
  };

  let responsePayload: unknown = null;
  let scanId: number;

  try {
    const response = await params.provider.searchArticles(query);
    responsePayload = response.rawResponse || null;

    const scanResult = await pool.query(`
      INSERT INTO news_search_scans (
        provider, watchlist_entry_id, search_term, source_filter, language,
        sort_by, from_date, to_date, scan_timestamp, request_payload,
        response_payload, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'success',$12)
      RETURNING id
    `, [
      params.provider.providerName,
      params.watchlistEntryId || null,
      params.searchTerm,
      params.sourceFilter || null,
      params.language || null,
      params.sortBy || null,
      params.fromDate || null,
      params.toDate || null,
      now,
      JSON.stringify(query),
      JSON.stringify(responsePayload),
      params.createdBy || null
    ]);

    scanId = scanResult.rows[0].id;

    const insertedResults: Array<{ searchResultId: number; articleId: number }> = [];

    for (const article of response.articles) {
      // Discard articles published before the cutoff date
      if (params.cutoffDate && article.publishedAt) {
        if (new Date(article.publishedAt) < new Date(params.cutoffDate)) continue;
      }
      const externalId = article.externalId || null;
      const normalized = normalizeUrl(article.url);
      const articleRow = [
        params.provider.providerName, externalId, article.title,
        article.sourceName || null, article.author || null,
        article.description || null, article.contentSnippet || null,
        article.url, normalized,
        article.publishedAt || null,
        article.language || params.language || null,
        JSON.stringify(article.rawPayload || null),
        now, now
      ];

      // Upsert article — always conflict on normalized_url (global dedup key).
      // Also update external_id/provider so that info is not lost.
      await pool.query(`
        INSERT INTO news_articles (
          provider, external_id, title, source_name, author, description, content_snippet,
          url, normalized_url, publication_date, language, raw_payload, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (normalized_url)
        DO UPDATE SET
          provider=COALESCE(EXCLUDED.provider, news_articles.provider),
          external_id=COALESCE(EXCLUDED.external_id, news_articles.external_id),
          title=EXCLUDED.title, source_name=EXCLUDED.source_name, author=EXCLUDED.author,
          description=EXCLUDED.description, content_snippet=EXCLUDED.content_snippet,
          url=EXCLUDED.url, publication_date=EXCLUDED.publication_date,
          language=EXCLUDED.language, raw_payload=EXCLUDED.raw_payload, updated_at=EXCLUDED.updated_at
      `, articleRow);

      // Look up article id by normalized_url (the single dedup key)
      const lookupResult = await pool.query('SELECT id FROM news_articles WHERE normalized_url=$1', [normalized]);

      if (!lookupResult.rows[0]) continue;
      const articleId = lookupResult.rows[0].id;

      // Insert search result (ignore duplicate scan+article)
      await pool.query(`
        INSERT INTO news_search_results (
          scan_id, article_id, watchlist_entry_id, search_term, scan_timestamp,
          review_status, imported_signal_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8)
        ON CONFLICT (scan_id, article_id) DO NOTHING
      `, [
        scanId, articleId,
        params.watchlistEntryId || null,
        params.searchTerm, now,
        params.autoIngest ? 'imported' : 'new',
        now, now
      ]);

      const srResult = await pool.query(
        'SELECT id FROM news_search_results WHERE scan_id=$1 AND article_id=$2',
        [scanId, articleId]
      );
      if (srResult.rows[0]) {
        insertedResults.push({ searchResultId: srResult.rows[0].id, articleId });
      }
    }

    let importedCount = 0;
    if (params.autoIngest && insertedResults.length > 0) {
      for (const result of insertedResults) {
        const importResult = await importSearchResultToSignals(result.searchResultId, {
          importedBy: params.createdBy,
          status: params.importStatus || 'new'
        });
        if (importResult.imported) importedCount += 1;
      }
    }

    // Stamp last_searched_at on the watchlist entry
    if (params.watchlistEntryId) {
      await pool.query(
        'UPDATE watch_list_entries SET last_searched_at = NOW() WHERE id = $1',
        [params.watchlistEntryId]
      );
    }

    const reviewResult = await pool.query(`
      SELECT
        r.id, r.review_status, r.search_term, r.scan_timestamp, r.imported_signal_id,
        a.title, a.source_name, a.author, a.description, a.content_snippet, a.url, a.publication_date
      FROM news_search_results r
      JOIN news_articles a ON a.id = r.article_id
      WHERE r.scan_id = $1
      ORDER BY a.publication_date DESC
    `, [scanId]);

    return {
      scanId,
      provider: params.provider.providerName,
      searchTerm: params.searchTerm,
      resultCount: reviewResult.rows.length,
      importedCount,
      candidates: reviewResult.rows
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await pool.query(`
      INSERT INTO news_search_scans (
        provider, watchlist_entry_id, search_term, source_filter, language,
        sort_by, from_date, to_date, scan_timestamp, request_payload,
        response_payload, status, error_message, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'error',$12,$13)
    `, [
      params.provider.providerName,
      params.watchlistEntryId || null,
      params.searchTerm,
      params.sourceFilter || null,
      params.language || null,
      params.sortBy || null,
      params.fromDate || null,
      params.toDate || null,
      now,
      JSON.stringify(query),
      responsePayload ? JSON.stringify(responsePayload) : null,
      message,
      params.createdBy || null
    ]);

    throw error;
  }
}

export async function listReviewCandidates(filters: {
  reviewStatus?: string;
  watchlistEntryId?: number;
  limit?: number;
}) {
  const pool = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.reviewStatus) {
    conditions.push(`r.review_status = $${values.length + 1}`);
    values.push(filters.reviewStatus);
  }
  if (filters.watchlistEntryId) {
    conditions.push(`r.watchlist_entry_id = $${values.length + 1}`);
    values.push(filters.watchlistEntryId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = Math.min(200, Math.max(1, filters.limit || 100));
  values.push(limitNum);

  const { rows } = await pool.query(`
    SELECT
      r.id, r.review_status, r.search_term, r.scan_timestamp, r.imported_signal_id,
      r.watchlist_entry_id, wl.name AS watchlist_name,
      a.title, a.source_name, a.author, a.description, a.content_snippet, a.url, a.publication_date,
      s.id AS scan_id, s.provider, s.status AS scan_status, s.error_message
    FROM news_search_results r
    JOIN news_articles a ON a.id = r.article_id
    JOIN news_search_scans s ON s.id = r.scan_id
    LEFT JOIN watch_list_entries wl ON wl.id = r.watchlist_entry_id
    ${where}
    ORDER BY r.scan_timestamp DESC
    LIMIT $${values.length}
  `, values);

  return rows;
}

export async function importSearchResultToSignals(
  searchResultId: number,
  options?: { importedBy?: string; status?: string }
): Promise<{ imported: boolean; signalId?: number }> {
  const pool = getDb();

  const { rows: existingRows } = await pool.query(
    'SELECT imported_signal_id FROM news_search_results WHERE id = $1',
    [searchResultId]
  );

  if (!existingRows[0]) throw new Error('Search result not found');
  if (existingRows[0].imported_signal_id) {
    return { imported: false, signalId: existingRows[0].imported_signal_id };
  }

  const { rows: candidateRows } = await pool.query(`
    SELECT
      r.id, r.search_term, r.scan_timestamp, r.watchlist_entry_id,
      a.id AS article_id, a.provider, a.external_id,
      a.title, a.source_name, a.author, a.description, a.content_snippet,
      a.url, a.publication_date, a.raw_payload,
      wl.id AS wl_id, wl.name,
      wl.topic_area, wl.focus_area, wl.technology_area, wl.driver_trend,
      wl.geographic_relevance, wl.industry_relevance
    FROM news_search_results r
    JOIN news_articles a ON a.id = r.article_id
    LEFT JOIN watch_list_entries wl ON wl.id = r.watchlist_entry_id
    WHERE r.id = $1
  `, [searchResultId]);

  const candidate = candidateRows[0];
  if (!candidate) throw new Error('Search result not found');

  const { rows: dupRows } = await pool.query(
    'SELECT id FROM signals WHERE url = $1 OR (external_source = $2 AND external_id = $3) LIMIT 1',
    [candidate.url, candidate.provider, candidate.external_id]
  );

  if (dupRows[0]) {
    await pool.query(
      'UPDATE news_search_results SET review_status=$1, imported_signal_id=$2, updated_at=NOW() WHERE id=$3',
      ['imported', dupRows[0].id, searchResultId]
    );
    return { imported: false, signalId: dupRows[0].id };
  }

  const payload = buildSignalPayload(
    {
      title: candidate.title, description: candidate.description,
      source_name: candidate.source_name, url: candidate.url,
      publication_date: candidate.publication_date,
      external_source: candidate.provider, external_id: candidate.external_id,
      search_term: candidate.search_term, scan_timestamp: candidate.scan_timestamp,
      raw_payload: candidate.raw_payload
    },
    candidate.wl_id ? {
      id: candidate.wl_id, name: candidate.name,
      topic_area: candidate.topic_area, focus_area: candidate.focus_area,
      technology_area: candidate.technology_area, driver_trend: candidate.driver_trend,
      geographic_relevance: candidate.geographic_relevance, industry_relevance: candidate.industry_relevance
    } : undefined,
    options?.status || 'new'
  );

  const { rows: signalRows } = await pool.query(`
    INSERT INTO signals (
      title, summary, source_name, source_type, url, publication_date, scan_date,
      topic_area, focus_area, technology_area, driver_trend,
      geographic_relevance, industry_relevance, status, tags,
      analyst_notes, external_source, external_id, watchlist_entry_id,
      search_term_used, scan_timestamp, raw_payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    RETURNING id
  `, [
    payload.title, payload.summary, payload.source_name, payload.source_type,
    payload.url, payload.publication_date, payload.scan_date,
    payload.topic_area, payload.focus_area, payload.technology_area, payload.driver_trend,
    payload.geographic_relevance, payload.industry_relevance, payload.status, payload.tags,
    payload.analyst_notes, payload.external_source, payload.external_id,
    candidate.watchlist_entry_id || null,
    payload.search_term_used, payload.scan_timestamp, payload.raw_payload
  ]);

  const signalId = signalRows[0].id;

  // Auto-enrich with AI metadata; log but don't fail the import if AI is unavailable
  try {
    const { rows: freshSignal } = await pool.query('SELECT * FROM signals WHERE id = $1', [signalId]);
    if (freshSignal[0]) {
      const suggestion = await generateAiSignalMetadata(freshSignal[0] as Record<string, unknown>);
      await pool.query(`
        UPDATE signals SET
          summary=$1, topic_area=$2, focus_area=$3, technology_area=$4, driver_trend=$5,
          signal_type=$6, geographic_relevance=$7, industry_relevance=$8,
          confidence_level=$9, novelty=$10, potential_impact=$11, relevance_score=$12,
          relevance_narrative=$13, tags=$14, analyst_notes=$15, updated_at=NOW()
        WHERE id=$16
      `, [
        suggestion.summary || freshSignal[0].summary || null,
        suggestion.topic_area || freshSignal[0].topic_area || null,
        suggestion.focus_area || freshSignal[0].focus_area || null,
        suggestion.technology_area || freshSignal[0].technology_area || null,
        suggestion.driver_trend || freshSignal[0].driver_trend || null,
        suggestion.signal_type || freshSignal[0].signal_type || null,
        suggestion.geographic_relevance || freshSignal[0].geographic_relevance || null,
        suggestion.industry_relevance || freshSignal[0].industry_relevance || null,
        suggestion.confidence_level ?? freshSignal[0].confidence_level ?? null,
        suggestion.novelty ?? freshSignal[0].novelty ?? null,
        suggestion.potential_impact ?? freshSignal[0].potential_impact ?? null,
        suggestion.relevance_score ?? freshSignal[0].relevance_score ?? null,
        suggestion.relevance_narrative || freshSignal[0].relevance_narrative || null,
        suggestion.tags || freshSignal[0].tags || '[]',
        suggestion.analyst_notes || freshSignal[0].analyst_notes || null,
        signalId
      ]);
    }
  } catch (aiErr) {
    console.warn(`AI enrichment skipped for signal ${signalId}:`, aiErr instanceof Error ? aiErr.message : aiErr);
  }

  await pool.query(
    'UPDATE news_search_results SET review_status=$1, imported_signal_id=$2, updated_at=NOW() WHERE id=$3',
    ['imported', signalId, searchResultId]
  );

  return { imported: true, signalId };
}

export async function dismissSearchResult(searchResultId: number) {
  const pool = getDb();
  await pool.query(
    "UPDATE news_search_results SET review_status='dismissed', updated_at=NOW() WHERE id=$1",
    [searchResultId]
  );
}
