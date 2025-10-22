let handler;
try {
  const serverless = require('serverless-http');
  const app = require('../server/server');
  handler = serverless(app);
} catch (e) {
  console.error('[boot] server failed to start:', e && e.message ? e.message : e);
  handler = async (req, res) => {
    try {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      const msg = (e && e.message) ? e.message : String(e);
      res.end(JSON.stringify({ error: 'boot_failed', message: msg }));
    } catch (_){
      res.statusCode = 500;
      res.end('boot_failed');
    }
  };
}

module.exports = (req, res) => handler(req, res);
