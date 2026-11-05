const bcrypt = require('bcryptjs');
const { db, initDatabase } = require('./config/database');

// Reset the demo data and create the two default admin accounts.
// Exported so the server can auto-seed an empty database on hosts whose
// disk is ephemeral (Vercel /tmp, Render free tier, etc.).
function seedDatabase() {
  initDatabase();

  db.exec(`
    DELETE FROM answers;
    DELETE FROM attempts;
    DELETE FROM leaderboard;
    DELETE FROM questions;
    DELETE FROM quizzes;
    DELETE FROM users;
  `);

  const adminPass = bcrypt.hashSync('Mohit@141106', 10);
  const adminPass1 = bcrypt.hashSync('Uiet@123', 10);
  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run('Admin Organizer', 'admin@quiz.com', adminPass, 'organizer');

  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run('UIET ADMIN', 'admin@uiet.com', adminPass1, 'admin');
}

module.exports = { seedDatabase };

// Allow running as a standalone script: `npm run seed`
if (require.main === module) {
  seedDatabase();
  db.close();
  console.log('Seeded: UIET ADMIN (admin@uiet.com)');
}
