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
let needsFinalReview = new Set(); // IDs of words that need review at the end

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

// Celebrities for Quiz Lifelines
const CELEBRITIES = [
  { name: 'Jack - 5 Củ', img: 'meme/jack.png', msg: 'Anh không "xòe" nữa, gợi ý cho em cực căng này, ngọt ngào như lời hứa 5 triệu luôn!' },
  { name: 'Độ Mixi (Tộc Trưởng)', img: 'meme/domixi.png', msg: 'Đáp án này mà sai thì tôi "off stream" luôn cho các ông xem! Tộc trưởng không bao giờ nói phét.' },
  { name: 'Trấn Thành (Cry)', img: 'meme/tranthanh.png', msg: 'Thành CRY đã ở đây để giúp bạn vượt qua nỗi đau mất điểm! Nước mắt rơi vì đáp án quá chuẩn...' },
  { name: 'Bô Lão Dũng CT', img: 'meme/dungct.png', msg: 'Phê chưa? Đáp án này mới gọi là "best" này các bạn! Cùng quẩy linh hồn của bô lão nào.' },
  { name: 'Sơn Tùng MTP (Sky)', img: 'meme/sontung.png', msg: 'Nắng ấm đã về, và đáp án chính là đây! Hãy tỏa sáng rực rỡ như một Sky chân chính nhé.' }
];

// Streak state
let streak = 0;
let lastDate = null; // last date user practiced flashcards

const STORAGE_KEY     = 'vocabmate_words';
const CATEGORIES_KEY  = 'vocabmate_categories';
const STREAK_KEY      = 'vocabmate_streak';
const LAST_DATE_KEY   = 'vocabmate_last_date';

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadFromStorage();
  loadStreak();
  checkSharedURL();
  renderCategorySelect();
  renderFilterChips();
  renderWordList();
  updateStats();
  updateFlashcardStats();
});

function loadStreak() {
  streak = parseInt(localStorage.getItem(STREAK_KEY)) || 0;
  lastDate = localStorage.getItem(LAST_DATE_KEY);
  
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  if (lastDate) {
    const last = new Date(lastDate);
    const curr = new Date(today);
    const diff = (curr - last) / (1000 * 60 * 60 * 24);
    
    if (diff > 1) {
      streak = 0; // Lost streak
    }
  }
}

function updateStreak() {
  const today = new Date().toLocaleDateString('en-CA');
  if (lastDate !== today) {
    if (lastDate) {
      const last = new Date(lastDate);
      const curr = new Date(today);
      const diff = (curr - last) / (1000 * 60 * 60 * 24);
      if (diff === 1) streak++;
      else if (diff > 1) streak = 1;
    } else {
      streak = 1;
    }
    lastDate = today;
    localStorage.setItem(STREAK_KEY, streak);
    localStorage.setItem(LAST_DATE_KEY, lastDate);
  }
}

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
    document.getElementById('import-category-select'),
    document.getElementById('fc-category-select')
  ];
  
  const optionsHtml = categories.map(c =>
    `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`
  ).join('');

  selects.forEach(s => {
    if (s) {
      const currentVal = s.value;
      if (s.id === 'fc-category-select') {
        s.innerHTML = `<option value="all">Tất cả chủ đề</option>` + optionsHtml;
      } else {
        s.innerHTML = optionsHtml;
      }
      if (currentVal) s.value = currentVal;
    }
  });

  const quizSelect = document.getElementById('quiz-category-select');
  if (quizSelect) {
    quizSelect.innerHTML = `<option value="random50">🎲 Ngẫu nhiên (50 từ)</option>` + optionsHtml;
  }

  const toeicSelect = document.getElementById('toeic-category-select');
  if (toeicSelect) {
    toeicSelect.innerHTML = `<option value="random">🎲 Ngẫu nhiên</option>` + optionsHtml;
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

  // Check if category already exists (duplicate check)
  const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    // If it exists, just select it and return
    if (document.getElementById('input-category')) {
      document.getElementById('input-category').value = existing.id;
    }
    return existing.id;
  }

  const id = 'cat_' + Date.now();
  categories.push({ id, name });
  saveCategories();
  renderCategorySelect();
  renderFilterChips();
  // Select the new category in the form
  if (document.getElementById('input-category')) {
    document.getElementById('input-category').value = id;
  }
  return id;
}

/**
 * Finds category ID by name (case-insensitive) or creates a new one.
 */
function findOrCreateCategory(name) {
  name = name.trim();
  if (!name) return null;
  
  const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  
  return addCategory(name);
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
      <div style="text-align:left;margin-bottom:16px;max-height:300px;overflow-y:auto; border: 1px solid #edf2f7; border-radius: 8px; padding: 0 12px;">
        ${listHtml}
      </div>
      <div class="modal-buttons" style="flex-wrap: wrap;">
        <button class="btn btn-ghost" onclick="closeCategoryModal()">Đóng</button>
        <button class="btn btn-primary" onclick="closeCategoryModal();openCategoryModal('add')">➕ Thêm mới</button>
        <button class="btn btn-danger-outline" onclick="clearAllCategories()" style="width: 100%; justify-content: center; margin-top: 8px;">🗑️ Xóa tất cả chủ đề</button>
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

function clearAllCategories() {
  const customCats = categories.filter(c => c.id !== 'general');
  if (customCats.length === 0) {
    alert('Không có chủ đề tùy chỉnh nào để xóa!');
    return;
  }

  if (confirm(`Bạn có chắc muốn xóa TẤT CẢ ${customCats.length} chủ đề tùy chỉnh? \n(Các từ vựng sẽ được chuyển về "Tổng hợp")`)) {
    // Move all words to general
    vocab.forEach(w => w.category = 'general');
    saveToStorage();

    // Reset to default
    categories = [{ id: 'general', name: 'Tổng hợp' }];
    saveCategories();
    
    currentCategory = 'all';
    renderCategorySelect();
    renderFilterChips();
    renderWordList();
    closeCategoryModal();
    alert('Đã xóa tất cả chủ đề tùy chỉnh.');
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
  const defaultCatId = document.getElementById('import-category-select').value;
  
  if (!text) {
    alert('Vui lòng dán nội dung vào ô nhập liệu!');
    return;
  }

  const lines = text.split('\n');
  let count = 0;
  let baseId = Date.now();
  let duplicatesFound = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;

    // Excel/Word tables use Tabs. Split by Tab.
    let parts = line.split('\t');
    
    // If only 1 part, user might have used multiple spaces or semicolons
    if (parts.length < 2) parts = line.split(/ {2,}/);
    if (parts.length < 2) parts = line.split(';');

    if (parts.length >= 2) {
      const en      = parts[0]?.trim();
      const ipa     = parts[1]?.trim();
      const vi      = parts[2]?.trim();
      const ex      = parts[3]?.trim();
      const catName = parts[4]?.trim();

      // Skip header row if matches common terms
      const lowEn = en.toLowerCase();
      if (lowEn === 'tiếng anh' || lowEn === 'english' || lowEn === 'từ vựng') return;

      if (en) {
        let finalCatId = defaultCatId;
        
        // If a topic is provided in the 5th column, find or create it
        if (catName) {
          finalCatId = findOrCreateCategory(catName) || defaultCatId;
        }

        // Check for duplicate in existing vocab (Same word AND Same category)
        const existing = vocab.find(w => 
          w.en.toLowerCase() === en.toLowerCase() && 
          w.category === finalCatId
        );
        if (existing) {
          duplicatesFound.push(`- ${en} (Đã có trong chủ đề: ${getCatLabel(existing.category)})`);
          return; // Skip adding this word
        }

        vocab.unshift({
          id: baseId + index + Math.random(),
          en: en,
          pronunciation: ipa || '',
          vi: vi || en, // Fallback if VI is missing
          example: ex || '',
          category: finalCatId,
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
    
    let msg = `✅ Đã nhập thành công ${count} từ vựng mới.`;
    if (duplicatesFound.length > 0) {
      msg += `\n\n⚠️ Đã bỏ qua ${duplicatesFound.length} từ bị trùng sau đây:\n${duplicatesFound.slice(0, 15).join('\n')}${duplicatesFound.length > 15 ? '\n...và các từ khác' : ''}`;
    }
    alert(msg);
    closeImportModal();
  } else {
    alert('❌ Không tìm thấy dữ liệu hợp lệ.\nLưu ý: Bạn cần có ít nhất cột Tiếng Anh và Nghĩa/Phiên âm.');
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

  // Check for duplicates (Same word AND Same category)
  const existing = vocab.find(w => 
    w.en.toLowerCase() === en.toLowerCase() && 
    w.category === category &&
    w.id !== editingId
  );
  if (existing) {
    alert(`Từ "${en}" đã tồn tại trong chủ đề "${getCatLabel(existing.category)}". Hệ thống sẽ không thêm từ trùng lặp trong cùng một chủ đề.`);
    return;
  }

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
        <div style="flex: 1;">
          <div class="word-en-row">
            <div class="word-en">${escHtml(w.en)}</div>
            <button class="speaker-btn" onclick="event.stopPropagation(); playSpeech('${escHtml(w.en.replace(/'/g, "\\'"))}')" title="Phát âm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            </button>
          </div>
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

// ── Speech & Sounds ──────────────────────────────────────────
let voices = [];
// More reliable, stable URLs
const correctSound = new Audio('https://raw.githubusercontent.com/ProgrammingHero1/simple-quiz-app/master/correct.mp3');
const wrongSound   = new Audio('https://raw.githubusercontent.com/ProgrammingHero1/simple-quiz-app/master/wrong.mp3');

function loadVoices() {
  voices = window.speechSynthesis.getVoices();
}
if (window.speechSynthesis) {
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function playSpeech(text) {
  if (!window.speechSynthesis) {
    console.error('Speech synthesis not supported');
    return;
  }
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95; 
  utterance.pitch = 1;
  
  if (voices.length === 0) loadVoices();
  
  const preferredVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) || 
                         voices.find(v => v.lang === 'en-US' && v.name.includes('Apple')) ||
                         voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha')) ||
                         voices.find(v => v.lang.startsWith('en-US')) ||
                         voices.find(v => v.lang.startsWith('en'));
  
  if (preferredVoice) utterance.voice = preferredVoice;
  
  window.speechSynthesis.speak(utterance);
}

function playQuizSound(isCorrect) {
  const sound = isCorrect ? correctSound : wrongSound;
  sound.currentTime = 0;
  sound.volume = 0.6;
  const playPromise = sound.play();
  
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn("Audio play failed, retrying on next interaction:", error);
    });
  }
}

// ── Tabs ───────────────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById(`panel-${tab}`).classList.remove('hidden');

  if (tab === 'flashcard') initFlashcard();
  if (tab === 'quiz')      resetQuizToStart();
  if (tab === 'toeic')     resetToeicToStart();
}

function goToHome() {
  switchTab('list', document.getElementById('tab-list'));
  resetQuizToStart();
  if (typeof resetToeicToStart === 'function') resetToeicToStart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Flashcard ──────────────────────────────────────────────
function initFlashcard() {
  const filterId = document.getElementById('fc-category-select')?.value || 'all';
  let pool = filterId === 'all' ? [...vocab] : vocab.filter(w => w.category === filterId);
  
  fcDeck  = shuffle([...pool]);
  fcIndex = 0;
  needsFinalReview = new Set(); // Reset final review pool
  renderFlashcard();
  updateFlashcardStats();
  
  // Auto play first card
  if (fcDeck.length > 0) {
    setTimeout(() => playSpeech(fcDeck[0].en), 300);
  }
}

function shuffleFlashcards() {
  initFlashcard(); // Also shuffles
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
  document.getElementById('fc-word').innerHTML            = `
    <span>${escHtml(word.en)}</span>
    <button class="fc-speaker-btn" onclick="event.stopPropagation(); playSpeech('${escHtml(word.en.replace(/'/g, "\\'"))}')">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
    </button>
  `;
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
  const cardInner = document.getElementById('card-inner');
  cardInner.classList.toggle('flipped');
  
  const word = fcDeck[fcIndex];
  if (word) playSpeech(word.en);
}

function resetCardFlip() {
  document.getElementById('card-inner').classList.remove('flipped');
}

function prevCard() {
  if (fcIndex > 0) { 
    fcIndex--; 
    renderFlashcard(); 
    playSpeech(fcDeck[fcIndex].en);
  }
}

function nextCard() {
  if (fcIndex < fcDeck.length - 1) { 
    fcIndex++; 
    renderFlashcard(); 
    playSpeech(fcDeck[fcIndex].en);
  }
}

function rateCard(rating) {
  const word = fcDeck[fcIndex];
  const vocabIdx = vocab.findIndex(w => w.id === word.id);
  if (vocabIdx === -1) return;

  updateStreak();

  if (rating === 'hard') {
    // ❌ Quên: lặp lại sau 2 câu + lặp ở cuối
    vocab[vocabIdx].mastery = 1;
    needsFinalReview.add(word.id);
    const reInsertIdx = Math.min(fcIndex + 2, fcDeck.length);
    fcDeck.splice(reInsertIdx, 0, word);
  } else if (rating === 'medium') {
    // 🤔 Lưỡng lự: lặp lại sau 7 câu + lặp ở cuối
    vocab[vocabIdx].mastery = 1;
    needsFinalReview.add(word.id);
    const reInsertIdx = Math.min(fcIndex + 7, fcDeck.length);
    fcDeck.splice(reInsertIdx, 0, word);
  } else {
    // ✅ Nhớ rõ: Xong luôn, không lặp lại
    vocab[vocabIdx].mastery = 2;
    vocab[vocabIdx].known = true;
    // Don't add to needsFinalReview, word will naturally disappear from deck flow
  }

  saveToStorage();
  updateFlashcardStats();

  if (fcIndex < fcDeck.length - 1) {
    fcIndex++;
    renderFlashcard();
    playSpeech(fcDeck[fcIndex].en);
  } else {
    // Check for final review phase
    if (needsFinalReview.size > 0) {
      const reviewWords = vocab.filter(w => needsFinalReview.has(w.id));
      fcDeck = [...fcDeck, ...shuffle(reviewWords)];
      needsFinalReview.clear(); // Clear so we don't loop forever
      fcIndex++;
      alert("🎯 Bắt đầu vòng ôn tập cuối cho các từ chưa thuộc!");
      renderFlashcard();
    } else {
      alert(`🎉 Chúc mừng! Bạn đã hoàn thành bộ từ này.`);
      initFlashcard();
    }
  }
}

function updateFlashcardStats() {
  const filterId = document.getElementById('fc-category-select')?.value || 'all';
  const pool = filterId === 'all' ? vocab : vocab.filter(w => w.category === filterId);
  const total = pool.length;
  
  if (total === 0) {
    document.getElementById('fc-streak').textContent = streak;
    document.getElementById('fc-percent').textContent = '0';
    document.getElementById('count-new').textContent = '0';
    document.getElementById('count-learning').textContent = '0';
    document.getElementById('count-mastered').textContent = '0';
    return;
  }

  const masteryCounts = { new: 0, learning: 0, mastered: 0 };
  pool.forEach(w => {
    if (!w.mastery) masteryCounts.new++;
    else if (w.mastery === 1) masteryCounts.learning++;
    else if (w.mastery === 2) masteryCounts.mastered++;
  });

  const masteredCount = masteryCounts.mastered;
  const pct = Math.round((masteredCount / total) * 100);

  document.getElementById('fc-streak').textContent = streak;
  document.getElementById('fc-percent').textContent = pct;
  document.getElementById('fc-mastered-count').textContent = masteredCount;

  document.getElementById('count-new').textContent = masteryCounts.new;
  document.getElementById('count-learning').textContent = masteryCounts.learning;
  document.getElementById('count-mastered').textContent = masteryCounts.mastered;
}

function showMasteryDetails(status) {
  const filterId = document.getElementById('fc-category-select')?.value || 'all';
  const pool = filterId === 'all' ? vocab : vocab.filter(w => w.category === filterId);
  
  const modal = document.getElementById('mastery-modal');
  const title = document.getElementById('mastery-modal-title');
  const listCont = document.getElementById('mastery-modal-list');

  let filtered = [];
  let label = "";
  if (status === 'new') {
    filtered = pool.filter(w => !w.mastery);
    label = "🔴 Chưa học";
  } else if (status === 'learning') {
    filtered = pool.filter(w => w.mastery === 1);
    label = "🟡 Đang học";
  } else {
    filtered = pool.filter(w => w.mastery === 2);
    label = "🟢 Đã nhớ";
  }

  const catName = filterId === 'all' ? 'Tất cả chủ đề' : getCatLabel(filterId);
  title.textContent = `${label} - ${catName} (${filtered.length})`;

  if (filtered.length === 0) {
    listCont.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 20px;">Không có từ nào ở mục này.</p>';
  } else {
    listCont.innerHTML = filtered.map(w => `
      <div style="padding: 10px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--accent-1); font-size: 15px;">${escHtml(w.en)}</strong>
          <div style="font-size: 13px; color: var(--text-secondary);">${escHtml(w.vi)}</div>
        </div>
        <span class="word-category-badge" style="margin:0;">${escHtml(getCatLabel(w.category))}</span>
      </div>
    `).join('');
  }

  modal.classList.remove('hidden');
}

function closeMasteryModal(e) {
  if (e && e.target !== document.getElementById('mastery-modal')) return;
  document.getElementById('mastery-modal').classList.add('hidden');
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

  // Sound warm-up to unlock audio context in some browsers
  correctSound.load();
  wrongSound.load();
  playQuizSound(true); // Small blip to unlock
  setTimeout(() => { correctSound.pause(); correctSound.currentTime = 0; }, 50);

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
    // Basic distractors candidate pool (excluding the correct answer)
    const candidates = vocab.filter(w => w.id !== word.id);
    
    if (type === 'fill') {
      return { word, type: 'fill' };
    } 
    
    if (type === 'choose') {
      // Standard random distractors for "English -> VI"
      const opts = shuffle([word, ...pickRandom(candidates, 3)]);
      return { word, type: 'choose', options: opts };
    } 
    
    // type === 'vi2en' (Vietnamese -> English)
    // 50% chance of getting "Hard" (Distracting) options
    const isHard = Math.random() > 0.5;
    
    if (isHard && candidates.length >= 3) {
      // Logic for Hard Distractors:
      // Priority 1: Same category
      const sameCat = candidates.filter(w => w.category === word.category);
      // Priority 2: Same prefix (first 2 letters)
      const samePrefix = candidates.filter(w => w.en.substring(0, 2).toLowerCase() === word.en.substring(0, 2).toLowerCase());
      // Priority 3: Similar length (+/- 2 letters)
      const similarLen = candidates.filter(w => Math.abs(w.en.length - word.en.length) <= 2);
      
      // Combine and filter unique distractors
      const smartPool = [...new Set([...sameCat, ...samePrefix, ...similarLen])];
      
      let hardDistractors = [];
      if (smartPool.length >= 3) {
        hardDistractors = pickRandom(smartPool, 3);
      } else {
        // Not enough smart options, mix smart + random
        hardDistractors = [...smartPool, ...pickRandom(candidates.filter(c => !smartPool.includes(c)), 3 - smartPool.length)];
      }
      
      const opts = shuffle([word, ...hardDistractors]);
      return { word, type: 'vi2en', options: opts, difficulty: 'hard' };
    } else {
      // Standard random distractors
      const opts = shuffle([word, ...pickRandom(candidates, 3)]);
      return { word, type: 'vi2en', options: opts, difficulty: 'standard' };
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

  // Handle Lifelines display
  const btnHint = document.getElementById('btn-hint');
  const btnCall = document.getElementById('btn-call');

  btnHint.style.display = (q.type === 'fill') ? 'inline-flex' : 'none';
  btnCall.style.display = (q.type === 'vi2en') ? 'inline-flex' : 'none';
  
  // Reset buttons state
  [btnHint, btnCall].forEach(b => {
    b.disabled = false;
    b.style.opacity = '1';
  });
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
  playQuizSound(isCorrect);

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
  playQuizSound(isRight);
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
  if (pct === 100)       { emoji = '🏆'; title = 'Hoàn hảo!'; playQuizSound(true); }
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

const GEMINI_API_KEY = "AIzaSyD-f9L_yaGSGiHrVQXDxecZT_SO047mzoM";

async function callGeminiAPI(prompt, isJsonMode = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const bodyData = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };

  // Tuyệt đối không thêm generation_config vào lúc này để kiểm tra kết nối

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API Error:", response.status, errorText);
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
async function useHint() {
  const q = quizQuestions[quizIndex];
  if (!q || q.type !== 'fill') return;

  const btn = document.getElementById('btn-hint');
  btn.disabled = true;
  btn.style.opacity = '0.5';

  const celeb = CELEBRITIES[Math.floor(Math.random() * CELEBRITIES.length)];
  const word = q.word.en;
  const vi = q.word.vi;
  
  const originalText = btn.innerHTML;
  btn.innerHTML = `⌛ Đang hỏi ${celeb.name}...`;

  try {
    const prompt = `Đóng vai ${celeb.name}, hãy đưa ra một câu nói ngắn gọn (khoảng 2-3 câu), hài hước và mang đậm phong cách đặc trưng của bạn để gợi ý cho người chơi về từ tiếng Anh "${word}" (nghĩa là "${vi}"). Tuyệt đối không được viết ra từ "${word}" trong câu trả lời.`;
    const response = await callGeminiAPI(prompt);

    // Create a hint: first char + underscores + last char
    let hint = "";
    if (word.length <= 1) {
      hint = word;
    } else {
      hint = word[0] + " " + "_ ".repeat(word.length - 2) + word[word.length - 1];
    }

    showCelebModal(celeb, response, hint);
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback if API fails
    let hint = word.length <= 1 ? word : word[0] + " " + "_ ".repeat(word.length - 2) + word[word.length - 1];
    showCelebModal(celeb, `${celeb.name} gợi ý cho bạn là:`, hint);
  } finally {
    btn.innerHTML = originalText;
  }
}

async function useCall() {
  const q = quizQuestions[quizIndex];
  if (!q || q.type !== 'vi2en') return;

  const btn = document.getElementById('btn-call');
  btn.disabled = true;
  btn.style.opacity = '0.5';

  const celeb = CELEBRITIES[Math.floor(Math.random() * CELEBRITIES.length)];
  const word = q.word.en;
  const vi = q.word.vi;
  const options = q.options.map(o => o.en).join(', ');

  const originalText = btn.innerHTML;
  btn.innerHTML = `📞 Đang gọi ${celeb.name}...`;

  try {
    const prompt = `Đóng vai ${celeb.name}, người chơi đang không biết từ tiếng Anh nào có nghĩa là "${vi}". Các lựa chọn là: ${options}. Đáp án đúng là "${word}". Hãy đưa ra một lời khuyên ngắn gọn (khoảng 2-3 câu), hài hước, mang đậm phong cách của bạn để khuyên người chơi chọn đáp án "${word}". Bạn có thể giả vờ không chắc chắn hoặc tự tin tuyệt đối, nhưng phải khuyên đúng.`;
    const response = await callGeminiAPI(prompt);
    
    showCelebModal(celeb, response, "");
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback if API fails
    const isWise = Math.random() < 0.75;
    let suggestedAnswer = "";
    if (isWise) {
      suggestedAnswer = q.word.en;
    } else {
      const distractors = q.options.filter(o => o.id !== q.word.id);
      suggestedAnswer = distractors[Math.floor(Math.random() * distractors.length)].en;
    }
    const msgs = [
      `"Alo, tôi nghĩ đáp án chuẩn là: <span class='celeb-hint-highlight'>${suggestedAnswer.toUpperCase()}</span>. Tin tôi đi!"`,
      `"Khó thế... nhưng theo trực giác của tôi thì là <span class='celeb-hint-highlight'>${suggestedAnswer.toUpperCase()}</span> đó."`,
      `"Dễ mà, chọn <span class='celeb-hint-highlight'>${suggestedAnswer.toUpperCase()}</span> chắc chắn luôn bạn ơi!"`
    ];
    showCelebModal(celeb, celeb.msg, msgs[Math.floor(Math.random() * msgs.length)]);
  } finally {
    btn.innerHTML = originalText;
  }
}

function showCelebModal(celeb, msg, result) {
  document.getElementById('celeb-img').src = celeb.img;
  document.getElementById('celeb-name').textContent = celeb.name;
  document.getElementById('celeb-msg').innerHTML = msg; // Support HTML
  document.getElementById('celeb-hint-result').innerHTML = result; // Support HTML
  document.getElementById('celeb-hint-result').style.display = result ? 'block' : 'none';
  
  document.getElementById('celeb-helper').classList.remove('hidden');
}

function closeCelebHelper() {
  document.getElementById('celeb-helper').classList.add('hidden');
}

// ── Share Link ─────────────────────────────────────────────
// ── Share Link ─────────────────────────────────────────────
const BIN_ID_KEY = 'vocabmate_json_id';

async function shareVocab() {
  if (vocab.length === 0) {
    alert('Bạn chưa có từ nào để chia sẻ!');
    return;
  }

  const btn = document.getElementById('btn-share');
  const originalHtml = btn.innerHTML;
  
  try {
    btn.innerHTML = '⌛ Đang tạo mã QR...';
    btn.disabled = true;

    const existingId = localStorage.getItem(BIN_ID_KEY);
    let finalUrl = "";

    // 1. Tạo dữ liệu dự phòng (lz)
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(vocab));
    const fallbackUrl = `${location.origin}${location.pathname}?lz=${compressed}`;

    try {
      // 2. Thử lưu lên server (JsonBlob hoặc npoint) để lấy link ngắn
      let response;
      if (existingId) {
        // Cập nhật kho cũ
        response = await fetch(`https://jsonblob.com/api/jsonBlob/${existingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vocab)
        });
      }

      if (!existingId || !response.ok) {
        // Tạo kho mới
        response = await fetch('https://jsonblob.com/api/jsonBlob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vocab)
        });
        if (response.ok) {
          const locationHeader = response.headers.get('Location');
          const newId = locationHeader.split('/').pop();
          localStorage.setItem(BIN_ID_KEY, newId);
        }
      }

      if (response.ok) {
        const id = localStorage.getItem(BIN_ID_KEY);
        finalUrl = `${location.origin}${location.pathname}?bin=${id}`;
      } else {
        throw new Error();
      }
    } catch (err) {
      finalUrl = fallbackUrl; // Dùng link nén nếu server lỗi
    }

    // 3. Copy link và Hiện mã QR (Dùng ảnh trực tiếp cho chắc chắn)
    await navigator.clipboard.writeText(finalUrl);
    showToast(finalUrl.includes('bin') ? "✅ Đã tạo mã QR siêu ngắn!" : "⚠️ Link hơi dài - Đang tạo mã QR...");
    showQRCodeImage(finalUrl);

  } catch (e) {
    console.error(e);
    alert('Không thể tạo mã QR. Hãy thử lại.');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function showQRCodeImage(url) {
  const modal = document.getElementById('qr-modal');
  const container = document.getElementById('qrcode-container');
  const linkDisplay = document.getElementById('qr-link-display');
  
  modal.classList.remove('hidden');
  linkDisplay.textContent = url;
  
  // Dùng dịch vụ tạo ảnh QR của API quốc tế (Đảm bảo luôn hiện ảnh)
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
  
  container.innerHTML = `
    <div style="text-align:center">
      <img src="${qrImageUrl}" alt="QR Code" style="width:250px; height:250px; border:none;" 
           onload="console.log('QR Loaded')" 
           onerror="this.parentElement.innerHTML='⚠️ Lỗi mạng không thể tải ảnh QR. Hày copy link dưới.'">
    </div>
  `;
}

// ── File Sharing (Way 3) ───────────────────────────────────
function exportToFile() {
  if (vocab.length === 0) {
    alert('Không có dữ liệu để xuất!');
    return;
  }
  
  // Trọn gói dữ liệu
  const bundle = {
    words: vocab,
    categories: categories,
    exportDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  a.href = url;
  a.download = `TuVung_CuaToi_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast("✅ Đã tải file dữ liệu về máy!");
}

function triggerFileInput() {
  document.getElementById('import-file-input').click();
}

function importFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      // Kiểm tra cấu trúc file
      let newWords = [];
      let newCats = [];
      
      if (Array.isArray(data)) {
        newWords = data; // Bản cũ chỉ có array words
      } else if (data.words && Array.isArray(data.words)) {
        newWords = data.words;
        newCats = data.categories || [];
      }
      
      if (newWords.length === 0) {
        alert("File này không có từ vựng nào!");
        return;
      }
      
      if (confirm(`Tìm thấy ${newWords.length} từ. Bạn có muốn nạp vào máy không? (Dữ liệu cũ sẽ được gộp chung)`)) {
        // Gộp dữ liệu (tránh trùng)
        const existingIds = new Set(vocab.map(w => w.id));
        newWords.forEach(w => {
           if (!existingIds.has(w.id)) vocab.push(w);
        });
        
        // Gộp chủ đề
        if (newCats.length > 0) {
          const catIds = new Set(categories.map(c => c.id));
          newCats.forEach(c => {
            if (!catIds.has(c.id)) categories.push(c);
          });
        }
        
        saveToStorage();
        saveCategories();
        applyFilters();
        renderWordList();
        renderCategorySelect();
        renderFilterChips();
        updateStats();
        
        showToast("✅ Nạp dữ liệu hoàn tất!");
      }
    } catch (err) {
      alert("Lỗi: File này không đúng định dạng dữ liệu của ứng dụng.");
    }
    // Reset input để có thể chọn lại file cũ nếu cần
    event.target.value = "";
  };
  reader.readAsText(file);
}

function showToast(message) {
  const toast = document.getElementById('share-toast');
  const span = toast.querySelector('span');
  if (span) span.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

async function checkSharedURL() {
  const params = new URLSearchParams(location.search);
  const binId  = params.get('bin');
  const lzData = params.get('lz');
  const oldShare = params.get('share');

  let importedData = null;

  try {
    if (binId) {
      showToast("🔍 Đang tải dữ liệu từ server...");
      const res = await fetch(`https://api.npoint.io/bins/${binId}`);
      if (res.ok) importedData = await res.json();
    } else if (lzData) {
      importedData = JSON.parse(LZString.decompressFromEncodedURIComponent(lzData));
    } else if (oldShare) {
      importedData = JSON.parse(decodeURIComponent(escape(atob(oldShare))));
    }

    if (Array.isArray(importedData) && importedData.length > 0) {
      sharedVocab = importedData;
      document.getElementById('shared-banner').classList.remove('hidden');
      // Tự động cuộn lên đầu để xem banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Cập nhật giao diện xem trước
      vocab = importedData;
      applyFilters();
      renderWordList();
      updateStats();
    }
  } catch (e) {
    console.warn("Không thể tải bộ từ chia sẻ.");
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

// ── TOEIC Reading ──────────────────────────────────────────

let currentToeicData = null;

function resetToeicToStart() {
  const toeicStart = document.getElementById('toeic-start');
  const toeicArea = document.getElementById('toeic-area');
  if (toeicStart) toeicStart.style.display = 'block';
  if (toeicArea) toeicArea.classList.add('hidden');
}

function exitToeic() {
  if (confirm('Bạn có chắc muốn thoát bài thi TOEIC?')) {
    resetToeicToStart();
  }
}

async function generateToeicTest() {
  const level = document.getElementById('toeic-level').value;
  const part = document.getElementById('toeic-part').value;
  const catChoice = document.getElementById('toeic-category-select').value;
  
  let pool = [];
  if (catChoice === 'random') {
    pool = [...vocab];
  } else {
    pool = vocab.filter(w => w.category === catChoice);
  }

  // Get up to 15 words from pool to feed the prompt
  const vocabSample = shuffle(pool).slice(0, 15).map(w => `${w.en} (${w.vi})`).join(', ');

  const btn = document.getElementById('btn-generate-toeic');
  const btnNext = document.getElementById('btn-toeic-next');
  
  if (btn) {
    btn.innerHTML = '⌛ AI đang soạn đề...';
    btn.disabled = true;
  }
  if (btnNext) {
    btnNext.innerHTML = '⌛ Đang soạn...';
    btnNext.disabled = true;
  }

  try {
    const prompt = `Bạn là chuyên gia soạn đề thi TOEIC Reading tại ETS với 15 năm kinh nghiệm.
Nhiệm vụ: Tạo 01 bộ câu hỏi TOEIC Reading chất lượng cao theo yêu cầu.

YÊU CẦU NỘI DUNG:
- TRÌNH ĐỘ: ${level}.
- PHẦN THI: ${part}.
- CHỦ ĐỀ: Tự chọn, nhưng ưu tiên sử dụng các từ vựng sau nếu có thể: ${vocabSample}. (Nếu danh sách rỗng, hãy tự chọn từ vựng phù hợp với trình độ TOEIC)

TUYỆT ĐỐI TUÂN THỦ CHIẾN THUẬT RA ĐỀ & BẪY (CHUẨN ETS):
- Nếu là Part 5: BẮT BUỘC phải tạo 10 câu hỏi riêng lẻ. Các câu hỏi phải chia đều vào 3 loại bẫy: (1) Word Form (đáp án cùng gốc từ nhưng khác loại từ: danh, động, tính, trạng), (2) Word Choice (các từ vựng rất gần nghĩa nhau nhưng khác sắc thái/ngữ cảnh sử dụng), (3) Prepositions/Collocations (giới từ đi kèm cụm từ cố định).
- Nếu là Part 6: Đoạn văn phải có tính liên kết chặt chẽ. BẮT BUỘC phải có ít nhất 1 câu hỏi dạng "Điền nguyên một câu trọn vẹn vào đoạn văn", đòi hỏi người đọc phải hiểu ngữ cảnh của câu phía trước và phía sau. Tổng cộng 3-4 câu hỏi.
- Nếu là Part 7: Văn bản phải mang tính thực tế cao (Email công việc, Thông báo/Memo, Online Chat, Quảng cáo). BẮT BUỘC đáp án đúng phải sử dụng Paraphrasing (dùng từ đồng nghĩa để diễn đạt lại thông tin trong bài, KHÔNG dùng lại từ gốc). BẮT BUỘC đáp án nhiễu phải chứa các từ khóa y hệt trong bài đọc nhưng làm sai lệch ngữ cảnh, sai đối tượng hoặc sai thời gian để đánh lừa. Tổng cộng 3-4 câu hỏi.

ĐỊNH DẠNG TRẢ VỀ: Trả về **DUY NHẤT** một object JSON hợp lệ, không có markdown block hay văn bản nào khác. Format JSON:
{
  "passage": "Nội dung đoạn văn (nếu là Part 6, 7). Nếu là Part 5, hãy để chuỗi rỗng.",
  "questions": [
    {
      "question_text": "Nội dung câu hỏi (Nếu Part 5 thì đây là câu chứa ô trống)",
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "correct_answer": "Chữ cái đáp án (A, B, C hoặc D)",
      "explanation_vn": "Giải thích chi tiết tại sao đúng, phân tích bẫy và cung cấp cấu trúc ngữ pháp quan trọng.",
      "paraphrase_key": "Cặp từ đồng nghĩa giữa bài đọc và đáp án (Dành cho Part 7), nếu không có để rỗng",
      "trap_category": "Phân loại bẫy (ví dụ: Word Form, Distractor Confusion)"
    }
  ],
  "vocabulary_list": [{"word": "...", "meaning": "...", "example": "..."}]
}`;

    const responseText = await callGeminiAPI(prompt, true);
    
    // Attempt to parse JSON from response. 
    let jsonStr = responseText.trim();
    const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonStr = match[1];
    } else {
      const match2 = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
      if (match2) {
        jsonStr = match2[1];
      }
    }
    
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("JSON Parse Error. Raw string:", jsonStr);
      throw new Error("AI trả về định dạng không hợp lệ. Vui lòng thử lại!");
    }
    
    currentToeicData = data;
    renderToeicTest(data, part);

  } catch (error) {
    console.error("Lỗi khi tạo đề TOEIC:", error);
    alert('Không thể tạo đề thi lúc này. Lỗi: ' + error.message);
  } finally {
    if (btn) {
      btn.innerHTML = '✨ Tạo đề thi ngay';
      btn.disabled = false;
    }
    if (btnNext) {
      btnNext.innerHTML = '✨ Tiếp theo';
      btnNext.disabled = false;
    }
  }
}

function renderToeicTest(data, part) {
  document.getElementById('toeic-start').style.display = 'none';
  document.getElementById('toeic-area').classList.remove('hidden');

  const passageContainer = document.getElementById('toeic-passage-container');
  const passageEl = document.getElementById('toeic-passage');
  
  if (data.passage && data.passage.trim() !== '') {
    passageContainer.style.display = 'block';
    // Split passage into paragraphs
    passageEl.innerHTML = data.passage.split('\n').map(p => p.trim() ? `<p>${escHtml(p)}</p>` : '').join('');
  } else {
    passageContainer.style.display = 'none';
  }

  const qsContainer = document.getElementById('toeic-questions-container');
  qsContainer.innerHTML = '';

  data.questions.forEach((q, index) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'card';
    qDiv.style.marginBottom = '16px';
    qDiv.style.textAlign = 'left';

    let html = `<h4 style="margin-top: 0;">Câu ${index + 1}: ${escHtml(q.question_text)}</h4>`;
    html += `<div class="toeic-options" id="toeic-opts-${index}">`;
    
    for (const [key, val] of Object.entries(q.options)) {
      html += `
        <label class="toeic-option-label" style="display: block; padding: 8px; margin: 4px 0; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">
          <input type="radio" name="toeic-q-${index}" value="${key}" onchange="checkToeicAnswer(${index}, '${key}', '${q.correct_answer}')" style="margin-right: 8px;" />
          <strong>${key}.</strong> ${escHtml(val)}
        </label>
      `;
    }
    html += `</div>`;

    html += `
      <div id="toeic-exp-${index}" style="display: none; margin-top: 12px; padding: 12px; background: #e0f2fe; border-left: 4px solid var(--primary); border-radius: 4px;">
        <p><strong>Đáp án đúng: ${q.correct_answer}</strong></p>
        <p>${escHtml(q.explanation_vn)}</p>
        ${q.trap_category ? `<p><em>Bẫy: ${escHtml(q.trap_category)}</em></p>` : ''}
        ${q.paraphrase_key ? `<p><em>Paraphrase: ${escHtml(q.paraphrase_key)}</em></p>` : ''}
      </div>
    `;

    qDiv.innerHTML = html;
    qsContainer.appendChild(qDiv);
  });

  const vocabContainer = document.getElementById('toeic-vocabulary-container');
  const vocabList = document.getElementById('toeic-vocabulary-list');
  
  if (data.vocabulary_list && data.vocabulary_list.length > 0) {
    vocabContainer.style.display = 'block';
    vocabList.innerHTML = data.vocabulary_list.map(v => 
      `<li><strong>${escHtml(v.word)}</strong>: ${escHtml(v.meaning)} <br/><span style="color:var(--text-muted); font-size:12px;">Ví dụ: ${escHtml(v.example)}</span></li>`
    ).join('');
  } else {
    vocabContainer.style.display = 'none';
  }
}

function checkToeicAnswer(qIndex, selected, correct) {
  const optsContainer = document.getElementById(`toeic-opts-${qIndex}`);
  const labels = optsContainer.querySelectorAll('label');
  
  labels.forEach(label => {
    const radio = label.querySelector('input');
    radio.disabled = true; // Disable after answer
    if (radio.value === correct) {
      label.style.backgroundColor = '#dcfce7'; // green-100
      label.style.borderColor = '#22c55e';
    } else if (radio.value === selected && selected !== correct) {
      label.style.backgroundColor = '#fee2e2'; // red-100
      label.style.borderColor = '#ef4444';
    }
  });

  document.getElementById(`toeic-exp-${qIndex}`).style.display = 'block';
}
