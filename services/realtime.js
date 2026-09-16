// ============================================================
// services/realtime.js
// Central hub for Socket.io so HTTP routes and socket handlers
// can broadcast leaderboard updates without wiring pain.
// ============================================================
const { refreshLeaderboard } = require('./leaderboard');

let io = null;

function setIo(instance) {
  io = instance;
}

function getIo() {
  return io;
}

// Recompute the leaderboard for a quiz and emit it to the room.
function broadcastLeaderboard(quizId, withSubmission = false) {
  if (!io) return null;
  const leaderboard = refreshLeaderboard(quizId);
  const room = `quiz-${quizId}`;
  io.to(room).emit('leaderboardUpdated', { quizId, leaderboard });
  if (withSubmission) {
    io.to(room).emit('quizSubmitted', { quizId, message: 'A participant submitted the quiz.' });
  }
  return leaderboard;
}

// Tell everyone on the live quiz page to submit immediately (admin stopped).
function broadcastQuizStopped(quizId, message = 'The quiz was stopped by the host. Your answers were submitted automatically.') {
  if (!io) return;
  io.to(`quiz-${quizId}`).emit('quizStopped', { quizId, message });
}

module.exports = { setIo, getIo, broadcastLeaderboard, broadcastQuizStopped };