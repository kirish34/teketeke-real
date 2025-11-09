import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
let _client = null;

function getClient(){
  if (!_client){
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase configuration. Check public/js/app-config.js');
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

export function supa(){ return getClient(); }
export function $(sel){ return document.querySelector(sel); }
export function el(id){ return document.getElementById(id); }

export function toast(message, variant='default'){
  const host = el('toast');
  if (!host) return;
  host.textContent = message;
  host.dataset.variant = variant;
  host.classList.add('show');
  clearTimeout(window.__tt_toast);
  window.__tt_toast = setTimeout(()=> host.classList.remove('show'), 2400);
}

export async function getSession(){
  const sb = getClient();
  const { data:{ session }, error } = await sb.auth.getSession();
  if (error) throw error;
  return session || null;
}

export async function getToken(){
  const session = await getSession();
  return session?.access_token || null;
}

export async function ensureAuth(options = {}){
  const session = await getSession();
  if (!session){
    const next = options.next || (location.pathname + location.search);
    location.href = '/public/auth/login.html?next=' + encodeURIComponent(next);
    throw new Error('Not authenticated');
  }
  return session;
}

export async function signOut(){
  try{
    await getClient().auth.signOut();
  }catch(e){
    console.warn('signOut failed', e);
  }
}

export async function authFetch(path, opts = {}){
  const token = await getToken();
  const headers = new Headers(opts.headers || {});
  if (!headers.has('Content-Type') && !(opts.body instanceof FormData)){
    headers.set('Content-Type','application/json');
  }
  if (token) headers.set('Authorization','Bearer '+token);

  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  let data = null;
  try{
    data = text ? JSON.parse(text) : null;
  }catch(_){}

  if (res.status === 401){
    await signOut();
    const next = location.pathname + location.search;
    location.href = '/public/auth/login.html?next=' + encodeURIComponent(next);
    throw new Error('Session expired');
  }
  if (!res.ok){
    const msg = data?.error || data?.message || text || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data ?? {};
}

export function mountServiceWorker(swPath = '/public/mobile/shared/sw.js'){
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(swPath).catch(()=>{});
}

export function onNetChange(handler){
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
}

export function fmtMoney(kes){
  if (kes == null || Number.isNaN(Number(kes))) return 'KES 0';
  return new Intl.NumberFormat('en-KE', { style:'currency', currency:'KES', maximumFractionDigits:0 }).format(Number(kes));
}

export function fmtDate(iso){
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' });
}
