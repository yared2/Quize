// Detect type by URL/file extension; return unified array
// {id, question, options:{a,b,c,d}, answer:'a'|'b'|'c'|'d', explanation?}
async function loadAndParse(url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now()); // cache-buster
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const text = await res.text();
  const lower = url.toLowerCase();
  if (lower.endsWith('.ndjson') || lower.endsWith('.jsonl')) return parseNdjson(text);
  if (lower.endsWith('.csv')) return parseCsv(text);
  // Heuristic: NDJSON if multiple JSON-looking lines
  return /^\s*\{/.test(text.trim()) ? parseNdjson(text) : parseCsv(text);
}

function parseNdjson(text) {
  const out = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const q = {
        id: obj.id ?? '',
        question: obj.question ?? '',
        options: obj.options ?? obj.choices ?? {},
        answer: obj.answer ?? obj.correct,
        explanation: obj.explanation ?? ''
      };
      normalizeOptions(q);
      out.push(q);
    } catch (e) {
      console.warn('Bad NDJSON line skipped:', line);
    }
  }
  return out;
}

function parseCsv(text) {
  // simple CSV parser (handles quotes, commas); for complex CSVs use PapaParse
  const rows = csvToRows(text);
  if (!rows.length) return [];
  // map header
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = name => header.indexOf(name);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const rec = Object.fromEntries(header.map((h, j) => [h, r[j] ?? '']));
    const q = {
      id: rec.id || i,
      question: rec.question || '',
      options: { a: rec.a, b: rec.b, c: rec.c, d: rec.d },
      answer: (rec.correct || '').toLowerCase(),
      explanation: rec.explanation || ''
    };
    normalizeOptions(q);
    out.push(q);
  }
  return out;
}

function normalizeOptions(q) {
  const opts = q.options || {};
  // ensure keys a–d exist as strings
  ['a','b','c','d'].forEach(k => { if (opts[k] == null) opts[k] = ''; else opts[k] = String(opts[k]); });
  q.options = opts;
  q.answer = String(q.answer || '').trim().toLowerCase();
}

function csvToRows(text) {
  const rows = [];
  let cur = [], val = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nxt = text[i+1];
    if (ch === '"' && inQ && nxt === '"') { val += '"'; i++; continue; }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cur.push(val); val = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !inQ) {
      if (val !== '' || cur.length) { cur.push(val); rows.push(cur); cur = []; val = ''; }
      continue;
    }
    val += ch;
  }
  if (val !== '' || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
