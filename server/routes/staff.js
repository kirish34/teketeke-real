const express = require('express');
const { supabaseAdmin } = require('../supabase');
const router = express.Router();

router.post('/cash', async (req, res) => {
  const { sacco_id, matatu_id, kind='DAILY_FEE', amount=0, payer_name='', payer_phone='', notes='' } = req.body||{};
  if(!sacco_id || !matatu_id) return res.status(400).json({ error:'sacco_id and matatu_id are required' });
  const row = {
    sacco_id, matatu_id, kind: kind==='DAILY_FEE' ? 'SACCO_FEE' : kind,
    fare_amount_kes: Number(amount||0), service_fee_kes: 0, status: 'SUCCESS',
    passenger_msisdn: payer_phone, notes
  };
  const { data, error } = await supabaseAdmin.from('transactions').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
