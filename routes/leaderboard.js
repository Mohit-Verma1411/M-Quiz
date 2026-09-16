// ============================================================
// routes/leaderboard.js
// GET /api/leaderboard/:quizId  (also used by the polling fallback)
// ============================================================
const express = require('express');
const { getLeaderboard } = require('../services/leaderboard');
const { db } = require('../config/database');

const router = express.Router();

// Public: no auth required, since quiz codes are shared in events.
router.get('/:quizId', (req, res) => {
  const quiz = db.prepare('SELECT id, title FROM quizzes WHERE id = ?').get(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  const leaderboard = getLeaderboard(quiz.id);
  return res.json({ quiz, leaderboard });
});

module.exports = router;