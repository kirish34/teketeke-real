import {
  ensureAuth,
  authFetch,
  getToken,
  mountServiceWorker,
  toast,
  el,
  fmtMoney,
  fmtDate,
  onNetChange,
  signOut
} from './shared/core.js';

const $ = el;
const NEXT_URL = '/public/mobile/index.html';
const QKEY = 'ttgo_queue_v2';

const state = {
  me: null,
  sacco: null,
  overview: null,
  vehicles: [],
  transactions: { fees: [], loans: [] },
  loans: [],
  queue: []
};

await ensureAuth({ next: NEXT_URL });
mountServiceWorker('/public/mobile/sw.js');

await initApp().catch((err) => {
  console.error(err);
  toast(err.message || 'Failed to load', 'err');
});

async function initApp(){
  bindUI();
  initTxRange();
  state.queue = readQueue();
  renderQueue();
  setNetBadge();
  await refreshAll();
  processQueue();
}

function bindUI(){
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => tab.addEventListener('click', () => switchPanel(tab.dataset.panel)));

  $('#homePayBtn')?.addEventListener('click', () => switchPanel('pay'));
  $('#refreshAll')?.addEventListener('click', () => refreshAll(true));
  $('#txReload')?.addEventListener('click', () => refreshTransactions(true));
  $('#verifyButton')?.addEventListener('click', () => refreshTransactions(true));

  $('#payButton')?.addEventListener('click', () => handlePayment('SACCO_FEE'));
  $('#loanPayBtn')?.addEventListener('click', () => handlePayment('LOAN_REPAY'));
  $('#ussdBtn')?.addEventListener('click', openSelectedUSSD);

  $('#payVehicle')?.addEventListener('change', updatePayCodeHint);

  $('#logoutBtn')?.addEventListener('click', async () => {
    await signOut().catch(()=>{});
    localStorage.removeItem(QKEY);
    location.href = '/public/auth/login.html';
  });

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const btn = $('#installBtn');
    if (btn) btn.hidden = false;
  });
  $('#installBtn')?.addEventListener('click', async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(()=>{});
    deferredPrompt = null;
    $('#installBtn').hidden = true;
  });

  onNetChange(() => {
    setNetBadge();
    if (navigator.onLine) processQueue();
  });
}

function initTxRange(){
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 7);
  if ($('#txFrom')) $('#txFrom').value = toISO(from);
  if ($('#txTo')) $('#txTo').value = toISO(to);
}

function toISO(date){
  return date.toISOString().slice(0,10);
}

function switchPanel(id){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${id}`));
}

async function refreshAll(showToast = false){
  setStatus('Refreshing…');
  await fetchProfile();
  await fetchVehicles();
  await Promise.all([fetchOverview(), fetchTransactions(), fetchLoans()]);
  renderSummary();
  renderVehicles();
  renderTransactionsTable();
  renderLoans();
  renderProfile();
  setStatus('Updated just now');
  if (showToast) toast('Data refreshed', 'ok');
}

async function fetchProfile(){
  const [me, saccoRes] = await Promise.all([
    authFetch('/u/me'),
    authFetch('/u/my-saccos').catch(()=>({ items: [] }))
  ]);
  state.me = me || null;
  state.sacco = saccoRes?.items?.[0] || null;
}

async function fetchVehicles(){
  const res = await authFetch('/u/vehicles');
  const vehicles = Array.isArray(res) ? res : (res?.items || []);
  state.vehicles = await Promise.all(vehicles.map(async (vehicle) => {
    try{
      const ussd = await authFetch(`/u/ussd?matatu_id=${vehicle.id}`);
      return { ...vehicle, ussd_code: ussd?.ussd_code || null };
    }catch{
      return { ...vehicle, ussd_code: null };
    }
  }));
}

async function fetchOverview(){
  if (!state.me?.sacco_id){
    state.overview = null;
    return;
  }
  try{
    state.overview = await authFetch('/u/sacco/overview');
  }catch(e){
    console.warn('overview failed', e);
    state.overview = null;
  }
}

async function fetchTransactions(){
  const [fees, loans] = await Promise.all([
    authFetch('/u/transactions?kind=fees'),
    authFetch('/u/transactions?kind=loans')
  ]);
  state.transactions.fees = normalizeRows(fees);
  state.transactions.loans = normalizeRows(loans);
}

async function fetchLoans(){
  if (!state.sacco?.sacco_id){
    state.loans = [];
    return;
  }
  const rows = await authFetch(`/u/sacco/${state.sacco.sacco_id}/loans`);
  state.loans = Array.isArray(rows) ? rows : (rows?.items || []);
}

function normalizeRows(payload){
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function relevantFees(){
  const list = state.transactions.fees || [];
  if (state.me?.matatu_id){
    return list.filter(tx => String(tx.matatu_id) === String(state.me.matatu_id));
  }
  if (state.sacco?.sacco_id){
    return list.filter(tx => String(tx.sacco_id) === String(state.sacco.sacco_id));
  }
  return list;
}

function renderSummary(){
  const fees = relevantFees();
  const todayTx = fees.find(isTodayTx) || null;
  const lastTx = fees[0] || null;

  const statusEl = $('#statusToday');
  if (statusEl){
    statusEl.textContent = todayTx ? 'PAID' : 'UNPAID';
    statusEl.classList.toggle('good', Boolean(todayTx));
    statusEl.classList.toggle('bad', !todayTx);
  }

  $('#amountDue').textContent = state.sacco?.default_till
    ? `Pay via ${state.sacco.default_till}`
    : 'Ask your SACCO admin';

  $('#lastPayment').textContent = lastTx
    ? `${fmtMoney(lastTx.amount || lastTx.fare_amount_kes || lastTx.principal_kes || 0)} · ${fmtDate(lastTx.created_at || lastTx.date)}`
    : 'No records yet';

  $('#metricVehicles').textContent = state.vehicles.length || 0;
  $('#metricFeesToday').textContent = fmtMoney(state.overview?.fees_today ?? sumToday(fees));
  $('#metricLoansToday').textContent = fmtMoney(state.overview?.loans_today ?? sumToday(state.transactions.loans));
  $('#metricQueue').textContent = state.queue.length || 0;
}

function sumToday(list){
  return (list || []).filter(isTodayTx).reduce((sum, row) => sum + Number(row.amount || row.fare_amount_kes || 0), 0);
}

function renderVehicles(){
  const listEl = $('#vehicleList');
  if (listEl){
    if (!state.vehicles.length){
      listEl.innerHTML = '<li>No vehicles linked to this login.</li>';
    }else{
      listEl.innerHTML = state.vehicles.map(v => (
        `<li><strong>${v.number_plate || v.plate}</strong> · ${v.vehicle_type || 'Vehicle'} · <span class="mono">${v.ussd_code || 'USSD pending'}</span></li>`
      )).join('');
    }
  }

  const select = $('#payVehicle');
  if (select){
    if (!state.vehicles.length){
      select.innerHTML = '<option value="">No vehicle</option>';
      select.disabled = true;
    }else{
      select.disabled = false;
      select.innerHTML = state.vehicles
        .map(v => `<option value="${v.id}">${v.number_plate || v.plate || v.id}</option>`)
        .join('');
      if (!Array.from(select.options).some(opt => opt.value === String(state.me?.matatu_id))){
        select.value = state.me?.matatu_id || select.options[0].value;
      }else{
        select.value = String(state.me?.matatu_id);
      }
    }
    updatePayCodeHint();
  }
}

function renderTransactionsTable(){
  const tbody = $('#txList');
  if (!tbody) return;
  const kindFilter = $('#txType')?.value || 'fees';
  const from = parseDate($('#txFrom')?.value);
  const to = parseDate($('#txTo')?.value);

  let dataset = [];
  if (kindFilter === 'loans') dataset = state.transactions.loans;
  else if (kindFilter === 'fees') dataset = relevantFees();
  else dataset = [...relevantFees(), ...state.transactions.loans];

  const filtered = dataset.filter(row => isWithinRange(row?.created_at || row?.date, from, to));
  if (!filtered.length){
    tbody.innerHTML = '<tr><td colspan="4">No transactions in this range.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(tx => `
    <tr>
      <td>${fmtDate(tx.created_at || tx.date)}</td>
      <td>${tx.kind || tx.type || 'N/A'}</td>
      <td>${fmtMoney(tx.amount || tx.fare_amount_kes || tx.principal_kes || 0)}</td>
      <td class="mono">${tx.external_id || tx.checkout_request_id || tx.ref || '—'}</td>
    </tr>
  `).join('');
}

function renderLoans(){
  $('#loanOutstanding').textContent = fmtMoney(state.loans.reduce((sum, loan) => sum + Number(loan.principal_kes || 0), 0));
  $('#loanNextDue').textContent = String(state.loans.filter(l => l.status === 'ACTIVE').length || 0) + ' active';
  const next = state.loans.find(l => l.next_due_date) || null;
  $('#loanNextDate').textContent = next ? fmtDate(next.next_due_date) : '--';

  const tbody = $('#loanTbody');
  if (tbody){
    if (!state.loans.length){
      tbody.innerHTML = '<tr><td colspan="6">No loans recorded for this SACCO.</td></tr>';
    }else{
      tbody.innerHTML = state.loans.map(loan => `
        <tr>
          <td>${loan.borrower_name || '—'}</td>
          <td>${loan.matatu_id || '—'}</td>
          <td>${fmtMoney(loan.principal_kes || 0)}</td>
          <td>${loan.interest_rate_pct || 0}%</td>
          <td>${loan.term_months || 0}m</td>
          <td>${loan.status || 'UNKNOWN'}</td>
        </tr>
      `).join('');
    }
  }
}

function renderProfile(){
  $('#pfUser').textContent = state.me?.email || '—';
  $('#pfRole').textContent = state.sacco?.role || state.me?.role || '—';
  $('#pfSacco').textContent = state.sacco?.name || '—';
  $('#pfVehicles').textContent = state.vehicles.map(v => v.number_plate || v.plate).join(', ') || '—';
}

function setStatus(text){
  const target = $('#statusMsg');
  if (target) target.textContent = text;
}

function parseDate(value){
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinRange(iso, from, to){
  if (!iso) return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  if (from && date < from) return false;
  if (to){
    const end = new Date(to);
    end.setHours(23,59,59,999);
    if (date > end) return false;
  }
  return true;
}

function isTodayTx(tx){
  if (!tx) return false;
  const date = new Date(tx.created_at || tx.date);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function setNetBadge(){
  const badge = $('#netBadge');
  if (!badge) return;
  const online = navigator.onLine;
  badge.textContent = online ? 'online' : 'offline';
  badge.classList.toggle('good', online);
  badge.classList.toggle('bad', !online);
}

function updatePayCodeHint(){
  const select = $('#payVehicle');
  const vehicle = state.vehicles.find(v => String(v.id) === (select?.value || ''));
  $('#payCode').textContent = vehicle?.ussd_code || state.sacco?.default_till || '—';
}

async function handlePayment(kind){
  const amountInput = kind === 'LOAN_REPAY' ? $('#loanPayAmount') : $('#payAmount');
  const phoneInput = $('#payPhone');
  const messageEl = kind === 'LOAN_REPAY' ? $('#loanMsg') : $('#payMsg');

  const amount = Number((amountInput?.value || '').trim());
  const phone = (phoneInput?.value || '').trim();
  if (!amount || amount <= 0){
    messageEl.textContent = 'Enter a valid amount.';
    return;
  }
  if (!phone){
    messageEl.textContent = 'Enter the phone number for the STK prompt.';
    return;
  }

  const vehicle = state.vehicles.find(v => String(v.id) === ($('#payVehicle')?.value || '')) || state.vehicles[0] || {};
  const payload = {
    amount,
    phone,
    vehicle_id: vehicle?.id || null,
    code: vehicle?.ussd_code || state.sacco?.default_till || 'TEKETEKE',
    kind,
    client_request_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  };

  messageEl.textContent = navigator.onLine ? 'Sending STK prompt…' : 'Offline. Saving to queue…';
  try{
    const result = await postOrQueue(payload);
    if (result.queued){
      messageEl.textContent = 'Queued for later. Will send once online.';
      return;
    }
    messageEl.textContent = result.status || 'QUEUED';
    toast('STK prompt sent', 'ok');
    await refreshTransactions();
  }catch(e){
    messageEl.textContent = e.message || 'Failed to send';
    toast(e.message || 'Payment failed', 'err');
  }
}

async function refreshTransactions(showToast = false){
  await fetchTransactions();
  renderSummary();
  renderTransactionsTable();
  if (showToast) toast('Transactions refreshed', 'ok');
}

function openSelectedUSSD(){
  const vehicle = state.vehicles.find(v => String(v.id) === ($('#payVehicle')?.value || '')) || state.vehicles[0];
  const code = vehicle?.ussd_code || state.sacco?.default_till;
  if (!code){
    toast('No USSD code assigned yet', 'warn');
    return;
  }
  window.location.href = `tel:${encodeURIComponent(code)}`;
}

function readQueue(){
  try{
    return JSON.parse(localStorage.getItem(QKEY) || '[]');
  }catch{
    return [];
  }
}

function writeQueue(items){
  state.queue = items;
  try{ localStorage.setItem(QKEY, JSON.stringify(items)); }catch{}
  renderQueue();
}

function enqueue(payload){
  const entry = { payload, created_at: Date.now() };
  const list = readQueue();
  list.push(entry);
  writeQueue(list);
}

async function postOrQueue(payload){
  if (!navigator.onLine){
    enqueue(payload);
    toast('Saved offline. Will sync later.', 'warn');
    return { queued: true };
  }
  return sendPayment(payload);
}

async function sendPayment(payload){
  const headers = { 'Content-Type':'application/json' };
  const token = await getToken().catch(()=>null);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api/pay/stk', {
    method:'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok){
    let msg = 'Request failed';
    try{
      const j = text ? JSON.parse(text) : null;
      msg = j?.error || j?.message || text || msg;
    }catch{
      msg = text || msg;
    }
    throw new Error(msg);
  }
  try{ return text ? JSON.parse(text) : {}; }catch{ return {}; }
}

async function processQueue(){
  if (!navigator.onLine) return;
  const queue = readQueue();
  if (!queue.length) return;
  const [next, ...rest] = queue;
  try{
    await sendPayment(next.payload);
    toast('Queued payment sent', 'ok');
    writeQueue(rest);
    setTimeout(processQueue, 400);
  }catch(e){
    console.warn('queue send failed', e);
  }
}

function renderQueue(){
  const badge = $('#queueBadge');
  const card = $('#queueCard');
  const list = $('#queueList');
  const size = state.queue.length;

  if (badge) badge.textContent = `${size} queued`;
  if (card) card.hidden = size === 0;
  if (list){
    if (!size){
      list.innerHTML = '<li>No pending offline payments.</li>';
    }else{
      list.innerHTML = state.queue.map(item => {
        const payload = item.payload || {};
        return `<li><strong>${fmtMoney(payload.amount || 0)}</strong> · ${payload.phone || ''} · ${new Date(item.created_at).toLocaleString()}</li>`;
      }).join('');
    }
  }
}
