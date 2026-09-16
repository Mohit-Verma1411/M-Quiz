// ============================================================
// services/leaderboard.js
// Leaderboard computation and real-time broadcast logic.
// Ranking: highest score first, then LOWER time taken, then
// earlier submission time.
// ============================================================
const { db } = require('../config/database');

const RANK_SQL = `
  SELECT
    a.id AS attempt_id,
    a.user_id,
    u.name AS participant,
    a.score,
    a.time_taken_seconds AS timeTaken,
    a.submitted_at AS submittedAt
  FROM attempts a
  JOIN users u ON u.id = a.user_id
  WHERE a.quiz_id = ? AND a.disqualified = 0
  ORDER BY a.score DESC, a.time_taken_seconds ASC, a.submitted_at ASC
`;

// Compute the full ranked leaderboard for a quiz from attempts.
function getLeaderboard(quizId) {
  const rows = db.prepare(RANK_SQL).all(quizId);
  return rows.map((row, idx) => ({
    rank: idx + 1,
    userId: row.user_id,
    participant: row.participant,
    score: row.score,
    timeTaken: row.timeTaken,
    submittedAt: row.submittedAt,
  }));
}

function refreshLeaderboard(quizId) {
  const lb = getLeaderboard(quizId);
  const tx = db.transaction(() => {
    const clear = db.prepare('DELETE FROM leaderboard WHERE quiz_id = ?');
    const insert = db.prepare(
      `INSERT INTO leaderboard (quiz_id, user_id, score, time_taken_seconds, rank)
       VALUES (?, ?, ?, ?, ?)`
    );
    clear.run(quizId);
    for (const entry of lb) {
      insert.run(quizId, entry.userId, entry.score, entry.timeTaken, entry.rank);
    }
  });
  tx();
  return lb.map((e) => ({
    rank: e.rank,
    userId: e.userId,
    participant: e.participant,
    score: e.score,
    timeTaken: e.timeTaken,
    submittedAt: e.submittedAt,
  }));
}

// Recompute a single user's row after a new attempt.
function upsertLeaderboardRow(quizId, userId) {
  const row = db
    .prepare(
      `SELECT a.id AS attempt_id, a.score, a.time_taken_seconds AS timeTaken,
              u.name AS participant
       FROM attempts a JOIN users u ON u.id = a.user_id
       WHERE a.quiz_id = ? AND a.user_id = ?`
    )
    .get(quizId, userId);

  // Then re-rank everyone (simple and always consistent for small/medium data).
  return refreshLeaderboard(quizId);
}

module.exports = { getLeaderboard, refreshLeaderboard, upsertLeaderboardRow };