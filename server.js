// ============================================================
// server.js
// M-Quiz — Ultimate Quiz Competition Platform
// Express + SQLite + Socket.io real-time leaderboard.
// Run: npm start   (http://localhost:3000)
// ============================================================
require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const { initDatabase, db } = require('./config/database');
const { setIo, getIo } = require('./services/realtime');
const { attachUser } = require('./middleware/auth');

// Ensure DB + tables exist before anything else.
initDatabase();

// Seed default admins when the database is empty. Serverless hosts such as
// Vercel start with a blank /tmp filesystem on every cold start, so this
// keeps the deployed app usable. Set AUTO_SEED=true on other hosts too.
const SHOULD_AUTO_SEED = process.env.AUTO_SEED === 'true' || !!process.env.VERCEL;
if (SHOULD_AUTO_SEED) {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    console.log('[boot] empty database detected — seeding default admins…');
    require('./seed').seedDatabase();
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
setIo(io);

// ---------- Middleware ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(require('./middleware/device'));

// ---------- Health check (Render / uptime monitors) ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Vercel serverless functions cannot host a long-lived Socket.io server.
// Serve a harmless stub so the client detects that `io` is unavailable and
// automatically falls back to polling the leaderboard API.
if (process.env.VERCEL) {
  app.get('/socket.io/socket.io.js', (req, res) => {
    res.type('application/javascript').send('/* realtime disabled on this deployment; polling fallback is active */');
  });
}

// ---------- REST API routes ----------
app.use('/api', attachUser);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/attempts', require('./routes/attempts'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/admin', require('./routes/admin'));

// ---------- Page routes ----------
app.use('/', require('./routes/pages'));

// ---------- 404 + error handlers ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  res.status(404).render('error', { code: 404, message: 'Page not found.', user: req.user || null });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
  res.status(500).render('error', { code: 500, message: 'Something went wrong.', user: req.user || null });
});

// ============================================================
// Socket.io — Real-time leaderboard
// Client -> server:  joinQuizRoom { quizId }
// Client -> server:  submitQuiz   { quizId, userId, answers, timeTaken }
// Server -> client:  leaderboardUpdated { quizId, leaderboard }
//                      quizSubmitted { quizId, message }
//                      error { message }
// ============================================================
io.on('connection', (socket) => {
  // Participant/admin opens the live board for a quiz.
  socket.on('joinQuizRoom', async ({ quizId } = {}) => {
    if (!quizId) {
      return socket.emit('error', { message: 'quizId is required to join a room.' });
    }
    await socket.join(`quiz-${quizId}`);
    socket.emit('joinedQuizRoom', { quizId });
  });

  // Participant submits through the live page (or API).
  socket.on('submitQuiz', async ({ quizId, userId, answers, timeTaken, deviceId } = {}) => {
    if (!quizId || !userId) {
      return socket.emit('error', { message: 'quizId and userId are required.' });
    }

    // Since socket handlers duplicate the HTTP submit logic, delegate to a
    // shared function instead of re-importing the route (the route handles
    // transactions + duplicate protection).
    const { submitAttempt } = require('./services/attempt-service');
    try {
      const result = submitAttempt({ quizId, userId, answers, timeTaken, deviceId });
      // Broadcast live update to everyone in the quiz room.
      socket.to(`quiz-${quizId}`).emit('leaderboardUpdated', {
        quizId,
        leaderboard: result.leaderboard,
      });
      socket.emit('quizSubmitted', {
        quizId,
        message: 'Quiz submitted successfully!',
        result: result.result,
        attemptId: result.attemptId,
      });
    } catch (err) {
      socket.emit('error', { message: err.message || 'Submission failed.' });
    }
  });

  socket.on('disconnect', () => {});
});

// Only listen when run directly (`npm start`). Serverless entry points
// import this module and invoke the exported Express app instead.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n  🎯 M-Quiz is running:`);
    console.log(`  →  http://localhost:${PORT}`);
    console.log(`  →  admin@uiet.com / Uiet@123 \n`);
  });
}

// Vercel's Express builder treats this file as the serverless handler and
// requires the default export to be a function. Expose the Express app
// directly while keeping the other handles available as properties.
module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
