CREATE TABLE IF NOT EXISTS line_queued_stickers (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sticker_package_id TEXT NOT NULL,
  sticker_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_queued_stickers_group_status ON line_queued_stickers(group_id, status);
