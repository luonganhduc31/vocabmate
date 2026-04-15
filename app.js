/* ============================================================
   VocabMate – app.js
   Features: CRUD, localStorage, Share link (URL-encoded),
             Flashcard (flip + mark), Quiz (3 modes)
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
let vocab        = [];          // [{id, en, pronunciation, vi, example, category, known}]
let filteredList = [];          // currently shown in list tab
let currentCategory = 'all';
let searchQuery = '';
let editingId = null;

// Flashcard
let fcDeck  = [];
let fcIndex = 0;

// Quiz
let quizQuestions = [];
let quizIndex     = 0;
let quizScore     = 0;
let quizType      = 'fill';
let waitingNext   = false;

// Delete modal
let deleteTargetId = null;

// Shared vocab (from URL)
let sharedVocab = null;

const STORAGE_KEY = 'vocabmate_words';

// ── Category labels ────────────────────────────────────────
const CAT_LABELS = {
  general:    'Tổng hợp',
  business:   'Kinh doanh',
  travel:     'Du lịch',
  academic:   'Học thuật',
  daily:      'Hàng ngày',
  technology: 'Công nghệ',
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  checkSharedURL();
  renderWordList();
  updateStats();
});

// ── Storage ────────────────────────────────────────────────
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    vocab = raw ? JSON.parse(raw) : [];
  } catch { vocab = []; }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vocab));
}

// ── Add / Edit ─────────────────────────────────────────────
function handleFormSubmit(e) {
  e.preventDefault();
  const en            = document.getElementById('input-english').value.trim();
  const pronunciation = document.getElementById('input-pronunciation').value.trim();
  const vi            = document.getElementById('input-vietnamese').value.trim();
  const example       = document.getElementById('input-example').value.trim();
  const category      = document.getElementById('input-category').value;

  if (!en || !vi) return;

  if (editingId !== null) {
    const idx = vocab.findIndex(w => w.id === editingId);
    if (idx !== -1) {
      vocab[idx] = { ...vocab[idx], en, pronunciation, vi, example, category };
    }
    cancelEdit();
  } else {
    const word = {
      id: Date.now(),
      en, pronunciation, vi, example, category,
      known: false,
    };
    vocab.unshift(word);
  }

  saveToStorage();
  applyFilters();
  renderWordList();
  updateStats();
  document.getElementById('vocab-form').reset();
}

function editWord(id) {
  const word = vocab.find(w => w.id === id);
  if (!word) return;

  editingId = id;
  document.getElementById('input-english').value       = word.en;
  document.getElementById('input-pronunciation').value = word.pronunciation || '';
  document.getElementById('input-vietnamese').value    = word.vi;
  document.getElementById('input-example').value       = word.example || '';
  document.getElementById('input-category').value      = word.category;

  document.getElementById('form-title-text').textContent = '✏️ Chỉnh sửa từ';
  document.getElementById('btn-submit').innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Lưu';
  document.getElementById('btn-cancel-edit').style.display = 'inline-flex';

  document.getElementById('input-english').focus();
  document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('vocab-form').reset();
  document.getElementById('form-title-text').textContent = '✏️ Thêm từ mới';
  document.getElementById('btn-submit').innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Thêm từ';
  document.getElementById('btn-cancel-edit').style.display = 'none';
}

// ── Delete ─────────────────────────────────────────────────
function openDeleteModal(id) {
  const word = vocab.find(w => w.id === id);
  if (!word) return;
  deleteTargetId = id;
  document.getElementById('modal-word-name').textContent = `"${word.en}" — ${word.vi}`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal(e) {
  if (e && e.target !== document.getElementById('delete-modal')) return;
  document.getElementById('delete-modal').classList.add('hidden');
  deleteTargetId = null;
}

function confirmDelete() {
  if (deleteTargetId === null) return;
  vocab = vocab.filter(w => w.id !== deleteTargetId);
  saveToStorage();
  applyFilters();
  renderWordList();
  updateStats();
  document.getElementById('delete-modal').classList.add('hidden');
  deleteTargetId = null;
}

function clearAllWords() {
  if (!vocab.length) return;
  if (!confirm(`Bạn có chắc muốn xóa tất cả ${vocab.length} từ không?`)) return;
  vocab = [];
  saveToStorage();
  applyFilters();
  renderWordList();
  updateStats();
}

// ── Filter & Search ────────────────────────────────────────
function filterByCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
  renderWordList();
}

function filterWords() {
  searchQuery = document.getElementById('search-input').value.toLowerCase();
  applyFilters();
  renderWordList();
}

function applyFilters() {
  filteredList = vocab.filter(w => {
    const catMatch = currentCategory === 'all' || w.category === currentCategory;
    const searchMatch = !searchQuery ||
      w.en.toLowerCase().includes(searchQuery) ||
      w.vi.toLowerCase().includes(searchQuery) ||
      (w.example || '').toLowerCase().includes(searchQuery);
    return catMatch && searchMatch;
  });
}

// ── Render Word List ───────────────────────────────────────
function renderWordList() {
  applyFilters();
  const container = document.getElementById('word-list');
  const empty     = document.getElementById('empty-state');

  if (filteredList.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  container.innerHTML = filteredList.map(w => `
    <div class="word-card" id="wc-${w.id}">
      <div class="word-card-header">
        <div>
          <div class="word-en">${escHtml(w.en)}</div>
          ${w.pronunciation ? `<div class="word-pronunciation">${escHtml(w.pronunciation)}</div>` : ''}
        </div>
        ${w.known ? '<span title="Đã nhớ" style="font-size:18px;">✅</span>' : ''}
      </div>
      <div class="word-vi">${escHtml(w.vi)}</div>
      ${w.example ? `<div class="word-example">${escHtml(w.example)}</div>` : ''}
      <div class="word-category-badge">${escHtml(CAT_LABELS[w.category] || w.category)}</div>
      <div class="word-card-actions">
        <button class="action-btn" onclick="editWord(${w.id})" title="Chỉnh sửa">✏️</button>
        <button class="action-btn delete" onclick="openDeleteModal(${w.id})" title="Xóa">🗑️</button>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  document.getElementById('total-words').textContent = vocab.length;
}

// ── Tabs ───────────────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById(`panel-${tab}`).classList.remove('hidden');

  if (tab === 'flashcard') initFlashcard();
  if (tab === 'quiz')      resetQuizToStart();
}

// ── Flashcard ──────────────────────────────────────────────
function initFlashcard() {
  fcDeck  = shuffle([...vocab]);
  fcIndex = 0;
  renderFlashcard();
}

function shuffleFlashcards() {
  fcDeck = shuffle([...vocab]);
  fcIndex = 0;
  resetCardFlip();
  renderFlashcard();
}

function resetFlashcards() {
  fcIndex = 0;
  resetCardFlip();
  renderFlashcard();
}

function renderFlashcard() {
  const area  = document.getElementById('flashcard-area');
  const empty = document.getElementById('fc-empty');

  if (fcDeck.length === 0) {
    area.style.display  = 'none';
    empty.classList.remove('hidden');
    document.querySelector('.fc-nav').style.display = 'none';
    document.querySelector('.fc-progress-bar-wrap').style.display = 'none';
    document.querySelector('.flashcard-controls').style.display = 'none';
    return;
  }

  area.style.display  = 'flex';
  empty.classList.add('hidden');
  document.querySelector('.fc-nav').style.display = 'flex';
  document.querySelector('.fc-progress-bar-wrap').style.display = 'block';
  document.querySelector('.flashcard-controls').style.display = 'flex';

  resetCardFlip();

  const word = fcDeck[fcIndex];
  document.getElementById('fc-category').textContent     = CAT_LABELS[word.category] || word.category;
  document.getElementById('fc-word').textContent         = word.en;
  document.getElementById('fc-pronunciation').textContent = word.pronunciation || '';
  document.getElementById('fc-meaning').textContent      = word.vi;
  document.getElementById('fc-example').textContent      = word.example || '';

  document.getElementById('fc-current').textContent = fcIndex + 1;
  document.getElementById('fc-total').textContent   = fcDeck.length;

  const pct = ((fcIndex + 1) / fcDeck.length) * 100;
  document.getElementById('fc-progress-bar').style.width = pct + '%';

  document.getElementById('btn-prev').disabled = fcIndex === 0;
  document.getElementById('btn-next').disabled = fcIndex === fcDeck.length - 1;
}

function flipCard() {
  document.getElementById('card-inner').classList.toggle('flipped');
}

function resetCardFlip() {
  document.getElementById('card-inner').classList.remove('flipped');
}

function prevCard() {
  if (fcIndex > 0) { fcIndex--; renderFlashcard(); }
}

function nextCard() {
  if (fcIndex < fcDeck.length - 1) { fcIndex++; renderFlashcard(); }
}

function markCard(known) {
  const word = fcDeck[fcIndex];
  const idx  = vocab.findIndex(w => w.id === word.id);
  if (idx !== -1) {
    vocab[idx].known = known;
    saveToStorage();
  }
  if (fcIndex < fcDeck.length - 1) {
    fcIndex++;
    renderFlashcard();
  } else {
    // End of deck
    alert(`🎉 Hết bộ từ! Bạn đã đánh dấu đã nhớ ${vocab.filter(w=>w.known).length}/${vocab.length} từ.`);
  }
}

// ── Quiz ───────────────────────────────────────────────────
function resetQuizToStart() {
  document.getElementById('quiz-start').style.display  = 'block';
  document.getElementById('quiz-area').classList.add('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
}

function startQuiz() {
  if (vocab.length < 2) {
    alert('Bạn cần ít nhất 2 từ để bắt đầu Quiz!');
    return;
  }
  quizType      = document.querySelector('input[name="quiz-type"]:checked').value;
  quizQuestions = buildQuestions(quizType);
  quizIndex     = 0;
  quizScore     = 0;
  waitingNext   = false;

  document.getElementById('quiz-start').style.display  = 'none';
  document.getElementById('quiz-area').classList.remove('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
  document.getElementById('quiz-q-total').textContent = quizQuestions.length;

  renderQuestion();
}

function buildQuestions(type) {
  const qs = shuffle([...vocab]).slice(0, Math.min(vocab.length, 15));
  return qs.map(word => {
    const distractors = vocab.filter(w => w.id !== word.id);
    if (type === 'fill') {
      return { word, type: 'fill' };
    } else if (type === 'choose') {
      // Show EN word, pick correct VI meaning
      const opts = shuffle([word, ...pickRandom(distractors, 3)]);
      return { word, type: 'choose', options: opts };
    } else {
      // vi2en: Show VI meaning, pick correct EN word
      const opts = shuffle([word, ...pickRandom(distractors, 3)]);
      return { word, type: 'vi2en', options: opts };
    }
  });
}

function renderQuestion() {
  const q = quizQuestions[quizIndex];
  if (!q) { showQuizResult(); return; }

  document.getElementById('quiz-q-num').textContent = quizIndex + 1;
  document.getElementById('quiz-score').textContent  = quizScore;

  const pct = (quizIndex / quizQuestions.length) * 100;
  document.getElementById('quiz-score-bar').style.width = pct + '%';

  // Reset UI
  const feedback = document.getElementById('quiz-feedback');
  feedback.classList.add('hidden');
  feedback.className = 'quiz-feedback hidden';
  document.getElementById('btn-next-question').style.display = 'none';
  waitingNext = false;

  if (q.type === 'fill') {
    document.getElementById('quiz-q-label').textContent = '✏️ Điền từ tiếng Anh theo nghĩa sau:';
    document.getElementById('quiz-q-text').textContent  = q.word.vi;
    document.getElementById('quiz-fill-area').classList.remove('hidden');
    document.getElementById('quiz-choices-area').classList.add('hidden');
    const input = document.getElementById('quiz-fill-input');
    input.value = '';
    input.disabled = false;
    document.getElementById('btn-submit-answer').disabled = false;
    setTimeout(() => input.focus(), 80);

  } else if (q.type === 'choose') {
    document.getElementById('quiz-q-label').textContent = '🎯 Chọn nghĩa đúng của từ:';
    document.getElementById('quiz-q-text').textContent  = q.word.en + (q.word.pronunciation ? `  ${q.word.pronunciation}` : '');
    document.getElementById('quiz-fill-area').classList.add('hidden');
    document.getElementById('quiz-choices-area').classList.remove('hidden');
    renderChoices(q.options, w => w.vi, q.word.id);

  } else {
    document.getElementById('quiz-q-label').textContent = '🔄 Từ tiếng Anh tương ứng với nghĩa:';
    document.getElementById('quiz-q-text').textContent  = q.word.vi;
    document.getElementById('quiz-fill-area').classList.add('hidden');
    document.getElementById('quiz-choices-area').classList.remove('hidden');
    renderChoices(q.options, w => w.en, q.word.id);
  }
}

function renderChoices(options, labelFn, correctId) {
  const container = document.getElementById('quiz-choices');
  container.innerHTML = options.map(opt => `
    <button class="choice-btn" onclick="selectChoice(${opt.id}, ${correctId})">
      ${escHtml(labelFn(opt))}
    </button>
  `).join('');
}

function selectChoice(selectedId, correctId) {
  if (waitingNext) return;
  waitingNext = true;

  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach(b => b.disabled = true);

  const correct = selectedId === correctId;
  if (correct) quizScore++;

  btns.forEach(b => {
    const id = parseInt(b.getAttribute('onclick').split('(')[1]);
    if (id === correctId) b.classList.add('correct');
    else if (id === selectedId && !correct) b.classList.add('wrong');
  });

  showFeedback(correct, quizQuestions[quizIndex].word);
}

function submitFillAnswer() {
  if (waitingNext) return;
  const input = document.getElementById('quiz-fill-input');
  const answer = input.value.trim().toLowerCase();
  const correct = quizQuestions[quizIndex].word.en.toLowerCase();
  const isRight = answer === correct || levenshtein(answer, correct) <= 1;

  if (isRight) quizScore++;
  waitingNext = true;
  input.disabled = true;
  document.getElementById('btn-submit-answer').disabled = true;

  showFeedback(isRight, quizQuestions[quizIndex].word);
}

function showFeedback(correct, word) {
  const feedback = document.getElementById('quiz-feedback');
  feedback.classList.remove('hidden', 'correct', 'wrong');
  feedback.classList.add(correct ? 'correct' : 'wrong');

  if (correct) {
    feedback.innerHTML = `✅ Chính xác! <strong>${escHtml(word.en)}</strong> = ${escHtml(word.vi)}`;
  } else {
    feedback.innerHTML = `❌ Chưa đúng. Đáp án: <strong>${escHtml(word.en)}</strong> = ${escHtml(word.vi)}`;
  }

  document.getElementById('btn-next-question').style.display = 'inline-flex';
}

function nextQuestion() {
  quizIndex++;
  if (quizIndex >= quizQuestions.length) {
    showQuizResult();
  } else {
    renderQuestion();
  }
}

function showQuizResult() {
  document.getElementById('quiz-area').classList.add('hidden');
  const result = document.getElementById('quiz-result');
  result.classList.remove('hidden');

  const total  = quizQuestions.length;
  const pct    = Math.round((quizScore / total) * 100);

  let emoji, title;
  if (pct === 100) { emoji = '🏆'; title = 'Hoàn hảo!'; }
  else if (pct >= 80) { emoji = '🎉'; title = 'Xuất sắc!'; }
  else if (pct >= 60) { emoji = '👍'; title = 'Khá tốt!'; }
  else if (pct >= 40) { emoji = '📚'; title = 'Cần ôn thêm!'; }
  else { emoji = '💪'; title = 'Cố lên!'; }

  document.getElementById('result-emoji').textContent      = emoji;
  document.getElementById('result-title').textContent      = title;
  document.getElementById('result-score-text').textContent = `${quizScore}/${total} (${pct}%)`;
  document.getElementById('result-detail').textContent     =
    pct >= 80
      ? 'Bạn đang học rất tốt! Hãy tiếp tục nhé 🌟'
      : 'Hãy ôn lại flashcard rồi thử lại nhé!';
}

function backToQuizStart() {
  document.getElementById('quiz-result').classList.add('hidden');
  document.getElementById('quiz-start').style.display = 'block';
}

// ── Share Link ─────────────────────────────────────────────
function shareVocab() {
  if (vocab.length === 0) {
    alert('Bạn chưa có từ nào để chia sẻ!');
    return;
  }

  try {
    const data    = JSON.stringify(vocab);
    const encoded = btoa(unescape(encodeURIComponent(data)));
    const url     = `${location.origin}${location.pathname}?share=${encoded}`;

    navigator.clipboard.writeText(url).then(() => {
      showToast();
    }).catch(() => {
      prompt('Sao chép link này để chia sẻ:', url);
    });
  } catch (e) {
    alert('Không thể tạo link chia sẻ. Bộ từ của bạn có thể quá lớn.');
  }
}

function showToast() {
  const toast = document.getElementById('share-toast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function checkSharedURL() {
  const params = new URLSearchParams(location.search);
  const share  = params.get('share');
  if (!share) return;

  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(share))));
    if (Array.isArray(decoded) && decoded.length > 0) {
      sharedVocab = decoded;
      document.getElementById('shared-banner').classList.remove('hidden');
      // Temporarily display shared vocab
      vocab = decoded;
      applyFilters();
      renderWordList();
      updateStats();
    }
  } catch {
    console.warn('Invalid share link');
  }
}

function importSharedVocab() {
  if (!sharedVocab) return;
  // Merge, avoid duplicates by english word
  let added = 0;
  const existing = new Set(vocab.map(w => w.en.toLowerCase()));

  // Load user's own vocab first
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const own = raw ? JSON.parse(raw) : [];
    const ownSet = new Set(own.map(w => w.en.toLowerCase()));
    sharedVocab.forEach(w => {
      if (!ownSet.has(w.en.toLowerCase())) {
        own.push({ ...w, id: Date.now() + Math.random(), known: false });
        added++;
      }
    });
    vocab = own;
    saveToStorage();
  } catch {
    sharedVocab.forEach(w => {
      if (!existing.has(w.en.toLowerCase())) {
        vocab.push({ ...w, id: Date.now() + Math.random(), known: false });
        added++;
      }
    });
    saveToStorage();
  }

  sharedVocab = null;
  document.getElementById('shared-banner').classList.add('hidden');

  // Remove share param from URL
  history.replaceState({}, '', location.pathname);

  applyFilters();
  renderWordList();
  updateStats();
  alert(`✅ Đã nhập ${added} từ mới vào bộ từ của bạn!`);
}

// ── Helpers ────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr, n) {
  return shuffle([...arr]).slice(0, Math.min(n, arr.length));
}

// Simple Levenshtein distance for typo tolerance in fill quiz
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) =>
    Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
