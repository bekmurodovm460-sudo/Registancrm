// =========================================================
// 🗓 Dars jadvali PDF — Edutizim guruhlaridan (crm_edu_groups, har soatda yangilanadi)
// A4 landshaft: Toq kunlar (Du·Ch·Ju) va Juft kunlar (Se·Pa·Sh) — xona × soat jadvali
// =========================================================
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

const FONT_BASE = 'https://raw.githubusercontent.com/bekmurodovm460-sudo/Registancrm/refs/heads/claude/html-site-web-platform-pltyl0/brand/fonts/';
let fontCache: { r: Uint8Array; b: Uint8Array } | null = null;
async function fonts() {
  if (!fontCache) {
    const [r, b] = await Promise.all(['DejaVuSansCondensed.ttf', 'DejaVuSansCondensed-Bold.ttf'].map(async f => {
      const res = await fetch(FONT_BASE + f);
      if (!res.ok) throw new Error(`Shrift yuklanmadi: ${f} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    }));
    fontCache = { r, b };
  }
  return fontCache;
}

export type Lesson = { id: string; name: string; room: string; start: string; end: string; days: number[]; course: string; sub: string; teacher: string; teacherId: string; students: number };

// Edutizim kunlari: 1 = Yakshanba … 7 = Shanba → [2,4,6] = Du·Ch·Ju (toq), [3,5,7] = Se·Pa·Sh (juft)
const DAY_UZ: Record<number, string> = { 1: 'Ya', 2: 'Du', 3: 'Se', 4: 'Ch', 5: 'Pa', 6: 'Ju', 7: 'Sh' };
export function toLessons(rows: any[]): Lesson[] {
  return rows.filter(r => (r.data?.state || 'active') === 'active').map(r => {
    const d = r.data || {};
    const t = d.teacher || {};
    return {
      id: String(r.id), name: String(d.name || r.name || '').replace(/\s+/g, ' ').trim(),
      room: String(d.room?.name || 'Xonasiz').replace(/\s+/g, ' ').trim(),
      start: String(d.courseShift?.startHour || '').trim(), end: String(d.courseShift?.endHour || '').trim(),
      days: (d.courseDay?.days || []).map(Number), course: String(d.course?.name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(),
      sub: String(d.subCourse?.name || '').trim(), teacher: [t.firstName, t.lastName].filter(Boolean).join(' ').trim(), teacherId: String(d.teacherId || t._id || ''),
      students: Number(d.students) || 0
    };
  });
}
export const daysLabel = (days: number[]) => days.slice().sort().map(d => DAY_UZ[d] || '?').join('·');
const roomNo = (r: string) => { const m = r.match(/\d+/); return m ? Number(m[0]) : 999; };
const tmin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) <= width) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.map(l => { while (font.widthOfTextAtSize(l, size) > width && l.length > 1) l = l.slice(0, -2) + '…'; return l; });
}

const C = {
  navy: rgb(0.06, 0.12, 0.27), orange: rgb(0.95, 0.39, 0.16), cream: rgb(0.984, 0.969, 0.949), line: rgb(0.82, 0.84, 0.88),
  text: rgb(0.1, 0.12, 0.16), muted: rgb(0.42, 0.45, 0.5), white: rgb(1, 1, 1), red: rgb(0.86, 0.15, 0.15), redBg: rgb(1, 0.93, 0.93),
  course: { 'Ingliz': rgb(0.9, 0.95, 1), 'Matem': rgb(0.93, 0.98, 0.92), 'Rus': rgb(1, 0.95, 0.9), 'Nemis': rgb(0.96, 0.93, 1), 'Turk': rgb(1, 0.93, 0.95), 'Kimyo': rgb(0.93, 0.99, 0.98), 'Biolog': rgb(0.94, 0.99, 0.93), 'Tarix': rgb(0.99, 0.97, 0.9), 'Ona': rgb(0.97, 0.95, 0.92) } as Record<string, any>
};
const bgOf = (course: string) => { for (const k of Object.keys(C.course)) if (course.includes(k)) return C.course[k]; return rgb(0.96, 0.96, 0.97); };

function header(page: PDFPage, F: { r: PDFFont; b: PDFFont }, title: string, sub: string, stamp: string) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 46, width, height: 46, color: C.navy });
  page.drawRectangle({ x: 0, y: height - 49, width, height: 3, color: C.orange });
  page.drawText('REGISTAN LC · Dars jadvali', { x: 24, y: height - 30, size: 15, font: F.b, color: C.white });
  page.drawText(title, { x: 250, y: height - 30, size: 13, font: F.b, color: C.orange });
  const sw = F.r.widthOfTextAtSize(stamp, 8.5);
  page.drawText(stamp, { x: width - 24 - sw, y: height - 22, size: 8.5, font: F.r, color: C.white });
  const s2w = F.r.widthOfTextAtSize(sub, 8.5);
  page.drawText(sub, { x: width - 24 - s2w, y: height - 35, size: 8.5, font: F.r, color: rgb(0.8, 0.84, 0.92) });
}

/** PDF: har kun turi (toq/juft) uchun xona × soat jadvali; teacherId berilsa — faqat shu ustoz darslari (ro'yxat ko'rinishida) */
export async function schedulePdf(lessons: Lesson[], opts: { stamp: string; title?: string; teacherId?: string } ) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = await fonts();
  const F = { r: await doc.embedFont(f.r, { subset: true }), b: await doc.embedFont(f.b, { subset: true }) };
  doc.setTitle('Registan LC — Dars jadvali'); doc.setAuthor('Registan Globus · Moliya bot');
  const list = opts.teacherId ? lessons.filter(l => l.teacherId === opts.teacherId) : lessons;
  const patterns = new Map<string, Lesson[]>();
  list.forEach(l => { const k = daysLabel(l.days) || '—'; (patterns.get(k) || patterns.set(k, []).get(k)!).push(l); });
  const order = [...patterns.keys()].sort((a, b) => (a.startsWith('Du') ? 0 : a.startsWith('Se') ? 1 : 2) - (b.startsWith('Du') ? 0 : b.startsWith('Se') ? 1 : 2) || a.localeCompare(b));
  const PW = 841.89, PH = 595.28, M = 18;
  let conflicts = 0;
  for (const key of order) {
    const ls = patterns.get(key)!;
    const name = key === 'Du·Ch·Ju' ? 'Toq kunlar' : key === 'Se·Pa·Sh' ? 'Juft kunlar' : 'Kunlar';
    const full = key.split('·').map(d => ({ Du: 'Dushanba', Se: 'Seshanba', Ch: 'Chorshanba', Pa: 'Payshanba', Ju: 'Juma', Sh: 'Shanba', Ya: 'Yakshanba' } as Record<string, string>)[d] || d).join(' · ');
    const page = doc.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: C.cream });
    header(page, F, `${name} — ${full}`, `${ls.length} guruh · ${ls.reduce((a, l) => a + l.students, 0)} o‘quvchi${opts.title ? ' · ' + opts.title : ''}`, opts.stamp);
    const rooms = [...new Set(ls.map(l => l.room))].sort((a, b) => roomNo(a) - roomNo(b) || a.localeCompare(b));
    const slots = [...new Set(ls.map(l => `${l.start}–${l.end}`))].sort((a, b) => tmin(a) - tmin(b) || a.localeCompare(b));
    const top = PH - 62, bottom = 30, timeW = 58;
    const colW = Math.min(190, (PW - 2 * M - timeW) / Math.max(1, rooms.length));
    const tableW = timeW + colW * rooms.length;
    const headH = 20, rowH = Math.min(rooms.length <= 3 ? 70 : 120, (top - bottom - headH) / Math.max(1, slots.length));
    // Sarlavha qatori (xonalar)
    page.drawRectangle({ x: M, y: top - headH, width: tableW, height: headH, color: C.navy });
    page.drawText('Vaqt', { x: M + 8, y: top - 14, size: 9, font: F.b, color: C.white });
    rooms.forEach((r, i) => {
      const w = F.b.widthOfTextAtSize(r, 9);
      page.drawText(r, { x: M + timeW + i * colW + (colW - w) / 2, y: top - 14, size: 9, font: F.b, color: C.white });
    });
    slots.forEach((slot, si) => {
      const y = top - headH - (si + 1) * rowH;
      page.drawRectangle({ x: M, y, width: timeW, height: rowH, color: rgb(0.93, 0.94, 0.96), borderColor: C.line, borderWidth: 0.5 });
      const [a, b] = slot.split('–');
      page.drawText(a, { x: M + 8, y: y + rowH / 2 + 2, size: 10, font: F.b, color: C.navy });
      page.drawText(b, { x: M + 8, y: y + rowH / 2 - 10, size: 8.5, font: F.r, color: C.muted });
      rooms.forEach((room, ri) => {
        const x = M + timeW + ri * colW;
        const here = ls.filter(l => l.room === room && `${l.start}–${l.end}` === slot);
        const clash = here.length > 1;
        if (clash) conflicts++;
        page.drawRectangle({ x, y, width: colW, height: rowH, color: here.length ? (clash ? C.redBg : bgOf(here[0].course)) : C.white, borderColor: clash ? C.red : C.line, borderWidth: clash ? 1.2 : 0.5 });
        let cy = y + rowH - 11;
        const inner = colW - 8;
        for (const l of here) {
          if (cy < y + 6) break;
          for (const t of wrap(l.name, F.b, 7.6, inner, 2)) { page.drawText(t, { x: x + 4, y: cy, size: 7.6, font: F.b, color: clash ? C.red : C.navy }); cy -= 9; }
          const meta = [l.course, l.sub].filter(Boolean).join(' · ');
          if (meta && cy >= y + 6) for (const t of wrap(meta, F.r, 6.8, inner, 2)) { if (cy < y + 6) break; page.drawText(t, { x: x + 4, y: cy, size: 6.8, font: F.r, color: C.text }); cy -= 8; }
          for (const t of wrap(`${l.teacher} · ${l.students} o‘q.`, F.r, 6.8, inner, 2)) { if (cy < y + 6) break; page.drawText(t, { x: x + 4, y: cy, size: 6.8, font: F.r, color: C.muted }); cy -= 8; }
          cy -= 2;
        }
      });
    });
    const foot = `Manba: Edutizim (har soatda yangilanadi) · Botda “🔄 Yangilash” — eng so‘nggi holat${conflicts ? ' · Qizil katak — bir xona va vaqtda 2+ guruh' : ''}`;
    page.drawText(foot.replace('🔄 ', ''), { x: M, y: 12, size: 7.5, font: F.r, color: C.muted });
  }
  if (!order.length) {
    const page = doc.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: C.cream });
    header(page, F, opts.title || '', '', opts.stamp);
    page.drawText('Aktiv guruh topilmadi.', { x: 40, y: PH / 2, size: 16, font: F.b, color: C.navy });
  }
  // Ustozlar bo'yicha qisqa ro'yxat (umumiy jadvalda)
  if (!opts.teacherId && list.length) {
    const byT = new Map<string, Lesson[]>();
    list.forEach(l => (byT.get(l.teacher || '—') || byT.set(l.teacher || '—', []).get(l.teacher || '—')!).push(l));
    const teachers = [...byT.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let page = doc.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: C.cream });
    header(page, F, 'Ustozlar bo‘yicha', `${teachers.length} ustoz · ${list.length} guruh`, opts.stamp);
    const colX = [M, M + PW / 2 - 6];
    let col = 0, y = PH - 70;
    for (const [t, ls] of teachers) {
      const need = 16 + ls.length * 11;
      if (y - need < 24) { if (col === 0) { col = 1; y = PH - 70; } else { page = doc.addPage([PW, PH]); page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: C.cream }); header(page, F, 'Ustozlar bo‘yicha (davomi)', '', opts.stamp); col = 0; y = PH - 70; } }
      const x = colX[col];
      page.drawText(`${t} — ${ls.length} guruh, ${ls.reduce((a, l) => a + l.students, 0)} o‘quvchi`, { x, y, size: 9.5, font: F.b, color: C.navy });
      y -= 13;
      ls.sort((a, b) => a.days[0] - b.days[0] || tmin(a.start) - tmin(b.start)).forEach(l => {
        page.drawText(wrap(`${daysLabel(l.days)}  ${l.start}–${l.end}  ·  ${l.room}  ·  ${l.name}  ·  ${[l.course, l.sub].filter(Boolean).join(' · ')}`, F.r, 8, PW / 2 - 30, 1)[0] || '', { x: x + 8, y, size: 8, font: F.r, color: C.text });
        y -= 11;
      });
      y -= 5;
    }
  }
  return { bytes: await doc.save(), groups: list.length, conflicts, patterns: order.length };
}
