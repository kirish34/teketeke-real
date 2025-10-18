const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../supabase');

// In real mode we read from Postgres (Supabase)
router.get('/my-saccos', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('saccos').select('id,name').order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data||[]).map(s=>({ sacco_id:s.id, name:s.name })) });
});

router.get('/sacco/:id/matatus', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('matatus').select('*').eq('sacco_id', req.params.id).order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

router.get('/sacco/:id/transactions', async (req, res) => {
  const limit = Number(req.query.limit||200);
  const { data, error } = await supabaseAdmin.from('transactions').select('*').eq('sacco_id', req.params.id).order('created_at',{ascending:false}).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

module.exports = router;
