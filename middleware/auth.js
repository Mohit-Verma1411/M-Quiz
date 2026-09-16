// ============================================================
// middleware/auth.js
// JWT-based authentication guards for protected routes.
// The JWT is stored in an httpOnly cookie for security.
//
// Roles:
//   organizer  — Admin Organizer: every permission, user management,
//                may control every quiz (even other admins').
//   admin      — Admin: dashboards + create/manage own quizzes only,
//                no user management.
//   participant — regular player.
// ============================================================
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'm-quiz-super-secret-key-change-me';

const STAFF_ROLES = ['admin', 'organizer'];

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Refresh role/identity straight from the DB so role changes and
// migrations take effect immediately (a JWT alone can go stale).
function freshUser(tokenUser) {
  if (!tokenUser || !tokenUser.id) return null;
  return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(tokenUser.id) || null;
}

// May this user edit/delete/stop a given quiz (by its created_by)?
function canManageQuiz(user, quizCreatedBy) {
  if (!user) return false;
  if (user.role === 'organizer') return true;
  return user.role === 'admin' && quizCreatedBy === user.id;
}

// Optionally read the current user without failing (for pages).
function attachUser(req, res, next) {
  const token = req.cookies.token;
  let u = null;
  if (token) {
    try {
      u = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      u = null;
    }
  }
  req.user = freshUser(u);
  next();
}

// Require a valid session (API + pages).
function requireAuth(req, res, next) {
  const token = req.cookies.token;
  const isApi = req.originalUrl.startsWith('/api/');
  if (!token) {
    if (isApi) {
      return res.status(401).json({ error: 'Please login to continue.' });
    }
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  try {
    const u = jwt.verify(token, JWT_SECRET);
    req.user = freshUser(u);
    if (!req.user) {
      res.clearCookie('token');
      if (isApi) {
        return res.status(401).json({ error: 'Account no longer exists.' });
      }
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    next();
  } catch (err) {
    res.clearCookie('token');
    if (isApi) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
}

// Deny access helper shared by the role guards.
function deny(res, isApi, message) {
  if (isApi) return res.status(403).json({ error: message });
  return res.status(403).render('error', {
    code: 403,
    message,
    user: res.req.user || null,
  });
}

// Require the admin role (either Admin or Admin Organizer).
function requireAdmin(req, res, next) {
  if (!req.user || !isStaff(req.user.role)) {
    return deny(res, req.originalUrl.startsWith('/api/'), 'Admins only.');
  }
  next();
}

// Require the Admin Organizer role specifically.
function requireOrganizer(req, res, next) {
  if (!req.user || req.user.role !== 'organizer') {
    return deny(res, req.originalUrl.startsWith('/api/'), 'Admin Organizer only.');
  }
  next();
}

module.exports = {
  JWT_SECRET,
  signToken,
  attachUser,
  requireAuth,
  requireAdmin,
  requireOrganizer,
  isStaff,
  canManageQuiz,
};