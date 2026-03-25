import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../signals.db');

let db: Database.Database;

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string): void {
  if (!hasColumn(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Backward-compatible columns for externally discovered signals.
  ensureColumn(database, 'signals', 'external_source', 'TEXT');
  ensureColumn(database, 'signals', 'external_id', 'TEXT');
  ensureColumn(database, 'signals', 'watchlist_entry_id', 'INTEGER');
  ensureColumn(database, 'signals', 'search_term_used', 'TEXT');
  ensureColumn(database, 'signals', 'scan_timestamp', 'TEXT');
  ensureColumn(database, 'signals', 'raw_payload', 'TEXT');

  database.exec(`
    CREATE TABLE IF NOT EXISTS watch_list_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS news_search_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      watchlist_entry_id INTEGER,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(watchlist_entry_id) REFERENCES watch_list_entries(id)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS news_search_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      article_id INTEGER NOT NULL,
      watchlist_entry_id INTEGER,
      search_term TEXT NOT NULL,
      scan_timestamp TEXT NOT NULL,
      review_status TEXT DEFAULT 'new' CHECK(review_status IN ('new','imported','dismissed')),
      imported_signal_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(scan_id) REFERENCES news_search_scans(id),
      FOREIGN KEY(article_id) REFERENCES news_articles(id),
      FOREIGN KEY(watchlist_entry_id) REFERENCES watch_list_entries(id),
      FOREIGN KEY(imported_signal_id) REFERENCES signals(id)
    )
  `);

  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_news_articles_provider_external_id ON news_articles(provider, external_id)');
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_news_articles_normalized_url ON news_articles(normalized_url)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_watch_list_entries_status ON watch_list_entries(status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_news_search_results_review_status ON news_search_results(review_status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_news_search_results_watchlist_entry_id ON news_search_results(watchlist_entry_id)');
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_news_search_results_scan_article ON news_search_results(scan_id, article_id)');

  console.log('Database initialized at', DB_PATH);
}
