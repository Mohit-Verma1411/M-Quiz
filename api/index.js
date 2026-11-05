// Vercel serverless entry point.
// The Express app is created in server.js; Vercel invokes it per request.
const app = require('../server');

module.exports = app;
