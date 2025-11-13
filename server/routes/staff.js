const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z } = require('zod');

// Accept broader inputs for SACCO Staff UI and normalize
const staffCashSchema = z.object({
  sacco_id: z.string().uuid(),
  matatu_id: z.string().uuid().optional().nullable(),
  kind: z.enum(['SACCO_FEE','SAVINGS','LOAN_REPAY','CASH','DAILY_FEE']).default('SACCO_FEE'),
  amount: z.number().int().positive().max(1_000_000),
  payer_name: z.string().min(0).max(120).optional().default(''),
  // Allow either E.164 2547xxxxxxxx, local 07xxxxxxxx, or empty
  payer_phone: z.string()
    .regex(/^(2547\d{8}|07\d{8})$/u, 'Phone must be 2547xxxxxxxx or 07xxxxxxxx')
    .optional()
    .default(''),
  notes: z.string().max(500).optional().default('')
});

// Insert a cash transaction using user-scoped client (RLS enforced)
router.post('/cash', requireUser, validate(staffCashSchema), async (req, res) => {
  try {
    let { sacco_id, matatu_id, kind, amount, payer_name, payer_phone, notes } = req.body;

    // Map Daily Fee alias to canonical kind used in DB
    if (kind === 'DAILY_FEE') kind = 'SACCO_FEE';

    // Normalize phone to E.164 2547xxxxxxxx if user typed 07xxxxxxxx
    if (payer_phone && /^07\d{8}$/.test(payer_phone)) {
      payer_phone = '254' + payer_phone.slice(1);
    }

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

    const { data, error } = await req.supa
      .from('transactions')
      .insert(row)
      .select('*')
      .single();
    if (error) return res.status(403).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to record cash entry' });
  }
});

module.exports = router;
