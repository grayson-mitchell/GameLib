-- CR-02: one in-flight GitHub publish per appId. The branch is per appId
-- (report/steam-<appId>), so two reports for one app must never run the
-- create-branch / fold flow at the same time. A row is a lease: it is deleted
-- when the publish ends and a stale one (expires <= now) can be taken over.
-- No client-address column (D-15).
CREATE TABLE publish_locks (
  app_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL
);
