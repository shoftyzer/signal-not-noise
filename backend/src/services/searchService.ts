import { getDb } from '../db/schema';
import { ExternalSearchProvider, ExternalSearchQuery } from './searchProviders/types';

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
}

interface WatchListEntrySummary {
  id: number;
  name: string;
  topic_area?: string;
  focus_area?: string;
  technology_area?: string;
  driver_trend?: string;
  geographic_relevance?: string;
  industry_relevance?: string;
}

function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    for (const trackingParam of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      parsed.searchParams.delete(trackingParam);
    }
    return parsed.toString();
  } catch {
    return raw.trim();
  }
}

function buildSignalPayload(article: any, watchlist?: WatchListEntrySummary, status = 'new') {
  const now = new Date().toISOString();
  const sourceProvider = article.external_source || 'external';
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
  const db = getDb();
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

    const scanInsert = db.prepare(`
      INSERT INTO news_search_scans (
        provider, watchlist_entry_id, search_term, source_filter, language,
        sort_by, from_date, to_date, scan_timestamp, request_payload,
        response_payload, status, created_by
      ) VALUES (
        @provider, @watchlist_entry_id, @search_term, @source_filter, @language,
        @sort_by, @from_date, @to_date, @scan_timestamp, @request_payload,
        @response_payload, @status, @created_by
      )
    `).run({
      provider: params.provider.providerName,
      watchlist_entry_id: params.watchlistEntryId || null,
      search_term: params.searchTerm,
      source_filter: params.sourceFilter || null,
      language: params.language || null,
      sort_by: params.sortBy || null,
      from_date: params.fromDate || null,
      to_date: params.toDate || null,
      scan_timestamp: now,
      request_payload: JSON.stringify(query),
      response_payload: JSON.stringify(responsePayload),
      status: 'success',
      created_by: params.createdBy || null
    });

    scanId = Number(scanInsert.lastInsertRowid);

    const upsertArticleByExternalId = db.prepare(`
      INSERT INTO news_articles (
        provider, external_id, title, source_name, author, description, content_snippet,
        url, normalized_url, publication_date, language, raw_payload, created_at, updated_at
      ) VALUES (
        @provider, @external_id, @title, @source_name, @author, @description, @content_snippet,
        @url, @normalized_url, @publication_date, @language, @raw_payload, @created_at, @updated_at
      )
      ON CONFLICT(provider, external_id)
      DO UPDATE SET
        title = excluded.title,
        source_name = excluded.source_name,
        author = excluded.author,
        description = excluded.description,
        content_snippet = excluded.content_snippet,
        url = excluded.url,
        publication_date = excluded.publication_date,
        language = excluded.language,
        raw_payload = excluded.raw_payload,
        updated_at = excluded.updated_at
    `);

    const upsertArticleByUrl = db.prepare(`
      INSERT INTO news_articles (
        provider, external_id, title, source_name, author, description, content_snippet,
        url, normalized_url, publication_date, language, raw_payload, created_at, updated_at
      ) VALUES (
        @provider, @external_id, @title, @source_name, @author, @description, @content_snippet,
        @url, @normalized_url, @publication_date, @language, @raw_payload, @created_at, @updated_at
      )
      ON CONFLICT(normalized_url)
      DO UPDATE SET
        title = excluded.title,
        source_name = excluded.source_name,
        author = excluded.author,
        description = excluded.description,
        content_snippet = excluded.content_snippet,
        url = excluded.url,
        publication_date = excluded.publication_date,
        language = excluded.language,
        raw_payload = excluded.raw_payload,
        updated_at = excluded.updated_at
    `);

    const getArticleIdByExternal = db.prepare(
      'SELECT id FROM news_articles WHERE provider = ? AND external_id = ?'
    );
    const getArticleIdByUrl = db.prepare(
      'SELECT id FROM news_articles WHERE normalized_url = ?'
    );
    const insertSearchResult = db.prepare(`
      INSERT OR IGNORE INTO news_search_results (
        scan_id, article_id, watchlist_entry_id, search_term, scan_timestamp,
        review_status, imported_signal_id, created_at, updated_at
      ) VALUES (
        @scan_id, @article_id, @watchlist_entry_id, @search_term, @scan_timestamp,
        @review_status, NULL, @created_at, @updated_at
      )
    `);

    const insertedResults: Array<{ searchResultId: number; articleId: number }> = [];

    for (const article of response.articles) {
      const externalId = article.externalId || null;
      const normalized = normalizeUrl(article.url);
      const row = {
        provider: params.provider.providerName,
        external_id: externalId,
        title: article.title,
        source_name: article.sourceName || null,
        author: article.author || null,
        description: article.description || null,
        content_snippet: article.contentSnippet || null,
        url: article.url,
        normalized_url: normalized,
        publication_date: article.publishedAt || null,
        language: article.language || params.language || null,
        raw_payload: JSON.stringify(article.rawPayload || null),
        created_at: now,
        updated_at: now
      };

      const urlAlreadyExists = Boolean(getArticleIdByUrl.get(normalized));

      if (externalId && !urlAlreadyExists) {
        upsertArticleByExternalId.run(row);
      } else {
        upsertArticleByUrl.run(row);
      }

      const articleLookup = externalId
        ? (getArticleIdByExternal.get(params.provider.providerName, externalId) as { id: number } | undefined)
        : (getArticleIdByUrl.get(normalized) as { id: number } | undefined);

      if (!articleLookup) continue;

      insertSearchResult.run({
        scan_id: scanId,
        article_id: articleLookup.id,
        watchlist_entry_id: params.watchlistEntryId || null,
        search_term: params.searchTerm,
        scan_timestamp: now,
        review_status: params.autoIngest ? 'imported' : 'new',
        created_at: now,
        updated_at: now
      });

      const searchResult = db.prepare(
        'SELECT id FROM news_search_results WHERE scan_id = ? AND article_id = ?'
      ).get(scanId, articleLookup.id) as { id: number } | undefined;

      if (searchResult) {
        insertedResults.push({ searchResultId: searchResult.id, articleId: articleLookup.id });
      }
    }

    let importedCount = 0;

    if (params.autoIngest && insertedResults.length > 0) {
      for (const result of insertedResults) {
        const importResult = importSearchResultToSignals(result.searchResultId, {
          importedBy: params.createdBy,
          status: params.importStatus || 'new'
        });
        if (importResult.imported) importedCount += 1;
      }
    }

    const reviewCandidates = db.prepare(`
      SELECT
        r.id,
        r.review_status,
        r.search_term,
        r.scan_timestamp,
        r.imported_signal_id,
        a.title,
        a.source_name,
        a.author,
        a.description,
        a.content_snippet,
        a.url,
        a.publication_date
      FROM news_search_results r
      JOIN news_articles a ON a.id = r.article_id
      WHERE r.scan_id = ?
      ORDER BY a.publication_date DESC
    `).all(scanId);

    return {
      scanId,
      provider: params.provider.providerName,
      searchTerm: params.searchTerm,
      resultCount: reviewCandidates.length,
      importedCount,
      candidates: reviewCandidates
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    db.prepare(`
      INSERT INTO news_search_scans (
        provider, watchlist_entry_id, search_term, source_filter, language,
        sort_by, from_date, to_date, scan_timestamp, request_payload,
        response_payload, status, error_message, created_by
      ) VALUES (
        @provider, @watchlist_entry_id, @search_term, @source_filter, @language,
        @sort_by, @from_date, @to_date, @scan_timestamp, @request_payload,
        @response_payload, @status, @error_message, @created_by
      )
    `).run({
      provider: params.provider.providerName,
      watchlist_entry_id: params.watchlistEntryId || null,
      search_term: params.searchTerm,
      source_filter: params.sourceFilter || null,
      language: params.language || null,
      sort_by: params.sortBy || null,
      from_date: params.fromDate || null,
      to_date: params.toDate || null,
      scan_timestamp: now,
      request_payload: JSON.stringify(query),
      response_payload: responsePayload ? JSON.stringify(responsePayload) : null,
      status: 'error',
      error_message: message,
      created_by: params.createdBy || null
    });

    throw error;
  }
}

export function listReviewCandidates(filters: {
  reviewStatus?: string;
  watchlistEntryId?: number;
  limit?: number;
}) {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {
    limit: Math.min(200, Math.max(1, filters.limit || 100))
  };

  if (filters.reviewStatus) {
    conditions.push('r.review_status = @review_status');
    params.review_status = filters.reviewStatus;
  }

  if (filters.watchlistEntryId) {
    conditions.push('r.watchlist_entry_id = @watchlist_entry_id');
    params.watchlist_entry_id = filters.watchlistEntryId;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      r.id,
      r.review_status,
      r.search_term,
      r.scan_timestamp,
      r.imported_signal_id,
      r.watchlist_entry_id,
      wl.name AS watchlist_name,
      a.title,
      a.source_name,
      a.author,
      a.description,
      a.content_snippet,
      a.url,
      a.publication_date,
      s.id AS scan_id,
      s.provider,
      s.status AS scan_status,
      s.error_message
    FROM news_search_results r
    JOIN news_articles a ON a.id = r.article_id
    JOIN news_search_scans s ON s.id = r.scan_id
    LEFT JOIN watch_list_entries wl ON wl.id = r.watchlist_entry_id
    ${where}
    ORDER BY r.scan_timestamp DESC
    LIMIT @limit
  `).all(params);
}

export function importSearchResultToSignals(
  searchResultId: number,
  options?: { importedBy?: string; status?: string }
): { imported: boolean; signalId?: number } {
  const db = getDb();

  const existing = db.prepare(`
    SELECT imported_signal_id
    FROM news_search_results
    WHERE id = ?
  `).get(searchResultId) as { imported_signal_id?: number | null } | undefined;

  if (!existing) {
    throw new Error('Search result not found');
  }

  if (existing.imported_signal_id) {
    return { imported: false, signalId: existing.imported_signal_id };
  }

  const candidate = db.prepare(`
    SELECT
      r.id,
      r.search_term,
      r.scan_timestamp,
      r.watchlist_entry_id,
      a.id AS article_id,
      a.provider,
      a.external_id,
      a.title,
      a.source_name,
      a.author,
      a.description,
      a.content_snippet,
      a.url,
      a.publication_date,
      a.raw_payload,
      wl.id AS wl_id,
      wl.name,
      wl.topic_area,
      wl.focus_area,
      wl.technology_area,
      wl.driver_trend,
      wl.geographic_relevance,
      wl.industry_relevance
    FROM news_search_results r
    JOIN news_articles a ON a.id = r.article_id
    LEFT JOIN watch_list_entries wl ON wl.id = r.watchlist_entry_id
    WHERE r.id = ?
  `).get(searchResultId) as any;

  if (!candidate) {
    throw new Error('Search result not found');
  }

  const duplicate = db.prepare(
    'SELECT id FROM signals WHERE url = ? OR (external_source = ? AND external_id = ?) LIMIT 1'
  ).get(candidate.url, candidate.provider, candidate.external_id) as { id: number } | undefined;

  if (duplicate) {
    db.prepare(`
      UPDATE news_search_results
      SET review_status = 'imported', imported_signal_id = ?, updated_at = ?
      WHERE id = ?
    `).run(duplicate.id, new Date().toISOString(), searchResultId);

    return { imported: false, signalId: duplicate.id };
  }

  const signalPayload = buildSignalPayload(
    {
      title: candidate.title,
      description: candidate.description,
      source_name: candidate.source_name,
      url: candidate.url,
      publication_date: candidate.publication_date,
      external_source: candidate.provider,
      external_id: candidate.external_id,
      search_term: candidate.search_term,
      scan_timestamp: candidate.scan_timestamp,
      raw_payload: candidate.raw_payload
    },
    candidate.wl_id ? {
      id: candidate.wl_id,
      name: candidate.name,
      topic_area: candidate.topic_area,
      focus_area: candidate.focus_area,
      technology_area: candidate.technology_area,
      driver_trend: candidate.driver_trend,
      geographic_relevance: candidate.geographic_relevance,
      industry_relevance: candidate.industry_relevance
    } : undefined,
    options?.status || 'new'
  );

  const insertResult = db.prepare(`
    INSERT INTO signals (
      title, summary, source_name, source_type, url, publication_date, scan_date,
      topic_area, focus_area, technology_area, driver_trend,
      geographic_relevance, industry_relevance, status, tags,
      analyst_notes, external_source, external_id, watchlist_entry_id,
      search_term_used, scan_timestamp, raw_payload, created_at, updated_at
    ) VALUES (
      @title, @summary, @source_name, @source_type, @url, @publication_date, @scan_date,
      @topic_area, @focus_area, @technology_area, @driver_trend,
      @geographic_relevance, @industry_relevance, @status, @tags,
      @analyst_notes, @external_source, @external_id, @watchlist_entry_id,
      @search_term_used, @scan_timestamp, @raw_payload, @created_at, @updated_at
    )
  `).run({
    ...signalPayload,
    watchlist_entry_id: candidate.watchlist_entry_id || null
  });

  const signalId = Number(insertResult.lastInsertRowid);

  db.prepare(`
    UPDATE news_search_results
    SET review_status = 'imported', imported_signal_id = ?, updated_at = ?
    WHERE id = ?
  `).run(signalId, new Date().toISOString(), searchResultId);

  return { imported: true, signalId };
}

export function dismissSearchResult(searchResultId: number) {
  const db = getDb();
  db.prepare(`
    UPDATE news_search_results
    SET review_status = 'dismissed', updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), searchResultId);
}
