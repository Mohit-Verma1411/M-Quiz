/* ============================================================
   leaderboard.js — renders the real-time leaderboard.
   Uses Socket.io when connected, with a 5s polling fallback.
   ============================================================ */
(function () {
  const root = document.getElementById('leaderboardRoot');
  if (!root) return;

  const quizId = root.dataset.quizId;
  const state = { socket: null, socketOk: false, pollTimer: null, lastLen: 0 };

  // ---------- Render ----------
  function setLive(connected) {
    const el = document.getElementById('lbLive');
    if (el) {
      el.classList.toggle('lb-live', connected);
      el.innerHTML = connected
        ? '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block"></span> LIVE · real-time updates'
        : '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--warning);display:inline-block"></span> POLLING · every 5s';
    }
  }

  function render(leaderboard) {
    const list = document.getElementById('lbList');
    if (!list) return;
    // Hide the placeholder loading state once we have real data.
    if (root && root.style) root.style.display = 'none';

    if (!leaderboard.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="big">🏆</div>
          <h3>No submissions yet</h3>
          <p>Be the first to submit and claim the top spot!</p>
        </div>`;
      setLive(!!state.socketOk);
      state.lastLen = 0;
      hideUpdate();
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = leaderboard.map((row, i) => {
      const idx = i + 1;
      const isLast = leaderboard.length - 1;
      const top = idx === 1 ? 'first' : idx <= 3 ? 'top' : '';
      const medal = idx <= 3 ? `<div class="medal">${medals[idx - 1]}</div>`
        : `<div class="rank-num">${idx}</div>`;
      return `
        <div class="rank-row ${top}" style="animation-delay:${i * 60}ms">
          ${medal}
          <div class="who">
            <b>${escapeHtml(row.participant)}</b>
            <span>${row.rank === 1 ? '⭐ ' : ''}Rank #${row.rank} · ${fmtTime(row.timeTaken)}</span>
          </div>
          <div class="num">
            <b>${row.score}</b><span>pts</span>
          </div>
        </div>`;
    }).join('');

    if (leaderboard.length !== state.lastLen) {
      flashUpdate();
    }
    state.lastLen = leaderboard.length;
    setLive(!!state.socketOk);
  }

  function flashUpdate() {
    const live = document.getElementById('lbLive');
    if (!live) return;
    live.classList.add('lb-live');
  }
  function hideUpdate() {
    const live = document.getElementById('lbLive');
    if (live) { /* keep indicator visible */ }
  }

  // ---------- Polling fallback (every 5000 ms) ----------
  async function poll() {
    try {
      const data = await api(`/api/leaderboard/${quizId}`);
      render(data.leaderboard);
    } catch (err) {
      // Silent: socket is authoritative; polling just compliments it.
    }
  }

  function startPolling() { state.pollTimer = setInterval(poll, 5000); }
  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); }

  // ---------- Socket.io ----------
  function connectSocket() {
    if ((typeof io === 'undefined') || !state.socketOk) { startPolling(); return; }
    state.socket = io();

    state.socket.on('connect', () => {
      state.socket.emit('joinQuizRoom', { quizId });
      stopPolling();
      state.socketOk = true;
      setLive(true);
    });

    state.socket.on('leaderboardUpdated', (data) => {
      if (String(data.quizId) === String(quizId)) render(data.leaderboard);
    });

    state.socket.on('quizSubmitted', () => {
      toast('A new result came in! 🎉', 'success');
    });

    state.socket.on('disconnect', () => {
      state.socketOk = false;
      setLive(false);
      stopPolling();
      startPolling(); // graceful fallback
    });

    // If socket cannot connect within 4s, fall back to polling.
    setTimeout(() => {
      if (!state.socketOk) { startPolling(); setLive(false); }
    }, 4000);
  }

  // ---------- Boot ----------
  poll();
  if (typeof io !== 'undefined') {
    try { connectSocket(); } catch (e) { startPolling(); }
  } else {
    startPolling();
  }
})();