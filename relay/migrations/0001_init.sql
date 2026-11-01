-- outcome values: 'pr', 'issue', 'suppressed', 'already-known', 'skipped'
-- (NULL = never completed; a NULL outcome row is retried as new).
-- No client-address column anywhere (D-15).
CREATE TABLE reports (
  app_id TEXT NOT NULL,
  key TEXT NOT NULL,
  op TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_version TEXT,
  title TEXT,
  outcome TEXT,
  pr_number INTEGER,
  issue_number INTEGER,
  PRIMARY KEY (app_id, key, op)
);

CREATE TABLE buckets (
  bucket TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE INDEX buckets_expires ON buckets (expires);
