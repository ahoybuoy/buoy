-- Project Baselines table for auto-baseline system
CREATE TABLE IF NOT EXISTS project_baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  baseline_sha TEXT NOT NULL,
  drift_signatures TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_baselines_project_repo_idx
ON project_baselines(project_id, repo_full_name);

-- Scan Claims table for queue idempotency
CREATE TABLE IF NOT EXISTS scan_claims (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT DEFAULT 'processing',
  comment_id INTEGER,
  claimed_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS scan_claims_unique_idx
ON scan_claims(repo_full_name, pr_number, commit_sha);

CREATE INDEX IF NOT EXISTS scan_claims_pr_idx
ON scan_claims(repo_full_name, pr_number);
