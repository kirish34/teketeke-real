const $ = (sel) => document.querySelector(sel);
const fmt = (value) => new Intl.NumberFormat('en-KE').format(value || 0);

const state = {
  saccos: [],
  matatus: [],
  overview: null,
  ussdAvailable: [],
  ussdAllocated: [],
  logins: []
};

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error(err);
    notify(err.message || 'Failed to load console');
  });
});

async function init(){
  bindTabs();
  bindForms();
  await ensureSession();
  await refreshAll();
}

function bindTabs(){
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${tab.dataset.panel}`);
    });
  }));
}

function bindForms(){
  $('#opsRefresh')?.addEventListener('click', () => refreshAll(true));

  $('#saccoForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try{
      await postJSON('/api/admin/register-sacco', payload);
      form.reset();
      showStatus('saccoMsg', 'SACCO created', 'ok');
      await loadSaccos();
    }catch(e){
      showStatus('saccoMsg', e.message, 'err');
    }
  });

  $('#saccoFilter')?.addEventListener('input', (event) => {
    renderSaccos(event.target.value || '');
  });

  $('#matatuForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try{
      await postJSON('/api/admin/register-matatu', payload);
      form.reset();
      showStatus('matatuMsg', 'Vehicle registered', 'ok');
      await loadMatatus();
    }catch(e){
      showStatus('matatuMsg', e.message, 'err');
    }
  });

  $('#matatuFilter')?.addEventListener('change', () => renderMatatus());

  $('#ussdForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try{
      const res = await postJSON('/api/admin/ussd/pool/assign-next', payload);
      showStatus('ussdMsg', `Assigned ${res.ussd_code || 'code'}`, 'ok');
      event.currentTarget.reset();
      await loadUssd();
    }catch(e){
      showStatus('ussdMsg', e.message, 'err');
    }
  });
}

async function ensureSession(){
  const supa = await window.TT?.getSupabase?.();
  if (!supa) throw new Error('Supabase client not configured');
  const { data:{ session } } = await supa.auth.getSession();
  if (!session){
    location.href = '/public/auth/login.html?next=/public/ops/index.html';
    throw new Error('Redirecting to login');
  }
  $('#auth_state').textContent = `Signed in as ${session.user?.email || 'admin'}`;
  $('#opsLogout')?.addEventListener('click', async ()=>{
    try{ await supa.auth.signOut(); }catch(_){}
    location.href = '/public/auth/login.html';
  }, { once:true });
}

async function refreshAll(showToast){
  notify('');
  try{
    await Promise.all([
      loadOverview(),
      loadSaccos(),
      loadMatatus(),
      loadUssd(),
      loadLogins()
    ]);
    if (showToast) notify('Data updated');
  }catch(e){
    notify(e.message || 'Failed to refresh');
    throw e;
  }
}

async function loadOverview(){
  const data = await fetchJSON('/api/admin/system-overview');
  state.overview = data;
  $('#ov_saccos').textContent = fmt(data?.counts?.saccos);
  $('#ov_matatus').textContent = fmt(data?.counts?.matatus);
  $('#ov_staff').textContent = fmt(data?.counts?.cashiers);
  $('#ov_tx').textContent = fmt(data?.counts?.tx_today);
  $('#ov_pool_avail').textContent = fmt(data?.ussd_pool?.available);
  $('#ov_pool_total').textContent = fmt(data?.ussd_pool?.total);
}

async function loadSaccos(){
  const res = await fetchJSON('/api/admin/saccos');
  state.saccos = res?.items || [];
  renderSaccos($('#saccoFilter')?.value || '');
  renderSaccoOptions();
}

function renderSaccos(filter){
  const tbody = $('#saccoTable');
  if (!tbody) return;
  const list = state.saccos
    .filter(row => !filter || row.name.toLowerCase().includes(filter.toLowerCase()));
  if (!list.length){
    tbody.innerHTML = '<tr><td colspan="6">No SACCOs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(row => `
    <tr>
      <td>${row.name || ''}</td>
      <td>${row.contact_name || ''}</td>
      <td>${row.contact_phone || ''}</td>
      <td>${row.contact_email || ''}</td>
      <td>${row.default_till || ''}</td>
      <td class="mono">${row.id}</td>
    </tr>
  `).join('');
}

function renderSaccoOptions(){
  const select = $('#matatuSacco');
  const filter = $('#matatuFilter');
  if (!select || !filter) return;
  const options = ['<option value="">-- optional for taxi/boda --</option>']
    .concat(state.saccos.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`));
  select.innerHTML = options.join('');

  const filterOptions = ['<option value="">All SACCOS</option>']
    .concat(state.saccos.map(s => `<option value="${s.id}">${s.name}</option>`));
  filter.innerHTML = filterOptions.join('');
}

async function loadMatatus(){
  const res = await fetchJSON('/api/admin/matatus');
  state.matatus = res?.items || [];
  renderMatatus();
}

function renderMatatus(){
  const tbody = $('#matatuTable');
  if (!tbody) return;
  const filterId = $('#matatuFilter')?.value || '';
  const list = state.matatus.filter(row => !filterId || String(row.sacco_id || '') === filterId);
  if (!list.length){
    tbody.innerHTML = '<tr><td colspan="6">No vehicles found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(row => `
    <tr>
      <td>${row.number_plate || ''}</td>
      <td>${row.vehicle_type || ''}</td>
      <td>${row.sacco_id || '—'}</td>
      <td>${row.owner_name || ''}</td>
      <td>${row.owner_phone || ''}</td>
      <td>${row.till_number || ''}</td>
    </tr>
  `).join('');
}

async function loadUssd(){
  const [avail, alloc] = await Promise.all([
    fetchJSON('/api/admin/ussd/pool/available'),
    fetchJSON('/api/admin/ussd/pool/allocated')
  ]);
  state.ussdAvailable = avail?.items || [];
  state.ussdAllocated = alloc?.items || [];
  renderUssd();
}

function renderUssd(){
  const list = $('#ussdAvail');
  if (list){
    if (!state.ussdAvailable.length){
      list.innerHTML = '<li>No free codes.</li>';
    }else{
      list.innerHTML = state.ussdAvailable.slice(0,30).map(item => `<li>${item.full_code}</li>`).join('');
    }
  }
  const table = $('#ussdAlloc');
  if (table){
    if (!state.ussdAllocated.length){
      table.innerHTML = '<tr><td colspan="5">No allocations yet.</td></tr>';
    }else{
      table.innerHTML = state.ussdAllocated.slice(0,30).map(item => `
        <tr>
          <td>${item.full_code}</td>
          <td>${item.status}</td>
          <td>${item.allocated_to_type || '—'}</td>
          <td>${item.allocated_to_id || '—'}</td>
          <td>${item.allocated_at ? new Date(item.allocated_at).toLocaleString() : '—'}</td>
        </tr>
      `).join('');
    }
  }
}

async function loadLogins(){
  const data = await fetchJSON('/api/admin/user-roles/logins');
  state.logins = data || [];
  const tbody = $('#loginTable');
  if (!tbody) return;
  if (!state.logins.length){
    tbody.innerHTML = '<tr><td colspan="5">No records.</td></tr>';
    return;
  }
  tbody.innerHTML = state.logins.map(row => `
    <tr>
      <td>${row.email || '—'}</td>
      <td>${row.role || ''}</td>
      <td>${row.sacco_id || '—'}</td>
      <td>${row.matatu_id || '—'}</td>
      <td>${row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
    </tr>
  `).join('');
}

async function fetchJSON(url){
  const res = await fetch(url);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok){
    throw new Error(data?.error || data?.message || res.statusText);
  }
  return data;
}

async function postJSON(url, body){
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok){
    throw new Error(data?.error || data?.message || res.statusText);
  }
  return data;
}

function showStatus(id, text, variant='muted'){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status ${variant}`;
}

function notify(message){
  const box = $('#globalMsg');
  if (!box) return;
  box.textContent = message;
}
