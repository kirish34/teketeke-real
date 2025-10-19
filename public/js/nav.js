(function(){
  const go = (p)=>{ try{ location.href = p; }catch(_){} };
  const b=document.getElementById('logoutBtn');
  if(b){
    b.addEventListener('click', async ()=>{
      try{
        if (window.TT && window.TT.getSupabase){ const supa = await window.TT.getSupabase(); await supa?.auth?.signOut(); }
      }catch(_){ }
      go('/public/auth/role-select.html');
    });
  }
  window.protect = async function(){
    try{
      if (window.TT && window.TT.getSupabase){
        const supa = await window.TT.getSupabase();
        const { data:{ session } } = await supa.auth.getSession();
        if (!session?.access_token){ go('/public/auth/login.html?next='+encodeURIComponent(location.pathname+location.search)); }
      }
    }catch(_){ go('/public/auth/login.html'); }
  };
})();
