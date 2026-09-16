// ============================================================
// routes/attempts.js
// POST /api/attempts/start | POST /api/attempts/submit
// GET /api/attempts/result/:attemptId
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { signToken, requireAuth, isStaff } = require('../middleware/auth');
const { submitAttempt } = require('../services/attempt-service');
const { broadcastLeaderboard } = require('../services/realtime');

const router = express.Router();

const GUEST_COOKIE_MAX_AGE = 24 * 3600 * 1000; // 1 day

// POST /api/attempts/start
// Body: { quizId, guestName? }
// Creates an ephemeral guest user if no session (guest mode), then
// returns the quiz questions WITHOUT revealing correct answers.
router.post('/start', (req, res) => {
  const { quizId } = req.body || {};
  if (!quizId) return res.status(400).json({ error: 'quizId is required.' });

  const quiz = db.prepare(`
    SELECT id, title, description, subject, quiz_code, duration_minutes,
           total_marks, negative_marking, is_active
    FROM quizzes WHERE id = ?
  `).get(quizId);

  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!quiz.is_active) return res.status(403).json({ error: 'This quiz is not open for attempts.' });

  let user = req.user;
  // Guests: create a lightweight participant account on the fly and give
  // them a real session cookie so they can see their own results later.
  if (!user) {
    const guestName = (req.body.guestName || 'Guest').trim().slice(0, 40);
    const guestEmail = `guest_${Date.now()}_${Math.floor(Math.random() * 1e6)}@quiz.local`;
    const hash = bcrypt.hashSync('guest-not-a-password', 10);
    const info = db
      .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run(guestName || 'Guest', guestEmail, hash, 'participant');
    const guestId = Number(info.lastInsertRowid);
    const guest = db
      .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
      .get(guestId);
    res.cookie('token', signToken(guest), {
      httpOnly: true,
      maxAge: GUEST_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
    user = { id: guest.id, name: guest.name };
  }

  // Block a second attempt (UNIQUE(user_id, quiz_id) backstop).
  const existing = db.prepare('SELECT id, score FROM attempts WHERE user_id = ? AND quiz_id = ?').get(user.id, quizId);
  if (existing) {
    return res.status(409).json({
      error: 'You have already attempted this quiz.',
      attemptId: existing.id,
    });
  }

  const questions = db.prepare(`
    SELECT id, question_text, option_a, option_b, option_c, option_d, marks
    FROM questions WHERE quiz_id = ? ORDER BY id
  `).all(quizId);

  return res.json({
    userId: user.id,
    quiz: {
      id: quiz.id, title: quiz.title, description: quiz.description,
      subject: quiz.subject, quiz_code: quiz.quiz_code,
      duration_minutes: quiz.duration_minutes, total_marks: quiz.total_marks,
      negative_marking: quiz.negative_marking,
    },
    questions,
    questionCount: questions.length,
    showResult: true, // demo policy: allow result screen after submit
  });
});

// POST /api/attempts/submit
router.post('/submit', (req, res) => {
  const { quizId, userId, answers, timeTaken } = req.body || {};
  try {
    const { attemptId, result, leaderboard } = submitAttempt({ quizId, userId, answers, timeTaken });

    // Broadcast the updated leaderboard to the real-time room in the background.
    try {
      broadcastLeaderboard(quizId);
    } catch (err) {
      // Non-fatal: HTTP response already contains the leaderboard.
    }

    return res.status(201).json({
      message: 'Quiz submitted successfully!',
      attemptId,
      result,
      leaderboard,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    return res.status(status).json({ error: err.message || 'Submission failed.' });
  }
});

// GET /api/attempts/result/:attemptId
router.get('/result/:attemptId', (req, res) => {
  const attempt = db.prepare(`
    SELECT a.*, u.name AS participant, q.title AS quizTitle
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = ?
  `).get(req.params.attemptId);

  if (!attempt) return res.status(404).json({ error: 'Result not found.' });

  // Staff and the owner may view.
  if (!isStaff(req.user.role) && req.user.id !== attempt.user_id) {
    return res.status(403).json({ error: 'You cannot view this result.' });
  }

  const answers = db.prepare(`
    SELECT ans.question_id, ans.selected_option, ans.is_correct, ans.marks_obtained,
           q.question_text, q.correct_option, q.marks
    FROM answers ans JOIN questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = ? ORDER BY ans.id
  `).all(attempt.id);

  return res.json({ attempt, answers });
});

module.exports = router;