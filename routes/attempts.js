// ============================================================
// routes/attempts.js
// POST /api/attempts/start | POST /api/attempts/submit
// GET /api/attempts/result/:attemptId
// ============================================================
const express = require('express');
const { db } = require('../config/database');
const { requireAuth, isStaff } = require('../middleware/auth');
const { submitAttempt } = require('../services/attempt-service');
const { broadcastLeaderboard } = require('../services/realtime');
const { canRevealAnswers } = require('../services/answer-privacy');

const router = express.Router();

// POST /api/attempts/start
// Body: { quizId }
// Requires a real (non-guest) account. Returns the quiz questions
// WITHOUT revealing correct answers.
router.post('/start', requireAuth, (req, res) => {
  const { quizId } = req.body || {};
  if (!quizId) return res.status(400).json({ error: 'quizId is required.' });

  const quiz = db.prepare(`
    SELECT id, title, description, subject, quiz_code, duration_minutes,
           total_marks, negative_marking, is_active
    FROM quizzes WHERE id = ?
  `).get(quizId);

  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!quiz.is_active) return res.status(403).json({ error: 'This quiz is not open for attempts.' });

  const user = req.user;

  // Device-level guard: one device gets one attempt per quiz, no matter
  // which account is used on it.
  if (req.deviceId) {
    const deviceAttempt = db
      .prepare('SELECT id, user_id FROM attempts WHERE device_id = ? AND quiz_id = ?')
      .get(req.deviceId, quizId);
    if (deviceAttempt) {
      const sameOwner = user.id === deviceAttempt.user_id;
      return res.status(409).json({
        error: 'This device already participated in this quiz. One device = one attempt.',
        // Only let them reopen the result screen if the attempt is their own.
        attemptId: sameOwner ? deviceAttempt.id : undefined,
      });
    }
  }

  // Block a second attempt from the same user (UNIQUE(user_id, quiz_id) backstop).
  const existing = db
    .prepare('SELECT id, score FROM attempts WHERE user_id = ? AND quiz_id = ?')
    .get(user.id, quizId);
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
    deviceId: req.deviceId || null,
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
    const { attemptId, result, leaderboard } = submitAttempt({
      quizId,
      userId,
      answers,
      timeTaken,
      deviceId: req.deviceId,
    });

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

  const quiz = db.prepare('SELECT id, is_active FROM quizzes WHERE id = ?').get(attempt.quiz_id);
  const reveal = canRevealAnswers(req.user, quiz && quiz.is_active);
  const lb = db.prepare('SELECT rank FROM leaderboard WHERE quiz_id = ? AND user_id = ?').get(attempt.quiz_id, attempt.user_id);
  const total = db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE quiz_id = ? AND disqualified = 0').get(attempt.quiz_id).c;

  const answers = db.prepare(`
    SELECT ans.question_id, ans.selected_option, ans.is_correct, ans.marks_obtained,
           q.question_text, q.correct_option, q.marks,
           q.option_a, q.option_b, q.option_c, q.option_d
    FROM answers ans JOIN questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = ? ORDER BY ans.id
  `).all(attempt.id);

  // While the quiz is still open, participants get no correctness info.
  const safeAnswers = reveal ? answers : answers.map((a) => ({
    question_id: a.question_id,
    selected_option: a.selected_option,
    question_text: a.question_text,
    marks: a.marks,
    option_a: a.option_a, option_b: a.option_b,
    option_c: a.option_c, option_d: a.option_d,
  }));

  return res.json({
    attempt,
    quizClosed: quiz ? !quiz.is_active : true,
    revealAnswers: reveal,
    rank: lb ? lb.rank : null,
    totalParticipants: total,
    answers: safeAnswers,
  });
});

module.exports = router;