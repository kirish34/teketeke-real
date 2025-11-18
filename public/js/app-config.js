window.SUPABASE_URL='https://ecjkxgegjzvixyuukysk.supabase.co';
window.SUPABASE_ANON_KEY='sb_publishable_iY_CGooJG4me_7X0nO0enA_OgqbIhEK';
window.GMAPS_API_KEY='AIzaSyAX9n7y1QOjrOZHJwiNBkdYUJ5JET6X4aw';

(function(){
  try{
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.location && window.location.pathname === '/public/auth/login.html'){
      document.addEventListener('DOMContentLoaded', function(){
        try{
          var params = new URLSearchParams(window.location.search || '');
          var next = String(params.get('next') || '');
          var isTaxi = next.indexOf('/public/taxi/') === 0 || next.indexOf('/public/mobile/taxi/') === 0;
          var isBoda = next.indexOf('/public/bodaboda/') === 0 || next.indexOf('/public/mobile/boda/') === 0;
          if (!isTaxi && !isBoda) return;
          var msgHost = document.getElementById('msg');
          var parent = msgHost && msgHost.parentNode ? msgHost.parentNode : null;
          if (!parent) return;
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
          } else {
            return;
          }
          host.appendChild(link);
          if (msgHost.nextSibling){
            parent.insertBefore(host, msgHost.nextSibling);
          } else {
            parent.appendChild(host);
          }
        }catch(_){}
      });
    }
  }catch(_){}
})(); 

