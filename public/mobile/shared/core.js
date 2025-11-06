import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export function $(sel){ return document.querySelector(sel); }
export function el(id){ return document.getElementById(id); }
export function toast(msg){
  const t = el('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(window._t); window._t = setTimeout(()=> t.classList.remove('show'), 2000);
}
export function supa(){
  return createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
export async function getToken(){
  const sb = supa();
  const { data:{ session } } = await sb.auth.getSession();
  return session?.access_token || null;
}
export async function authFetch(path, opts={}){
  const t = await getToken();
  const h = Object.assign({ 'Content-Type':'application/json' }, opts.headers||{});
  if (t) h['Authorization'] = 'Bearer ' + t;
  const r = await fetch(path, { ...opts, headers: h });
  const tx = await r.text();
  if (!r.ok) throw new Error(tx || r.statusText);
  try { return JSON.parse(tx); } catch { return {}; }
}
export async function ensureAuth(){
  const sb = supa();
  const { data:{ session } } = await sb.auth.getSession();
  if (!session){
    location.href = '/public/auth/login.html?next=' + encodeURIComponent(location.pathname);
  }
}
export function mountServiceWorker(swPath='/public/mobile/shared/sw.js'){
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register(swPath).catch(()=>{});
  }
}
