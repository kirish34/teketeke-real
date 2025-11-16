
  (async function(){
    try{
      await requireRole('SACCO', { statusEl:'auth_state', roleLabel:'SACCO Admin' });
    }catch(_){
      return;
    }
    const $ = id => document.getElementById(id);
    const isoDate = d => new Date(d).toISOString().slice(0,10);
    const today = isoDate(new Date());
    const fmtKES = n => Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});

    let supaClient = null;

    async function ensureSupabase(){
      if (window.TT && typeof window.TT.getSupabase === 'function'){
        try{ return await window.TT.getSupabase(); }catch(_){ /* ignore */ }
      }
      if (supaClient) return supaClient;
      try{
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        const url = window.SUPABASE_URL || '';
        const anon = window.SUPABASE_ANON_KEY || '';
        if (!url || !anon) return null;
        supaClient = createClient(url, anon);
        return supaClient;
      }catch(err){
        console.warn('[sacco] failed to init supabase', err);
        return null;
      }
    }

    function friendlyName(user){
      if(!user) return 'SACCO Admin';
      const meta = user.user_metadata || {};
      const email = user.email || '';
      return meta.full_name || meta.name || meta.display_name || meta.displayName || (email ? email.split('@')[0] : 'SACCO Admin');
    }

    function startClock(){
      const el = $('dateTimeLine');
      if(!el) return;
      const tick = ()=>{ el.textContent = new Date().toLocaleString(); };
      tick();
      setInterval(tick, 1000);
    }
    startClock();

    async function setupSessionUi(){
      const pill = $('auth_state');
      const welcome = $('welcomeLine');
      try{
        const supa = await ensureSupabase();
        if(!supa){
          if (pill) pill.textContent = 'Sign-in unavailable';
          return;
        }
        const { data:{ session } } = await supa.auth.getSession();
        const user = session?.user || null;
        if (pill) pill.textContent = user?.email ? `Signed in as ${user.email}` : 'Not signed in';
        if (welcome) welcome.textContent = `Hello, ${friendlyName(user)}`;
        const btn = $('logoutBtn');
        if (btn && !btn.dataset.bound){
          btn.dataset.bound = '1';
          btn.addEventListener('click', async ()=>{
            btn.disabled = true;
            try{ await supa.auth.signOut(); }catch(_){}
            ['auth_token','tt_root_token','tt_admin_token'].forEach(k=>localStorage.removeItem(k));
            location.href = '/public/auth/login.html';
          });
        }
      }catch(err){
        console.warn('[sacco] session ui error', err);
        if (pill) pill.textContent = 'Sign-in error';
      }
    }
    setupSessionUi();

    async function parse(res){
      const t = await res.text();
      let j = {};
      try { j = t ? JSON.parse(t) : {}; } catch { j = { error: t || res.statusText }; }
      if (!res.ok) throw new Error(j.error||j.message||res.statusText||'Request failed');
      return j;
    }
    async function jget(path){
      return parse(await fetch(path,{ headers:{ Accept:'application/json' }}));
    }

    async function loadNotifications(){
      const card = document.getElementById('notifCard');
      const listEl = document.getElementById('notifList');
      if (!card || !listEl || !currentSacco) return;

      const messages = [];

      // Pending loan requests
      try{
        const res = await jget(`/u/sacco/${currentSacco}/loan-requests?status=PENDING`);
        const pending = (res.items||[]).length;
        if (pending > 0){
          messages.push(`${pending} pending loan request${pending>1?'s':''}`);
        }
      }catch(_){}

      // Loan repayments recorded today
      try{
        const tx = await jget('/u/transactions?kind=loans');
        const rows = tx.data || tx.items || [];
        const todayISO = new Date().toISOString().slice(0,10);
        const todayCount = (rows||[]).filter(r=>String(r.created_at||'').slice(0,10)===todayISO).length;
        if (todayCount > 0){
          messages.push(`${todayCount} loan repayment${todayCount>1?'s':''} recorded today`);
        }
      }catch(_){}

      // Matatus without daily fee yesterday
      try{
        if (matatuMap && matatuMap.size){
          const y = new Date(); y.setDate(y.getDate()-1);
          const yISO = y.toISOString().slice(0,10);
          const tx = await jget(`/u/sacco/${currentSacco}/transactions?limit=2000`);
          const items = tx.items || tx || [];
          const paid = new Set(
            (items||[])
              .filter(t=>String(t.kind||'').toUpperCase()==='SACCO_FEE' && String(t.created_at||'').slice(0,10)===yISO)
              .map(t=>String(t.matatu_id||''))
          );
          const allIds = Array.from(matatuMap.keys()).map(String);
          const unpaid = allIds.filter(id=>id && !paid.has(id));
          if (unpaid.length){
            messages.push(`Daily fee missing yesterday for ${unpaid.length} matatu(s)`);
          }
        }
      }catch(_){}

      if (!messages.length){
        card.style.display = 'none';
        listEl.innerHTML = '';
      }else{
        listEl.innerHTML = messages.map(m=>`<li>${m}</li>`).join('');
        card.style.display = 'block';
      }
    }

    // Tabs (delegated, with aria)
    (function setupTabs(){
      const tabsWrap = document.querySelector('.tabs');
      if(!tabsWrap) return;
      tabsWrap.addEventListener('click', (e)=>{
        const tab = e.target.closest('.tab'); if(!tab) return;
        const id = tab.getAttribute('data-panel');
        document.querySelectorAll('.tab').forEach(t=>{
          const sel = t===tab;
          t.classList.toggle('active', sel);
          t.setAttribute('aria-selected', sel ? 'true' : 'false');
        });
        document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
        const panel = document.getElementById(id);
        if(panel){ panel.classList.add('active'); panel.scrollTop=0; }
      });
    })();

    // Date defaults (today only)
    $('toDate').value = today;
    $('fromDate').value = today;

    let currentSacco = null;
    let matatuMap = new Map();
    let routeRecWatchId = null;
    let routeRecBuf = [];
    let gmapApiLoading = null;
    let gmapMap = null;
    let gmapRoutePolyline = null;
    let gmapTrafficLayer = null;
    let gmapLiveMarkers = new Map();
    let liveLastCount = 0;
    let liveLastTs = null;
    const saccoNames = new Map();
    const headlineEl = document.getElementById('saccoHeadline');
    const defaultHeadline = 'SACCO Dashboard';
    function updateHeadlineFor(id){
      if(!headlineEl) return;
      const label = id ? (saccoNames.get(id) || id) : '';
      const trimmed = (label || '').trim();
      if(!trimmed){
        headlineEl.textContent = defaultHeadline;
        return;
      }
      const endsWithSacco = /\bsacco\b$/i.test(trimmed);
      headlineEl.textContent = endsWithSacco ? `${trimmed} Dashboard` : `${trimmed} SACCO Dashboard`;
    }

    async function loadSaccos(){
      const sel = $('saccoSelect');
      sel.innerHTML = '<option value="">- choose -</option>';
      const res = await jget('/u/my-saccos');
      const items = res.items || [];
      saccoNames.clear();
      items.forEach(s=>{
        const o=document.createElement('option');
        o.value = s.sacco_id;
        o.textContent = s.name || s.sacco_id;
        sel.appendChild(o);
        saccoNames.set(s.sacco_id, s.name || s.sacco_id);
      });
      $('statusMsg').textContent = `${items.length} SACCO(s)`;
      if(items.length){
        sel.value = items[0].sacco_id;
        currentSacco = sel.value;
        updateHeadlineFor(currentSacco);
      } else {
        currentSacco = null;
        updateHeadlineFor(null);
      }
    }

    async function loadMatatus(){
      if(!currentSacco) return;
      const data = await jget(`/u/sacco/${currentSacco}/matatus`);
      matatuMap = new Map((data.items||[]).map(m=>[m.id,m.number_plate||'']));
      // Keep full matatu details for loan owner validation
      window._matatuFull = new Map((data.items||[]).map(m=>[m.id, m]));
      const q = $('matatuSearch').value.trim().toUpperCase();
      const rows = (data.items||[]).filter(m => !q || (m.number_plate||'').toUpperCase().includes(q));
      const T = $('matatuTbody'); T.innerHTML = '';
      rows.forEach(m=>{
        const tr = document.createElement('tr');
        tr.innerHTML =
          `<td>${m.number_plate||''}</td><td>${m.owner_name||''}</td><td>${m.owner_phone||''}</td>`+
          `<td>${m.vehicle_type||''}</td><td>${m.tlb_number||''}</td><td>${m.till_number||''}</td>`;
        T.appendChild(tr);
      });
      $('matatuCount').textContent = `${rows.length} matatu(s)`;

      // Daily fee type select: distinct vehicle types for this SACCO
      const typeSel = document.getElementById('dfTypeSelect');
      if (typeSel){
        const seen = new Set();
        typeSel.innerHTML = '<option value="">- choose type -</option>';
        (data.items||[]).forEach(m=>{
          const vt = (m.vehicle_type||'').toString().trim();
          if (!vt || seen.has(vt)) return;
          seen.add(vt);
          const o=document.createElement('option');
          o.value = vt;
          o.textContent = vt;
          typeSel.appendChild(o);
        });
      }

      // loans matatu select
      const sel = $('lnMatatu');
      sel.innerHTML = '<option value="">- choose Matatu -</option>';
      (data.items||[]).forEach(m=>{
        const o=document.createElement('option');
        o.value=m.id; o.textContent=m.number_plate + (m.owner_name ? (' - ' + m.owner_name) : '');
        sel.appendChild(o);
      });
      // When matatu changes, auto-fill borrower as the owner and lock it
      sel.onchange = ()=>{
        const id = sel.value;
        const m = window._matatuFull?.get(id) || null;
        const owner = (m && (m.owner_name||'')) || '';
        const b = $('lnBorrower');
        b.value = owner;
        try { updateLoanSummary && updateLoanSummary(); } catch(_){ }
      };
    }

    function withinRange(ts,fromIso,toIso){
      const d = isoDate(ts);
      return d>=fromIso && d<=toIso;
    }
    function groupByDay(items){
      const map = new Map();
      items.forEach(tx=>{
        const day = isoDate(tx.created_at);
        map.set(day,(map.get(day)||0) + Number(tx.kind==='SACCO_FEE' ? (tx.fare_amount_kes||0) : 0));
      });
      const labels=[]; const values=[];
      const start=new Date($('fromDate').value+'T00:00:00');
      const end=new Date($('toDate').value+'T00:00:00');
      for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
        const key=isoDate(d);
        labels.push(key);
        values.push(map.get(key)||0);
      }
      return {labels, values};
    }

    function renderChart(id,label,labels,values){
      const ctx=document.getElementById(id);
      if(ctx._inst) ctx._inst.destroy();
      ctx._inst=new Chart(ctx,{
        type:'line',
        data:{ labels, datasets:[{ label, data:values, borderColor:'#1976d2', backgroundColor:'transparent', tension:.25 }] },
        options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
      });
    }

    async function loadTxAndTotals(){
      if(!currentSacco) return;
      const res = await jget(`/u/sacco/${currentSacco}/transactions?limit=1000`);
      const fromIso=$('fromDate').value, toIso=$('toDate').value, status=$('txStatus').value;
      const all=(res.items||[]).filter(tx=>withinRange(tx.created_at,fromIso,toIso));
      const items = status ? all.filter(tx=>(tx.status||'')===status) : all;

      const dailyBody = document.getElementById('txDailyBody');
      const savBody   = document.getElementById('txSavingsBody');
      const loanBody  = document.getElementById('txLoanBody');
      if (dailyBody) dailyBody.innerHTML = '';
      if (savBody)   savBody.innerHTML   = '';
      if (loanBody)  loanBody.innerHTML  = '';

      const appendRow = (tbody, tx) => {
        if (!tbody) return;
        const tr=document.createElement('tr');
        tr.innerHTML =
          `<td>${new Date(tx.created_at).toLocaleString()}</td><td class="mono">${matatuMap.get(tx.matatu_id)||''}</td>`+
          `<td class="mono">${tx.passenger_msisdn||''}</td><td>${fmtKES(tx.fare_amount_kes)}</td>`+
          `<td>${fmtKES(tx.service_fee_kes)}</td><td>${tx.status||''}</td>`;
        tbody.appendChild(tr);
      };

      items.forEach(tx=>{
        const kind = String(tx.kind||'').toUpperCase();
        if (kind === 'SACCO_FEE'){
          appendRow(dailyBody, tx);
        } else if (kind === 'SAVINGS'){
          appendRow(savBody, tx);
        } else if (kind === 'LOAN_REPAY'){
          appendRow(loanBody, tx);
        }
      });

      if (dailyBody && !dailyBody.children.length){
        dailyBody.innerHTML = '<tr><td colspan="6" class="muted">No daily fee transactions in range.</td></tr>';
      }
      if (savBody && !savBody.children.length){
        savBody.innerHTML = '<tr><td colspan="6" class="muted">No savings transactions in range.</td></tr>';
      }
      if (loanBody && !loanBody.children.length){
        loanBody.innerHTML = '<tr><td colspan="6" class="muted">No loan repayments in range.</td></tr>';
      }
      $('txCount').textContent = `${items.length} row(s)`;

      // Summary: today / this week / this month for key kinds
      const raw = (res.items||[]).filter(tx => String(tx.status||'').toUpperCase()==='SUCCESS');
      const today = new Date(); today.setHours(0,0,0,0);
      const startOfWeek = new Date(today); const day = startOfWeek.getDay() || 7; startOfWeek.setDate(startOfWeek.getDate() - (day-1));
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const isSameOrAfter = (d, since)=> d.getTime() >= since.getTime();

      const buckets = {
        SACCO_FEE: { today:0, week:0, month:0 },
        SAVINGS:   { today:0, week:0, month:0 },
        LOAN_REPAY:{ today:0, week:0, month:0 }
      };
      let hasOlder = false;

      raw.forEach(tx=>{
        const kind = String(tx.kind||'').toUpperCase();
        if (!buckets[kind]) return;
        const amt = Number(tx.fare_amount_kes||0);
        const d = new Date(tx.created_at);
        const dMid = new Date(d); dMid.setHours(0,0,0,0);
        if (!isSameOrAfter(dMid, startOfMonth)) hasOlder = true;
        if (dMid.getTime() === today.getTime()) buckets[kind].today += amt;
        if (isSameOrAfter(dMid, startOfWeek)) buckets[kind].week += amt;
        if (isSameOrAfter(dMid, startOfMonth)) buckets[kind].month += amt;
      });

      const put = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = fmtKES(val); };
      put('sum_df_today', buckets.SACCO_FEE.today);
      put('sum_df_week',  buckets.SACCO_FEE.week);
      put('sum_df_month', buckets.SACCO_FEE.month);
      put('sum_sv_today', buckets.SAVINGS.today);
      put('sum_sv_week',  buckets.SAVINGS.week);
      put('sum_sv_month', buckets.SAVINGS.month);
      put('sum_ln_today', buckets.LOAN_REPAY.today);
      put('sum_ln_week',  buckets.LOAN_REPAY.week);
      put('sum_ln_month', buckets.LOAN_REPAY.month);

      const olderEl = document.getElementById('sumOlderNote');
      if (olderEl){
        olderEl.textContent = hasOlder
          ? 'There are successful collections before this month in the last 1000 transactions.'
          : 'No successful collections before this month in the last 1000 transactions.';
      }

      const g = groupByDay(all);
      renderChart('summaryChart','SACCO Fee (KES)',g.labels,g.values);
    }

    async function loadStaffCollections(){
      if(!currentSacco) return;
      const res = await jget(`/u/sacco/${currentSacco}/transactions?limit=2000`);
      const fromIso=$('fromDate').value, toIso=$('toDate').value;
      const items=(res.items||[]).filter(tx=>withinRange(tx.created_at,fromIso,toIso) && (tx.status||'')==='SUCCESS');

      const staffMap = new Map(); // key -> {name,email,df,sav,loan,total}
      const brk = new Map(); // key -> {staff, plate, kind, amount, count}

      const staffKey = (tx)=>{
        const name = tx.created_by_name || '';
        const email = tx.created_by_email || '';
        const id = tx.created_by || '';
        return id || email || name || 'n++';
      };
      const staffLabel = (tx)=> (tx.created_by_name || tx.created_by_email || 'n++');
      const plateFor = (id)=> (matatuMap.get(id)||id||'');

      items.forEach(tx=>{
        // classify kind
        const k = tx.kind === 'SACCO_FEE' ? 'df' : (tx.kind === 'SAVINGS' ? 'sav' : (tx.kind === 'LOAN_REPAY' ? 'loan' : null));
        if (!k) return;
        const amt = Number(tx.fare_amount_kes||0);
        const key = staffKey(tx);
        const label = staffLabel(tx);
        const email = tx.created_by_email || '';
        const row = staffMap.get(key) || { name: label, email, df:0, sav:0, loan:0, total:0 };
        row[k] += amt; row.total += amt; row.email = email || row.email; row.name = label || row.name;
        staffMap.set(key, row);

        const bkey = `${key}|${tx.matatu_id||''}|${tx.kind}`;
        const brow = brk.get(bkey) || { staff: label, plate: plateFor(tx.matatu_id), kind: tx.kind, amount:0, count:0 };
        brow.amount += amt; brow.count += 1; brk.set(bkey, brow);
      });

      // Render summary
      const sumBody = $('sc_sum_tbody'); sumBody.innerHTML='';
      const rows = Array.from(staffMap.values()).sort((a,b)=> b.total - a.total);
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${r.name||'n++'}</td><td class="mono">${r.email||''}</td>`+
                       `<td>${fmtKES(r.df)}</td><td>${fmtKES(r.sav)}</td><td>${fmtKES(r.loan)}</td><td><strong>${fmtKES(r.total)}</strong></td>`;
        sumBody.appendChild(tr);
      });
      if (!rows.length) sumBody.innerHTML = '<tr><td colspan="6" class="muted">No data in range.</td></tr>';

      // Render breakdown
      const colBody = $('sc_col_tbody'); colBody.innerHTML='';
      const brows = Array.from(brk.values()).sort((a,b)=> b.amount - a.amount);
      brows.forEach(r=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${r.staff||'n++'}</td><td class="mono">${r.plate||''}</td><td>${r.kind}</td><td>${fmtKES(r.amount)}</td><td>${r.count}</td>`;
        colBody.appendChild(tr);
      });
      if (!brows.length) colBody.innerHTML = '<tr><td colspan="5" class="muted">No data in range.</td></tr>';
    }

    // STK
    $('stkGo').onclick = async ()=>{
      try{
        const body = {
          code:  $('stkCode').value.trim(),
          amount:Number($('stkAmt').value||0),
          phone: $('stkPhone').value.trim()
        };
        const r = await fetch('/api/pay/stk',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        $('stkOut').textContent = await r.text();
      }catch(e){ $('stkOut').textContent = e.message; }
    };

    // Staff
    async function loadStaff(){
      if(!currentSacco) return;
      try{
        const res = await jget(`/u/sacco/${currentSacco}/staff`);
        const T=$('staffTbody'); T.innerHTML='';
        (res.items||[]).forEach(s=>{
          const tr=document.createElement('tr');
          tr.innerHTML = `<td>${s.name||''}</td><td>${s.phone||''}</td><td>${s.email||''}</td><td>${s.role||''}</td>`+
            `<td><button class=\"bad\" data-action=\"del-staff\" data-id=\"${s.id}\">Delete</button></td>`;
          T.appendChild(tr);
        });
      }catch(e){
        $('staffTbody').innerHTML = `<tr><td colspan="4" class="err">${parseErr(e)}</td></tr>`;
      }
    }
      $('stAdd').onclick = async ()=>{
        if(!currentSacco) return alert('Pick a SACCO first');
        const body = {
          sacco_id: currentSacco,
          name:  $('stName').value.trim(),
          phone: $('stPhone').value.trim(),
          email: $('stEmail').value.trim(),
          role:  $('stRole').value,
          password: $('stPass').value
        };
        try{
          await parse(await fetch(`/u/sacco/${currentSacco}/staff`,{
            method:'POST',
            headers:{ 'Content-Type':'application/json', Accept:'application/json' },
            body: JSON.stringify(body)
          }));
          $('stName').value = $('stPhone').value = $('stEmail').value = '';
          $('stPass').value = '';
          await loadStaff();
          alert('Staff added');
        }catch(e){ alert(e.message); }
      };

    // Loans
    function addMonths(date, m){ const d = new Date(date); d.setMonth(d.getMonth()+m); return d; }
    function countWeekdaysInclusive(start, end){
      try{ let c=0, d=new Date(start); d.setHours(0,0,0,0); const e=new Date(end); e.setHours(0,0,0,0); while(d<=e){ const day=d.getDay(); if(day>=1 && day<=5) c++; d.setDate(d.getDate()+1);} return Math.max(1,c);}catch(_){ return 1; }
    }
    function weeksInRange(start, end){ try{ const ms = new Date(end).getTime() - new Date(start).getTime(); return Math.max(1, Math.ceil(ms/(7*24*3600*1000))); }catch(_){ return 1; } }
    function updateLoanSummary(){
  const principal = Number((document.getElementById('lnPrincipal')?.value)||0);
  const model = document.getElementById('lnModel')?.value || 'MONTHLY';
  const rateEl = document.getElementById('lnRate');
  const termEl = document.getElementById('lnTerm');
  const startEl = document.getElementById('lnStart');
  if (!startEl) return;
  let perMonth = 30; if (model === 'DAILY') perMonth = 10; else if (model === 'WEEKLY') perMonth = 20;
  let term = Math.max(1, Math.min(6, Number(termEl.value||1)));
  termEl.value = String(term);
  const totalPercent = perMonth * term;
  rateEl.value = String(totalPercent);
  rateEl.readOnly = true; termEl.readOnly = false;
  const start = startEl.value || new Date().toISOString().slice(0,10);
  const end = new Date(start); end.setMonth(end.getMonth() + term);
  const total = principal * (1 + totalPercent/100);
  let installments = term;
  if (model === 'DAILY') {
    let c=0, d=new Date(start); d.setHours(0,0,0,0); const e=new Date(end); e.setHours(0,0,0,0);
    while(d<=e){ const day=d.getDay(); if(day>=1 && day<=5) c++; d.setDate(d.getDate()+1); }
    installments = Math.max(1,c);
  } else if (model === 'WEEKLY') {
    const ms = end.getTime() - new Date(start).getTime();
    installments = Math.max(1, Math.ceil(ms/(7*24*3600*1000)));
  }
  const per = installments>0 ? (total/installments) : total;
  const sumEl = document.getElementById('lnSummary');
  if (sumEl) sumEl.textContent = 'Total due: KES ' + Number(total||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' - ' + installments + ' ' + model.toLowerCase() + ' installment(s) @ KES ' + Number(per||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' each';
}
    ;['lnModel','lnPrincipal','lnRate','lnTerm','lnStart'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', updateLoanSummary); });
    if (document.getElementById('lnStart')) { document.getElementById('lnStart').value = new Date().toISOString().slice(0,10); }
    try { updateLoanSummary(); } catch(_){ }

    async function loadLoans(){
      if(!currentSacco) return;
      try{
        const res = await jget(`/u/sacco/${currentSacco}/loans`);
        const T=$('loanTbody'); T.innerHTML='';
        (res.items||[]).forEach(l=>{
          const tr=document.createElement('tr');
          tr.innerHTML =
            `<td>${l.borrower_name||''}</td><td>${(matatuMap.get(l.matatu_id)||l.matatu_id||'')}</td><td>${fmtKES(l.principal_kes||0)}</td>`+
            `<td>${l.interest_rate_pct||0}</td><td>${l.term_months||0}</td><td>${l.status||''}</td>`+
            `<td>`+
              `<button class=\"ghost\" data-action=\"ln-hist\" data-id=\"${l.id}\">History</button> `+
              `<button class=\"ghost\" data-action=\"ln-close\" data-id=\"${l.id}\">Close</button> `+
              `<button class=\"bad\" data-action=\"ln-del\" data-id=\"${l.id}\">Delete</button>`+
            `</td>`;
          T.appendChild(tr);
        });
      }catch(e){
        $('loanTbody').innerHTML = `<tr><td colspan="7" class="err">${parseErr(e)}</td></tr>`;
      }
    }
    $('lnAdd').onclick = async ()=>{
      if(!currentSacco) return alert('Pick a SACCO first');
      const matatuId = $('lnMatatu').value;
      if(!matatuId) return alert('Select a Matatu - loans must be tied to the vehicle owner');
      const m = (window._matatuFull && window._matatuFull.get(matatuId)) || null;
      const ownerName = (m && (m.owner_name||'')) || '';
      $('lnBorrower').value = ownerName; // enforce borrower = owner
      // Enforce loan math: per-month rate * months (1..6)
      try{
        const model = document.getElementById('lnModel')?.value || 'MONTHLY';
        let months = Math.max(1, Math.min(6, Number(document.getElementById('lnTerm').value||1)));
        document.getElementById('lnTerm').value = String(months);
        const perMonth = (model==='DAILY'?10:(model==='WEEKLY'?20:30));
        document.getElementById('lnRate').value = String(perMonth * months);
      }catch(_){ }
      const body = {
        sacco_id: currentSacco,
        borrower_name: ownerName,
        matatu_id:     matatuId,
        principal_kes: Number($('lnPrincipal').value||0),
        interest_rate_pct: Number($('lnRate').value||0),
        term_months:   Number($('lnTerm').value||0)
      };
      try{
        await parse(await fetch(`/u/sacco/${currentSacco}/loans`,{
          method:'POST',
          headers:{ 'Content-Type':'application/json', Accept:'application/json' },
          body: JSON.stringify(body)
        }));
        $('lnBorrower').value = $('lnPrincipal').value = $('lnRate').value = $('lnTerm').value = '';
        $('lnMatatu').value = '';
        await loadLoans();
        alert('Loan created');
      }catch(e){ alert(e.message); }
    };

    // Daily fee rates (per SACCO per vehicle type)
    async function loadDailyFeeRatesAdmin(){
      if (!currentSacco) return;
      const T = document.getElementById('dfRulesBody');
      if (!T) return;
      T.innerHTML = '<tr><td colspan="2" class="muted">Loading...</td></tr>';
      try{
        const res = await jget(`/u/sacco/${currentSacco}/daily-fee-rates`);
        const items = res.items || [];
        if (!items.length){
          T.innerHTML = '<tr><td colspan="2" class="muted">No rates configured yet.</td></tr>';
          return;
        }
        T.innerHTML = '';
        items.forEach(r=>{
          const tr=document.createElement('tr');
          tr.innerHTML = `<td>${r.vehicle_type||''}</td><td>${fmtKES(r.daily_fee_kes||0)}</td>`;
          T.appendChild(tr);
        });
      }catch(e){
        T.innerHTML = `<tr><td colspan="2" class="err">${parseErr(e)}</td></tr>`;
      }
    }

    const dfSaveBtn = document.getElementById('dfSave');
    if (dfSaveBtn){
      dfSaveBtn.onclick = async ()=>{
        if (!currentSacco) return alert('Pick a SACCO first');
        const typeSel = document.getElementById('dfTypeSelect');
        const amtEl = document.getElementById('dfAmount');
        const msgEl = document.getElementById('dfMsg');
        const vt = (typeSel?.value || '').trim();
        const amt = Number(amtEl?.value || 0);
        if (!vt){
          if (msgEl){ msgEl.textContent='Vehicle type required'; msgEl.className='muted err'; }
          return;
        }
        if (!amt || !Number.isFinite(amt) || amt <= 0){
          if (msgEl){ msgEl.textContent='Enter a positive daily fee amount'; msgEl.className='muted err'; }
          return;
        }
        if (msgEl){ msgEl.textContent='Saving...'; msgEl.className='muted'; }
        dfSaveBtn.disabled = true;
        try{
          await parse(await fetch(`/u/sacco/${currentSacco}/daily-fee-rates`,{
            method:'POST',
            headers:{ 'Content-Type':'application/json', Accept:'application/json' },
            body: JSON.stringify({ vehicle_type: vt, daily_fee_kes: amt })
          }));
          if (msgEl){ msgEl.textContent='Saved'; msgEl.className='ok'; }
          await loadDailyFeeRatesAdmin();
        }catch(e){
          if (msgEl){ msgEl.textContent = e.message || 'Failed to save'; msgEl.className='muted err'; }
        }finally{
          dfSaveBtn.disabled = false;
        }
      };
    }

    // Routes settings panel
    let saccoRoutes = [];
    let selectedRouteId = null;
    let livePollTimer = null;

    async function loadRoutesAdmin(){
      if (!currentSacco) return;
      const T = $('rtTbody');
      if (!T) return;
      T.innerHTML = '<tr><td colspan="6" class="muted">Loading routes...</td></tr>';
      try{
        const res = await jget(`/u/sacco/${currentSacco}/routes?include_inactive=true`);
        const items = res.items || res || [];
        saccoRoutes = items;
        if (!items.length){
          T.innerHTML = '<tr><td colspan="6" class="muted">No routes yet.</td></tr>';
          selectedRouteId = null;
          liveLastCount = 0;
          liveLastTs = null;
          if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
          updateLiveStatus();
          return;
        }
        T.innerHTML = '';
        items.forEach(r=>{
          const tr=document.createElement('tr');
          tr.dataset.routeId = r.id;
          const status = r.active ? 'Active' : 'Inactive';
          const btnLabel = r.active ? 'Disable' : 'Enable';
          tr.innerHTML =
            `<td>${r.code || ''}</td>`+
            `<td>${r.name || ''}</td>`+
            `<td>${r.start_stop || ''}</td>`+
            `<td>${r.end_stop || ''}</td>`+
            `<td>${status}</td>`+
            `<td><button class="ghost" data-act="rt-toggle" data-id="${r.id}" data-active="${r.active ? '1' : '0'}">${btnLabel}</button></td>`;
          T.appendChild(tr);
        });
      }catch(e){
        T.innerHTML = `<tr><td colspan="6" class="err">${parseErr(e)}</td></tr>`;
      }
    }

    function updateRouteRecInfo(msg){
      const el = $('rtRecInfo');
      if (!el) return;
      el.textContent = msg;
    }

    function stopRouteRecording(){
      const startBtn = $('rtStartRec');
      const stopBtn = $('rtStopRec');
      if (routeRecWatchId != null && navigator.geolocation){
        try{
          navigator.geolocation.clearWatch(routeRecWatchId);
        }catch(_){}
        routeRecWatchId = null;
      }
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      if (routeRecBuf && routeRecBuf.length){
        updateRouteRecInfo(`Recorded ${routeRecBuf.length} point(s). Will attach when you create the route.`);
      }else{
        updateRouteRecInfo('Recording stopped (no points captured).');
      }
    }

    function startRouteRecording(){
      if (!navigator.geolocation){
        updateRouteRecInfo('Geolocation not supported in this browser.');
        return;
      }
      if (routeRecWatchId != null){
        updateRouteRecInfo('Already recording route.');
        return;
      }
      routeRecBuf = [];
      const startBtn = $('rtStartRec');
      const stopBtn = $('rtStopRec');
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
      updateRouteRecInfo('Requesting location and starting recording...');
      routeRecWatchId = navigator.geolocation.watchPosition(
        pos => {
          const point = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ts: new Date(pos.timestamp || Date.now()).toISOString()
          };
          routeRecBuf.push(point);
          updateRouteRecInfo(`Recording: ${routeRecBuf.length} point(s) captured...`);
        },
        err => {
          console.warn('route geo error', err);
          updateRouteRecInfo('Location error: ' + (err.message || err.code || 'unknown'));
        },
        { enableHighAccuracy:true, maximumAge:5000, timeout:15000 }
      );
    }

    function updateLiveStatus(){
      const el = $('liveStatus');
      if (!el){
        return;
      }
      if (!currentSacco || !selectedRouteId){
        el.textContent = 'Live: no route selected.';
        return;
      }
      const route = saccoRoutes.find(r => String(r.id) === String(selectedRouteId));
      const name = route?.name || '';
      if (!liveLastCount && !liveLastTs){
        el.textContent = name ? `Live: ${name} – waiting for positions...` : 'Live: waiting for positions...';
        return;
      }
      const when = liveLastTs ? new Date(liveLastTs) : null;
      const timeStr = when ? when.toLocaleTimeString() : 'n/a';
      if (!liveLastCount){
        el.textContent = name
          ? `Live: ${name} – no matatu positions in the last window (last update at ${timeStr}).`
          : `Live: no matatu positions in the last window (last update at ${timeStr}).`;
        return;
      }
      el.textContent = name
        ? `Live: ${name} – ${liveLastCount} matatu(s) active, last update at ${timeStr}.`
        : `Live: ${liveLastCount} matatu(s) active, last update at ${timeStr}.`;
    }

    function ensureGoogleMaps(){
      if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
      if (gmapApiLoading) return gmapApiLoading;
      const key = window.GMAPS_API_KEY || window.GOOGLE_MAPS_API_KEY || '';
      let src = 'https://maps.googleapis.com/maps/api/js?libraries=geometry';
      if (key) src += '&key=' + encodeURIComponent(key);
      gmapApiLoading = new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onerror = ()=> reject(new Error('Failed to load Google Maps API'));
        s.onload = ()=>{
          if (window.google && window.google.maps){ resolve(window.google.maps); }
          else reject(new Error('Google Maps API not available after load'));
        };
        document.head.appendChild(s);
      });
      return gmapApiLoading;
    }

    async function ensureRouteMap(){
      const maps = await ensureGoogleMaps();
      if (gmapMap) return maps;
      const div = $('routeMap');
      if (!div) return maps;
      gmapMap = new maps.Map(div, {
        center: { lat: -1.286389, lng: 36.817223 }, // Nairobi CBD approx
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false
      });
      gmapTrafficLayer = new maps.TrafficLayer();
      gmapTrafficLayer.setMap(gmapMap);
      return maps;
    }

    async function showRouteOnMap(route){
      if (!route || !route.path_points || !route.path_points.length){
        updateRouteRecInfo('Selected route has no recorded path yet.');
        return;
      }
      const maps = await ensureRouteMap();
      const pts = route.path_points
        .map(p => (p && typeof p.lat === 'number' && typeof p.lng === 'number') ? { lat:p.lat, lng:p.lng } : null)
        .filter(Boolean);
      if (!pts.length){
        updateRouteRecInfo('Selected route has no valid path points.');
        return;
      }
      if (!gmapRoutePolyline){
        gmapRoutePolyline = new maps.Polyline({
          strokeColor: '#2563eb',
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map: gmapMap
        });
      }
      gmapRoutePolyline.setPath(pts);
      const bounds = new maps.LatLngBounds();
      pts.forEach(pt => bounds.extend(pt));
      gmapMap.fitBounds(bounds);
      updateRouteRecInfo(`Showing route "${route.name||''}" with ${pts.length} point(s).`);
    }

    async function refreshLivePositions(){
      if (!currentSacco) return;
      if (!selectedRouteId) return;
      let res;
      try{
        res = await jget(`/u/sacco/${currentSacco}/live-positions?route_id=${encodeURIComponent(selectedRouteId)}&window_min=60`);
      }catch(e){
        console.warn('live positions error', e);
        liveLastCount = 0;
        liveLastTs = null;
        updateLiveStatus();
        return;
      }
      const items = res.items || [];
      const maps = await ensureRouteMap();
      const used = new Set();
      let latestTs = null;
      if (!items.length){
        // Clear markers if no recent positions
        gmapLiveMarkers.forEach((marker, id)=>{
          marker.setMap(null);
        });
        gmapLiveMarkers.clear();
        liveLastCount = 0;
        liveLastTs = null;
        updateLiveStatus();
        return;
      }
      items.forEach(row=>{
        const id = String(row.matatu_id||'');
        if (!id) return;
        used.add(id);
        const pos = { lat:Number(row.lat), lng:Number(row.lng) };
        if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return;
        if (row.recorded_at){
          const t = Date.parse(row.recorded_at);
          if (!Number.isNaN(t)){
            if (latestTs == null || t > latestTs){
              latestTs = t;
            }
          }
        }
        let marker = gmapLiveMarkers.get(id);
        if (!marker){
          marker = new maps.Marker({
            position: pos,
            map: gmapMap,
            title: (matatuMap.get(row.matatu_id) || 'Matatu'),
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#16a34a',
              fillOpacity: 0.9,
              strokeColor: '#065f46',
              strokeWeight: 1
            }
          });
          gmapLiveMarkers.set(id, marker);
        }else{
          marker.setPosition(pos);
        }
      });
      // Optionally remove markers that are not in the latest batch
      gmapLiveMarkers.forEach((marker, id)=>{
        if (!used.has(id)){
          marker.setMap(null);
          gmapLiveMarkers.delete(id);
        }
      });
      liveLastCount = used.size;
      liveLastTs = latestTs ? new Date(latestTs).toISOString() : null;
      updateLiveStatus();
    }

    const rtCreateBtn = $('rtCreate');
    if (rtCreateBtn){
      rtCreateBtn.onclick = async ()=>{
        if (!currentSacco) return alert('Pick a SACCO first');
        const nameEl = $('rtName');
        const codeEl = $('rtCode');
        const startEl = $('rtStart');
        const endEl = $('rtEnd');
        const statusEl = $('rtStatus');
        const name = (nameEl?.value || '').trim();
        if (!name){
          if (statusEl){ statusEl.textContent = 'Name is required'; statusEl.className = 'err'; }
          return;
        }
        const body = {
          name,
          code: (codeEl?.value || '').trim() || null,
          start_stop: (startEl?.value || '').trim() || null,
          end_stop: (endEl?.value || '').trim() || null
        };
        if (routeRecBuf && routeRecBuf.length){
          body.path_points = routeRecBuf.slice();
        }
        rtCreateBtn.disabled = true;
        if (statusEl){ statusEl.textContent = 'Saving...'; statusEl.className = 'muted'; }
        try{
          await parse(await fetch(`/u/sacco/${currentSacco}/routes`,{
            method:'POST',
            headers:{ 'Content-Type':'application/json', Accept:'application/json' },
            body: JSON.stringify(body)
          }));
          if (nameEl) nameEl.value = '';
          if (codeEl) codeEl.value = '';
          if (startEl) startEl.value = '';
          if (endEl) endEl.value = '';
          routeRecBuf = [];
          const startBtn = $('rtStartRec');
          const stopBtn = $('rtStopRec');
          if (startBtn) startBtn.disabled = false;
          if (stopBtn) stopBtn.disabled = true;
          const recInfo = $('rtRecInfo');
          if (recInfo) recInfo.textContent = 'Route saved. Recording cleared.';
          if (statusEl){ statusEl.textContent = 'Route created'; statusEl.className = 'ok'; }
          await loadRoutesAdmin();
        }catch(e){
          if (statusEl){ statusEl.textContent = e.message || 'Failed to create route'; statusEl.className = 'err'; }
        }finally{
          rtCreateBtn.disabled = false;
        }
      };
    }

    const rtStartRecBtn = $('rtStartRec');
    if (rtStartRecBtn){
      rtStartRecBtn.onclick = ()=>{ startRouteRecording(); };
    }
    const rtStopRecBtn = $('rtStopRec');
    if (rtStopRecBtn){
      rtStopRecBtn.onclick = ()=>{ stopRouteRecording(); };
    }

    // Events
    $('saccoSelect').onchange = async ()=>{
      currentSacco = $('saccoSelect').value || null;
      try{ stopRouteRecording(); }catch(_){}
      selectedRouteId = null;
      liveLastCount = 0;
      liveLastTs = null;
      if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
      updateLiveStatus();
      updateHeadlineFor(currentSacco);
      const link = document.getElementById('linkStaffLoans'); if (link) link.href = '/public/sacco/staff-loans.html' + (currentSacco ? ('?sacco='+encodeURIComponent(currentSacco)) : '');
      await Promise.all([ loadMatatus(), loadTxAndTotals(), loadStaff(), loadLoans(), loadLoanRequests(), loadRoutesAdmin(), loadDailyFeeRatesAdmin() ]);
      await loadNotifications();
    };

    // Loan Requests
    async function loadLoanRequests(){
      if(!currentSacco) return;
      try{
        const res = await jget(`/u/sacco/${currentSacco}/loan-requests?status=PENDING`);
        const T=$('lnreqTbody'); if(!T) return; T.innerHTML='';
        (res.items||[]).forEach(r=>{
          const plate = (matatuMap.get(r.matatu_id)||'');
          const tr=document.createElement('tr');
          tr.innerHTML = `<td>${new Date(r.created_at).toLocaleString()}</td><td>${r.owner_name||''}</td><td>${plate}</td>`+
            `<td>${fmtKES(r.amount_kes||0)}</td><td>${r.model||''}</td><td>${r.term_months||0}</td><td>${r.note||''}</td>`+
            `<td>${r.status||''}</td>`+
            `<td>`+
              `<button class="ok" data-act="approve" data-id="${r.id}">Approve</button> `+
              `<button class="bad" data-act="reject" data-id="${r.id}">Reject</button>`+
            `</td>`;
          T.appendChild(tr);
        });
        if (!(res.items||[]).length){ $('lnreqTbody').innerHTML = '<tr><td colspan="9" class="muted">No pending requests</td></tr>'; }
      }catch(e){ const T=$('lnreqTbody'); if(T) T.innerHTML = `<tr><td colspan="9" class="err">${parseErr(e)}</td></tr>`; }
    }
    $('applyRange').onclick = ()=> { loadTxAndTotals(); loadStaffCollections(); };
    $('matatuSearch').oninput = ()=> { clearTimeout(window._mtT); window._mtT = setTimeout(loadMatatus, 200); };
    $('reloadMatatus').onclick = loadMatatus;
    $('txStatus').onchange = loadTxAndTotals;
    $('reloadTx').onclick = ()=> { loadTxAndTotals(); loadStaffCollections(); };
    $('sc_refresh').onclick = loadStaffCollections;

    // Export CSV
    $('exportTx').onclick = ()=>{
      const tables = document.querySelectorAll('#p_tx table');
      const rows = [];
      tables.forEach(table => {
        rows.push(...table.querySelectorAll('tr'));
      });
      const csv = rows.map(r=>[...r.querySelectorAll('th,td')].map(c=>`"${(c.innerText||'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
      a.download='transactions.csv';
      a.click();
    };

    // Init
    (async function init(){
      try{
        await loadSaccos();
        const link = document.getElementById('linkStaffLoans'); if (link) link.href = '/public/sacco/staff-loans.html' + (currentSacco ? ('?sacco='+encodeURIComponent(currentSacco)) : '');
        await Promise.all([ loadMatatus(), loadTxAndTotals(), loadStaffCollections(), loadStaff(), loadLoans(), loadLoanRequests(), loadRoutesAdmin(), loadDailyFeeRatesAdmin() ]);
        await loadNotifications();
        // Auto-refresh key views every 60 seconds (if SACCO selected)
        setInterval(async ()=>{
          if (!currentSacco) return;
          try{
            await Promise.all([ loadTxAndTotals(), loadStaffCollections(), loadNotifications() ]);
          }catch(_){ /* ignore background refresh errors */ }
        }, 60000);

    // Approve/Reject loan requests
    (function bindLnReqActions(){
      const T=document.getElementById('lnreqTbody'); if(!T) return;
      T.addEventListener('click', async (e)=>{
        const btn=e.target.closest('button'); if(!btn) return; const act=btn.dataset.act; const id=btn.dataset.id; if(!id) return;
        if(!confirm(`${act==='approve'?'Approve':'Reject'} this request?`)) return;
        btn.disabled=true; try{
          await parse(await fetch(`/u/sacco/${currentSacco}/loan-requests/${id}`,{ method:'PATCH', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ action: act.toUpperCase() }) }));
          await loadLoanRequests(); await loadLoans();
        }catch(err){ alert(err.message); } finally{ btn.disabled=false; }
      });
    })();

    // Routes actions (delegated)
    (function bindRouteActions(){
      const T = document.getElementById('rtTbody'); if (!T) return;
      T.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button');
        const row = e.target.closest('tr');
        const routeId = row?.dataset?.routeId || null;
        if (routeId){
          selectedRouteId = routeId;
          const route = saccoRoutes.find(r => String(r.id) === String(routeId));
          if (route){
            showRouteOnMap(route).catch(err=>console.warn(err));
            if (livePollTimer) clearInterval(livePollTimer);
            livePollTimer = setInterval(()=>{ refreshLivePositions().catch(()=>{}); }, 30000);
            liveLastCount = 0;
            liveLastTs = null;
            updateLiveStatus();
            refreshLivePositions().catch(()=>{});
          }
        }
        if (!btn) return;
        if (btn.dataset.act !== 'rt-toggle') return;
        const id = btn.dataset.id;
        if (!id || !currentSacco) return;
        const currentActive = btn.dataset.active === '1';
        btn.disabled = true;
        try{
          await parse(await fetch(`/u/sacco/${currentSacco}/routes/${id}`,{
            method:'PATCH',
            headers:{ 'Content-Type':'application/json', Accept:'application/json' },
            body: JSON.stringify({ active: !currentActive })
          }));
          await loadRoutesAdmin();
        }catch(err){
          alert(err.message || String(err));
        }finally{
          btn.disabled = false;
        }
      });
    })();

      }catch(e){
        $('statusMsg').textContent = e.message;
        console.error(e);
        alert('Load error: '+e.message);
      }
    })();

    // Staff delete (delegated)
    (function bindStaffActions(){
      const T = document.getElementById('staffTbody'); if(!T) return;
      T.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button'); if(!btn) return;
        if (btn.dataset.action !== 'del-staff') return;
        const id = btn.dataset.id; if (!id || !currentSacco) return;
        if (!confirm('Delete this staff and revoke SACCO access?')) return;
        btn.disabled = true;
        try{
          await parse(await fetch(`/u/sacco/${currentSacco}/staff/${id}`,{ method:'DELETE', headers:{ Accept:'application/json' } }));
          await loadStaff();
          alert('Staff deleted');
        }catch(err){ alert(err.message); }
        finally{ btn.disabled=false; }
      });
    })();

    // Loans actions (delegated)
    (function bindLoanActions(){
      const T = document.getElementById('loanTbody'); if(!T) return;
      T.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button'); if(!btn) return;
        const id = btn.dataset.id; const act = btn.dataset.action; if (!id || !act) return;
        try{
          if (act==='ln-hist'){
            const res = await jget(`/u/sacco/${currentSacco}/loans/${id}/payments`);
            const TB = document.getElementById('loanHistTbody'); TB.innerHTML='';
            (res.items||[]).forEach(tx=>{
              const tr=document.createElement('tr');
              tr.innerHTML = `<td>${new Date(tx.created_at).toLocaleString()}</td><td>${fmtKES(tx.fare_amount_kes||0)}</td><td>${tx.created_by_name||tx.created_by_email||''}</td><td>${tx.notes||''}</td>`;
              TB.appendChild(tr);
            });
            const sum = (res.items||[]).reduce((s,t)=>s+Number(t.fare_amount_kes||0),0);
            document.getElementById('loanHistSum').textContent = 'Paid total: KES ' + fmtKES(sum) + ' - Remaining: KES ' + fmtKES(Math.max(0,(res.total||0)-sum));
            document.getElementById('loanHistTitle').textContent = 'Loan History (' + id.slice(0,8) + '...)';
          } else if (act==='ln-close'){
            if (!confirm('Mark this loan as CLOSED?')) return;
            btn.disabled=true; await parse(await fetch(`/u/sacco/${currentSacco}/loans/${id}`,{ method:'PATCH', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ status:'CLOSED' }) })); await loadLoans();
          } else if (act==='ln-del'){
            if (!confirm('Permanently delete this loan?')) return;
            btn.disabled=true; await parse(await fetch(`/u/sacco/${currentSacco}/loans/${id}`,{ method:'DELETE', headers:{ Accept:'application/json' } })); await loadLoans();
          }
        }catch(err){ alert(err.message); }
        finally{ btn.disabled=false; }
      });
    })();
  })();
  