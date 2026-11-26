// =========================================================
// 💵 Naqd inkassa — Edutizim kassasidagi "Naqd Inkassa" to'lov usuli.
// Inkassa davri: Shanba 00:00 — Juma 23:59 (Toshkent); Juma kuni bankka topshiriladi.
// Kirim ikki xil: o'quvchi to'g'ridan-to'g'ri shu usulda to'lagan yoki "Naqd"dan ko'chirilgan
// ("Naqd"dan chiqim + bir vaqtda xuddi shu summada "Naqd Inkassa"ga kirim).
// Faqat o'qiydi — Edutizimda hech narsa o'zgartirilmaydi.
// =========================================================
export type InkP = 'cur' | 'prev' | 'month' | 'pmonth' | 'w8';
type Edu = (action: string, body?: Record<string, unknown>) => Promise<any>;

const TZ = 5 * 3600_000, DAY = 86400_000;
const WD = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const WD_FULL = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
const sum = (n: number) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';
const mln = (n: number) => (Math.abs(n) >= 1_000_000 ? (Math.round(n / 100_000) / 10).toString().replace('.', ',') + ' mln so‘m' : sum(n));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const bar = (part: number, whole: number) => { const n = whole ? Math.round((part / whole) * 10) : 0; return '▰'.repeat(n) + '▱'.repeat(10 - n); };
const dayStart = (ms: number) => Math.floor((ms + TZ) / DAY) * DAY - TZ;
const dow = (ms: number) => (new Date(dayStart(ms) + TZ).getUTCDay() + 6) % 7; // Du = 0 … Ya = 6
const dmy = (ms: number) => { const d = new Date(ms + TZ); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const wdd = (ms: number) => `${WD[dow(ms)]} ${dmy(ms)}`;

export const isInk = (m: string) => /inkassa/i.test(String(m || ''));
// Xarajatlardan chiqariladi: kategoriyasiz "Naqd" chiqim — bu Naqd Inkassa'ga ko'chirma
export const isMoveOut = (t: any) => t.type === 'payOut' && (!t.category || t.category === '—') && !t.subtype && !t.person && /naqd/i.test(t.method || '') && !isInk(t.method);

/** Inkassa davri (Shanba–Juma) */
export function cycleOf(ms: number) {
  const from = dayStart(ms) - ((dow(ms) - 5 + 7) % 7) * DAY;
  return { from, to: from + 7 * DAY - 1, bank: from + 6 * DAY };
}
export const ustozOf = (c: string) => {
  const s = String(c || '').replace(/\s+/g, ' ').trim();
  if (!s || /^[.\-–—\s]*$/.test(s)) return 'Izohsiz';
  const n = s.toLowerCase().replace(/ustoza\b/g, 'ustoz').replace(/[’'`ʻʼ‘]/g, '\'');
  return n.charAt(0).toUpperCase() + n.slice(1);
};

export async function inkTx(edu: Edu, from: number, to: number) {
  const meta = await edu('kassaMeta');
  if (!meta.ok) throw new Error(meta.error || 'Edutizim kassasi');
  const res = await Promise.all((meta.cashboxes || []).map((c: any) => edu('kassaTx', { cashboxId: c.id, dateFrom: new Date(from).toISOString(), dateTo: new Date(to).toISOString() })));
  const err = res.find((r: any) => !r.ok);
  if (err) throw new Error(err.error || 'Edutizim xatosi');
  const all = res.flatMap((r: any) => r.tx || []).filter((t: any) => !t.cancelled);
  const outs = all.filter((t: any) => t.type === 'payOut' && !isInk(t.method) && /naqd/i.test(t.method));
  const used = new Set<any>();
  const ink = all.filter((t: any) => isInk(t.method));
  ink.forEach((t: any) => {
    if (t.type !== 'payIn') return;
    const tm = new Date(t.date).getTime();
    const o = outs.find((x: any) => !used.has(x) && x.amount === t.amount && Math.abs(new Date(x.date).getTime() - tm) <= 10_000);
    if (o) { used.add(o); t.moved = true; }
  });
  return ink;
}

function periodOf(p: InkP, now: number) {
  const c = cycleOf(now);
  const t = new Date(now + TZ);
  const m0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TZ, pm0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1) - TZ;
  switch (p) {
    case 'cur': return { from: c.from, to: Math.min(now, c.to), label: `Joriy davr (${wdd(c.from)} – ${wdd(c.bank)})`, bank: c.bank };
    case 'prev': return { from: c.from - 7 * DAY, to: c.from - 1, label: `O‘tgan davr (${wdd(c.from - 7 * DAY)} – ${wdd(c.bank - 7 * DAY)})`, bank: c.bank - 7 * DAY };
    case 'month': return { from: m0, to: now, label: `Bu oy (${dmy(m0)}–${dmy(now)})`, bank: 0 };
    case 'pmonth': return { from: pm0, to: m0 - 1, label: `O‘tgan oy (${dmy(pm0)}–${dmy(m0 - 1)})`, bank: 0 };
    case 'w8': return { from: c.from - 7 * 7 * DAY, to: now, label: `Oxirgi 8 davr (${dmy(c.from - 49 * DAY)}–${dmy(now)})`, bank: 0 };
  }
}

export const P_INK: Record<InkP, string> = { cur: 'Joriy davr', prev: 'O‘tgan davr', month: 'Bu oy', pmonth: 'O‘tgan oy', w8: '📊 Oxirgi 8 davr' };

/** Hisobot matni. short=true — Juma eslatmasi uchun qisqa ko'rinish */
export async function inkassaReport(edu: Edu, p: InkP, now = Date.now(), short = false): Promise<string> {
  const r = periodOf(p, now)!;
  const tx = await inkTx(edu, r.from, r.to);
  const ins = tx.filter(t => t.type === 'payIn'), outs = tx.filter(t => t.type !== 'payIn');
  const inSum = ins.reduce((a, t) => a + t.amount, 0), outSum = outs.reduce((a, t) => a + t.amount, 0);
  const moved = ins.filter(t => t.moved), direct = ins.filter(t => !t.moved);
  const movedSum = moved.reduce((a, t) => a + t.amount, 0), directSum = inSum - movedSum;
  const lines = [`💵 <b>Naqd inkassa · ${r.label}</b>`, ''];
  if (r.bank) {
    const today = dayStart(now);
    const left = Math.round((r.bank - today) / DAY);
    lines.push(p === 'cur'
      ? `🏦 Bankka topshirish: <b>${WD_FULL[dow(r.bank)]}, ${dmy(r.bank)}</b>${left === 0 ? ' — <b>bugun</b>' : left > 0 ? ` · ${left} kun qoldi` : ''}`
      : `🏦 ${WD_FULL[dow(r.bank)]}, ${dmy(r.bank)} kuni bankka topshirilgan bo‘lishi kerak`);
    lines.push(`💰 ${p === 'cur' ? 'Bankka topshiriladigan summa (hozirgacha)' : 'Bankka topshiriladigan summa'}: <b>${mln(inSum)}</b>`);
  } else lines.push(`📥 Jami yig‘ilgan: <b>${mln(inSum)}</b>`);
  lines.push(`   🧑‍🎓 To‘g‘ridan-to‘g‘ri to‘lovlar: <b>${mln(directSum)}</b> · ${direct.length} ta`);
  lines.push(`   🔁 Naqddan ko‘chirilgan: <b>${mln(movedSum)}</b> · ${moved.length} marta`);
  if (!short) {
    const bal = inSum - outSum;
    lines.push(`📤 Kassadan kunlik o‘tkazilgan: ${mln(outSum)}${bal ? ` · ⚖️ farq ${mln(bal)}` : ' ✅'}`);
  }
  if (p === 'w8' || p === 'month' || p === 'pmonth') {
    const cyc = new Map<number, { i: number; m: number; n: number }>();
    if (p === 'w8') for (let w = r.from; w <= now; w += 7 * DAY) cyc.set(cycleOf(w).from, { i: 0, m: 0, n: 0 });
    ins.forEach(t => { const k = cycleOf(new Date(t.date).getTime()).from; const x = cyc.get(k) || { i: 0, m: 0, n: 0 }; x.i += t.amount; x.n++; if (t.moved) x.m += t.amount; cyc.set(k, x); });
    const max = Math.max(1, ...[...cyc.values()].map(x => x.i));
    lines.push('', '<b>Davrlar bo‘yicha (Shanba–Juma · jami · shundan ko‘chirma):</b>');
    [...cyc.entries()].sort((a, b) => b[0] - a[0]).forEach(([k, x]) =>
      lines.push(`🏦 Ju ${dmy(k + 6 * DAY)} · <b>${mln(x.i)}</b>${x.m ? ` · 🔁 ${mln(x.m)}` : ''}\n   ${bar(x.i, max)} ${x.n} ta`));
  } else if (!short) {
    const by = new Map<string, { s: number; n: number }>();
    direct.forEach(t => { const k = ustozOf(t.comment); const x = by.get(k) || { s: 0, n: 0 }; x.s += t.amount; x.n++; by.set(k, x); });
    const list = [...by.entries()].sort((a, b) => b[1].s - a[1].s);
    if (list.length) {
      lines.push('', '<b>👩‍🏫 To‘lovlar ustozlar bo‘yicha (izohdan):</b>');
      list.slice(0, 15).forEach(([k, x], i) => lines.push(`${i + 1}. ${esc(k)} — <b>${mln(x.s)}</b> · ${x.n} ta · ${pct(x.s, directSum)}%`));
    }
    const days = new Map<number, { i: number; m: number }>();
    ins.forEach(t => { const k = dayStart(new Date(t.date).getTime()); const x = days.get(k) || { i: 0, m: 0 }; x.i += t.amount; if (t.moved) x.m += t.amount; days.set(k, x); });
    if (days.size) {
      lines.push('', '<b>📅 Kunlar bo‘yicha:</b>');
      [...days.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, x]) => lines.push(`${wdd(k)} · <b>${mln(x.i)}</b>${x.m ? ` (🔁 ${mln(x.m)})` : ''}`));
    }
    const pays = [...direct].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (pays.length) {
      lines.push('', `<b>🧾 To‘g‘ridan-to‘g‘ri to‘lovlar${pays.length > 20 ? ' (oxirgi 20)' : ''}:</b>`);
      pays.slice(0, 20).forEach(t => lines.push(`• ${dmy(new Date(t.date).getTime())} · ${esc(t.person || t.category || '—')} — <b>${sum(t.amount)}</b>${ustozOf(t.comment) !== 'Izohsiz' ? ` · <i>${esc(ustozOf(t.comment))}</i>` : ''}`));
    }
  }
  if (!tx.length) lines.push('', 'Bu davrda “Naqd Inkassa” usulida amal yo‘q.');
  const text = lines.join('\n');
  return text.length > 4000 ? text.slice(0, 3990) + '\n…' : text;
}
