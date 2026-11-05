// ============================================================
// services/answer-privacy.js
// Decides whether correct answers may be revealed for a quiz.
// Participants only see the full answer review AFTER the quiz is
// closed (is_active = 0); staff (admin/organizer) always can.
// ============================================================
const STAFF_ROLES = ['admin', 'organizer'];

function canRevealAnswers(user, quizIsActive) {
  if (!user) return false;
  if (STAFF_ROLES.includes(user.role)) return true;
  return !quizIsActive;
}

module.exports = { canRevealAnswers };