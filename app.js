let questions = [];
let idx = 0;
let answered = {}; // id -> 'a'|'b'|'c'|'d'
let score = 0;






const els = {
  app: document.getElementById('app'),
  dataUrl: document.getElementById('dataUrl'),
  loadBtn: document.getElementById('loadBtn'),
  qtext: document.getElementById('qtext'),
  choices: document.getElementById('choices'),
  explanation: document.getElementById('explanation'),
  progress: document.getElementById('progress'),
  score: document.getElementById('score'),
  prev: document.getElementById('prevBtn'),
  next: document.getElementById('nextBtn'),
  restart: document.getElementById('restartBtn'),
  shuffle: document.getElementById('shuffleBtn')
};


// --- Theme handling (dark / light with persistence) ---
const themeBtn = document.getElementById('themeToggle');
const rootEl = document.documentElement;

function applyTheme(mode) {
  if (mode === 'dark') {
    rootEl.classList.add('theme-dark');
    if (themeBtn) themeBtn.textContent = '☀️ Light';
  } else {
    rootEl.classList.remove('theme-dark');
    if (themeBtn) themeBtn.textContent = '🌙 Dark';
  }
}

function getSystemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Load saved theme or system default
const savedTheme = localStorage.getItem('quizTheme');
applyTheme(savedTheme ? savedTheme : (getSystemPrefersDark() ? 'dark' : 'light'));

// Toggle click
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const next = rootEl.classList.contains('theme-dark') ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('quizTheme', next);
  });
}


els.topic = document.getElementById('topic');

if (els.topic) {
  els.topic.addEventListener('change', async () => {
    const topic = els.topic.value;
    if (!topic) return;
    const url = TOPIC_SOURCES[topic];
    try {
      const qs = await loadAndParse(url);
      initQuiz(qs);
      saveState(url);
      // reflect selection in URL (?topic=java)
      const params = new URLSearchParams(location.search);
      params.set('topic', topic);
      history.replaceState(null, "", "?" + params.toString());
    } catch (e) {
      alert('Load error: ' + e.message);
    }
  });
}


// Topic → RAW file map
const TOPIC_SOURCES = {
  java: "https://raw.githubusercontent.com/yared2/Quize/main/data/java.ndjson",
  spring: "https://raw.githubusercontent.com/yared2/Quize/main/data/spring.ndjson",
  kubernetes: "https://raw.githubusercontent.com/yared2/Quize/main/data/kubernetes.ndjson",
};

// Optional default (used on first load or when no topic chosen)
const DEFAULT_DATA_URL = TOPIC_SOURCES.java; // autoload Java by default


// Auto-load your default questions file from GitHub
//const DEFAULT_DATA_URL = "https://raw.githubusercontent.com/yared2/Quize/main/data/questions.ndjson";

window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const topic = params.get('topic');
  const remembered = loadState().url;

  // Priority: URL ?topic → remembered URL → DEFAULT
  let url = topic && TOPIC_SOURCES[topic] ? TOPIC_SOURCES[topic]
          : remembered || DEFAULT_DATA_URL;

  if (els.topic && topic) els.topic.value = topic;

  try {
    const qs = await loadAndParse(url);
    initQuiz(qs);
    saveState(url);
  } catch (e) {
    console.error("Default data load failed:", e);
  }
});


els.loadBtn.addEventListener('click', async () => {
  const url = els.dataUrl.value.trim();
  if (!url) return alert('Paste a GitHub RAW URL first.');
  try {
    const qs = await loadAndParse(url);
    initQuiz(qs);
    saveState(url);
  } catch (e) {
    alert('Load error: ' + e.message);
  }
});

function initQuiz(qs) {
  questions = qs.filter(q => q.question && q.answer && q.options && q.options.a);
  idx = 0; answered = {}; score = 0;
  els.app.hidden = false;
  render();
}

function render() {
  const q = questions[idx];
  if (!q) return;
  els.qtext.textContent = q.question;
  els.choices.innerHTML = '';

  Object.entries(q.options).forEach(([key, text], i) => {
    const div = document.createElement('div');
    div.className = 'choice';
    div.tabIndex = 0;
    div.dataset.key = key;
    div.innerHTML = `<strong>${key.toUpperCase()}.</strong> ${text || ''}`;
    div.addEventListener('click', () => choose(key));
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(key); }
    });
    els.choices.appendChild(div);
  });

  const ans = answered[q.id];
  if (ans) lockAndColor(ans);
  els.explanation.textContent = ans ? (q.explanation || '') : '';
  els.progress.textContent = `Q ${idx + 1} / ${questions.length}`;
  els.score.textContent = `Score: ${score}`;
  els.prev.disabled = idx === 0;
  els.next.disabled = idx >= questions.length - 1;
}

function choose(key) {
  const q = questions[idx];
  if (answered[q.id]) return; // locked
  answered[q.id] = key;
  if (key === q.answer) score++;
  lockAndColor(key);
  els.explanation.textContent = q.explanation || '';
  els.score.textContent = `Score: ${score}`;
  saveState(); // persist progress
}

function lockAndColor(chosen) {
  const q = questions[idx];
  [...els.choices.children].forEach(div => {
    const k = div.dataset.key;
    // clean first
    div.classList.remove('correct', 'wrong');

    if (k === q.answer) {
      div.classList.add('correct');
    } else if (k === chosen) {
      div.classList.add('wrong');
    }

    // lock UI for this question
    div.setAttribute('aria-disabled', 'true');
    div.style.pointerEvents = 'none';
  });
}


els.prev.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
els.next.addEventListener('click', () => { if (idx < questions.length - 1) { idx++; render(); } });
els.restart.addEventListener('click', () => { answered = {}; score = 0; idx = 0; render(); });
els.shuffle.addEventListener('click', () => {
  // Fisher–Yates
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  idx = 0; render();
});

// Keyboard shortcuts: 1–4 answer, arrows nav
window.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowRight') { els.next.click(); }
  if (e.key === 'ArrowLeft') { els.prev.click(); }
  if (['1','2','3','4'].includes(e.key)) {
    const map = { '1':'a','2':'b','3':'c','4':'d' };
    choose(map[e.key]);
  }
});

// Persistence (URL + state) so you can refresh
function saveState(url) {
  const state = { url: url ?? loadState().url, idx, answered, score };
  localStorage.setItem('quizState', JSON.stringify(state));
}
function loadState() {
  try { return JSON.parse(localStorage.getItem('quizState') || '{}'); } catch { return {}; }
}

// Auto-restore if previously loaded
(async function restore() {
  const s = loadState();
  if (s.url) {
    els.dataUrl.value = s.url;
    try {
      const qs = await loadAndParse(s.url);
      initQuiz(qs);
      idx = Math.min(s.idx || 0, qs.length - 1);
      answered = s.answered || {};
      score = s.score || 0;
      render();
    } catch {}
  }
})();
