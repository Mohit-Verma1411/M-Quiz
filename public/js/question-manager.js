/* ============================================================
   question-manager.js — add / edit / delete questions with a
   card editor on the "manage questions" page.
   Existing rows carry [data-id]; new rows are created; edits and
   removals are synced to the server in one request.
   ============================================================ */
(function () {
  const root = document.getElementById('questionEditor');
  if (!root) return;

  const quizId = root.dataset.quizId;
  const LETTERS = ['A', 'B', 'C', 'D'];
  const removedIds = [];

  // ---------- Build an empty question template ----------
  function optionFields(q, i) {
    return LETTERS.map((l) => {
      const key = 'option_' + l.toLowerCase();
      const val = q ? (q[key] || '') : '';
      return `<input class="input" data-field="${key}" placeholder="Option ${l}…" value="${escapeAttr(val)}">`;
    }).join('');
  }

  function rowTemplate({ index, q = null }) {
    const correct = q ? q.correct_option : 'A';
    const marks = q ? q.marks : 1;
    return `
      <div class="q-edit-row" data-row="${index}" ${q ? `data-id="${q.id}"` : ''}>
        <div class="q-head between">
          <b>Q${index + 1}</b>
          <div class="flex" style="gap:6px">
            <button class="btn btn-danger btn-sm" data-del>Remove</button>
          </div>
        </div>
        <textarea class="input" data-field="question_text" placeholder="Type the question…">${escapeHtml(q ? q.question_text : '')}</textarea>
        <div class="q-meta-row">
          <select data-field="correct_option">
            ${LETTERS.map((l) => `<option value="${l}" ${l === correct ? 'selected' : ''}>Correct: ${l}</option>`).join('')}
          </select>
          <input class="input" type="number" min="1" value="${marks}" style="width:110px" data-field="marks">
          <span class="faint" style="font-size:.82rem">marks</span>
        </div>
        <div class="q-opt-grid mt-2">${optionFields(q, index)}</div>
      </div>`;
  }

  function escapeAttr(v) {
    return String(v).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function collectRow(el) {
    return {
      question_text: el.querySelector('[data-field="question_text"]').value.trim(),
      option_a: el.querySelector('[data-field="option_a"]').value.trim(),
      option_b: el.querySelector('[data-field="option_b"]').value.trim(),
      option_c: el.querySelector('[data-field="option_c"]').value.trim(),
      option_d: el.querySelector('[data-field="option_d"]').value.trim(),
      correct_option: el.querySelector('[data-field="correct_option"]').value,
      marks: Number(el.querySelector('[data-field="marks"]').value) || 1,
    };
  }

  function rerender() {
    const rows = [...root.querySelectorAll('.q-edit-row')];
    rows.forEach((el, i) => { el.querySelector('.q-head b').textContent = `Q${i + 1}`; });
    const empty = root.querySelector('.empty');
    if (empty) {
      if (rows.length) empty.remove();
    } else if (!rows.length) {
      root.insertAdjacentHTML('beforeend', `<div class="empty"><div class="big">⛳</div><h3>No questions yet</h3><p>Add your first question below.</p></div>`);
    }
  }

  // Remove row (track existing ids for server-side delete)
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (btn) {
      const row = btn.closest('.q-edit-row');
      if (row.dataset.id) removedIds.push(+row.dataset.id);
      row.remove();
      rerender();
    }
  });

  // Add question
  const addBtn = document.getElementById('addQuestion');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      root.insertAdjacentHTML('beforeend', rowTemplate({ index: allRows().length }));
      rerender();
    });
  }

  function allRows() { return [...root.querySelectorAll('.q-edit-row')]; }

  // Save: split into create / update / delete
  const saveBtn = document.getElementById('saveQuestions');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const rows = allRows().map((el) => ({ id: el.dataset.id ? +el.dataset.id : null, payload: collectRow(el) }));
      const valid = rows.every((r) => r.payload.question_text && r.payload.option_a && r.payload.option_b && r.payload.option_c && r.payload.option_d);
      if (!rows.length && !removedIds.length) return toast('Nothing to save yet.', 'info');
      if (!valid) return toast('Every question needs text for all 4 options.', 'error');

      const body = {
        create: rows.filter((r) => !r.id).map((r) => r.payload),
        update: rows.filter((r) => r.id).map((r) => ({ id: r.id, ...r.payload })),
        delete: removedIds,
      };

      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        const data = await api(`/api/quizzes/${quizId}/questions`, { method: 'POST', body: JSON.stringify(body) });
        toast(data.message, 'success');
        setTimeout(() => window.location.reload(), 700);
      } catch (e) {
        toast(e.message, 'error');
        saveBtn.disabled = false; saveBtn.textContent = 'Save Questions';
      }
    });
  }

  rerender();
})();