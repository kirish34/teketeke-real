require('dotenv').config();
const express = require('express');
const path = require('path');

const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// CORS (whitelist via CORS_ORIGINS="https://app1,https://app2")
const allow = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allow.length === 0 || allow.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  },
  credentials: true
}));

// Security & logs
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limit for API & user routes
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(['/api', '/u'], apiLimiter);

// Serve dynamic Supabase client config for the browser from env
// Keeps client/server in sync and avoids stale hard-coded keys
app.get('/public/js/app-config.js', (_req, res) => {
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const body = `// generated at runtime by server\nwindow.SUPABASE_URL=${JSON.stringify(url)};\nwindow.SUPABASE_ANON_KEY=${JSON.stringify(anon)};\n`;
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  return res.status(200).send(body);
});

// static
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// routes
app.use('/u', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/pay', require('./routes/pay-daraja'));
app.use('/api/taxi', require('./routes/taxi'));
app.use('/api/boda', require('./routes/boda'));
app.use('/api/db', require('./routes/db'));

// health (works on Vercel via rewrite /healthz → /api/index.js)
app.get(['/healthz','/api/healthz'], (_req,res)=>res.json({ ok:true, mode:'real' }));

// local only (guard for Vercel)
const PORT = process.env.PORT || 5001;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log('TekeTeke REAL API listening on ' + PORT));
}

// 404 fallback to avoid hanging in serverless when route not matched
app.use((req, res, _next) => {
  res.status(404).json({ error: 'not_found', path: req.path, url: req.originalUrl });
});

// error handler (last)
app.use((err, req, res, _next) => {
  console.error(err);
  const id = req.headers['x-request-id'] || '';
  res.status(500).json({ error: 'server_error', request_id: id });
});

module.exports = app;
