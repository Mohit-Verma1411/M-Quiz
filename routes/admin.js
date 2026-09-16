// ============================================================
// routes/admin.js
// Admin dashboard, results, CSV export.
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { requireAuth, requireAdmin, requireOrganizer, isStaff, canManageQuiz } = require('../middleware/auth');
const { refreshLeaderboard } = require('../services/leaderboard');
const { broadcastLeaderboard, broadcastQuizStopped } = require('../services/realtime');

const router = express.Router();
router.use(requireAuth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function csvEscape(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Quiz must exist + be manageable by this admin (organizers manage all).
function loadQuiz(req, res) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.quizId || req.params.id);
  if (!quiz) { res.status(404).json({ error: 'Quiz not found.' }); return null; }
  if (!canManageQuiz(req.user, quiz.created_by)) {
    res.status(403).json({ error: 'Admins can only manage quizzes they created.' });
    return null;
  }
  return quiz;
}

// GET /api/admin/dashboard
router.get('/dashboard', requireAdmin, (req, res) => {
  const isOrg = req.user.role === 'organizer';
  const uid = req.user.id;

  // Organizers see global numbers; admins see numbers for their own quizzes.
  let totalQuizzes, activeQuizzes, inactiveQuizzes, totalAttempts, recentQuizzes, topAttempts;

  if (isOrg) {
    const s = db.prepare(`
      SELECT COUNT(*) AS total, COALESCE(SUM(is_active), 0) AS active,
             COALESCE(SUM(1 - is_active), 0) AS inactive
      FROM quizzes
    `).get();
    totalQuizzes = s.total; activeQuizzes = s.active; inactiveQuizzes = s.inactive;
    totalAttempts = db.prepare('SELECT COUNT(*) AS c FROM attempts').get().c;
    recentQuizzes = db.prepare(`
      SELECT q.id, q.title, q.quiz_code, q.is_active, q.created_at,
             COUNT(DISTINCT a.user_id) AS participants,
             (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS questions
      FROM quizzes q LEFT JOIN attempts a ON a.quiz_id = q.id
      GROUP BY q.id ORDER BY q.created_at DESC LIMIT 6
    `).all();
    topAttempts = db.prepare(`
      SELECT a.score, a.time_taken_seconds, u.name AS participant, q.title AS quiz_title
      FROM attempts a JOIN users u ON u.id = a.user_id JOIN quizzes q ON q.id = a.quiz_id
      ORDER BY a.score DESC LIMIT 5
    `).all();
  } else {
    const s = db.prepare(`
      SELECT COUNT(*) AS total, COALESCE(SUM(is_active), 0) AS active,
             COALESCE(SUM(1 - is_active), 0) AS inactive
      FROM quizzes WHERE created_by = ?
    `).get(uid);
    totalQuizzes = s.total; activeQuizzes = s.active; inactiveQuizzes = s.inactive;
    totalAttempts = db.prepare(`
      SELECT COUNT(*) AS c FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
      WHERE q.created_by = ?
    `).get(uid).c;
    recentQuizzes = db.prepare(`
      SELECT q.id, q.title, q.quiz_code, q.is_active, q.created_at,
             COUNT(DISTINCT a.user_id) AS participants,
             (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS questions
      FROM quizzes q LEFT JOIN attempts a ON a.quiz_id = q.id
      WHERE q.created_by = ?
      GROUP BY q.id ORDER BY q.created_at DESC LIMIT 6
    `).all(uid);
    topAttempts = db.prepare(`
      SELECT a.score, a.time_taken_seconds, u.name AS participant, q.title AS quiz_title
      FROM attempts a JOIN users u ON u.id = a.user_id JOIN quizzes q ON q.id = a.quiz_id
      WHERE q.created_by = ?
      ORDER BY a.score DESC LIMIT 5
    `).all(uid);
  }

  const totalUsers = isOrg ? db.prepare('SELECT COUNT(*) AS c FROM users').get().c : null;

  return res.json({
    stats: { totalQuizzes, totalUsers, activeQuizzes, inactiveQuizzes, totalAttempts },
    recentQuizzes,
    topAttempts,
  });
});

// GET /api/admin/quizzes — organizers see all, admins only their own.
router.get('/quizzes', requireAdmin, (req, res) => {
  const base = `
    SELECT q.*, COUNT(DISTINCT a.user_id) AS participants,
           (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS questions
    FROM quizzes q LEFT JOIN attempts a ON a.quiz_id = q.id
  `;
  const quizzes = req.user.role === 'organizer'
    ? db.prepare(base + 'GROUP BY q.id ORDER BY q.created_at DESC').all()
    : db.prepare(base + 'WHERE q.created_by = ? GROUP BY q.id ORDER BY q.created_at DESC').all(req.user.id);
  return res.json({ quizzes });
});

// GET /api/admin/results/:quizId — full leaderboard with answer stats
router.get('/results/:quizId', requireAdmin, (req, res) => {
  const quiz = loadQuiz(req, res);
  if (!quiz) return;

  const rows = db.prepare(`
    SELECT a.id AS attempt_id, u.name AS participant, u.email,
           a.score, a.time_taken_seconds, a.submitted_at, a.disqualified
    FROM attempts a JOIN users u ON u.id = a.user_id
    WHERE a.quiz_id = ?
    ORDER BY a.disqualified ASC, a.score DESC, a.time_taken_seconds ASC, a.submitted_at ASC
  `).all(quiz.id);

  // Rank valid participants 1..n; disqualified rows sit below with no rank.
  const leaderboard = rows.map((r, i) => ({ ...r, rank: r.disqualified ? null : i + 1 }));

  return res.json({ quiz, leaderboard });
});

// GET /api/admin/export-results/:quizId — CSV file download
router.get('/export-results/:quizId', requireAdmin, (req, res) => {
  const quiz = loadQuiz(req, res);
  if (!quiz) return;

  const rows = db.prepare(`
    SELECT u.name, u.email, a.score, a.time_taken_seconds, a.submitted_at
    FROM attempts a JOIN users u ON u.id = a.user_id
    WHERE a.quiz_id = ? ORDER BY a.score DESC, a.time_taken_seconds ASC
  `).all(quiz.id);

  const header = 'Rank,Name,Email,Score,Time Taken (sec),Submitted At';
  const lines = rows.map((r, i) =>
    [i + 1, csvEscape(r.name), csvEscape(r.email), r.score, r.time_taken_seconds, r.submitted_at].join(',')
  );
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${quiz.title.replace(/[^a-z0-9]+/gi, '_')}-results.csv"`
  );
  return res.send(csv);
});

// ============================================================
// User management
// ============================================================

// GET /api/admin/users — every account with attempt counts. (Organizer only)
router.get('/users', requireOrganizer, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
           COUNT(a.id) AS attempts
    FROM users u LEFT JOIN attempts a ON a.user_id = u.id
    GROUP BY u.id ORDER BY u.role = 'admin' DESC, u.id ASC
  `).all();
  return res.json({ users });
});

// PUT /api/admin/users/:id — admins may update a user's name, email,
// role (promote to admin / demote) and reset their password.
router.put('/users/:id', requireOrganizer, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const b = req.body || {};
  const name = b.name && b.name.trim() ? b.name.trim() : user.name;
  let email = user.email;
  if (b.email && b.email.trim()) {
    if (!EMAIL_RE.test(b.email.trim())) return res.status(400).json({ error: 'Valid email is required.' });
    email = b.email.trim().toLowerCase();
    if (email !== user.email) {
      const taken = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (taken) return res.status(409).json({ error: 'That email is already in use.' });
    }
  }

  let role = user.role;
  if (b.role && ['organizer', 'admin', 'participant'].includes(b.role)) {
    // Admins cannot change their own role (avoids locking everyone out).
    if (user.id === req.user.id && b.role !== user.role) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }
    // Do not demote the last remaining organizer.
    if (user.role === 'organizer' && b.role !== 'organizer') {
      const orgCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'organizer'").get().c;
      if (orgCount <= 1) return res.status(400).json({ error: 'At least one Admin Organizer must remain.' });
    }
    role = b.role;
  }

  try {
    let hash = user.password;
    if (b.password) {
      if (b.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      hash = bcrypt.hashSync(b.password, 10);
    }
    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, password = ? WHERE id = ?')
      .run(name, email, role, hash, user.id);
    return res.json({ message: 'User updated successfully!' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not update user.' });
  }
});

// DELETE /api/admin/users/:id — removes an account and all their quiz
// history. Quizzes the user organized are transferred to the acting admin.
router.delete('/users/:id', requireOrganizer, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  if (user.role === 'organizer') {
    const orgCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'organizer'").get().c;
    if (orgCount <= 1) return res.status(400).json({ error: 'At least one Admin Organizer must remain.' });
  }

  const run = db.transaction(() => {
    const qids = db.prepare('SELECT DISTINCT quiz_id FROM attempts WHERE user_id = ?')
      .all(user.id).map((r) => r.quiz_id);
    // answers cascade off attempts; quizzes are kept and reassigned.
    db.prepare('UPDATE quizzes SET created_by = ? WHERE created_by = ?').run(req.user.id, user.id);
    db.prepare('DELETE FROM leaderboard WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM attempts WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    return qids;
  });

  const qids = run();
  qids.forEach((quizId) => {
    try { refreshLeaderboard(quizId); } catch (e) {}
    try { broadcastLeaderboard(quizId); } catch (e) {}
  });

  return res.json({ message: `${user.name} has been deleted.` });
});

// ============================================================
// Participant management
// ============================================================

// PUT /api/admin/attempts/:attemptId/disqualify
// body: { disqualified: 1 | 0 } — removes/restores a participant
// from the quiz leaderboard and refreshes ranks.
router.put('/attempts/:attemptId/disqualify', requireAdmin, (req, res) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(req.params.attemptId);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(attempt.quiz_id);
  if (!canManageQuiz(req.user, quiz.created_by)) {
    return res.status(403).json({ error: 'Admins can only manage quizzes they created.' });
  }

  const val = req.body && req.body.disqualified ? 1 : 0;
  const at = val ? new Date().toISOString() : null;
  db.prepare('UPDATE attempts SET disqualified = ?, disqualified_at = ? WHERE id = ?')
    .run(val, at, attempt.id);

  refreshLeaderboard(attempt.quiz_id);
  try { broadcastLeaderboard(attempt.quiz_id); } catch (e) {}

  return res.json({
    message: val ? 'Participant disqualified.' : 'Participant reinstated.',
    disqualified: val,
  });
});

// ============================================================
// Stop quiz — auto-submits in-progress attempts (via broadcast)
// ============================================================

// POST /api/admin/quizzes/:id/stop
// Sets the quiz inactive, refreshes the final board and tells all
// live quiz clients to submit whatever they have right now.
router.post('/quizzes/:id/stop', requireAdmin, (req, res) => {
  const quiz = loadQuiz(req, res);
  if (!quiz) return;

  db.prepare('UPDATE quizzes SET is_active = 0 WHERE id = ?').run(quiz.id);

  // Recompute + push the final leaderboard; clients reply by submitting.
  try {
    broadcastLeaderboard(quiz.id, true);
  } catch (e) {}

  // Tell open quiz tabs to auto-submit right now.
  try { broadcastQuizStopped(quiz.id); } catch (e) {}

  return res.json({ message: 'Quiz stopped — participants were auto-submitted.' });
});

module.exports = router;