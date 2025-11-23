window.TT = window.TT || {};
TT.getAuth = () => (sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || '');

// Lightweight Supabase JWT helper + authFetch (with 401 redirect)
(function(){
  // Keep original fetch to avoid recursion
  const origFetch = window.fetch.bind(window);

  let supaLoaded = false;
  let supaClient = null;

  async function loadSupabaseLib(){
    if (window.supabase) return;
    if (supaLoaded) return new Promise((res)=>{
      const iv = setInterval(()=>{ if (window.supabase){ clearInterval(iv); res(); } }, 20);
    });
    supaLoaded = true;
    await new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function getSupabase(){
    await loadSupabaseLib();
    if (!supaClient){
      const url = window.SUPABASE_URL || '';
      const anon = window.SUPABASE_ANON_KEY || '';
      if (!url || !anon){
        console.warn('[TT] Missing SUPABASE_URL/ANON key in public/js/app-config.js');
      } else {
        supaClient = window.supabase.createClient(url, anon);
      }
    }
    return supaClient;
  }

  async function getAccessToken(){
    // Prefer the live Supabase session but fall back to the raw auth_token we stash
    // in storage on login so first post-login requests are not missing the header.
    let fallback = '';
    try{
      fallback = TT?.getAuth?.() || '';
    }catch(_){}

    const supa = await getSupabase();
    if (!supa) return fallback || null;
    try{
      const { data: { session } } = await supa.auth.getSession();
      return session?.access_token || fallback || null;
    }catch(e){
      return fallback || null;
    }
  }

  async function authFetch(input, init){
    const url = typeof input === 'string' ? input : (input?.url || '');
    const needsAuth = /^\/(u|api)\b/.test(url); // cover /u and all /api routes
    if (!needsAuth) return origFetch(input, init);
    const headers = new Headers(init?.headers || {});
    try{
      const token = await getAccessToken();
      if (token) headers.set('Authorization','Bearer '+token);
    }catch(_){ }
    const resp = await origFetch(input, { ...(init||{}), headers });
    try{
      if (resp.status === 401 && !/\/public\/auth\/login\.html$/.test(location.pathname)){
        const next = location.pathname + location.search;
        location.href = '/public/auth/login.html?next=' + encodeURIComponent(next);
      }
    }catch(_){ }
    return resp;
  }

  // Expose helpers
  window.TT.getSupabase = getSupabase;
  window.authFetch = authFetch;

  // Monkey-patch fetch for /u/* and /api/* (non-breaking elsewhere)
  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (/^\/(u|api)\b/.test(url)){
      return authFetch(input, init);
    }
    return origFetch(input, init);
  };

  // Gentle runtime cleanup for occasional mojibake characters
  document.addEventListener('DOMContentLoaded', () => {
    try{
      if (/\uFFFD/.test(document.title)) {
        document.title = document.title.replace(/\uFFFD+/g, '-');
      }
    }catch(_){ }
    try{
      const as = document.getElementById('auth_state');
      if (as && /\uFFFD/.test(as.textContent||'')) {
        as.textContent = 'Checking sign-in...';
      }
    }catch(_){ }
    try{
      document.querySelectorAll('a').forEach(a => {
        const t = (a.textContent||'').trim();
        if (t === '? Back') a.textContent = 'Back';
        if (/^\?\s*Role Select$/.test(t)) a.textContent = 'Role Select';
      });
    }catch(_){ }
    try{
      ['ov_found','mt_found','up_found_label'].forEach(id => {
        const el = document.getElementById(id);
        if (el && /^\?\s/.test(el.textContent||'')) {
          el.textContent = el.textContent.replace(/^\?\s/, '✓ ');
        }
      });
    }catch(_){ }
  });

  // Best-effort cleanup when explicitly logging out
  function ttCleanupAuth(){
    try{
      if (supaClient && supaClient.auth){
        supaClient.auth.signOut().catch?.(()=>{});
      }
    }catch(_){}
    try{
      if (typeof window.ttClearAuthStorage === 'function'){
        window.ttClearAuthStorage();
        return;
      }
    }catch(_){}
    try{
      ['auth_token','tt_root_token','tt_admin_token'].forEach((k)=>{
        try{ sessionStorage.removeItem(k); }catch(_){}
        try{ localStorage.removeItem(k); }catch(_){}
      });
    }catch(_){}
  }

  try{
    // Hook common logout buttons so clicking them always clears storage,
    // but do NOT auto-logout on simple refresh or navigation.
    document.addEventListener('click', (event) => {
      try{
        const target = event.target;
        if (!target || !target.closest) return;
        const logoutEl = target.closest('#logout,#logoutBtn,#logout_btn,#opsLogout');
        if (!logoutEl) return;
        ttCleanupAuth();
      }catch(_){}
    }, true);
  }catch(_){}
})();
