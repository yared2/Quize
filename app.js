/* =========================
   Quiz state
========================= */
let questions = [];
let idx = 0;
let answered = {}; // id -> 'a'|'b'|'c'|'d'
let score = 0;

/* =========================
   Helpers: persistence
========================= */
function saveState(url) {
  const state = { url: url ?? loadState().url, idx, answered, score };
  localStorage.setItem('quizState', JSON.stringify(state));
}
function loadState() {
  try { return JSON.parse(localStorage.getItem('quizState') || '{}'); }
  catch { return {}; }
}

/* =========================
   Render & interactions
========================= */
function initQuiz(qs) {
  questions = qs.filter(q => q && q.question && q.answer && q.options && q.options.a);
  idx = 0; answered = {}; score = 0;
  els.app.hidden = false;
  render();
}

function render() {
  const q = questions[idx];
  if (!q) return;
  els.qtext.textContent = q.question;
  els.choices.innerHTML = '';

  Object.entries(q.options).forEach(([key, text]) => {
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
  els.progress.textContent = `${idx + 1} of ${questions.length}`;
  els.score.textContent = `Score: ${score}`;
  els.prev.disabled = idx === 0;
  els.next.disabled = idx >= questions.length - 1;
}

function choose(key) {
  const q = questions[idx];
  if (answered[q.id]) return; // already answered → locked
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

/* =========================
   Boot: wait for DOM ready
========================= */
let els = {};
document.addEventListener('DOMContentLoaded', async () => {
  // ---- Topic → RAW file map (define before using) ----
  const TOPIC_SOURCES = {
    java: "https://raw.githubusercontent.com/yared2/Quize/main/data/java.ndjson",
    spring: "https://raw.githubusercontent.com/yared2/Quize/main/data/spring.ndjson",
    kubernetes: "https://raw.githubusercontent.com/yared2/Quize/main/data/kubernetes.ndjson",
  };
  const DEFAULT_DATA_URL = TOPIC_SOURCES.java; // default topic

  // ---- Grab elements AFTER DOM is ready ----
  els = {
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
    shuffle: document.getElementById('shuffleBtn'),
    topic: document.getElementById('topic'),
    themeBtn: document.getElementById('themeToggle'),
  };

  /* ---------- Theme handling ---------- */
  const rootEl = document.documentElement;
  function applyTheme(mode) {
    if (mode === 'dark') {
      rootEl.classList.add('theme-dark');
      if (els.themeBtn) els.themeBtn.textContent = '☀️ Light';
    } else {
      rootEl.classList.remove('theme-dark');
      if (els.themeBtn) els.themeBtn.textContent = '🌙 Dark';
    }
  }
  const prefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('quizTheme');
  applyTheme(savedTheme ? savedTheme : (prefersDark() ? 'dark' : 'light'));

  if (els.themeBtn) {
    els.themeBtn.addEventListener('click', () => {
      const next = rootEl.classList.contains('theme-dark') ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('quizTheme', next);
    });
  }

  /* ---------- Topic picker ---------- */
  if (els.topic) {
    els.topic.addEventListener('change', async () => {
      const topic = els.topic.value;
      if (!topic) return;
      const url = TOPIC_SOURCES[topic];
      try {
        const qs = await loadAndParse(url);
        initQuiz(qs);
        saveState(url);
        const params = new URLSearchParams(location.search);
        params.set('topic', topic);
        history.replaceState(null, "", "?" + params.toString());
      } catch (e) {
        alert('Load error: ' + e.message);
      }
    });
  }

  /* ---------- Manual URL loader ---------- */
  if (els.loadBtn) {
    els.loadBtn.addEventListener('click', async () => {
      const url = (els.dataUrl?.value || '').trim();
      if (!url) return alert('Paste a GitHub RAW URL first.');
      try {
        const qs = await loadAndParse(url);
        initQuiz(qs);
        saveState(url);
      } catch (e) {
        alert('Load error: ' + e.message);
      }
    });
  }

  /* ---------- Controls ---------- */
  if (els.prev) {
    els.prev.addEventListener('click', () => {
      if (idx > 0) { idx--; render(); }
    });
  }
  if (els.next) {
    els.next.addEventListener('click', () => {
      if (idx < questions.length - 1) { idx++; render(); }
    });
  }
  if (els.restart) {
    els.restart.addEventListener('click', () => {
      answered = {}; score = 0; idx = 0; render();
    });
  }
  if (els.shuffle) {
    els.shuffle.addEventListener('click', () => {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
      idx = 0; render();
    });
  }

  /* ---------- Keyboard shortcuts ---------- */
  window.addEventListener('keydown', (e) => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight' && els.next && !els.next.disabled) { els.next.click(); }
    if (e.key === 'ArrowLeft' && els.prev && !els.prev.disabled) { els.prev.click(); }
    if (['1','2','3','4'].includes(e.key)) {
      const map = { '1':'a','2':'b','3':'c','4':'d' };
      choose(map[e.key]);
    }
  });

  /* ---------- Initial data load ---------- */
  const params = new URLSearchParams(location.search);
  const topic = params.get('topic');
  const remembered = loadState().url;

  // Priority: ?topic → remembered → default
  let url = (topic && TOPIC_SOURCES[topic]) ? TOPIC_SOURCES[topic]
                                           : (remembered || DEFAULT_DATA_URL);

  if (els.topic && topic) els.topic.value = topic;

  try {
    const qs = await loadAndParse(url);
    initQuiz(qs);
    saveState(url);
  } catch (e) {
    console.error("Default data load failed:", e);
  }
});
