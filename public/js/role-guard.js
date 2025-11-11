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
    const required = Array.isArray(expected) ? expected : [expected];
    const statusTarget = statusElFrom(opts.statusEl);
    const roleLabel = opts.roleLabel || required.join(' / ');
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
      const profile = await res.json().catch(()=> ({}));
      if (!profile || !required.includes(profile.role)){
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
