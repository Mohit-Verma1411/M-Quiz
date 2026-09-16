// ============================================================
// config/database.js
// SQLite database setup using better-sqlite3.
// Creates the `quiz.db` file and all required tables.
// Run directly with `node config/database.js` to (re)create.
// ============================================================
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'quiz.db');
const db = new Database(DB_PATH);

// Enable foreign keys and WAL for better concurrency during live quizzes.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'participant',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  quiz_code TEXT UNIQUE NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_marks INTEGER DEFAULT 0,
  negative_marking INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  start_time DATETIME,
  end_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  marks INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  quiz_id INTEGER NOT NULL,
  score INTEGER DEFAULT 0,
  time_taken_seconds INTEGER DEFAULT 0,
  disqualified INTEGER NOT NULL DEFAULT 0,
  disqualified_at DATETIME,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, quiz_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  selected_option TEXT,
  is_correct INTEGER DEFAULT 0,
  marks_obtained INTEGER DEFAULT 0,
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  time_taken_seconds INTEGER NOT NULL,
  rank INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(quiz_id, user_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

db.exec(SCHEMA);

// ---------- Lightweight migrations for existing DB files ----------
(function migrate() {
  const attemptsCols = db.prepare('PRAGMA table_info(attempts)').all().map((c) => c.name);
  if (!attemptsCols.includes('disqualified')) {
    db.exec('ALTER TABLE attempts ADD COLUMN disqualified INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE attempts ADD COLUMN disqualified_at DATETIME');
    console.log('[migrate] added attempts.disqualified');
  }

  // Two-tier admin model: existing 'admin' accounts become 'organizer'
  // (Admin Organizer) so they keep their full powers (user management,
  // control of every quiz). New 'admin' accounts are regular admins who
  // can only manage their own quizzes.
  const promoted = db
    .prepare("UPDATE users SET role = 'organizer' WHERE role = 'admin'")
    .run();
  if (promoted.changes > 0) {
    console.log(`[migrate] promoted ${promoted.changes} existing admin(s) → organizer`);
  }
})();

function initDatabase() {
  // Recompute total_marks for every quiz from its questions
  // (used after seeding or question edits).
  const quizzes = db.prepare('SELECT id FROM quizzes').all();
  const sumMarks = db.prepare(
    'SELECT COALESCE(SUM(marks), 0) AS total FROM questions WHERE quiz_id = ?'
  );
  const updateQuiz = db.prepare(
    'UPDATE quizzes SET total_marks = ? WHERE id = ?'
  );
  const tx = db.transaction(() => {
    for (const q of quizzes) {
      const { total } = sumMarks.get(q.id);
      updateQuiz.run(total, q.id);
    }
  });
  tx();
}

module.exports = { db, initDatabase, DB_PATH };

// Allow running as a standalone script: `node config/database.js`
if (require.main === module) {
  initDatabase();
  console.log('SQLite database initialized at', DB_PATH);
}