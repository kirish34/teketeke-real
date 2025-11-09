window.ensureAuthOrRoot = window.ensureAuthOrRoot || (async function(){
  try{
    if (window.TT && window.TT.getSupabase){
      const supa = await window.TT.getSupabase();
      const { data:{ session } } = await supa.auth.getSession();
      if (!session?.access_token){ location.href='/public/auth/login.html?next='+encodeURIComponent(location.pathname+location.search); }
    }
  }catch(_){ /* ignore */ }
});
