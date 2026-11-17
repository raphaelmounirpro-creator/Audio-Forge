CREATE TABLE IF NOT EXISTS profiles (name TEXT PRIMARY KEY, payload TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);
