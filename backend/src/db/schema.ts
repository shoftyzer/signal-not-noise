import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../signals.db');

let db: Database.Database;

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

  console.log('Database initialized at', DB_PATH);
}
