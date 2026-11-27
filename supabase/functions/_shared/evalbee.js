// =========================================================
// EvalBee (va boshqa OMR ilovalari) Excel/CSV natijalarini o'qish.
// Brauzerda (CRM) ham, Deno (bot) da ham ishlaydi — faqat jadval qatorlari (2D massiv) bilan ishlaydi.
// Ustunlar nomidan avtomatik taniladi; CRM'da qo'lda tuzatish mumkin.
// =========================================================

export const FIELDS = {
  name: 'F.I.Sh.',
  roll: 'Roll / ID / KM-raqam',
  cls: 'Sinf',
  phone: 'Telefon',
  q1: '1-fan (to‘g‘ri javoblar)',
  q2: '2-fan (to‘g‘ri javoblar)',
  correct: 'Jami to‘g‘ri javoblar',
  score: 'Jami ball'
};

const norm = s => String(s ?? '').toLowerCase().replace(/[ʻʼ‘’'`´]/g, '').replace(/\s+/g, ' ').trim();

// Sarlavha → maydon (birinchi mos kelgan ustun olinadi)
const PATTERNS = [
  ['name', /(student|candidate)?\s*name|^ism|ismi|f\.?\s*i\.?\s*sh|fio|фио|o.?quvchi|ученик|familiya/],
  ['roll', /roll|^id$|student id|reg|ariza|^km|admission|№|^no\.?$|номер/],
  ['cls', /class|sinf|section$|^section name|группа|класс|grade|batch/],
  ['phone', /phone|mobile|tel|raqam|телефон/],
  ['q1', /(section|part|bo.?lim|fan|subject)\s*[-#:]?\s*(1|i|a)\b|math|matem|матем/],
  ['q2', /(section|part|bo.?lim|fan|subject)\s*[-#:]?\s*(2|ii|b)\b|english|ingliz|англ/],
  ['correct', /correct|to.?g.?ri|right|верн|правил/],
  ['score', /total|score|marks|ball|jami|балл|итог|obtained|result|natija/]
];

/** Jadvaldagi sarlavha qatorini topish (birinchi 15 qator ichida, "ism" ustuni bor qator) */
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(norm);
    if (cells.some(c => PATTERNS[0][1].test(c)) && cells.filter(Boolean).length >= 2) return i;
  }
  return 0;
}

/** Sarlavhalardan maydonlar xaritasi: { name: 2, score: 7, ... } */
export function guessMapping(headers) {
  const map = {};
  const used = new Set();
  const cells = headers.map(norm);
  for (const [field, re] of PATTERNS) {
    // "Total correct" kabi ustun score emas, correct — shuning uchun correct'ni score'dan oldin tekshiramiz
    const idx = cells.findIndex((c, i) => c && !used.has(i) && re.test(c) && !(field === 'score' && PATTERNS[6][1].test(c)));
    if (idx >= 0) { map[field] = idx; used.add(idx); }
  }
  return map;
}

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Qatorlarni yozuvlarga aylantirish */
export function rowsToRecords(rows, headerRow, map) {
  const out = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const get = f => (map[f] === undefined || map[f] === null || map[f] === '' ? '' : r[map[f]]);
    const name = String(get('name') ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) continue;
    out.push({
      row: i + 1,
      name,
      roll: String(get('roll') ?? '').trim(),
      cls: String(get('cls') ?? '').trim(),
      phone: String(get('phone') ?? '').trim(),
      q1: num(get('q1')),
      q2: num(get('q2')),
      correct: num(get('correct')),
      score: num(get('score'))
    });
  }
  return out;
}

/** Ballni hisoblash: 1-fan/2-fan to'g'ri javoblari bo'lsa — test og'irliklari bilan, bo'lmasa fayldagi jami ball */
export function computeScore(rec, w1 = 1, w2 = 1) {
  if (rec.q1 !== null || rec.q2 !== null) {
    const q1 = rec.q1 || 0, q2 = rec.q2 || 0;
    return { q1, q2, score: Math.round((q1 * w1 + q2 * w2) * 10) / 10 };
  }
  if (rec.score !== null) return { q1: rec.correct ?? 0, q2: 0, score: rec.score };
  if (rec.correct !== null) return { q1: rec.correct, q2: 0, score: Math.round(rec.correct * w1 * 10) / 10 };
  return null;
}

/** Ism solishtirish: katta-kichik harf, apostroflar va so'z tartibidan qat'i nazar */
export function nameKey(s) {
  return norm(s).replace(/[^a-zа-яёўқғҳ0-9 ]/gi, '').split(' ').filter(Boolean).sort().join(' ');
}

const CYR = { а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ж: 'J', з: 'Z', и: 'I', к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F', х: 'X' };
/** Sinf nomini solishtirish: "5A", "5-A", "5 а" → "5A" */
export function classKey(s) {
  const t = String(s ?? '').trim().toLowerCase();
  const m = t.match(/(\d{1,2})\s*[-–_ ]?\s*([a-zа-яё]?)/i);
  if (!m) return t.toUpperCase();
  const letter = m[2] ? (CYR[m[2]] || m[2].toUpperCase()) : '';
  return m[1] + letter;
}

/** Ariza raqami (KM-123 yoki 123) */
export function regIdOf(roll) {
  const m = String(roll || '').match(/(?:km[-\s]?)?(\d{1,7})/i);
  return m ? Number(m[1]) : null;
}

/** Fayl jadvalidan to'liq tahlil */
export function analyze(rows) {
  const headerRow = findHeaderRow(rows);
  const headers = (rows[headerRow] || []).map(h => String(h ?? ''));
  const map = guessMapping(headers);
  const records = rowsToRecords(rows, headerRow, map);
  const ok = map.name !== undefined && (map.score !== undefined || map.q1 !== undefined || map.correct !== undefined);
  return { headerRow, headers, map, records, ok };
}
