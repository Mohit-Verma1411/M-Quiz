/* ============================================================
   quiz.js — live quiz experience.
   Bootstraps via POST /api/attempts/start which validates the
   quiz, requires a logged-in account, and blocks repeats.
   ============================================================ */
(function () {
  const cfg = window.MQUIZ;
  if (!cfg || !cfg.quizId) return;
  const quizId = cfg.quizId;

  const state = {
    userId: null,
    deviceId: null,
    quiz: null,
    questions: [],
    answers: {},           // questionId -> 'A'|'B'|'C'|'D'
    current: 0,
    remaining: 0,
    durationSec: 0,
    timerId: null,
    submitting: false,
    socket: null,
    socketOk: false,
  };

  const timerEl = document.getElementById('quizTimerTime');
  const timerWrap = document.getElementById('quizTimer');
  const loadingEl = document.getElementById('quizLoading');
  const boxEl = document.getElementById('questionBox');

  // ---------- Bootstrap ----------
  (async function boot() {
    try {
      const data = await api('/api/attempts/start', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });

      state.userId = data.userId;
      state.deviceId = data.deviceId || null;
      state.quiz = data.quiz;
      state.questions = data.questions;
      state.durationSec = state.quiz.duration_minutes * 60;
      state.remaining = state.durationSec;

      document.getElementById('quizTitle').textContent = state.quiz.title;
      if (loadingEl) loadingEl.classList.add('hidden');
      if (boxEl) boxEl.style.display = '';

      connectSocket();
      renderQuestion();
      updateNav();
      startTimer();
      startStopPoll();
    } catch (err) {
      // Reopen their own result if they already tried; otherwise show the
      // reason (e.g. previous attempt from THIS device) instead of looping.
      if (err.status === 409 && err.attemptId) {
        return window.location.replace(`/result/${err.attemptId}`);
      }
      if (loadingEl) loadingEl.innerHTML = `
        <div class="empty">
          <div class="big">😔</div>
          <h3>Could not start the quiz</h3>
          <p>${escapeHtml(err.message)}</p>
          <div class="flex center" style="justify-content:center;margin-top:16px">
            <a class="btn btn-ghost" href="/join">Try another code</a>
            <a class="btn btn-gradient" href="/">Home</a>
          </div>
        </div>`;
    }
  })();

  window.addEventListener('beforeunload', (e) => {
    if (!state.submitting) { e.preventDefault(); e.returnValue = ''; }
  });

  function connectSocket() {
    if (typeof io === 'undefined') return;
    try {
      state.socket = io();
      state.socket.on('connect', () => { state.socketOk = true; });
      state.socket.on('error', (err) => toast(err.message || 'Socket error.', 'error'));
      state.socket.on('quizStopped', (d) => {
        toast((d && d.message) || 'The quiz was stopped — submitting your answers.', 'warning', 6000);
        submitQuiz(true);
      });
    } catch (e) { /* API submit handles it */ }
  }

  // ---------- Timer ----------
  function startTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      state.remaining -= 1;
      renderTimer();
      if (state.remaining <= 0) {
        clearInterval(state.timerId);
        submitQuiz(true);
      }
    }, 1000);
  }

  function renderTimer() {
    const s = Math.max(0, state.remaining);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (timerEl) timerEl.textContent = `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    if (timerWrap) timerWrap.classList.toggle('warn', s <= 30);
  }

  // ---------- Rendering ----------
  function renderQuestion() {
    const q = state.questions[state.current];
    if (!q) return;

    document.getElementById('qIndex').textContent = `Question ${state.current + 1} of ${state.questions.length}`;
    document.getElementById('qText').textContent = q.question_text;
    document.getElementById('qMarks').textContent = `+${q.marks} marks`;

    const opts = [['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]];
    const optsEl = document.getElementById('qOptions');
    optsEl.innerHTML = opts.map(([letter, text]) => `
      <div class="option ${state.answers[q.id] === letter ? 'selected' : ''}" data-qid="${q.id}" data-letter="${letter}">
        <span class="letter">${letter}</span>
        <span>${escapeHtml(text)}</span>
      </div>`).join('');

    optsEl.querySelectorAll('.option').forEach((el) => {
      el.addEventListener('click', () => {
        const qid = el.dataset.qid;
        state.answers[qid] = el.dataset.letter;
        optsEl.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        el.classList.add('selected');
        updateNav();
      });
    });

    document.getElementById('btnPrev').disabled = state.current === 0;
    document.getElementById('btnNext').disabled = state.current === state.questions.length - 1;
    document.getElementById('qPager').textContent = `${state.current + 1} / ${state.questions.length}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateNav() {
    const nav = document.getElementById('questionNav');
    if (!nav) return;
    nav.innerHTML = state.questions.map((q, i) => {
      const cls = ['q-dot', i === state.current ? 'current' : '', state.answers[q.id] != null ? 'answered' : ''].join(' ');
      return `<div class="${cls}" data-idx="${i}">${i + 1}</div>`;
    }).join('');
    nav.querySelectorAll('.q-dot').forEach((el) => {
      el.addEventListener('click', () => { state.current = Number(el.dataset.idx); renderQuestion(); updateNav(); });
    });
  }

  // ---------- Nav actions ----------
  document.getElementById('btnPrev').addEventListener('click', () => { if (state.current > 0) { state.current--; renderQuestion(); updateNav(); } });
  document.getElementById('btnNext').addEventListener('click', () => { if (state.current < state.questions.length - 1) { state.current++; renderQuestion(); updateNav(); } });
  document.getElementById('btnSubmit').addEventListener('click', () => submitQuiz(false));

  // ---------- Admin stop detection (fallback when socket is down) ----------
  function startStopPoll() {
    setInterval(async () => {
      if (state.submitting) return;
      try {
        const data = await api(`/api/quizzes/${quizId}/status`);
        if (data.quiz && data.quiz.is_active === 0) {
          toast('The quiz was stopped by the host — submitting your answers.', 'warning', 6000);
          submitQuiz(true);
        }
      } catch (e) { /* network hiccup: retry next tick */ }
    }, 8000);
  }

  // ---------- Submission ----------
  async function submitQuiz(forced) {
    if (state.submitting) return;
    state.submitting = true;
    const btn = document.getElementById('btnSubmit');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    clearInterval(state.timerId);

    const answers = Object.entries(state.answers).map(([questionId, selectedOption]) => ({ questionId: +questionId, selectedOption }));
    const timeTaken = state.durationSec - state.remaining;
    const payload = { quizId, userId: state.userId, answers, timeTaken, deviceId: state.deviceId };

    try {
      const data = await api('/api/attempts/submit', { method: 'POST', body: JSON.stringify(payload) });
      if (state.socket && state.socketOk) state.socket.emit('submitQuiz', payload);
      toast(forced ? 'Time is up — auto-submitted! ⏱' : 'Quiz submitted! 🎉', 'success');
      setTimeout(() => { window.location.href = `/result/${data.attemptId}`; }, 700);
    } catch (err) {
      if (err.status === 409) {
        toast('Already submitted this quiz.', 'warning');
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      toast(err.message, 'error');
      state.submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Quiz'; }
      if (!state.timerId) startTimer();
    }
  }
})();