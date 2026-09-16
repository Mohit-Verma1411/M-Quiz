/* ============================================================
   main.js — shared UI helpers: toasts, nav, fetch wrapper, forms.
   ============================================================ */

// ---------- Toasts ----------
function toast(message, type = 'info', duration = 3200) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, duration);
}

// ---------- Escape HTML in user content ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

// ---------- Nav toggle ----------
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
});

// ---------- Automatic form handling ----------
// Any form with [data-ajax] posts to its action as JSON and shows
// toasts + runs [data-redirect] on success.
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form.matches('[data-ajax]')) return;
  e.preventDefault();

  const btn = form.querySelector('button[type="submit"]');
  const errBox = form.querySelector('[data-error]');
  const successBox = form.querySelector('[data-success]');
  const payload = Object.fromEntries(new FormData(form).entries());

  if (btn) { btn.disabled = true; btn.dataset.original = btn.innerHTML; btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></span>'; }

  try {
    const res = await fetch(form.action, {
      method: form.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      if (errBox) { errBox.textContent = data.error || 'Request failed.'; errBox.classList.add('show'); }
      toast(data.error || 'Request failed.', 'error');
    } else {
      toast(data.message || 'Done!', 'success');
      if (successBox) { successBox.textContent = data.message || 'Success!'; successBox.classList.add('show'); }
      const redirect = form.dataset.redirect;
      if (redirect) setTimeout(() => { window.location.href = redirect; }, 600);
      const reload = form.dataset.reload;
      if (reload) setTimeout(() => window.location.reload(), 500);
    }
  } catch (err) {
    toast('Network error. Please try again.', 'error');
    if (errBox) { errBox.textContent = 'Network error.'; errBox.classList.add('show'); }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.original; }
  }
});

// ---------- Generic fetch helper ----------
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: res.status, ...data });
  return data;
}

// ---------- Format helpers ----------
function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

function timeAgo(dateStr) {
  const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}