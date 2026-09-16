// ============================================================
// seed.js — sample data for M-Quiz.
// Creates the admin + participant accounts, 3 demo quizzes with
// questions, and a few sample attempts so the leaderboards have
// immediate life. Run: npm run seed
// ============================================================
const bcrypt = require('bcryptjs');
const { db, initDatabase } = require('./config/database');

initDatabase();

// ---------- Clean demo tables so re-seeding is idempotent ----------
function resetDemo() {
  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM answers;
      DELETE FROM attempts;
      DELETE FROM leaderboard;
      DELETE FROM questions;
      DELETE FROM quizzes;
      DELETE FROM users;
    `);
  });
  tx();
}

const adminPass = bcrypt.hashSync('admin123', 10);
const participantPass = bcrypt.hashSync('player123', 10);

function insertUser(name, email, role, password) {
  return Number(db
    .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name, email, password, role).lastInsertRowid);
}

function insertQuiz({ title, description, subject, code, duration, negative = 0, active = 1 }) {
  return Number(db
    .prepare(`INSERT INTO quizzes
      (title, description, subject, quiz_code, duration_minutes, negative_marking, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(title, description, subject, code, duration, negative, active, adminId).lastInsertRowid);
}

function insertQuestion(quizId, text, opts, correct, marks = 1) {
  const ins = db.prepare(`
    INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run(quizId, text, opts.A, opts.B, opts.C, opts.D, correct, marks);
}

// ---------- Run seed ----------
resetDemo();

const adminId = insertUser('Admin Organizer', 'admin@quiz.com', 'organizer', adminPass);
const playerId = insertUser('Zara Khan', 'zara@example.com', 'participant', participantPass);
const player2Id = insertUser('Ravi Singh', 'ravi@example.com', 'participant', participantPass);
const player3Id = insertUser('Maya Patel', 'maya@example.com', 'participant', participantPass);

// --- Quiz 1: Tech Fest GK ---
const q1 = insertQuiz({
  title: 'Tech Fest 2026 — Mega GK Quiz',
  description: 'The ultimate general knowledge battle of the tech fest. 3 rounds, all in one!',
  subject: 'General Knowledge',
  code: 'TECH26',
  duration: 8,
  negative: 0,
});
const q1qs = [
  { text: 'What does "HTTP" stand for?', opts: { A: 'HyperText Transfer Protocol', B: 'HighTech Transfer Protocol', C: 'Hyper Transfer Text Protocol', D: 'HyperText Traffic Protocol' }, correct: 'A', marks: 1 },
  { text: 'Which company developed the Python programming language?', opts: { A: 'Google', B: 'Microsoft', C: 'Guido van Rossum (Python Software Foundation)', D: 'IBM' }, correct: 'C', marks: 1 },
  { text: 'What is the smallest unit of data in a computer?', opts: { A: 'Byte', B: 'Bit', C: 'Nibble', D: 'Word' }, correct: 'B', marks: 2 },
  { text: 'Which of these is a version control system?', opts: { A: 'Git', B: 'Slack', C: 'Docker Compose (only)', D: 'Nginx' }, correct: 'A', marks: 2 },
  { text: '"AI" commonly stands for what?', opts: { A: 'Automated Interface', B: 'Artificial Intelligence', C: 'Applied Information', D: 'Analog Input' }, correct: 'B', marks: 1 },
  { text: 'Which language is primarily used for styling web pages?', opts: { A: 'Python', B: 'Java', C: 'CSS', D: 'SQL' }, correct: 'C', marks: 1 },
];
q1qs.forEach((q) => insertQuestion(q1, q.text, q.opts, q.correct, q.marks));

// --- Quiz 2: Code Battle ---
const q2 = insertQuiz({
  title: 'Code Battle — DSA Sprint',
  description: 'Fast-paced data structures & algorithms challenge for coding ninjas.',
  subject: 'Coding',
  code: 'CODE7',
  duration: 6,
  negative: 1,
});
const q2qs = [
  { text: 'What is the time complexity of binary search?', opts: { A: 'O(n)', B: 'O(log n)', C: 'O(n log n)', D: 'O(1)' }, correct: 'B', marks: 2 },
  { text: 'Which data structure uses FIFO order?', opts: { A: 'Stack', B: 'Queue', C: 'Tree', D: 'Graph' }, correct: 'B', marks: 2 },
  { text: 'What is the output of `typeof null` in JavaScript?', opts: { A: '"null"', B: '"undefined"', C: '"object"', D: '"number"' }, correct: 'C', marks: 2 },
  { text: 'Which of these is NOT an OOP pillar?', opts: { A: 'Encapsulation', B: 'Inheritance', C: 'Polymorphism', D: 'Compilation' }, correct: 'D', marks: 1 },
];
q2qs.forEach((q) => insertQuestion(q2, q.text, q.opts, q.correct, q.marks));

// --- Quiz 3: Science Sprint ---
const q3 = insertQuiz({
  title: 'Science Sprint',
  description: 'Quick-fire science trivia — biology, physics and chemistry.',
  subject: 'Science',
  code: 'SCI7X',
  duration: 5,
  negative: 1,
});
const q3qs = [
  { text: 'What planet is known as the Red Planet?', opts: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' }, correct: 'B', marks: 1 },
  { text: 'What is the chemical symbol for gold?', opts: { A: 'Gd', B: 'Au', C: 'Go', D: 'Ag' }, correct: 'B', marks: 1 },
  { text: 'H2O is the chemical formula for what?', opts: { A: 'Hydrogen peroxide', B: 'Carbon dioxide', C: 'Water', D: 'Salt' }, correct: 'C', marks: 1 },
  { text: 'Which force keeps planets in orbit around the Sun?', opts: { A: 'Friction', B: 'Gravity', C: 'Magnetism', D: 'Electromagnetism' }, correct: 'B', marks: 1 },
];
q3qs.forEach((q) => insertQuestion(q3, q.text, q.opts, q.correct, q.marks));

// Recompute total_marks for all quizzes.
initDatabase();

// --- Sample attempts (so leaderboards look alive) ---
function correctPicks(quizId) {
  return db.prepare('SELECT correct_option FROM questions WHERE quiz_id = ? ORDER BY id').all(quizId)
    .map((q) => q.correct_option);
}

function makeAttempt(userId, quizId, picks, timeTaken) {
  const questions = db.prepare('SELECT id, correct_option, marks FROM questions WHERE quiz_id = ? ORDER BY id').all(quizId);
  const neg = db.prepare('SELECT negative_marking FROM quizzes WHERE id = ?').get(quizId).negative_marking;
  const insertAttempt = db.prepare('INSERT INTO attempts (user_id, quiz_id, score, time_taken_seconds) VALUES (?, ?, ?, ?)');
  const insertAnswer = db.prepare('INSERT INTO answers (attempt_id, question_id, selected_option, is_correct, marks_obtained) VALUES (?, ?, ?, ?, ?)');

  const tx = db.transaction(() => {
    let score = 0;
    const attemptId = insertAttempt.run(userId, quizId, 0, timeTaken).lastInsertRowid;
    questions.forEach((q, i) => {
      const picked = picks[i];
      const ok = picked === q.correct_option;
      const gained = ok ? q.marks : -neg;
      score += gained;
      insertAnswer.run(attemptId, q.id, picked, ok ? 1 : 0, gained);
    });
    db.prepare('UPDATE attempts SET score = ? WHERE id = ?').run(score, attemptId);
  });
  tx();
}

const { refreshLeaderboard } = require('./services/leaderboard');

// Zara — great run on Tech Fest (all correct, fast)
makeAttempt(playerId, q1, correctPicks(q1), 240);
// Ravi — slightly slower
makeAttempt(player2Id, q1, correctPicks(q1), 300);
// Maya — a couple wrong
makeAttempt(player3Id, q1, correctPicks(q1).map((p, i) => (i === 1 || i === 4 ? 'D' : p)), 280);

// Code battle: everyone fast-ish, some wrong
makeAttempt(playerId, q2, correctPicks(q2).map((p, i) => (i === 0 ? 'C' : p)), 210);
makeAttempt(player2Id, q2, correctPicks(q2), 180);
makeAttempt(player3Id, q2, correctPicks(q2).map((p, i) => (i === 3 ? 'A' : p)), 260);

// Science: simple
makeAttempt(playerId, q3, correctPicks(q3), 90);
makeAttempt(player2Id, q3, correctPicks(q3), 140);
makeAttempt(player3Id, q3, correctPicks(q3).map((p, i) => (i === 2 ? 'A' : p)), 120);

// Recompute leaderboard for each quiz.
for (const quizId of [q1, q2, q3]) refreshLeaderboard(quizId);

// Close cleanly BEFORE the process exits — avoids a better-sqlite3/Node 24
// teardown assertion that fires when statements are finalized during exit.
db.close();

console.log(`
  ✅ M-Quiz seeded successfully!

  👤 Admin   → admin@quiz.com   / admin123
  👤 Player  → zara@example.com / player123

  3 demo quizzes created:
    • Tech Fest 2026 — Mega GK Quiz     code: TECH26  (8 min)
    • Code Battle — DSA Sprint         code: CODE7   (6 min)
    • Science Sprint                   code: SCI7X   (5 min)
`);