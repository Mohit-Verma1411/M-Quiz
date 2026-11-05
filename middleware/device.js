// ============================================================
// middleware/device.js
// Tracks a persistent per-browser device identifier in a cookie
// (`device_id`). It is set on every request so one device keeps
// the same ID across logins/logouts and even when a different
// account is used — letting us enforce "one device = one
// attempt per quiz". The cookie is NOT httpOnly so the client
// can read it and forward it through Socket.io.
// ============================================================
const crypto = require('crypto');

const DEVICE_COOKIE = 'device_id';
const DEVICE_MAX_AGE = 365 * 24 * 3600 * 1000; // 1 year
const DEVICE_PATTERN = /^[a-f0-9]{32}$/;

function newDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

function isDeviceId(value) {
  return typeof value === 'string' && DEVICE_PATTERN.test(value);
}

function attachDevice(req, res, next) {
  let id = req.cookies[DEVICE_COOKIE];
  if (!isDeviceId(id)) {
    id = newDeviceId();
    res.cookie(DEVICE_COOKIE, id, {
      maxAge: DEVICE_MAX_AGE,
      sameSite: 'lax',
    });
  }
  req.deviceId = id;
  next();
}

module.exports = attachDevice;
module.exports.attachDevice = attachDevice;
module.exports.isDeviceId = isDeviceId;