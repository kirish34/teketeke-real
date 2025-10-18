const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url) throw new Error('Missing SUPABASE_URL');
if(!service) console.warn('[WARN] Missing SUPABASE_SERVICE_ROLE_KEY — admin endpoints will fail');
const supabaseAdmin = createClient(url, service || anon, { auth: { persistSession: false } });
const supabaseAnon  = createClient(url, anon || service, { auth: { persistSession: false } });
module.exports = { supabaseAdmin, supabaseAnon };
