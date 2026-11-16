CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    output_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_source ON downloads(source_url, output_key);
CREATE INDEX IF NOT EXISTS downloads_date ON downloads(created_at DESC);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
