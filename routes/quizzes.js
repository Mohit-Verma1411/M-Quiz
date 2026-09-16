// ============================================================
// routes/quizzes.js
// Quiz CRUD + question management + join-by-code lookup.
// ============================================================
const express = require('express');
const { db } = require('../config/database');
const { requireAuth, requireAdmin, isStaff, canManageQuiz } = require('../middleware/auth');

const router = express.Router();

function requireQuizOwner(req, res, quizCreatedBy) {
  if (canManageQuiz(req.user, quizCreatedBy)) return true;
  res.status(403).json({ error: 'Admins can only manage quizzes they created.' });
  return false;
}

// Helper to generate a unique 6-char quiz code.
function generateQuizCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (db.prepare('SELECT id FROM quizzes WHERE quiz_code = ?').get(code));
  return code;
}

// GET /api/quizzes/code/:code — PUBLIC join-by-code lookup
router.get('/code/:code', (req, res) => {
  const quiz = db.prepare(`
    SELECT id, title, description, subject, quiz_code, duration_minutes,
           total_marks, negative_marking, is_active, start_time, end_time, created_at
    FROM quizzes WHERE UPPER(quiz_code) = UPPER(?)
  `).get(req.params.code || '');
  if (!quiz) return res.status(404).json({ error: 'No quiz found with that code.' });
  if (!quiz.is_active) return res.status(403).json({ error: 'This quiz is not open yet.' });
  return res.json({ quiz });
});

// GET /api/quizzes/:id/status — PUBLIC lightweight status poll used by
// the live quiz page to detect an admin "stop" without relying on socket.
router.get('/:id/status', (req, res) => {
  const quiz = db.prepare(`
    SELECT id, is_active, duration_minutes FROM quizzes WHERE id = ?
  `).get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  return res.json({ quiz });
});

router.use(requireAuth);

// POST /api/quizzes  (admin only)
router.post('/', requireAdmin, (req, res) => {
  const {
    title, description, subject, quiz_code, duration_minutes,
    negative_marking, start_time, end_time,
  } = req.body || {};

  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  const duration = parseInt(duration_minutes, 10);
  if (!duration || duration <= 0 || duration > 300) {
    return res.status(400).json({ error: 'Duration must be between 1 and 300 minutes.' });
  }

  const code = (quiz_code || generateQuizCode()).toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return res.status(400).json({ error: 'Quiz code must be 4-8 letters/digits.' });
  }
  if (db.prepare('SELECT id FROM quizzes WHERE quiz_code = ?').get(code)) {
    return res.status(409).json({ error: 'That quiz code is already in use.' });
  }

  const neg = parseInt(negative_marking, 10);
  try {
    const info = db
      .prepare(
        `INSERT INTO quizzes
         (title, description, subject, quiz_code, duration_minutes, negative_marking, created_by, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(), description || '', subject || '',
        code, duration, neg > 0 ? neg : 0, req.user.id,
        start_time || null, end_time || null
      );
    return res.status(201).json({ message: 'Quiz created successfully!', id: info.lastInsertRowid, quiz_code: code });
  } catch (err) {
    return res.status(500).json({ error: 'Could not create quiz.' });
  }
});

// GET /api/quizzes  — organizers/admins see their quizzes, participants get published/active ones
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'organizer') {
    rows = db.prepare(`
      SELECT q.*, COUNT(DISTINCT a.user_id) AS participants
      FROM quizzes q
      LEFT JOIN attempts a ON a.quiz_id = q.id
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `).all();
  } else if (req.user.role === 'admin') {
    rows = db.prepare(`
      SELECT q.*, COUNT(DISTINCT a.user_id) AS participants
      FROM quizzes q
      LEFT JOIN attempts a ON a.quiz_id = q.id
      WHERE q.created_by = ?
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `).all(req.user.id);
  } else {
    rows = db.prepare(`
      SELECT id, title, description, subject, quiz_code, duration_minutes,
             total_marks, negative_marking, is_active, start_time, end_time, created_at
      FROM quizzes WHERE is_active = 1 ORDER BY created_at DESC
    `).all();
  }
  return res.json({ quizzes: rows });
});

// GET /api/quizzes/:id  (must come AFTER /code/:code)
router.get('/:id', (req, res) => {
  const quiz = db.prepare(`
    SELECT id, title, description, subject, quiz_code, duration_minutes,
           total_marks, negative_marking, is_active, created_by, start_time, end_time, created_at
    FROM quizzes WHERE id = ?
  `).get(req.params.id);

  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

  // Staff are limited to quizzes they manage; organizers see everything.
  if (isStaff(req.user.role) && !canManageQuiz(req.user, quiz.created_by)) {
    return res.status(403).json({ error: 'Admins can only manage quizzes they created.' });
  }

  // Participant may not fetch questions for an inactive quiz.
  if (!isStaff(req.user.role) && !quiz.is_active) {
    return res.status(403).json({ error: 'This quiz is not open.' });
  }

  const questions = db
    .prepare('SELECT id, question_text, option_a, option_b, option_c, option_d, marks FROM questions WHERE quiz_id = ? ORDER BY id')
    .all(quiz.id);
  return res.json({ quiz, questions });
});

// PUT /api/quizzes/:id  (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!requireQuizOwner(req, res, quiz.created_by)) return;

  const b = req.body || {};
  const title = b.title && b.title.trim() ? b.title.trim() : quiz.title;
  const duration = b.duration_minutes ? parseInt(b.duration_minutes, 10) : quiz.duration_minutes;
  const neg = b.negative_marking !== undefined ? parseInt(b.negative_marking, 10) || 0 : quiz.negative_marking;
  const isActive = b.is_active !== undefined ? (b.is_active ? 1 : 0) : quiz.is_active;

  try {
    db.prepare(`
      UPDATE quizzes SET title = ?, description = ?, subject = ?, duration_minutes = ?,
        negative_marking = ?, is_active = ?, start_time = ?, end_time = ?
      WHERE id = ?
    `).run(
      title, b.description !== undefined ? b.description : quiz.description,
      b.subject !== undefined ? b.subject : quiz.subject,
      duration, neg, isActive,
      b.start_time !== undefined ? b.start_time : quiz.start_time,
      b.end_time !== undefined ? b.end_time : quiz.end_time,
      quiz.id
    );
    return res.json({ message: 'Quiz updated successfully!' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not update quiz.' });
  }
});

// DELETE /api/quizzes/:id  (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const found = db.prepare('SELECT id, created_by FROM quizzes WHERE id = ?').get(req.params.id);
  if (!found) return res.status(404).json({ error: 'Quiz not found.' });
  if (!requireQuizOwner(req, res, found.created_by)) return;

  // Remove child rows in FK-safe order (attempts cascades to answers).
  const del = db.transaction(() => {
    db.prepare('DELETE FROM leaderboard WHERE quiz_id = ?').run(found.id);
    db.prepare('DELETE FROM attempts WHERE quiz_id = ?').run(found.id);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(found.id);
  });
  try {
    del();
    return res.json({ message: 'Quiz deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete quiz. It may have linked data.' });
  }
});

// POST /api/quizzes/:id/questions  (admin) — bulk sync editor.
// Accepts either:
//   - a plain array of new question objects, OR
//   - { create: [...], update: [...], delete: [ids] }
// Updates existing questions in place and deletes removed ones.
router.post('/:id/questions', requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT id, created_by FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!requireQuizOwner(req, res, quiz.created_by)) return;

  let create = []; let update = []; let del = [];
  if (Array.isArray(req.body)) {
    create = req.body;
  } else {
    create = req.body.create || [];
    update = req.body.update || [];
    del = req.body.delete || [];
  }
  if (!create.length && !update.length && !del.length) {
    return res.status(400).json({ error: 'No changes provided.' });
  }

  const insert = db.prepare(`
    INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?,
      option_d = ?, correct_option = ?, marks = ? WHERE id = ? AND quiz_id = ?
  `);
  const delStmt = db.prepare('DELETE FROM questions WHERE id = ? AND quiz_id = ?');
  const validOptions = ['A', 'B', 'C', 'D'];

  const tx = db.transaction(() => {
    let count = 0;
    for (const q of create) {
      const opt = ((q.correct_option || '').trim()).toUpperCase();
      if (!q.question_text || !q.question_text.trim()) throw new Error('Every question needs text.');
      if (!validOptions.includes(opt)) throw new Error('Correct option must be A, B, C or D.');
      const marks = parseInt(q.marks, 10) || 1;
      insert.run(quiz.id, q.question_text.trim(), q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '', opt, marks > 0 ? marks : 1);
      count++;
    }
    for (const q of update) {
      const opt = ((q.correct_option || '').trim()).toUpperCase();
      if (!q.question_text || !q.question_text.trim()) throw new Error('Every question needs text.');
      if (!validOptions.includes(opt)) throw new Error('Correct option must be A, B, C or D.');
      const marks = parseInt(q.marks, 10) || 1;
      const info = updateStmt.run(q.question_text.trim(), q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '', opt, marks > 0 ? marks : 1, q.id, quiz.id);
      if (info.changes) count++;
    }
    for (const id of del) {
      // Protect questions that people have already answered — deleting them
      // would silently change scores and corrupt the leaderboard.
      const answered = db.prepare(
        'SELECT COUNT(*) AS c FROM answers WHERE question_id = ?'
      ).get(id).c;
      if (answered > 0) {
        throw new Error(`Question #${id} has been answered already and cannot be deleted.`);
      }
      const info = delStmt.run(id, quiz.id);
      if (info.changes) count++;
    }
    return count;
  });

  try {
    const changed = tx();
    recalcTotalMarks(quiz.id);
    return res.status(201).json({ message: `${changed || 'No'} question(s) updated successfully!` });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/questions/:questionId  (admin)
router.put('/questions/:questionId', requireAdmin, (req, res) => {
  const found = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.questionId);
  if (!found) return res.status(404).json({ error: 'Question not found.' });
  const parent = db.prepare('SELECT created_by FROM quizzes WHERE id = ?').get(found.quiz_id);
  if (!requireQuizOwner(req, res, parent && parent.created_by)) return;

  const b = req.body || {};
  const opt = ((b.correct_option || found.correct_option).trim()).toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(opt)) {
    return res.status(400).json({ error: 'Correct option must be A, B, C or D.' });
  }

  db.prepare(`
    UPDATE questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?,
      option_d = ?, correct_option = ?, marks = ? WHERE id = ?
  `).run(
    b.question_text !== undefined ? b.question_text : found.question_text,
    b.option_a !== undefined ? b.option_a : found.option_a,
    b.option_b !== undefined ? b.option_b : found.option_b,
    b.option_c !== undefined ? b.option_c : found.option_c,
    b.option_d !== undefined ? b.option_d : found.option_d,
    opt,
    b.marks !== undefined ? parseInt(b.marks, 10) || 1 : found.marks,
    found.id
  );
  recalcTotalMarks(found.quiz_id);
  return res.json({ message: 'Question updated successfully!' });
});

// DELETE /api/questions/:questionId  (admin)
router.delete('/questions/:questionId', requireAdmin, (req, res) => {
  const found = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.questionId);
  if (!found) return res.status(404).json({ error: 'Question not found.' });
  const parent = db.prepare('SELECT created_by FROM quizzes WHERE id = ?').get(found.quiz_id);
  if (!requireQuizOwner(req, res, parent && parent.created_by)) return;
  db.prepare('DELETE FROM questions WHERE id = ?').run(found.id);
  recalcTotalMarks(found.quiz_id);
  return res.json({ message: 'Question deleted successfully.' });
});

function recalcTotalMarks(quizId) {
  const { total } = db
    .prepare('SELECT COALESCE(SUM(marks), 0) AS total FROM questions WHERE quiz_id = ?')
    .get(quizId);
  db.prepare('UPDATE quizzes SET total_marks = ? WHERE id = ?').run(total, quizId);
}

module.exports = router;