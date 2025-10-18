const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

function base64(str){ return Buffer.from(str).toString('base64'); }

async function getAccessToken(){
  const key = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;
  const env = process.env.DARAJA_ENV || 'sandbox';
  const host = env==='production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const res = await fetch(host + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + base64(key + ':' + secret) }
  });
  if(!res.ok) throw new Error('Daraja token error: '+res.statusText);
  const j = await res.json();
  return j.access_token;
}

router.post('/stk', async (req,res)=>{
  const { phone, amount, code } = req.body||{};
  const env = process.env.DARAJA_ENV || 'sandbox';
  const shortcode = process.env.DARAJA_SHORTCODE;
  const passkey = process.env.DARAJA_PASSKEY;
  const callback = process.env.DARAJA_CALLBACK_URL || 'https://example.com/callback';
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
  const password = base64(shortcode + passkey + timestamp);

  if (!shortcode || !passkey) {
    // Fallback mock
    return res.json({ phone, amount:Number(amount||0), ussd_code:code||null, checkout_request_id:'CHK_'+Math.random().toString(36).slice(2,10).toUpperCase(), status:'QUEUED' });
  }
  try{
    const token = await getAccessToken();
    const host = env==='production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Number(amount||0),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callback,
      AccountReference: code || 'TEKETEKE',
      TransactionDesc: 'TekeTeke STK'
    };
    const r = await fetch(host + '/mpesa/stkpush/v1/processrequest', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if(!r.ok) return res.status(500).json(j);
    res.json({ phone, amount:Number(amount||0), ussd_code:code||null, checkout_request_id:j.CheckoutRequestID||null, status:'QUEUED' });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

router.post('/stk/callback', (req,res)=>{
  // For production, validate and persist result. For now just 200/OK.
  res.json({ ok:true });
});

module.exports = router;
