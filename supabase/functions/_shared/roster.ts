// =========================================================
// 📋 Excel ro'yxat → maktab / sinf / o'quvchi (imtihon boti → CRM)
// Ustunlar sarlavhadan taniladi: ism, sinf, maktab, telefon.
// Sinf ustuni bo'lmasa — varaq nomidan ("5-A") yoki jadval ichidagi "5-A sinf" sarlavha qatoridan olinadi.
// Toza funksiyalar: Deno (bot) va testlarda ishlaydi.
// =========================================================

export type RosterRec = { name: string; cls: string; school: string; phone: string; sheet: string; row: number };

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[ʻʼ‘’'`´]/g, '').replace(/\s+/g, ' ').trim();

const H = {
  name: /(student|candidate|pupil)?\s*name|^ism|ismi|f\.?\s*i\.?\s*sh|fio|фио|o.?quvchi|ученик|familiya|фамилия|имя/,
  cls: /^class|class name|sinf|^section|группа|класс|^grade|^guruh/,
  school: /maktab|school|школа|^muassasa|ta.?lim muassasa/,
  phone: /phone|mobile|^tel|raqam|телефон|номер тел/,
  score: /total|score|marks|^ball|jami|балл|итог|obtained|result|natija|to.?g.?ri|correct/
};

const CYR: Record<string, string> = { а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ж: 'J', з: 'Z', и: 'I', к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F', х: 'X' };

/** Sinf: "5a", "5 А", "5-«a» sinf", "5A-sinf" → "5-A"; "11" → "11"; topilmasa "" */
export function crmClass(raw: unknown): string {
  const t = String(raw ?? '').trim().toLowerCase().replace(/[«»"“”']/g, '');
  const m = t.match(/(^|[^\d])(1[01]|[1-9])\s*[-–_ ]?\s*([a-zа-яё])?(?![a-zа-яё])/i) || t.match(/^(1[01]|[1-9])$/);
  if (!m) return '';
  const num = m[2] ?? m[1];
  const l = m[3] ? (CYR[m[3]] || m[3].toUpperCase()) : '';
  return l ? `${num}-${l}` : String(num);
}

/** Qator "sinf sarlavhasi"mi: "5-A sinf", "5 «B» sinf o'quvchilari", "Sinf: 7-V" */
export function classHeading(text: string): string {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return '';
  if (/sinf|класс|class|guruh/i.test(t) || /^(1[01]|[1-9])\s*[-–]?\s*[a-zа-я]$/i.test(t)) return crmClass(t);
  return '';
}

/** Maktab: "12-maktab", "12 maktab", "12-umumta'lim maktabi", "12" → { id: "12-maktab", name: "12-Maktab" } */
export function crmSchool(raw: unknown): { id: string; name: string } | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const n = t.match(/\d{1,4}/);
  if (n) return { id: `${Number(n[0])}-maktab`, name: `${Number(n[0])}-Maktab` };
  const slug = norm(t).replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug ? { id: slug, name: t.slice(0, 60) } : null;
}

const cleanName = (s: unknown) => String(s ?? '').replace(/^\s*\d{1,4}\s*[.)\-–]\s*/, '').replace(/\s+/g, ' ').trim();
const looksName = (s: string) => {
  const t = cleanName(s);
  const words = t.split(' ').filter(w => /[a-zа-яёʻʼ‘’'`]{2,}/i.test(w));
  return words.length >= 2 && !/\d{3,}/.test(t) && t.length <= 80;
};
const phoneOf = (s: unknown) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 9 ? '+998' + d.slice(-9) : ''; };

function findHeader(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] || []).map(norm);
    const idx = cells.findIndex(c => c && c.length < 40 && !/\d/.test(c) && H.name.test(c));
    if (idx >= 0) {
      const col = (re: RegExp) => cells.findIndex((c, j) => j !== idx && c && c.length < 40 && re.test(c));
      return { row: i, name: idx, cls: col(H.cls), school: col(H.school), phone: col(H.phone), score: col(H.score) };
    }
  }
  return null;
}

/** Sarlavhasiz varaq: eng ko'p "ism-familiya" bo'lgan ustun */
function guessNameCol(rows: unknown[][]) {
  const cnt = new Map<number, number>();
  rows.slice(0, 200).forEach(r => (r || []).forEach((c, j) => { if (looksName(String(c ?? ''))) cnt.set(j, (cnt.get(j) || 0) + 1); }));
  const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 ? best[0] : -1;
}

/**
 * Varaqlardan ro'yxat. sheets: [{ name, rows }]
 * Natija: records + ball ustuni bormi (natija fayli bo'lishi mumkin) + maktab ustuni bormi
 */
export function parseRoster(sheets: { name: string; rows: unknown[][] }[]) {
  const records: RosterRec[] = [];
  let hasScore = false, hasSchool = false, hasClassInfo = false;
  for (const sh of sheets) {
    const rows = sh.rows || [];
    if (!rows.length) continue;
    const h = findHeader(rows);
    // Sarlavhasiz varaqda ism har qatorda alohida qidiriladi (raqam va ism turli ustunda bo'lishi mumkin)
    const nameCol = h ? h.name : guessNameCol(rows);
    if (nameCol < 0) continue;
    if (h && h.score >= 0) hasScore = true;
    if (h && h.school >= 0) hasSchool = true;
    const sheetClass = /^\s*(1[01]|[1-9])\s*[-–_ ]?\s*[«"']?[a-zа-яё]?[»"']?\s*(-?\s*(sinf|класс|class))?\s*$/i.test(sh.name) ? crmClass(sh.name) : '';
    let current = '';
    for (let i = (h ? h.row + 1 : 0); i < rows.length; i++) {
      const r = rows[i] || [];
      const cellName = h ? String(r[nameCol] ?? '').trim() : String(r.find(c => looksName(String(c ?? ''))) ?? '').trim();
      const nonEmpty = r.filter(c => String(c ?? '').trim()).length;
      // "5-A sinf" kabi sarlavha qatori (yolg'iz yoki birinchi katakda)
      const headCell = String(r.find(c => String(c ?? '').trim()) ?? '');
      const heading = nonEmpty <= 2 ? classHeading(headCell) : '';
      if (heading) { current = heading; hasClassInfo = true; continue; }
      if (!looksName(cellName)) continue;
      if (/^(jami|итого|всего|total)/i.test(cellName)) continue;
      const cls = (h && h.cls >= 0 ? crmClass(r[h.cls]) : '') || current || sheetClass;
      if (cls) hasClassInfo = true;
      const school = h && h.school >= 0 ? String(r[h.school] ?? '').trim() : '';
      records.push({ name: cleanName(cellName), cls, school, phone: h && h.phone >= 0 ? phoneOf(r[h.phone]) : '', sheet: sh.name, row: i + 1 });
    }
  }
  return { records, hasScore, hasSchool, hasClassInfo };
}

/** Maktab → sinf → soni (tartiblangan) */
export function groupRoster(recs: { cls: string; schoolName?: string; school?: string }[]) {
  const g = new Map<string, Map<string, number>>();
  for (const r of recs) {
    const sk = r.schoolName || r.school || '—';
    if (!g.has(sk)) g.set(sk, new Map());
    const m = g.get(sk)!;
    m.set(r.cls || '—', (m.get(r.cls || '—') || 0) + 1);
  }
  const clsSort = (a: string, b: string) => (parseInt(a) || 99) - (parseInt(b) || 99) || a.localeCompare(b);
  return [...g.entries()].sort((a, b) => (parseInt(a[0]) || 999) - (parseInt(b[0]) || 999) || a[0].localeCompare(b[0]))
    .map(([school, m]) => ({ school, classes: [...m.entries()].sort((a, b) => clsSort(a[0], b[0])).map(([cls, n]) => ({ cls, n })) }));
}
