const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const { supabaseAdmin } = require('../supabase');
const { validate } = require('../middleware/validate');
const { z } = require('zod');

// Accept broader inputs for SACCO Staff UI and normalize
const staffCashSchema = z.object({
  sacco_id: z.string().uuid(),
  matatu_id: z.string().uuid().optional().nullable(),
  kind: z.enum(['SACCO_FEE','SAVINGS','LOAN_REPAY','CASH','DAILY_FEE']).default('SACCO_FEE'),
  amount: z.number().int().positive().max(1_000_000),
  payer_name: z.string().min(0).max(120).optional().default(''),
  // Allow either E.164 2547xxxxxxxx, local 07xxxxxxxx, or empty string
  payer_phone: z.union([
      z.literal(''),
      z.string().regex(/^(2547\d{8}|07\d{8})$/u, 'Phone must be 2547xxxxxxxx or 07xxxxxxxx')
    ])
    .optional()
    .default(''),
  notes: z.string().max(500).optional().default('')
});

// Insert a cash transaction using user-scoped client (RLS enforced)
router.post('/cash', requireUser, validate(staffCashSchema), async (req, res) => {
  try {
    let { sacco_id, matatu_id, kind, amount, payer_name, payer_phone, notes } = req.body;

    if (kind === 'DAILY_FEE') kind = 'SACCO_FEE';
    if (payer_phone && /^07\d{8}$/.test(payer_phone)) payer_phone = '254' + payer_phone.slice(1);

    const row = {
      sacco_id,
      matatu_id: matatu_id || null,
      kind,
      fare_amount_kes: amount,
      service_fee_kes: 0,
      status: 'SUCCESS',
      passenger_msisdn: payer_phone || null,
      notes: (notes || payer_name || '').toString()
    };

    // First try with user-scoped client (RLS)
    let ins = await req.supa.from('transactions').insert(row).select('*').single();
    if (!ins.error && ins.data) return res.json(ins.data);

    // Fallback: verify authorization and upsert using service role to avoid RLS recursion issues
    if (supabaseAdmin) {
      // Check this user is allowed to write for the sacco
      // 1) staff_profiles (SYSTEM_ADMIN or matching sacco_id)
      // 2) user_roles with matching sacco_id (or matatu.role whose sacco matches)
      let allowed = false;
      try {
        const { data: profs } = await supabaseAdmin
          .from('staff_profiles')
          .select('role,sacco_id')
          .eq('user_id', req.user.id);
        if (Array.isArray(profs)) {
          allowed = profs.some(r => r.role === 'SYSTEM_ADMIN' || String(r.sacco_id) === String(sacco_id));
        }
      } catch (_) {}

      if (!allowed) {
        try {
          const { data: roles } = await supabaseAdmin
            .from('user_roles')
            .select('role,sacco_id,matatu_id')
            .eq('user_id', req.user.id);
          if (Array.isArray(roles)) {
            allowed = roles.some(r => String(r.sacco_id || '') === String(sacco_id));
            if (!allowed) {
              const matatuIds = (roles || []).map(r => r.matatu_id).filter(Boolean);
              if (matatuIds.length) {
                const { data: mats } = await supabaseAdmin
                  .from('matatus')
                  .select('id,sacco_id')
                  .in('id', matatuIds);
                if (Array.isArray(mats)) {
                  allowed = mats.some(m => String(m.sacco_id) === String(sacco_id));
                }
              }
            }
          }
        } catch (_) {}
      }

      if (!allowed) {
        const msg = ins?.error?.message || 'Forbidden';
        return res.status(403).json({ error: msg });
      }

      const alt = await supabaseAdmin.from('transactions').insert(row).select('*').single();
      if (alt.error) return res.status(500).json({ error: alt.error.message || 'Failed to record cash entry' });
      return res.json(alt.data);
    }

    // No admin client available — surface the original error
    return res.status(403).json({ error: ins?.error?.message || 'Forbidden' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to record cash entry' });
  }
});

module.exports = router;
