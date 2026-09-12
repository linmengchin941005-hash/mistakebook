CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_key TEXT NOT NULL,
  image_type TEXT NOT NULL DEFAULT 'image/jpeg',

  subject TEXT NOT NULL DEFAULT '數A',
  semester TEXT NOT NULL DEFAULT '高二上',

  unit TEXT NOT NULL DEFAULT '其他',
  subunit TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  ai_note TEXT NOT NULL DEFAULT '',

  student_note TEXT NOT NULL DEFAULT '',
  error_type TEXT NOT NULL DEFAULT '',
  mastery INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mistakes_unit ON mistakes(unit);
CREATE INDEX IF NOT EXISTS idx_mistakes_mastery ON mistakes(mastery);
CREATE INDEX IF NOT EXISTS idx_mistakes_created_at ON mistakes(created_at);
