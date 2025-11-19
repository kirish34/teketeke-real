window.SUPABASE_URL='https://ecjkxgegjzvixyuukysk.supabase.co';
window.SUPABASE_ANON_KEY='sb_publishable_iY_CGooJG4me_7X0nO0enA_OgqbIhEK';
window.GMAPS_API_KEY='AIzaSyAX9n7y1QOjrOZHJwiNBkdYUJ5JET6X4aw';
// Base URL for API calls when running inside the mobile shell.
// In your case this points at the live Vercel/production domain.
window.TT_API_BASE='https://teketeke.dev';

(function(){
  try{
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Global helper to clear auth/session storage (used by login + dashboards)
    if (!window.ttClearAuthStorage){
      window.ttClearAuthStorage = function(){
        try{
          var stores = [];
          try{ if (typeof window.localStorage !== 'undefined') stores.push(window.localStorage); }catch(_){}
          try{ if (typeof window.sessionStorage !== 'undefined') stores.push(window.sessionStorage); }catch(_){}
          stores.forEach(function(store){
            if (!store) return;
            ['auth_token','tt_root_token','tt_admin_token'].forEach(function(k){
              try{ store.removeItem(k); }catch(_){}
            });
            try{
              for (var i = store.length - 1; i >= 0; i--){
                var key = store.key(i);
                if (!key) continue;
                if (key.indexOf('sb-') === 0 || key.indexOf('supabase') !== -1){
                  store.removeItem(key);
                }
              }
            }catch(_){}
          });
        }catch(_){}
      };
    }

    if (window.location && window.location.pathname === '/public/auth/login.html'){
      document.addEventListener('DOMContentLoaded', function(){
        try{
          // Apply dashboard-like theme to login card
          try{
            var style = document.createElement('style');
            style.textContent = [
              'body{',
              '  background:radial-gradient(circle at top,#0ea5e9 0,#e0f2fe 40%,#f4f6fb 80%);',
              '  min-height:100vh;',
              '}',
              '.wrap{',
              '  min-height:100vh;',
              '  display:grid;',
              '  place-items:center;',
              '  padding:16px;',
              '}',
              '.card{',
              '  position:relative;',
              '  border-radius:20px;',
              '  box-shadow:0 26px 60px rgba(15,23,42,.35);',
              '  border:1px solid rgba(15,23,42,.06);',
              '  overflow:hidden;',
              '  background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(248,250,252,.96));',
              '}',
              '.card::before{',
              '  content:\"\";',
              '  position:absolute;',
              '  inset:0;',
              '  background:radial-gradient(circle at top left,rgba(59,130,246,.18),transparent 55%);',
              '  pointer-events:none;',
              '}',
              '.card > *{',
              '  position:relative;',
              '  z-index:1;',
              '}',
              '.topline{',
              '  margin-bottom:12px;',
              '  align-items:center;',
              '}',
              'button, .btn{',
              '  border-radius:10px;',
              '  box-shadow:0 8px 20px rgba(15,23,42,.18);',
              '}',
              'button.ghost{',
              '  box-shadow:none;',
              '}',
              '.brand-logo{',
              '  box-shadow:0 12px 30px rgba(37,99,235,.5);',
              '}',
              '@media (max-width:640px){',
              '  .card{',
              '    width:100%;',
              '  }',
              '  h1#t_title{',
              '    font-size:20px;',
              '  }',
              '}', 
              '}'
            ].join('');
            document.head.appendChild(style);
          }catch(_){}

          var params = new URLSearchParams(window.location.search || '');
          var next = String(params.get('next') || '');
          var isTaxi = next.indexOf('/public/taxi/') === 0 || next.indexOf('/public/mobile/taxi/') === 0;
          var isBoda = next.indexOf('/public/bodaboda/') === 0 || next.indexOf('/public/mobile/boda/') === 0;
          if (isTaxi || isBoda){
            var msgHost = document.getElementById('msg');
            var parent = msgHost && msgHost.parentNode ? msgHost.parentNode : null;
            if (parent){
              var host = document.createElement('div');
              host.id = 'tt_signup_links';
              host.style.marginTop = '8px';
              host.style.fontSize = '13px';
              host.style.color = '#6b7280';
              var link = document.createElement('a');
              link.rel = 'noopener noreferrer';
              link.style.fontWeight = '700';
              link.style.color = '#1976d2';
              if (isTaxi){
                link.href = '/public/taxi/signup.html';
                link.textContent = 'New taxi? Create an account';
              } else if (isBoda){
                link.href = '/public/bodaboda/signup.html';
                link.textContent = 'New boda? Create an account';
              }
              host.appendChild(link);
              if (msgHost.nextSibling){
                parent.insertBefore(host, msgHost.nextSibling);
              } else {
                parent.appendChild(host);
              }
            }
          }

          // Also hook login page logout button to clear storage
          try{
            var logoutBtn = document.getElementById('logout');
            if (logoutBtn){
              logoutBtn.addEventListener('click', function(){
                try{
                  if (window.ttClearAuthStorage) window.ttClearAuthStorage();
                }catch(_){}
              });
            }
          }catch(_){}
        }catch(_){}
      });
    }
  }catch(_){}
})(); 

