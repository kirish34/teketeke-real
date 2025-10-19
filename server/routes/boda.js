const express = require('express');
const { requireUser } = require('../middleware/auth');
const router = express.Router();

// Summary for a given date (scaffold: returns zeros)
router.get('/summary', requireUser, async (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0,10));
  res.json({ summary: { till_today: 0, cash_today: 0, exp_today: 0 }, date });
});

// Recent cash entries (scaffold: empty list)
router.get('/cash', requireUser, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  res.json({ items: [], limit });
});

// Record a cash entry (scaffold: accepts, does not persist)
router.post('/cash', requireUser, async (req, res) => {
  const { amount, name = '', phone = '', notes = '' } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount required' });
  res.json({ ok: true, id: null, amount: Number(amount), name, phone, notes });
});

// Recent expense entries (scaffold: empty list)
router.get('/expenses', requireUser, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  res.json({ items: [], limit });
});

// Record an expense (scaffold: accepts, does not persist)
router.post('/expenses', requireUser, async (req, res) => {
  const { category = 'Other', amount, notes = '' } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount required' });
  res.json({ ok: true, id: null, category, amount: Number(amount), notes });
});

module.exports = router;

