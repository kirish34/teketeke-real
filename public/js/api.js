window.TT = window.TT || {};
TT.getAuth = () => localStorage.getItem('auth_token') || '';

// Lightweight Supabase JWT helper + authFetch
(function(){
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
    const supa = await getSupabase();
    if (!supa) return null;
    try{
      const { data: { session } } = await supa.auth.getSession();
      return session?.access_token || null;
    }catch(e){
      return null;
    }
  }

  async function authFetch(input, init){
    const url = typeof input === 'string' ? input : (input?.url || '');
    const needsAuth = /^\/(u|api\/staff|api\/taxi|api\/boda)\b/.test(url);
    if (!needsAuth) return fetch(input, init);
    const token = await getAccessToken();
    const headers = new Headers(init?.headers || {});
    if (token) headers.set('Authorization','Bearer '+token);
    return fetch(input, { ...(init||{}), headers });
  }

  // Expose helpers
  window.TT.getSupabase = getSupabase;
  window.authFetch = authFetch;

  // Monkey-patch fetch for /u/*, /api/staff/*, /api/taxi/*, /api/boda/* (non-breaking elsewhere)
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (/^\/(u|api\/staff|api\/taxi|api\/boda)\b/.test(url)){
      return authFetch(input, init);
    }
    return origFetch(input, init);
  };
})();
