// TekeTeke Go — PWA shell
import {} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Build Supabase client using the same config as dashboards
const sb = window.supabase?.createClient(window.SUPABASE_URL || '', window.SUPABASE_ANON_KEY || '');

// --- utilities ---
const $ = (id) => document.getElementById(id);
const toast = (t) => { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(window._tt_to); window._tt_to = setTimeout(()=> el.classList.remove('show'), 2200); };
const esc = (v)=> String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

function setNetBadge(){
  const b = $('netBadge');
  b.textContent = navigator.onLine ? 'online' : 'offline';
  b.style.background = navigator.onLine ? '#dcfce7' : '#fee2e2';
  b.style.color = navigator.onLine ? '#065f46' : '#991b1b';
}
window.addEventListener('online', setNetBadge);
window.addEventListener('offline', setNetBadge);

// --- auth helpers ---
async function getToken(){
  try { const { data:{ session } } = await sb.auth.getSession(); return session?.access_token || null; } catch { return null; }
}
function redirectToLogin(){
  location.href = '/public/auth/login.html?next=' + encodeURIComponent('/public/mobile/index.html');
}
async function authHeaders(){
  const h = { 'Content-Type': 'application/json' };
  const tok = await getToken();
  if (!tok) { redirectToLogin(); throw new Error('Not signed in'); }
  h['Authorization'] = 'Bearer ' + tok;
  return h;
}
async function handleResponse(r){
  if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
  const text = await r.text();
  if (!r.ok){
    let msg = r.statusText || 'Request failed';
    try{
      const j = text ? JSON.parse(text) : null;
      if (j && (j.error || j.message)) msg = j.error || j.message; else if (text) msg = text;
    }catch{ if (text) msg = text; }
    throw new Error(msg);
  }
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}
async function authedFetch(path, options={}){
  const r = await fetch(path, { ...options, headers: { ...(options.headers||{}), ...(await authHeaders()) }});
  return handleResponse(r);
}

// --- offline write queue (simple localStorage) ---
const QKEY = 'ttgo_queue_v1';
function readQ(){ try{ return JSON.parse(localStorage.getItem(QKEY)||'[]'); }catch{ return []; } }
function writeQ(arr){ try{ localStorage.setItem(QKEY, JSON.stringify(arr)); }catch{} }
async function processQueue(){
  if (!navigator.onLine) return;
  let q = readQ();
  if (!q.length) return;
  const next = q[0];
  try{
    const r = await fetch(next.url, { method:'POST', headers: next.headers||{}, body: JSON.stringify(next.body||{}) });
    await handleResponse(r);
    q.shift(); writeQ(q);
    setTimeout(processQueue, 50);
  }catch(e){
    // keep it for later
  }
}
window.addEventListener('online', processQueue);

async function postOrQueue(url, body){
  const headers = await authHeaders();
  if (navigator.onLine){
    const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body||{}) });
    return handleResponse(r);
  } else {
    const q = readQ();
    q.push({ url, body, headers });
    writeQ(q);
    toast('Queued to sync when online');
    return { queued:true };
  }
}

// --- UI: tabs ---
(function tabs(){
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const p = t.dataset.panel;
    document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
    $('panel-' + p).classList.add('active');
  }));
})();

// --- register service worker ---
if ('serviceWorker' in navigator){
  try { await navigator.serviceWorker.register('./sw.js'); } catch {}
}

// --- install prompt ---
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e; $('installBtn').hidden = false;
});
$('installBtn').addEventListener('click', async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('installBtn').hidden = true;
});

// --- logout ---
$('logoutBtn').addEventListener('click', async ()=>{
  try{ await sb.auth.signOut(); }catch{}
  try{ localStorage.removeItem(QKEY); }catch{}
  location.href = '/public/auth/login.html';
});

// --- Feature: USSD open ---
function openUSSD(code){ window.location.href = `tel:${encodeURIComponent(code)}`; }
$('ussdBtn').addEventListener('click', async ()=>{
  try{
    const r = await authedFetch('/u/ussd/code');
    openUSSD(r?.code || '*001*110#');
  }catch{ openUSSD('*001*110#'); }
});

// --- Home / Summary ---
async function loadSummary(){
  const s = await authedFetch('/u/me/summary');
  $('statusToday').textContent = s?.todayPaid ? 'PAID' : 'UNPAID';
  $('statusToday').style.background = s?.todayPaid ? '#dcfce7' : '#fee2e2';
  $('statusToday').style.color = s?.todayPaid ? '#065f46' : '#991b1b';
  $('amountDue').textContent = s?.amountDue != null ? `KES ${s.amountDue}` : '—';
  $('lastPayment').textContent = s?.lastTx ? `${s.lastTx.amount} @ ${s.lastTx.time}` : '—';
  $('vehicleList').innerHTML = (s?.vehicles||[]).map(v => `<li>${esc(v.number_plate || v.plate || '')} — ${esc(v.sacco || '')}</li>`).join('') || '<li>None</li>';
  // Profile
  $('pfUser').textContent = s?.user?.email || '—';
  $('pfRole').textContent = s?.role || (s?.user?.role || '—');
  $('pfSacco').textContent = s?.sacco || '—';
  $('pfVehicles').textContent = (s?.vehicles||[]).map(v=>v.number_plate||v.plate).join(', ') || '—';
}
$('homePayBtn').addEventListener('click', () => { document.querySelector('.tab[data-panel="pay"]').click(); });

// --- Pay ---
function randomId(){ return (typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now()+'-'+Math.random()); }
$('payButton').addEventListener('click', async ()=>{
  const amount = Number(($('payAmount').value||'').trim() || 0);
  if (!amount) { $('payMsg').textContent = 'Enter an amount'; return; }
  $('payMsg').textContent = 'Starting STK push…';
  const id = randomId();
  try{
    const r = await postOrQueue('/u/fees/pay', { amount, client_request_id: id });
    if (r.queued){ $('payMsg').textContent = 'Queued (offline). Will process when online.'; return; }
    $('payMsg').textContent = (r.status || 'PENDING');
    // poll for final status for a short while
    for (let i=0;i<8;i++){
      await new Promise(res => setTimeout(res, 1500));
      try{
        const t = await authedFetch('/u/fees/today');
        if (t?.paid){ $('payMsg').textContent = 'SUCCESS — Receipt '+(t?.tx?.ref || ''); await loadSummary(); return; }
      }catch{}
    }
    $('payMsg').textContent = 'Pending confirmation…';
  }catch(e){
    $('payMsg').textContent = e.message || 'Payment failed';
  }
});
$('verifyButton').addEventListener('click', async ()=>{
  $('payMsg').textContent = 'Checking today status…';
  try{
    const t = await authedFetch('/u/fees/today');
    $('payMsg').textContent = t?.paid ? ('SUCCESS — Receipt '+(t?.tx?.ref||'')) : 'Not paid yet';
    await loadSummary();
  }catch(e){ $('payMsg').textContent = e.message || 'Check failed'; }
});

// --- Transactions ---
function iso(d){ return d.toISOString().slice(0,10); }
(function initTxDates(){
  const to = new Date();
  const from = new Date(); from.setDate(to.getDate()-7);
  $('txFrom').value = iso(from);
  $('txTo').value = iso(to);
})();
$('txReload').addEventListener('click', loadTx);
async function loadTx(){
  const from = $('txFrom').value, to = $('txTo').value, type = $('txType').value;
  const q = new URLSearchParams({ from, to }); if (type) q.set('type', type);
  const data = await authedFetch('/u/transactions?'+q.toString());
  const list = Array.isArray(data) ? data : (data?.items || []);
  $('txList').innerHTML = list.map(tx => `<tr><td>${esc(tx.date||'')}</td><td>${esc(tx.type||'')}</td><td>${esc(tx.amount||'')}</td><td class="mono">${esc(tx.ref||'')}</td></tr>`).join('');
}

// --- Loans ---
async function loadLoans(){
  try{
    const s = await authedFetch('/u/loans/summary');
    $('loanOutstanding').textContent = s?.outstanding != null ? `KES ${s.outstanding}` : '—';
    $('loanNextDue').textContent = s?.next_amount != null ? `KES ${s.next_amount}` : '—';
    $('loanNextDate').textContent = s?.next_date || '—';
  }catch{}
}
$('loanPayBtn').addEventListener('click', async ()=>{
  const amt = Number(($('loanPayAmount').value||'').trim()||0);
  if (!amt){ $('loanMsg').textContent = 'Enter amount'; return; }
  $('loanMsg').textContent = 'Starting loan repayment…';
  const id = randomId();
  try{
    const r = await postOrQueue('/u/loans/pay', { amount: amt, client_request_id: id });
    if (r.queued){ $('loanMsg').textContent = 'Queued (offline). Will process when online.'; return; }
    $('loanMsg').textContent = r.status || 'PENDING';
    setTimeout(loadLoans, 1500);
  }catch(e){ $('loanMsg').textContent = e.message || 'Failed'; }
});

// --- init ---
(async function init(){
  setNetBadge();
  // require session
  const tok = await getToken();
  if (!tok) return redirectToLogin();

  // load data
  try{
    await loadSummary();
    await loadTx();
    await loadLoans();
  }catch(e){ console.error(e); toast(e.message || 'Load error'); }

  // start queue processor
  processQueue();
})();
