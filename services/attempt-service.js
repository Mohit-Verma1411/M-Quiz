// ============================================================
// services/attempt-service.js
// Shared attempt-submission logic used by BOTH the REST API
// and the Socket.io "submitQuiz" handler so behaviour is
// identical (transactions, duplicate protection, scoring).
// ============================================================
const { db } = require('../config/database');
const { refreshLeaderboard } = require('./leaderboard');

/**
 * Validate + score an attempt and persist it inside a transaction.
 * Returns { attemptId, result, leaderboard }.
 *
 * @param {object} params { quizId, userId, answers, timeTaken, deviceId }
 */
function submitAttempt({ quizId, userId, answers = [], timeTaken = 0, deviceId = null }) {
  if (!quizId || !userId) {
    const err = new Error('quizId and userId are required.');
    err.status = 400;
    throw err;
  }

  const quiz = db.prepare('SELECT id, negative_marking, duration_minutes FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) {
    const err = new Error('Quiz not found.');
    err.status = 404;
    throw err;
  }

  const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  const questions = db.prepare('SELECT id, correct_option, marks FROM questions WHERE quiz_id = ?').all(quizId);
  const qMap = Object.fromEntries(questions.map((q) => [q.id, q]));

  let score = 0;
  const answerRows = answers.map((a) => {
    const q = qMap[a && a.questionId];
    if (!q) return null;
    const selected = String(a.selectedOption || '').trim().toUpperCase();
    const picked = ['A', 'B', 'C', 'D'].includes(selected) ? selected : null;
    const isCorrect = picked !== null && picked === q.correct_option;
    let gained = 0;
    if (isCorrect) gained = q.marks;
    else if (picked !== null) gained = -quiz.negative_marking;
    score += gained;
    return { questionId: q.id, selected: picked, isCorrect: isCorrect ? 1 : 0, gained };
  });

  const maxSeconds = quiz.duration_minutes * 60;
  const safeTime = Math.min(Math.max(parseInt(timeTaken, 10) || 0, 0), maxSeconds);

  const insertAttempt = db.prepare(
    'INSERT INTO attempts (user_id, quiz_id, device_id, score, time_taken_seconds) VALUES (?, ?, ?, ?, ?)'
  );
  const insertAnswer = db.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected_option, is_correct, marks_obtained)
     VALUES (?, ?, ?, ?, ?)`
  );

  // Route through a helper so the client and the DB agree on the message.
  const deviceConflict = () => {
    const err = new Error('This device already participated in this quiz. One device = one attempt.');
    err.status = 409;
    err.dup = 'device';
    return err;
  };

  const submit = db.transaction(() => {
    // Device check runs INSIDE the transaction (holds the write lock), so two
    // rapid submissions from the same device cannot both slip through.
    if (deviceId) {
      const existingDevice = db
        .prepare('SELECT id FROM attempts WHERE device_id = ? AND quiz_id = ?')
        .get(deviceId, quizId);
      if (existingDevice) throw deviceConflict();
    }
    const info = insertAttempt.run(userId, quizId, deviceId, score, safeTime);
    const attemptId = info.lastInsertRowid;
    for (const a of answerRows) {
      if (!a) continue;
      insertAnswer.run(attemptId, a.questionId, a.selected, a.isCorrect, a.gained);
    }
    return attemptId;
  });

  let attemptId;
  try {
    attemptId = submit.immediate(); // BEGIN IMMEDIATE → exclusive write lock
  } catch (err) {
    if (err.dup === 'device') throw err;
    if (String(err.message).includes('UNIQUE constraint failed')) {
      const dup = new Error('Duplicate submission blocked — you already submitted this quiz.');
      dup.status = 409;
      throw dup;
    }
    throw err;
  }

  const leaderboard = refreshLeaderboard(quizId);

  return {
    attemptId,
    result: {
      score,
      timeTaken: safeTime,
      totalQuestions: questions.length,
    },
    leaderboard,
  };
}

module.exports = { submitAttempt };