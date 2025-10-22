const express = require('express');
const { timingSafeEqual } = require('crypto');
const { supabaseAdmin } = require('../supabase');
const router = express.Router();
const DEBUG = process.env.DEBUG_ADMIN === '1';

function checkAdmin(req,res,next){
  const expected = (process.env.ADMIN_TOKEN || '');
  if (!expected) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  const got = String(req.headers['x-admin-token'] || '');
  const a = Buffer.from(expected), b = Buffer.from(got);
  if (a.length !== b.length) {
    if (DEBUG) console.warn('[admin] deny: len mismatch path=%s', req.path);
    return res.status(401).json({ error: 'admin token required' });
  }
  try {
    if (timingSafeEqual(a,b)) {
      if (DEBUG) console.log('[admin] ok path=%s', req.path);
      return next();
    }
  } catch (_) {}
  if (DEBUG) console.warn('[admin] deny: mismatch path=%s', req.path);
  return res.status(401).json({ error: 'admin token required' });
}
router.use(checkAdmin);

// Simple ping for UI testing
router.get('/ping', (_req,res)=> res.json({ ok:true }));

// Overview
router.get('/system-overview', async (_req, res) => {
  try {
    const [{ count: saccos }, { count: matatus }, { count: staff }, { data: txTodayRows }] = await Promise.all([
      supabaseAdmin.from('saccos').select('*', { count:'exact', head:true }),
      supabaseAdmin.from('matatus').select('*', { count:'exact', head:true }),
      supabaseAdmin.from('staff_profiles').select('*', { count:'exact', head:true }),
      supabaseAdmin.rpc('count_tx_today')
    ]);
    const { data: poolAvail } = await supabaseAdmin.from('ussd_pool').select('id').eq('status','AVAILABLE');
    const { data: poolAll }   = await supabaseAdmin.from('ussd_pool').select('id', { count: 'exact' });
    res.json({ counts: { saccos: saccos||0, matatus: matatus||0, cashiers: staff||0, tx_today: (txTodayRows||0) }, ussd_pool: { available: (poolAvail||[]).length, total: (poolAll?.length||0) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Saccos
router.get('/saccos', async (req,res)=>{
  let q = supabaseAdmin.from('saccos').select('*').order('created_at',{ascending:false});
  const filter = (req.query.q||'').trim();
  if (filter) q = q.ilike('name', `%${filter}%`);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data||[] });
});
router.post('/register-sacco', async (req,res)=>{
  const row = { name: req.body?.name, contact_name: req.body?.contact_name, contact_phone: req.body?.contact_phone, contact_email: req.body?.contact_email, default_till: req.body?.default_till };
  if(!row.name) return res.status(400).json({error:'name required'});
  const { data, error } = await supabaseAdmin.from('saccos').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
router.post('/update-sacco', async (req,res)=>{
  const { id, ...rest } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});
  const { data, error } = await supabaseAdmin.from('saccos').update(rest).eq('id',id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
router.delete('/delete-sacco/:id', async (req,res)=>{
  const { error } = await supabaseAdmin.from('saccos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: 1 });
});

// Matatus
router.get('/matatus', async (req,res)=>{
  let q = supabaseAdmin.from('matatus').select('*').order('created_at',{ascending:false});
  if (req.query.sacco_id) q = q.eq('sacco_id', req.query.sacco_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data||[] });
});
router.post('/register-matatu', async (req,res)=>{
  const row = { sacco_id: req.body?.sacco_id, number_plate: (req.body?.number_plate||'').toUpperCase(), owner_name: req.body?.owner_name, owner_phone: req.body?.owner_phone, vehicle_type: req.body?.vehicle_type, tlb_number: req.body?.tlb_number, till_number: req.body?.till_number };
  if(!row.sacco_id || !row.number_plate) return res.status(400).json({error:'sacco_id and number_plate required'});
  const { data, error } = await supabaseAdmin.from('matatus').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
router.post('/update-matatu', async (req,res)=>{
  const { id, ...rest } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});
  if (rest.number_plate) rest.number_plate = String(rest.number_plate).toUpperCase();
  const { data, error } = await supabaseAdmin.from('matatus').update(rest).eq('id',id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
router.delete('/delete-matatu/:id', async (req,res)=>{
  const { error } = await supabaseAdmin.from('matatus').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: 1 });
});

// USSD Pool
router.get('/ussd/pool/available', async (_req,res)=>{
  const { data, error } = await supabaseAdmin.from('ussd_pool').select('*').eq('status','AVAILABLE').order('base');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data||[] });
});
router.get('/ussd/pool/allocated', async (_req,res)=>{
  const { data, error } = await supabaseAdmin.from('ussd_pool').select('*').neq('status','AVAILABLE').order('allocated_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data||[] });
});
router.post('/ussd/pool/assign-next', async (req,res)=>{
  const prefix = req.body?.prefix || '*001*';
  let { data: row, error } = await supabaseAdmin.from('ussd_pool').select('*').eq('status','AVAILABLE').ilike('full_code', `${prefix}%`).order('base', {ascending:true}).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!row) {
    const alt = await supabaseAdmin.from('ussd_pool').select('*').eq('status','AVAILABLE').order('base', {ascending:true}).limit(1).maybeSingle();
    row = alt.data; error = alt.error;
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.json({ success:false, error:'no available codes' });
  }
  const upd = { status:'ALLOCATED', allocated_at: new Date().toISOString(), allocated_to_type: req.body?.level||'MATATU', allocated_to_id: req.body?.matatu_id || req.body?.sacco_id || null };
  const { error: ue } = await supabaseAdmin.from('ussd_pool').update(upd).eq('id', row.id);
  if (ue) return res.status(500).json({ error: ue.message });
  res.json({ success:true, ussd_code: row.full_code });
});
router.post('/ussd/bind-from-pool', async (req,res)=>{
  const code = req.body?.ussd_code;
  if (!code) return res.status(400).json({ success:false, error:'ussd_code required' });
  const { data: row, error } = await supabaseAdmin.from('ussd_pool').select('*').eq('status','AVAILABLE').eq('full_code', code).single();
  if (error) return res.status(404).json({ success:false, error:'code not in pool' });
  const upd = { status:'ALLOCATED', allocated_at: new Date().toISOString(), allocated_to_type: req.body?.level||'MATATU', allocated_to_id: req.body?.matatu_id || req.body?.sacco_id || null };
  const { error: ue } = await supabaseAdmin.from('ussd_pool').update(upd).eq('id', row.id);
  if (ue) return res.status(500).json({ success:false, error: ue.message });
  res.json({ success:true, ussd_code: code });
});

// Transactions for dashboard tables
router.get('/transactions/fees', async (_req,res)=>{
  const { data, error } = await supabaseAdmin.rpc('fees_today');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data||[] });
});
router.get('/transactions/loans', async (_req,res)=>{
  const { data, error } = await supabaseAdmin.rpc('loans_today');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data||[] });
});

// Staff, Loans (CRUD used by sacco dashboard)
router.get('/staff', async (req,res)=>{
  let q = supabaseAdmin.from('staff_profiles').select('*').order('created_at',{ascending:false});
  if (req.query.sacco_id) q = q.eq('sacco_id', req.query.sacco_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data||[] });
});
router.post('/staff', async (req,res)=>{
  const row = { sacco_id: req.body?.sacco_id, name: req.body?.name, phone: req.body?.phone, email: req.body?.email, role: req.body?.role||'SACCO_STAFF', user_id: req.body?.user_id||null };
  if(!row.sacco_id || !row.name) return res.status(400).json({error:'sacco_id and name are required'});
  const { data, error } = await supabaseAdmin.from('staff_profiles').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/loans', async (req,res)=>{
  let q = supabaseAdmin.from('loans').select('*').order('created_at',{ascending:false});
  if (req.query.sacco_id) q = q.eq('sacco_id', req.query.sacco_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data||[] });
});
router.post('/loans', async (req,res)=>{
  const row = { sacco_id: req.body?.sacco_id, matatu_id: req.body?.matatu_id||null, borrower_name: req.body?.borrower_name, principal_kes: req.body?.principal_kes||0, interest_rate_pct: req.body?.interest_rate_pct||0, term_months: req.body?.term_months||0, status: req.body?.status||'ACTIVE' };
  if(!row.sacco_id || !row.borrower_name) return res.status(400).json({error:'sacco_id and borrower_name are required'});
  const { data, error } = await supabaseAdmin.from('loans').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
