// ============================================================
// routes/pages.js
// Server-rendered pages (EJS).
// ============================================================
const express = require('express');
const { db } = require('../config/database');
const { attachUser, requireAuth, requireAdmin, requireOrganizer, isStaff, canManageQuiz } = require('../middleware/auth');

const router = express.Router();

router.use(attachUser);

function page(res, view, data = {}) {
  res.render(view, {
    layout: null,
    user: res.req.user || null,
    ...data,
  });
}

// Guard an admin-managed quiz page: organizers see all, admins only theirs.
function loadManagedQuiz(req, res) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    res.status(404).render('error', { code: 404, message: 'Quiz not found.', user: req.user });
    return null;
  }
  if (!canManageQuiz(req.user, quiz.created_by)) {
    res.status(403).render('error', {
      code: 403,
      message: 'Admins can only manage quizzes they created.',
      user: req.user,
    });
    return null;
  }
  return quiz;
}

// GET / — home
router.get('/', (req, res) => {
  const publicQuizzes = db.prepare(`
    SELECT id, title, description, subject, quiz_code, duration_minutes,
           total_marks, is_active
    FROM quizzes WHERE is_active = 1 ORDER BY created_at DESC LIMIT 6
  `).all();
  page(res, 'home', { publicQuizzes });
});

// GET /login
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  page(res, 'login');
});

// GET /signup
router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/');
  page(res, 'signup');
});

// GET /join
router.get('/join', (req, res) => {
  page(res, 'participant/join');
});

// GET /live/:quizId  — participant live quiz (open to guests)
router.get('/live/:quizId', (req, res) => {
  const quiz = db.prepare(`
    SELECT id, title, description, subject, quiz_code, duration_minutes,
           total_marks, negative_marking, is_active
    FROM quizzes WHERE id = ?
  `).get(req.params.quizId);
  if (!quiz) {
    return res.status(404).render('error', { code: 404, message: 'Quiz not found.', user: req.user });
  }
  if (!quiz.is_active && !isStaff(req.user.role)) {
    return res.status(403).render('error', { code: 403, message: 'This quiz is not open.', user: req.user });
  }
  const questions = db.prepare(`
    SELECT id, question_text, option_a, option_b, option_c, option_d, marks
    FROM questions WHERE quiz_id = ? ORDER BY id
  `).all(quiz.id);
  const existing = req.user
    ? db.prepare('SELECT id FROM attempts WHERE user_id = ? AND quiz_id = ?').get(req.user.id, quiz.id)
    : null;
  if (existing) {
    return page(res, 'participant/result', { quiz, alive: true, existingAttempt: existing.id });
  }
  page(res, 'participant/live', { quiz, questions });
});

// GET /result/:attemptId  — participant result / review
router.get('/result/:attemptId', requireAuth, (req, res) => {
  const attempt = db.prepare(`
    SELECT a.*, u.name AS participant, q.title AS quizTitle
    FROM attempts a JOIN users u ON u.id = a.user_id JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = ?
  `).get(req.params.attemptId);
  if (!attempt) return res.status(404).render('error', { code: 404, message: 'Result not found.', user: req.user });
  if (!isStaff(req.user.role) && req.user.id !== attempt.user_id) {
    return res.status(403).render('error', { code: 403, message: 'Not your result.', user: req.user });
  }
  const answers = db.prepare(`
    SELECT ans.selected_option, ans.is_correct, ans.marks_obtained,
           q.question_text, q.correct_option, q.marks,
           q.option_a, q.option_b, q.option_c, q.option_d
    FROM answers ans JOIN questions q ON q.id = ans.question_id
    WHERE ans.attempt_id = ? ORDER BY ans.id
  `).all(attempt.id);
  page(res, 'participant/result', { attempt, answers });
});

// GET /leaderboard/:quizId — real-time leaderboard
router.get('/leaderboard/:quizId', (req, res) => {
  const quiz = db.prepare('SELECT id, title, quiz_code, subject FROM quizzes WHERE id = ?').get(req.params.quizId);
  if (!quiz) return res.status(404).render('error', { code: 404, message: 'Quiz not found.', user: req.user });
  page(res, 'leaderboard', { quiz });
});

// GET /profile
router.get('/profile', requireAuth, (req, res) => {
  const me = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  const attempts = db.prepare(`
    SELECT a.score, a.time_taken_seconds, a.submitted_at, q.title, q.quiz_code
    FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.user_id = ? ORDER BY a.submitted_at DESC LIMIT 20
  `).all(me.id);
  page(res, 'profile', { me, attempts });
});

// ---------- Admin ----------
// GET /admin/dashboard
router.get('/admin/dashboard', requireAuth, requireAdmin, (req, res) => {
  page(res, 'admin/dashboard');
});

// GET /admin/quiz/new — create quiz
router.get('/admin/quiz/new', requireAuth, requireAdmin, (req, res) => {
  page(res, 'admin/create-quiz');
});

// GET /admin/quiz/:id — edit quiz + manage questions
router.get('/admin/quiz/:id', requireAuth, requireAdmin, (req, res) => {
  const quiz = loadManagedQuiz(req, res);
  if (!quiz) return;
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY id').all(quiz.id);
  page(res, 'admin/edit-quiz', { quiz, questions });
});

// GET /admin/quiz/:id/leaderboard — live leaderboard for a quiz
router.get('/admin/quiz/:id/leaderboard', requireAuth, requireAdmin, (req, res) => {
  const quiz = loadManagedQuiz(req, res);
  if (!quiz) return;
  page(res, 'admin/quiz-leaderboard', { quiz });
});

// GET /admin/quiz/:id/results — results details + CSV export
router.get('/admin/quiz/:id/results', requireAuth, requireAdmin, (req, res) => {
  const quiz = loadManagedQuiz(req, res);
  if (!quiz) return;
  page(res, 'admin/quiz-results', { quiz });
});

// GET /admin/quizzes — list quizzes you can manage
router.get('/admin/quizzes', requireAuth, requireAdmin, (req, res) => {
  page(res, 'admin/quizzes');
});

// GET /admin/users — manage all user accounts (Admin Organizer only)
router.get('/admin/users', requireAuth, requireOrganizer, (req, res) => {
  page(res, 'admin/users');
});

// GET /404 fallback handled by app.use below in server.js
module.exports = router;