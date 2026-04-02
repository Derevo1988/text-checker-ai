// === Глобальные переменные ===
const inputEl = document.getElementById('inputText');
const checkBtn = document.getElementById('checkBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const loadingEl = document.getElementById('loading');
const resultEl = document.getElementById('result');
const correctedTextEl = document.getElementById('correctedText');
const errorsListEl = document.getElementById('errorsList');
const highlightedTextEl = document.getElementById('highlightedText');
const historyListEl = document.getElementById('historyList');
const historyCountEl = document.getElementById('historyCount');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

let lastResult = null;

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  setupTabs();
  setupEventListeners();
});

function setupEventListeners() {
  checkBtn.addEventListener('click', checkText);
  clearBtn.addEventListener('click', () => { inputEl.value = ''; resultEl.classList.add('hidden'); });
  copyBtn.addEventListener('click', copyResult);
  clearHistoryBtn.addEventListener('click', clearHistory);
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

// === Основная функция проверки ===
async function checkText() {
  const text = inputEl.value.trim();
  if (!text) return alert('📝 Введите текст для проверки!');
  if (text.length > 5000) return alert('⚠️ Текст слишком длинный (макс. 5000 символов)');

  // UI: показать загрузку
  loadingEl.classList.remove('hidden');
  resultEl.classList.add('hidden');
  checkBtn.disabled = true;

  try {
    const response = await fetch('/.netlify/functions/check-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('Ошибка сервера: ' + response.status);
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    lastResult = data;
    displayResult(data);
    saveToHistory(text, data.corrected_text, data.errors);
    
  } catch (err) {
    alert('❌ Ошибка: ' + err.message);
    console.error(err);
  } finally {
    loadingEl.classList.add('hidden');
    checkBtn.disabled = false;
  }
}

// === Отображение результатов ===
function displayResult(data) {
  // Исправленный текст
  correctedTextEl.textContent = data.corrected_text;

  // Список ошибок
  if (data.errors && data.errors.length > 0) {
    errorsListEl.innerHTML = data.errors.map(err => `
      <li class="error-item">
        <span class="type">${escapeHtml(err.type || 'ошибка')}</span>
        <strong>${escapeHtml(err.original)}</strong> → 
        <span class="fix">${escapeHtml(err.suggestion)}</span>
        ${err.explanation ? `<br><small>💡 ${escapeHtml(err.explanation)}</small>` : ''}
      </li>
    `).join('');
  } else {
    errorsListEl.innerHTML = '<li>🎉 Ошибок не найдено!</li>';
  }

  // Подсветка в исходном тексте
  highlightedTextEl.innerHTML = highlightErrors(inputEl.value, data.errors);

  resultEl.classList.remove('hidden');
}

// === Подсветка ошибок в тексте ===
function highlightErrors(text, errors) {
  if (!errors || errors.length === 0) return escapeHtml(text);

  let result = escapeHtml(text);
  
  // Сортируем по длине (сначала длинные), чтобы не ломать замену
  const sorted = [...errors].sort((a, b) => b.original.length - a.original.length);
  
  sorted.forEach(err => {
    const origEscaped = escapeHtml(err.original);
    const tip = `${err.suggestion} (${err.type})${err.explanation ? ': ' + err.explanation : ''}`;
    const replacement = `<span class="highlight-error" data-tip="${escapeHtml(tip)}">${origEscaped}</span>`;
    // Заменяем только первое вхождение для точности
    result = result.replace(origEscaped, replacement);
  });
  
  return result;
}

// === Копирование результата ===
async function copyResult() {
  if (!lastResult) return;
  
  const text = lastResult.corrected_text;
  try {
    await navigator.clipboard.writeText(text);
    const original = copyBtn.textContent;
    copyBtn.textContent = '✅ Скопировано!';
    setTimeout(() => copyBtn.textContent = original, 2000);
  } catch {
    // Fallback для старых браузеров
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copyBtn.textContent = '✅ Скопировано!';
    setTimeout(() => copyBtn.textContent = '📋 Копировать', 2000);
  }
}

// === История в localStorage ===
function saveToHistory(original, corrected, errors) {
  const history = JSON.parse(localStorage.getItem('textCheckerHistory') || '[]');
  const item = {
    id: Date.now(),
    date: new Date().toISOString(),
    original: original.slice(0, 100) + (original.length > 100 ? '...' : ''),
    corrected,
    errorsCount: errors?.length || 0,
    fullOriginal: original // сохраняем полностью для повторной загрузки
  };
  
  // Добавляем в начало, храним максимум 20 записей
  history.unshift(item);
  if (history.length > 20) history.pop();
  
  localStorage.setItem('textCheckerHistory', JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem('textCheckerHistory') || '[]');
  historyCountEl.textContent = history.length;
  
  if (history.length === 0) {
    historyListEl.innerHTML = '<p style="color:var(--text-muted);font-size:14px">История пуста</p>';
    return;
  }
  
  historyListEl.innerHTML = history.map(item => `
    <div class="history-item">
      <span class="preview" title="${escapeHtml(item.fullOriginal)}">
        ${escapeHtml(item.original)}
      </span>
      <time>${new Date(item.date).toLocaleString('ru', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
      })}</time>
      <span style="color:${item.errorsCount ? 'var(--warning)' : 'var(--success)'};font-size:12px;margin-right:8px">
        ${item.errorsCount} ошиб.${item.errorsCount !== 1 ? 'ки' : ''}
      </span>
      <button class="btn-small" onclick="loadFromHistory(${item.id})">↩️ Загрузить</button>
      <button class="btn-small" onclick="deleteHistoryItem(${item.id})">✕</button>
    </div>
  `).join('');
}

function loadFromHistory(id) {
  const history = JSON.parse(localStorage.getItem('textCheckerHistory') || '[]');
  const item = history.find(h => h.id === id);
  if (item) {
    inputEl.value = item.fullOriginal;
    resultEl.classList.add('hidden');
    inputEl.focus();
  }
}

function deleteHistoryItem(id) {
  let history = JSON.parse(localStorage.getItem('textCheckerHistory') || '[]');
  history = history.filter(h => h.id !== id);
  localStorage.setItem('textCheckerHistory', JSON.stringify(history));
  loadHistory();
}

function clearHistory() {
  if (confirm('Удалить всю историю проверок?')) {
    localStorage.removeItem('textCheckerHistory');
    loadHistory();
  }
}

// === Утилиты ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Сделать функции доступными глобально для onclick
window.loadFromHistory = loadFromHistory;
window.deleteHistoryItem = deleteHistoryItem;