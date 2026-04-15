/* ============================================================
   VocabMate – app.js
   Features: CRUD words, CRUD categories, localStorage,
             Share link, Flashcard, Quiz (3 modes)
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
let vocab        = [];
let filteredList  = [];
let currentCategory = 'all';
let searchQuery  = '';
let editingId    = null;

// Categories: stored in localStorage, user can add/edit/delete
const DEFAULT_CATEGORIES = [
  { id: 'general',    name: 'Tổng hợp' },
  { id: 'business',   name: 'Kinh doanh' },
  { id: 'travel',     name: 'Du lịch' },
  { id: 'academic',   name: 'Học thuật' },
  { id: 'daily',      name: 'Hàng ngày' },
  { id: 'technology', name: 'Công nghệ' },
];
let categories = [];

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

// Shared vocab
let sharedVocab = null;

const STORAGE_KEY     = 'vocabmate_words';
const CATEGORIES_KEY  = 'vocabmate_categories';

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadFromStorage();
  checkSharedURL();
  renderCategorySelect();
  renderFilterChips();
  renderWordList();
  updateStats();
});

// ── Categories CRUD ────────────────────────────────────────
function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    categories = raw ? JSON.parse(raw) : [...DEFAULT_CATEGORIES];
  } catch { categories = [...DEFAULT_CATEGORIES]; }
  // Ensure at least general exists
  if (!categories.find(c => c.id === 'general')) {
    categories.unshift({ id: 'general', name: 'Tổng hợp' });
  }
}

function saveCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

function getCatLabel(catId) {
  const cat = categories.find(c => c.id === catId);
  return cat ? cat.name : catId;
}

function renderCategorySelect() {
  const selects = [
    document.getElementById('input-category'),
    document.getElementById('import-category-select')
  ];
  
  const optionsHtml = categories.map(c =>
    `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`
  ).join('');

  selects.forEach(s => {
    if (s) s.innerHTML = optionsHtml;
  });

  const quizSelect = document.getElementById('quiz-category-select');
  if (quizSelect) {
    quizSelect.innerHTML = `<option value="random50">🎲 Ngẫu nhiên (50 từ)</option>` + optionsHtml;
  }
}

function renderFilterChips() {
  const container = document.getElementById('filter-chips');
  let html = `<button class="chip ${currentCategory === 'all' ? 'active' : ''}" onclick="filterByCategory('all', this)">Tất cả</button>`;
  categories.forEach(c => {
    html += `<button class="chip ${currentCategory === c.id ? 'active' : ''}" onclick="filterByCategory('${escHtml(c.id)}', this)">${escHtml(c.name)}</button>`;
  });
  container.innerHTML = html;
}

function addCategory(name) {
  name = name.trim();
  if (!name) return;
  const id = 'cat_' + Date.now();
  categories.push({ id, name });
  saveCategories();
  renderCategorySelect();
  renderFilterChips();
  // Select the new category in the form
  document.getElementById('input-category').value = id;
}

function renameCategory(catId, newName) {
  newName = newName.trim();
  if (!newName) return;
  const cat = categories.find(c => c.id === catId);
  if (cat) {
    cat.name = newName;
    saveCategories();
    renderCategorySelect();
    renderFilterChips();
    renderWordList();
  }
}

function deleteCategory(catId) {
  // Don't allow deleting 'general'
  if (catId === 'general') {
    alert('Không thể xóa chủ đề "Tổng hợp"!');
    return;
  }
  // Move words in this category to 'general'
  vocab.forEach(w => {
    if (w.category === catId) w.category = 'general';
  });
  saveToStorage();

  categories = categories.filter(c => c.id !== catId);
  saveCategories();

  if (currentCategory === catId) currentCategory = 'all';
  renderCategorySelect();
  renderFilterChips();
  renderWordList();
}

// Category modal
function openCategoryModal(mode) {
  const modal = document.getElementById('category-modal');
  const content = document.getElementById('category-modal-content');

  if (mode === 'add') {
    content.innerHTML = `
      <div class="modal-icon">➕</div>
      <h3>Thêm chủ đề mới</h3>
      <input class="modal-input" id="new-cat-name" type="text" placeholder="Tên chủ đề..." autofocus onkeydown="if(event.key==='Enter'){confirmAddCategory()}" />
      <div class="modal-buttons">
        <button class="btn btn-ghost" onclick="closeCategoryModal()">Hủy</button>
        <button class="btn btn-primary" onclick="confirmAddCategory()">Thêm</button>
      </div>
    `;
  } else {
    // Manage mode: list all categories with edit/delete
    let listHtml = categories.map(c => {
      const isDefault = c.id === 'general';
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;">
          <span style="flex:1;font-weight:500;">${escHtml(c.name)}</span>
          <button class="btn btn-ghost btn-sm" onclick="promptRenameCategory('${c.id}','${escHtml(c.name)}')">✏️</button>
          ${isDefault ? '' : `<button class="btn btn-danger-outline btn-sm" onclick="promptDeleteCategory('${c.id}','${escHtml(c.name)}')">🗑️</button>`}
        </div>`;
    }).join('');

    content.innerHTML = `
      <div class="modal-icon">⚙️</div>
      <h3>Quản lý chủ đề</h3>
      <div style="text-align:left;margin-bottom:16px;max-height:300px;overflow-y:auto;">
        ${listHtml}
      </div>
      <div class="modal-buttons">
        <button class="btn btn-ghost" onclick="closeCategoryModal()">Đóng</button>
        <button class="btn btn-primary" onclick="closeCategoryModal();openCategoryModal('add')">➕ Thêm mới</button>
      </div>
    `;
  }

  modal.classList.remove('hidden');
  const input = document.getElementById('new-cat-name');
  if (input) setTimeout(() => input.focus(), 100);
}

function closeCategoryModal(e) {
  if (e && e.target !== document.getElementById('category-modal')) return;
  document.getElementById('category-modal').classList.add('hidden');
}

function confirmAddCategory() {
  const input = document.getElementById('new-cat-name');
  const name = input ? input.value.trim() : '';
  if (!name) { alert('Vui lòng nhập tên chủ đề!'); return; }
  addCategory(name);
  closeCategoryModal();
}

function promptRenameCategory(catId, currentName) {
  const newName = prompt(`Đổi tên chủ đề "${currentName}" thành:`, currentName);
  if (newName !== null && newName.trim()) {
    renameCategory(catId, newName);
    closeCategoryModal();
    openCategoryModal('manage'); // refresh the list
  }
}

function promptDeleteCategory(catId, catName) {
  if (confirm(`Xóa chủ đề "${catName}"?\n\nCác từ trong chủ đề này sẽ chuyển về "Tổng hợp".`)) {
    deleteCategory(catId);
    closeCategoryModal();
    openCategoryModal('manage'); // refresh
  }
}

// ── Bulk Import ────────────────────────────────────────────
function openImportModal() {
  const modal = document.getElementById('import-modal');
  modal.classList.remove('hidden');
  renderCategorySelect(); // Ensure categories match
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-stats').textContent = '';
}

function closeImportModal(e) {
  if (e && e.target !== document.getElementById('import-modal')) return;
  document.getElementById('import-modal').classList.add('hidden');
}

function processBulkImport() {
  const text = document.getElementById('import-textarea').value.trim();
  const catId = document.getElementById('import-category-select').value;
  
  if (!text) {
    alert('Vui lòng dán nội dung vào ô nhập liệu!');
    return;
  }

  const lines = text.split('\n');
  let count = 0;
  
  // To avoid ID collisions during rapid batch add
  let baseId = Date.now();

  lines.forEach((line, index) => {
    if (!line.trim()) return;

    // Split logic: Tab is standard for Word/Excel. 
    // Fallback split by 2+ spaces or semicolons
    let parts = line.split('\t');
    if (parts.length < 2) parts = line.split(/ {2,}/);
    if (parts.length < 2) parts = line.split(';');

    if (parts.length >= 2) {
      const en = parts[0]?.trim();
      const ipa = parts[1]?.trim();
      const vi = parts[2]?.trim() || '';
      const ex = parts[3]?.trim() || '';

      if (en) {
        vocab.unshift({
          id: baseId + index + Math.random(),
          en: en,
          pronunciation: ipa,
          vi: vi || en, // Fallback to EN if VI missing
          example: ex,
          category: catId,
          known: false
        });
        count++;
      }
    }
  });

  if (count > 0) {
    saveToStorage();
    applyFilters();
    renderWordList();
    updateStats();
    alert(`✅ Thành công! Đã nhập ${count} từ vựng vào hệ thống.`);
    closeImportModal();
  } else {
    alert('❌ Không tìm thấy dữ liệu hợp lệ. Lưu ý: Cần có ít nhất cột Từ vựng và Phiên âm/Nghĩa.');
  }
}

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
    vocab.unshift({
      id: Date.now(),
      en, pronunciation, vi, example, category,
      known: false,
    });
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
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Lưu';
  document.getElementById('btn-cancel-edit').style.display = 'inline-flex';

  document.getElementById('input-english').focus();
  document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('vocab-form').reset();
  document.getElementById('form-title-text').textContent = '✏️ Thêm từ mới';
  document.getElementById('btn-submit').innerHTML =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Thêm từ';
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
  if (btn) btn.classList.add('active');
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
        ${w.known ? '<span title="Đã nhớ" style="font-size:16px;">✅</span>' : ''}
      </div>
      <div class="word-vi">${escHtml(w.vi)}</div>
      ${w.example ? `<div class="word-example">${escHtml(w.example)}</div>` : ''}
      <div class="word-category-badge">${escHtml(getCatLabel(w.category))}</div>
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

function goToHome() {
  switchTab('list', document.getElementById('tab-list'));
  resetQuizToStart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  document.getElementById('fc-category').textContent      = getCatLabel(word.category);
  document.getElementById('fc-word').textContent          = word.en;
  document.getElementById('fc-pronunciation').textContent = word.pronunciation || '';
  document.getElementById('fc-meaning').textContent       = word.vi;
  document.getElementById('fc-example').textContent       = word.example || '';

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
    alert(`🎉 Hết bộ từ! Bạn đã nhớ ${vocab.filter(w => w.known).length}/${vocab.length} từ.`);
  }
}

// ── Quiz ───────────────────────────────────────────────────
function resetQuizToStart() {
  document.getElementById('quiz-start').style.display  = 'block';
  document.getElementById('quiz-area').classList.add('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
}

function startQuiz() {
  const catChoice = document.getElementById('quiz-category-select').value;
  let quizPool = [];

  if (catChoice === 'random50') {
    quizPool = shuffle([...vocab]).slice(0, 50);
  } else {
    quizPool = vocab.filter(w => w.category === catChoice);
  }

  if (quizPool.length < 2) {
    alert('Không đủ từ trong danh sách này! Bạn cần ít nhất 2 từ để làm Quiz.');
    return;
  }

  quizType      = document.querySelector('input[name="quiz-type"]:checked').value;
  quizQuestions = buildQuestions(quizType, quizPool);
  quizIndex     = 0;
  quizScore     = 0;
  waitingNext   = false;

  document.getElementById('quiz-start').style.display  = 'none';
  document.getElementById('quiz-area').classList.remove('hidden');
  document.getElementById('quiz-result').classList.add('hidden');
  document.getElementById('quiz-q-total').textContent = quizQuestions.length;

  renderQuestion();
}

function buildQuestions(type, pool) {
  pool = pool || shuffle([...vocab]).slice(0, Math.min(vocab.length, 15));
  const qs = shuffle([...pool]);
  return qs.map(word => {
    const distractors = vocab.filter(w => w.id !== word.id);
    if (type === 'fill') {
      return { word, type: 'fill' };
    } else if (type === 'choose') {
      const opts = shuffle([word, ...pickRandom(distractors, 3)]);
      return { word, type: 'choose', options: opts };
    } else {
      const opts = shuffle([word, ...pickRandom(distractors, 3)]);
      return { word, type: 'vi2en', options: opts };
    }
  });
}

function renderQuestion() {
  const q = quizQuestions[quizIndex];
  if (!q) { showQuizResult(); return; }

  document.getElementById('quiz-q-num').textContent  = quizIndex + 1;
  document.getElementById('quiz-score').textContent  = quizScore;

  const pct = (quizIndex / quizQuestions.length) * 100;
  document.getElementById('quiz-score-bar').style.width = pct + '%';

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
    <button class="choice-btn" data-id="${opt.id}" onclick="selectChoice(${opt.id}, ${correctId})">
      ${escHtml(labelFn(opt))}
    </button>
  `).join('');
}

function selectChoice(selectedId, correctId) {
  if (waitingNext) return;
  waitingNext = true;

  const btns = document.querySelectorAll('.choice-btn');
  btns.forEach(b => b.disabled = true);

  const isCorrect = selectedId === correctId;
  if (isCorrect) quizScore++;

  btns.forEach(b => {
    const id = parseInt(b.dataset.id);
    if (id === correctId) b.classList.add('correct');
    else if (id === selectedId && !isCorrect) b.classList.add('wrong');
  });

  showFeedback(isCorrect, quizQuestions[quizIndex].word);
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
  if (pct === 100)       { emoji = '🏆'; title = 'Hoàn hảo!'; }
  else if (pct >= 80)    { emoji = '🎉'; title = 'Xuất sắc!'; }
  else if (pct >= 60)    { emoji = '👍'; title = 'Khá tốt!'; }
  else if (pct >= 40)    { emoji = '📚'; title = 'Cần ôn thêm!'; }
  else                   { emoji = '💪'; title = 'Cố lên!'; }

  document.getElementById('result-emoji').textContent      = emoji;
  document.getElementById('result-title').textContent      = title;
  document.getElementById('result-score-text').textContent = `${quizScore}/${total} (${pct}%)`;
  document.getElementById('result-detail').textContent     =
    pct >= 80 ? 'Bạn đang học rất tốt! Hãy tiếp tục nhé 🌟' : 'Hãy ôn lại flashcard rồi thử lại nhé!';
}

function backToQuizStart() {
  document.getElementById('quiz-result').classList.add('hidden');
  document.getElementById('quiz-start').style.display = 'block';
}

function exitQuiz() {
  if (confirm('Bạn có chắc muốn thoát Quiz? Tiến trình hiện tại sẽ bị hủy.')) {
    goToHome();
  }
}

// ── Share Link ─────────────────────────────────────────────
function shareVocab() {
  if (vocab.length === 0) {
    alert('Bạn chưa có từ nào để chia sẻ!');
    return;
  }

  const btn = document.getElementById('btn-share');
  const originalHtml = btn.innerHTML;
  
  try {
    btn.innerHTML = '⌛ Đang tạo link...';
    btn.disabled = true;

    // Nén dữ liệu trực tiếp vào link (giảm ~70% dung lượng)
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(vocab));
    const url = `${location.origin}${location.pathname}?lz=${compressed}`;

    navigator.clipboard.writeText(url).then(() => {
      showToast("✅ Đã sao chép link chia sẻ!");
    }).catch(() => {
      prompt('Sao chép link này để chia sẻ:', url);
    });
  } catch (e) {
    console.error(e);
    alert('❌ Lỗi: Không thể tạo link. Hãy thử F5 trang web.');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function showToast(message) {
  const toast = document.getElementById('share-toast');
  const span = toast.querySelector('span');
  if (span) span.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

function checkSharedURL() {
  const params = new URLSearchParams(location.search);
  const lzData = params.get('lz');
  const oldShare = params.get('share');

  let dataToProcess = null;

  try {
    if (lzData) {
      // Giải nén từ link kiểu mới
      dataToProcess = JSON.parse(LZString.decompressFromEncodedURIComponent(lzData));
    } else if (oldShare) {
      // Tương thích với link kiểu cũ
      dataToProcess = JSON.parse(decodeURIComponent(escape(atob(oldShare))));
    }
    
    if (Array.isArray(dataToProcess) && dataToProcess.length > 0) {
      sharedVocab = dataToProcess;
      document.getElementById('shared-banner').classList.remove('hidden');
      // Hiển thị dữ liệu lên giao diện để xem trước
      vocab = dataToProcess;
      applyFilters();
      renderWordList();
      updateStats();
    }
  } catch (e) {
    console.warn('Link chia sẻ không hợp lệ hoặc bị hỏng.');
  }
}

function importSharedVocab() {
  if (!sharedVocab) return;
  let added = 0;

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
    const existing = new Set(vocab.map(w => w.en.toLowerCase()));
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
