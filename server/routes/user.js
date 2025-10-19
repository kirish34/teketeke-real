const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');

// In real mode we read from Postgres (Supabase) via user-scoped client + RLS
router.get('/my-saccos', requireUser, async (req, res) => {
  const { data, error } = await req.supa.from('saccos').select('id,name').order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data||[]).map(s=>({ sacco_id:s.id, name:s.name })) });
});

router.get('/sacco/:id/matatus', requireUser, async (req, res) => {
  const { data, error } = await req.supa.from('matatus').select('*').eq('sacco_id', req.params.id).order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

router.get('/sacco/:id/transactions', requireUser, async (req, res) => {
  const limit = Number(req.query.limit||200);
  const { data, error } = await req.supa.from('transactions').select('*').eq('sacco_id', req.params.id).order('created_at',{ascending:false}).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

module.exports = router;
