const express = require('express');
const { requireUser } = require('../middleware/auth');
const router = express.Router();

// Summary for a given date (per-user)
router.get('/summary', requireUser, async (req, res) => {
  try{
    const dateStr = String(req.query.date || new Date().toISOString().slice(0,10));
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(new Date(start).getTime() + 24*3600*1000);

    const [cashRes, expRes] = await Promise.all([
      req.supa.from('taxi_cash_entries').select('amount,created_at').order('created_at',{ascending:false}),
      req.supa.from('taxi_expense_entries').select('amount,created_at').order('created_at',{ascending:false}),
    ]);
    if (cashRes.error) return res.status(500).json({ error: cashRes.error.message });
    if (expRes.error) return res.status(500).json({ error: expRes.error.message });

    const cashToday = (cashRes.data||[]).filter(r=>{
      const t = new Date(r.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).reduce((a,b)=> a + Number(b.amount||0), 0);
    const expToday = (expRes.data||[]).filter(r=>{
      const t = new Date(r.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).reduce((a,b)=> a + Number(b.amount||0), 0);

    res.json({ summary: { till_today: 0, cash_today: cashToday, exp_today: expToday }, date: dateStr });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Recent cash entries
router.get('/cash', requireUser, async (req, res) => {
  try{
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
    const { data, error } = await req.supa
      .from('taxi_cash_entries')
      .select('id,created_at,amount,name,phone,notes')
      .order('created_at', { ascending:false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data||[], limit });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Record a cash entry
router.post('/cash', requireUser, async (req, res) => {
  try{
    const { amount, name = '', phone = '', notes = '' } = req.body || {};
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount required' });
    const row = { user_id: req.user.id, amount: Number(amount), name, phone, notes };
    const { data, error } = await req.supa.from('taxi_cash_entries').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Recent expense entries
router.get('/expenses', requireUser, async (req, res) => {
  try{
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
    const { data, error } = await req.supa
      .from('taxi_expense_entries')
      .select('id,created_at,category,amount,notes')
      .order('created_at', { ascending:false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data||[], limit });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Record an expense
router.post('/expenses', requireUser, async (req, res) => {
  try{
    const { category = 'Other', amount, notes = '' } = req.body || {};
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount required' });
    const row = { user_id: req.user.id, category: String(category||'Other'), amount: Number(amount), notes };
    const { data, error } = await req.supa.from('taxi_expense_entries').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

module.exports = router;
