const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const { validate, cashSchema } = require('../middleware/validate');

// Insert a cash transaction using user-scoped client (RLS enforced)
router.post('/cash', requireUser, validate(cashSchema), async (req, res) => {
  const { sacco_id, matatu_id, kind, amount, payer_name, payer_phone, notes } = req.body;
  const row = {
    sacco_id,
    matatu_id: matatu_id || null,
    kind,
    fare_amount_kes: amount,
    service_fee_kes: 0,
    status: 'SUCCESS',
    passenger_msisdn: payer_phone || null,
    notes: notes || payer_name || ''
  };
  const { data, error } = await req.supa
    .from('transactions')
    .insert(row)
    .select('*')
    .single();
  if (error) return res.status(403).json({ error: error.message });
  res.json(data);
});

module.exports = router;
