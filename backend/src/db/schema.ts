import { Pool } from 'pg';

let pool: Pool;

export function getDb(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('sslmode=disable')
        ? { rejectUnauthorized: false }
        : false
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const db = getDb();

  await db.query(`
    CREATE TABLE IF NOT EXISTS signals (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      source_name TEXT,
      source_type TEXT CHECK(source_type IN ('article','paper','announcement','regulatory','patent','event','other')),
      url TEXT,
      publication_date TEXT,
      scan_date TEXT,
      topic_area TEXT,
      focus_area TEXT,
      technology_area TEXT,
      driver_trend TEXT,
      signal_type TEXT CHECK(signal_type IN ('weak','strong','emerging','established')),
      geographic_relevance TEXT,
      industry_relevance TEXT,
      confidence_level INTEGER CHECK(confidence_level BETWEEN 1 AND 5),
      novelty INTEGER CHECK(novelty BETWEEN 1 AND 5),
      potential_impact INTEGER CHECK(potential_impact BETWEEN 1 AND 5),
      time_horizon TEXT CHECK(time_horizon IN ('now','1-2yr','3-5yr','5+yr')),
      status TEXT DEFAULT 'new' CHECK(status IN ('new','triaged','under_review','published','archived','rejected')),
      tags TEXT DEFAULT '[]',
      analyst_notes TEXT,
      external_source TEXT,
      external_id TEXT,
      watchlist_entry_id INTEGER,
      search_term_used TEXT,
      scan_timestamp TEXT,
      raw_payload TEXT,
      relevance_score INTEGER CHECK(relevance_score BETWEEN 1 AND 5),
      relevance_narrative TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS watch_list_entries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      search_query TEXT NOT NULL,
      description TEXT,
      topic_area TEXT,
      focus_area TEXT,
      technology_area TEXT,
      driver_trend TEXT,
      geographic_relevance TEXT,
      industry_relevance TEXT,
      language TEXT,
      source_filter TEXT,
      from_date TEXT,
      to_date TEXT,
      sort_by TEXT,
      priority INTEGER DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
      tags TEXT DEFAULT '[]',
      notes TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_searched_at TIMESTAMPTZ
    )
  `);

  // Migration: add last_searched_at to existing tables
  await db.query(`
    ALTER TABLE watch_list_entries
    ADD COLUMN IF NOT EXISTS last_searched_at TIMESTAMPTZ
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      external_id TEXT,
      title TEXT NOT NULL,
      source_name TEXT,
      author TEXT,
      description TEXT,
      content_snippet TEXT,
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      publication_date TEXT,
      language TEXT,
      raw_payload TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS news_search_scans (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      watchlist_entry_id INTEGER REFERENCES watch_list_entries(id),
      search_term TEXT NOT NULL,
      source_filter TEXT,
      language TEXT,
      sort_by TEXT,
      from_date TEXT,
      to_date TEXT,
      scan_timestamp TEXT NOT NULL,
      request_payload TEXT,
      response_payload TEXT,
      status TEXT DEFAULT 'success' CHECK(status IN ('success','error')),
      error_message TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS news_search_results (
      id SERIAL PRIMARY KEY,
      scan_id INTEGER NOT NULL REFERENCES news_search_scans(id),
      article_id INTEGER NOT NULL REFERENCES news_articles(id),
      watchlist_entry_id INTEGER REFERENCES watch_list_entries(id),
      search_term TEXT NOT NULL,
      scan_timestamp TEXT NOT NULL,
      review_status TEXT DEFAULT 'new' CHECK(review_status IN ('new','imported','dismissed')),
      imported_signal_id INTEGER REFERENCES signals(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_news_articles_provider_external_id
    ON news_articles(provider, external_id)
    WHERE external_id IS NOT NULL
  `);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_news_articles_normalized_url ON news_articles(normalized_url)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_watch_list_entries_status ON watch_list_entries(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_news_search_results_review_status ON news_search_results(review_status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_news_search_results_watchlist_entry_id ON news_search_results(watchlist_entry_id)`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_news_search_results_scan_article ON news_search_results(scan_id, article_id)`);

  console.log('PostgreSQL database initialized');
}

