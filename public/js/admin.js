/* ============================================================
   admin.js — admin dashboard + quiz management pages.
   ============================================================ */

// ---------- Admin Dashboard ----------
async function initDashboard() {
  const root = document.getElementById('adminDashboard');
  if (!root) return;
  try {
    const data = await api('/api/admin/dashboard');

    document.getElementById('statQuizzes').textContent = data.stats.totalQuizzes;
    const usersEl = document.getElementById('statUsers');
    if (usersEl) usersEl.textContent = data.stats.totalUsers != null ? data.stats.totalUsers : '—';
    document.getElementById('statActive').textContent = data.stats.activeQuizzes;
    const inactiveEl = document.getElementById('statInactive');
    if (inactiveEl) inactiveEl.textContent = data.stats.inactiveQuizzes;
    document.getElementById('statAttempts').textContent = data.stats.totalAttempts;

    // Recent quizzes
    const qList = document.getElementById('recentQuizzes');
    qList.innerHTML = data.recentQuizzes.length ? data.recentQuizzes.map((q) => `
      <div class="card">
        <div class="flex between">
          <span class="pill ${q.is_active ? 'on' : 'off'}">${q.is_active ? 'Active' : 'Draft'}</span>
          <span class="tag accent">#${escapeHtml(q.quiz_code)}</span>
        </div>
        <h3 class="mt-2">${escapeHtml(q.title)}</h3>
        <p class="muted">${q.participants} participant(s) · ${q.questions} questions</p>
        <div class="card-foot">
          <a class="btn btn-ghost btn-sm" href="/admin/quiz/${q.id}">Manage</a>
          <a class="btn btn-gradient btn-sm" href="/admin/quiz/${q.id}/leaderboard">Live board</a>
        </div>
      </div>`).join('')
      : `<div class="empty"><div class="big">🎯</div><h3>No quizzes yet</h3><p>Create your first quiz to get started.</p></div>`;

    // Top attempts
    const top = document.getElementById('topAttempts');
    top.innerHTML = data.topAttempts.length ? data.topAttempts.map((a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(a.participant)}</td>
        <td>${escapeHtml(a.quiz_title)}</td>
        <td>${fmtTime(a.time_taken_seconds)}</td>
        <td><b style="color:var(--success)">${a.score}</b></td>
      </tr>`).join('')
      : `<tr><td colspan="5" class="empty">No submissions yet.</td></tr>`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- All quizzes list ----------
async function initQuizzes() {
  const root = document.getElementById('adminQuizzesList');
  if (!root) return;
  try {
    const data = await api('/api/admin/quizzes');
    root.innerHTML = data.quizzes.length ? data.quizzes.map((q) => `
      <tr>
        <td><b>${escapeHtml(q.title)}</b><div class="faint" style="font-size:.8rem">${escapeHtml(q.subject || 'General')}</div></td>
        <td><span class="tag accent">#${escapeHtml(q.quiz_code)}</span></td>
        <td>${q.questions}</td>
        <td>${q.participants}</td>
        <td><span class="pill ${q.is_active ? 'on' : 'off'}">${q.is_active ? 'Active' : 'Draft'}</span></td>
        <td>
          <div class="flex" style="gap:6px">
            <a class="btn btn-ghost btn-sm" href="/admin/quiz/${q.id}">Edit</a>
            <a class="btn btn-gradient btn-sm" href="/admin/quiz/${q.id}/leaderboard">Board</a>
            <a class="btn btn-ghost btn-sm" href="/admin/quiz/${q.id}/results">Results</a>
          </div>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="empty"><div class="big">🎯</div><h3>No quizzes yet</h3><p>Create your first quiz to get started.</p></td></tr>`;
  } catch (err) {
    root.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

// ---------- Quiz results ----------
async function initQuizResults() {
  const root = document.getElementById('quizResults');
  if (!root) return;
  const quizId = root.dataset.quizId;
  const exportLink = document.getElementById('exportCsv');
  if (exportLink) exportLink.href = `/api/admin/export-results/${quizId}`;

  const btn = document.getElementById('announceWinners');
  if (btn) {
    btn.addEventListener('click', async () => {
      try {
        const data = await api(`/api/leaderboard/${quizId}`);
        const top = data.leaderboard.slice(0, 3);
        if (!top.length) return toast('No submissions to announce.', 'info');
        announceWinners(data.quiz.title, top);
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // Load leaderboard via socket for realtime, fallback to API fetch.
  const liveAnchor = document.getElementById('liveAnchor');
  if (liveAnchor) liveAnchor.href = `/admin/quiz/${quizId}/leaderboard`;

  async function refresh() {
    try {
      const data = await api(`/api/admin/results/${quizId}`);
      renderRows(data.leaderboard);
    } catch (err) { /* keep last rows */ }
  }

  setInterval(refresh, 6000);

  try {
    await refresh();

    const toggleBtn = document.getElementById('toggleActive');
    if (toggleBtn) {
      const status = await api(`/api/quizzes/${quizId}`);
      toggleBtn.innerHTML = status.quiz.is_active ? 'Stop quiz' : 'Reopen quiz';
      toggleBtn.classList.toggle('btn-danger', !!status.quiz.is_active);
      toggleBtn.addEventListener('click', async () => {
        toggleBtn.disabled = true;
        try {
          if (status.quiz.is_active) {
            await api(`/api/admin/quizzes/${quizId}/stop`, { method: 'POST' });
            toast('Quiz stopped — participants auto-submitted.', 'success');
          } else {
            await api(`/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify({ is_active: 1 }) });
            toast('Quiz reopened!', 'success');
          }
          setTimeout(() => window.location.reload(), 700);
        } catch (e) { toast(e.message, 'error'); toggleBtn.disabled = false; }
      });
    }
  } catch (err) {
    root.innerHTML = `<tr><td colspan="7" class="empty"><div class="big">😔</div><h3>Could not load results</h3><p>${escapeHtml(err.message)}</p></div></td></tr>`;
  }

function renderRows(lb) {
    root.innerHTML = lb.length
      ? lb.map((r) => `
        <tr class="${r.disqualified ? 'dq' : ''}">
          <td><b>${r.rank === null ? '—' : r.rank === 1 ? '🥇 ' : r.rank === 2 ? '🥈 ' : r.rank === 3 ? '🥉 ' : r.rank + '.'}</b></td>
          <td>${escapeHtml(r.participant)}${r.disqualified ? ' <span class="pill off">Disqualified</span>' : ''}</td>
          <td>${escapeHtml(r.email)}</td>
          <td><b style="color:var(--success)">${r.score}</b></td>
          <td>${fmtTime(r.time_taken_seconds)}</td>
          <td>${timeAgo(r.submitted_at)}</td>
          <td>
            <div class="flex" style="gap:6px;justify-content:flex-end">
              <button class="btn btn-ghost btn-sm dq-toggle" data-id="${r.attempt_id}" data-dq="${r.disqualified ? 1 : 0}">
                ${r.disqualified ? 'Reinstate' : 'Disqualify 🚫'}
              </button>
              <button class="btn btn-ghost btn-sm remove-attempt" data-id="${r.attempt_id}" data-name="${escapeHtml(r.participant)}">
                Remove record ↺
              </button>
            </div>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="empty"><div class="big">🤔</div><h3>No results yet</h3><p>Participants haven't submitted yet.</p></div></td></tr>`;

    root.querySelectorAll('.dq-toggle').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const disq = el.dataset.dq === '0' ? 1 : 0;
        try {
          await api(`/api/admin/attempts/${id}/disqualify`, { method: 'PUT', body: JSON.stringify({ disqualified: disq }) });
          toast(disq ? 'Participant disqualified.' : 'Participant reinstated.', 'success');
          await refresh();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    root.querySelectorAll('.remove-attempt').forEach((el) => {
      el.addEventListener('click', () => openRemoveAttempt(el.dataset));
    });
  }

  // ---- Remove attempt record (give the participant/device another chance) ----
  const removeModal = document.getElementById('removeAttemptModal');
  let removeTarget = null;

  function openRemoveAttempt(d) {
    removeTarget = { id: d.id, name: d.name };
    const text = document.getElementById('removeAttemptText');
    if (text) text.innerHTML = `Remove the attempt record of <b>${escapeHtml(d.name)}</b>?`;
    if (removeModal) removeModal.style.display = 'grid';
  }

  if (removeModal) {
    removeModal.addEventListener('click', (e) => {
      if (e.target === removeModal) removeModal.style.display = 'none';
    });
    const confirmBtn = document.getElementById('confirmRemoveAttempt');
    const errBox = removeModal.querySelector('[data-remove-error]');
    confirmBtn.addEventListener('click', async () => {
      if (!removeTarget) return;
      confirmBtn.disabled = true;
      try {
        await api(`/api/admin/attempts/${removeTarget.id}`, { method: 'DELETE' });
        toast('Attempt record removed — they can retake the quiz now.', 'success');
        removeModal.style.display = 'none';
        removeTarget = null;
        await refresh();
      } catch (err) {
        if (errBox) { errBox.textContent = err.message; errBox.classList.add('show'); }
        toast(err.message, 'error');
      } finally {
        confirmBtn.disabled = false;
      }
    });
  }
}

// Flashy winner announcement overlay (uses SpeechSynthesis when available).
function announceWinners(quizTitle, top) {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="winnerOverlay" style="position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:20px;background:rgba(5,8,16,.88);backdrop-filter:blur(10px)">
      <div class="glass" style="max-width:460px;width:100%;text-align:center;padding:36px;animation:toastIn .5s ease">
        <div style="font-size:3rem">🏆</div>
        <h2 style="font-size:1.6rem;margin:10px 0 4px">Winners of ${escapeHtml(quizTitle)}</h2>
        <p class="muted mb-3">Top 3 finishers</p>
        ${top.map((r, i) => `
          <div class="rank-row ${i === 0 ? 'first' : 'top'}" style="animation:none">
            <div class="medal">${['🥇','🥈','🥉'][i]}</div>
            <div class="who"><b>${escapeHtml(r.participant)}</b><span>${fmtTime(r.timeTaken)}</span></div>
            <div class="num"><b>${r.score}</b><span>pts</span></div>
          </div>`).join('')}
        <button class="btn btn-gradient btn-block mt-3" onclick="this.closest('#winnerOverlay').remove()">Close</button>
      </div>
    </div>`);

  if ('speechSynthesis' in window) {
    const names = top.map((r, i) => `Rank ${i + 1}: ${r.participant}`).join('. ');
    const msg = new SpeechSynthesisUtterance(`Congratulations! ${names}`);
    window.speechSynthesis.speak(msg);
  }
}

// ---------- User management ----------
async function initUsers() {
  const root = document.getElementById('adminUsersList');
  if (!root) return;

  const currentUserId = (window.MVIEW && MVIEW.currentUserId) || null;
  let deleteTarget = null;

  async function refresh() {
    try {
      const data = await api('/api/admin/users');
      root.innerHTML = data.users.length ? data.users.map((u) => `
        <tr>
          <td><b>${escapeHtml(u.name)}</b>${u.id === currentUserId ? ' <span class="faint">(you)</span>' : ''}</td>
          <td>${escapeHtml(u.email)}</td>
          <td><span class="pill ${u.role === 'organizer' ? 'on' : u.role === 'admin' ? 'warn' : 'off'}">${u.role === 'organizer' ? 'Admin Organizer' : u.role === 'admin' ? 'Admin' : 'Participant'}</span></td>
          <td>${u.attempts}</td>
          <td style="text-align:right">
            <div class="flex" style="gap:6px;justify-content:flex-end">
              <button class="btn btn-ghost btn-sm edit-user"
                data-id="${u.id}" data-name="${escapeHtml(u.name)}"
                data-email="${escapeHtml(u.email)}" data-role="${u.role}">Edit</button>
              ${u.id !== currentUserId ? `<button class="btn btn-danger btn-sm del-user" data-id="${u.id}" data-name="${escapeHtml(u.name)}">Delete</button>` : ''}
            </div>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="center muted">No users yet.</td></tr>`;

      root.querySelectorAll('.edit-user').forEach((el) => {
        el.addEventListener('click', () => openEditUser(el.dataset));
      });
      root.querySelectorAll('.del-user').forEach((el) => {
        el.addEventListener('click', () => openDeleteUser(el.dataset));
      });
    } catch (err) {
      root.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ---- Delete user ----
  const delModal = document.getElementById('deleteUserModal');
  const delErr = delModal ? delModal.querySelector('[data-del-error]') : null;

  function openDeleteUser(d) {
    deleteTarget = { id: d.id, name: d.name };
    const text = document.getElementById('deleteUserText');
    if (text) text.innerHTML = `Delete <b>${escapeHtml(d.name)}</b>?`;
    if (delErr) delErr.classList.remove('show');
    delModal.style.display = 'grid';
  }

  if (delModal) {
    delModal.addEventListener('click', (e) => {
      if (e.target === delModal) delModal.style.display = 'none';
    });
    const confirmBtn = document.getElementById('confirmUserDelete');
    confirmBtn.addEventListener('click', async () => {
      if (!deleteTarget) return;
      confirmBtn.disabled = true;
      try {
        await api(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
        toast(`${deleteTarget.name} deleted.`, 'success');
        delModal.style.display = 'none';
        deleteTarget = null;
        await refresh();
      } catch (err) {
        if (delErr) { delErr.textContent = err.message; delErr.classList.add('show'); }
        toast(err.message, 'error');
      } finally {
        confirmBtn.disabled = false;
      }
    });
  }

  const modal = document.getElementById('editUserModal');
  if (!modal) return;
  const form = document.getElementById('editUserForm');
  const errBox = modal.querySelector('[data-error]');

  function openEditUser(d) {
    form.elements.id.value = d.id;
    form.elements.name.value = d.name;
    form.elements.email.value = d.email;
    form.elements.role.value = d.role;
    form.elements.password.value = '';
    errBox.classList.remove('show');
    modal.style.display = 'grid';
  }

  // Click anywhere on the dimmed backdrop to close.
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = { name: fd.get('name'), email: fd.get('email'), role: fd.get('role') };
    if (fd.get('password')) payload.password = fd.get('password');
    try {
      await api(`/api/admin/users/${fd.get('id')}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('User updated!', 'success');
      modal.style.display = 'none';
      await refresh();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });

  refresh();
}

// ---------- Create / Edit quiz page ----------
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
  initQuizzes();
  initQuizResults();
  initUsers();
});