const express = require('express');
const { requireUser } = require('../middleware/auth');
const { supabaseAdmin } = require('../supabase');

if (!supabaseAdmin) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to serve mobile endpoints');
}

const router = express.Router();

router.use(requireUser);

const PG_ROW_NOT_FOUND = 'PGRST116';

function startOfDayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

async function getRoleRow(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== PG_ROW_NOT_FOUND) {
    throw error;
  }
  return data || null;
}

async function getMatatu(rowMatatuId) {
  if (!rowMatatuId) return null;
  const { data, error } = await supabaseAdmin
    .from('matatus')
    .select('id,sacco_id,number_plate')
    .eq('id', rowMatatuId)
    .maybeSingle();
  if (error && error.code !== PG_ROW_NOT_FOUND) throw error;
  return data || null;
}

async function getSaccoDetails(saccoId) {
  if (!saccoId) return null;
  const { data, error } = await supabaseAdmin
    .from('saccos')
    .select('id,name,contact_name,contact_phone,contact_email,default_till')
    .eq('id', saccoId)
    .maybeSingle();
  if (error && error.code !== PG_ROW_NOT_FOUND) throw error;
  return data || null;
}

async function getSaccoContext(userId) {
  const role = await getRoleRow(userId);
  if (!role) return { role: null, saccoId: null, matatu: null };
  if (role.sacco_id) {
    return { role, saccoId: role.sacco_id, matatu: null };
  }
  if (role.matatu_id) {
    const matatu = await getMatatu(role.matatu_id);
    return { role, saccoId: matatu?.sacco_id || null, matatu };
  }
  return { role, saccoId: null, matatu: null };
}

async function ensureSaccoAccess(userId, requestedId) {
  const ctx = await getSaccoContext(userId);
  if (!ctx.saccoId) return { allowed: false, ctx };
  const match = String(ctx.saccoId) === String(requestedId);
  return { allowed: match, ctx };
}

async function ensureMatatuAccess(userId, requestedId) {
  const ctx = await getSaccoContext(userId);
  if (!requestedId) return { allowed: false, ctx, matatu: null };
  const matatu = await getMatatu(requestedId);
  if (!matatu) return { allowed: false, ctx, matatu: null };

  // Direct matatu roles must match the exact vehicle
  if (ctx.matatu) {
    const match = String(ctx.matatu.id) === String(requestedId);
    return { allowed: match, ctx, matatu };
  }

  // Otherwise fall back to sacco-scoped access
  if (ctx.saccoId && String(matatu.sacco_id) === String(ctx.saccoId)) {
    return { allowed: true, ctx, matatu };
  }
  return { allowed: false, ctx, matatu };
}

router.get('/my-saccos', async (req, res) => {
  try {
    const ctx = await getSaccoContext(req.user.id);
    if (!ctx.saccoId) return res.json({ items: [] });
    const sacco = await getSaccoDetails(ctx.saccoId);
    if (!sacco) return res.json({ items: [] });
    res.json({
      items: [
        {
          sacco_id: sacco.id,
          name: sacco.name,
          contact_name: sacco.contact_name,
          contact_phone: sacco.contact_phone,
          contact_email: sacco.contact_email,
          default_till: sacco.default_till,
          role: ctx.role?.role || null,
          via: ctx.matatu ? 'matatu' : 'direct',
          matatu_id: ctx.matatu?.id || null,
          matatu_plate: ctx.matatu?.number_plate || null,
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load saccos' });
  }
});

router.get('/sacco/:id/matatus', async (req, res) => {
  const saccoId = req.params.id;
  try {
    const { allowed, ctx } = await ensureSaccoAccess(req.user.id, saccoId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    let query = supabaseAdmin
      .from('matatus')
      .select('*')
      .eq('sacco_id', saccoId)
      .order('number_plate', { ascending: true });
    if (ctx.role?.matatu_id && ctx.matatu?.id) {
      query = query.eq('id', ctx.matatu.id);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load matatus' });
  }
});

router.get('/sacco/:id/transactions', async (req, res) => {
  const saccoId = req.params.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 2000);
  try {
    const { allowed, ctx } = await ensureSaccoAccess(req.user.id, saccoId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    let query = supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('sacco_id', saccoId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (ctx.role?.matatu_id && ctx.matatu?.id) {
      // Matatu-scoped roles only see their vehicle's records
      query = query.eq('matatu_id', ctx.matatu.id);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load transactions' });
  }
});

router.get('/matatu/:id/transactions', async (req, res) => {
  const matatuId = req.params.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 2000);
  try {
    const { allowed, matatu } = await ensureMatatuAccess(req.user.id, matatuId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('matatu_id', matatu.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load transactions' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const role = await getRoleRow(req.user.id);
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: role?.role || 'USER',
      sacco_id: role?.sacco_id || null,
      matatu_id: role?.matatu_id || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load profile' });
  }
});

router.get('/vehicles', async (req, res) => {
  try {
    const role = await getRoleRow(req.user.id);
    let query = supabaseAdmin.from('matatus').select('*').order('created_at', { ascending: false });
    if (role?.sacco_id) query = query.eq('sacco_id', role.sacco_id);
    if (role?.matatu_id) query = query.eq('id', role.matatu_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load vehicles' });
  }
});

router.get('/sacco/overview', async (req, res) => {
  try {
    const role = await getRoleRow(req.user.id);
    if (!role?.sacco_id) return res.status(403).json({ error: 'No SACCO assignment' });
    const saccoId = role.sacco_id;

    const [matatusRes, feesRes, loansRes] = await Promise.all([
      supabaseAdmin.from('matatus').select('id').eq('sacco_id', saccoId),
      supabaseAdmin
        .from('fees_payments')
        .select('amount')
        .eq('sacco_id', saccoId)
        .gte('created_at', startOfDayISO())
        .lte('created_at', endOfDayISO()),
      supabaseAdmin
        .from('loan_payments')
        .select('amount')
        .eq('sacco_id', saccoId)
        .gte('created_at', startOfDayISO())
        .lte('created_at', endOfDayISO()),
    ]);

    if (matatusRes.error) throw matatusRes.error;
    if (feesRes.error) throw feesRes.error;
    if (loansRes.error) throw loansRes.error;

    const activeMatatus = (matatusRes.data || []).length;
    const feesTotal = (feesRes.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const loansTotal = (loansRes.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

    res.json({
      sacco_id: saccoId,
      active_matatus: activeMatatus,
      fees_today: feesTotal,
      loans_today: loansTotal,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load overview' });
  }
});

router.get('/ussd', async (req, res) => {
  try {
    const matatuId = req.query.matatu_id;
    if (!matatuId) return res.status(400).json({ error: 'matatu_id required' });
    const { data, error } = await supabaseAdmin
      .from('ussd_allocations')
      .select('full_code')
      .eq('matatu_id', matatuId)
      .order('allocated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const code = data && data.length ? data[0].full_code : null;
    res.json({ matatu_id: matatuId, ussd_code: code });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load USSD code' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const role = await getRoleRow(req.user.id);
    const kind = String(req.query.kind || 'fees').toLowerCase();
    const table = kind === 'loans' ? 'loan_payments' : 'fees_payments';

    let query = supabaseAdmin.from(table).select('*').order('created_at', { ascending: false }).limit(200);
    if (role?.sacco_id) query = query.eq('sacco_id', role.sacco_id);
    if (role?.matatu_id) query = query.eq('matatu_id', role.matatu_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load transactions' });
  }
});

module.exports = router;
