(function(){
  function statusElFrom(option){
    if (!option) return null;
    if (typeof option === 'string') return document.getElementById(option);
    return option;
  }

  function setStatus(el, text){
    if (!el) return;
    el.textContent = text;
  }

  async function requireRole(expected, opts = {}){
    const requiredRaw = Array.isArray(expected) ? expected : [expected];
    const required = requiredRaw.map(r => String(r || '').toUpperCase());
    const statusTarget = statusElFrom(opts.statusEl);
    const roleLabel = opts.roleLabel || requiredRaw.join(' / ');
    const next = opts.next || (location.pathname + location.search);
    const loginUrl = opts.loginUrl || `/public/auth/login.html?next=${encodeURIComponent(next)}`;
    const mismatchUrl = opts.onMismatch || '/public/auth/role-select.html';

    try{
      const supa = await window.TT?.getSupabase?.();
      if (!supa) throw new Error('Supabase client not ready');

      const { data:{ session } } = await supa.auth.getSession();
      if (!session){
        setStatus(statusTarget, 'Redirecting to login...');
        location.href = loginUrl;
        throw new Error('no_session');
      }

      const res = await fetch('/u/me');
      if (res.status === 401){
        location.href = loginUrl;
        throw new Error('unauthorized');
      }
      if (!res.ok){
        throw new Error('auth_failed');
      }

      const profile = await res.json().catch(()=> ({}));
      const role = String(profile?.role || '').toUpperCase();
      if (!role || !required.includes(role)){
        setStatus(statusTarget, `Requires ${roleLabel} access`);
        location.href = mismatchUrl;
        throw new Error('role_mismatch');
      }
      return profile;
    }catch(err){
      console.error('[role-guard]', err);
      setStatus(statusTarget, err?.message || 'Auth error');
      throw err;
    }
  }

  window.requireRole = requireRole;
})();
