// Yutuqli karta (TOP-3) — CRM'dagi buildCardCanvas dizaynining server nusxasi.
// SVG yasaladi va resvg-wasm bilan PNG'ga aylantiriladi (Telegram sendPhoto uchun).
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';

export type CardInfo = {
  id: number;
  fullName: string;
  className: string;
  schoolName: string;
  gradeKey: string;
  rank: number; // 1..3
};

export const PRIZES: Record<number, { amount: number; tier: string; label: string; quote: string }> = {
  1: { amount: 150000, tier: '1-o‘rin (Parallel TOP-3)', label: '1-O‘RIN · OLTIN YUTUQLI KARTA', quote: 'Birinchi qadam — eng katta ilhom! Bilimingiz bilan yangi cho‘qqilarni zabt eting!' },
  2: { amount: 100000, tier: '2-o‘rin (Parallel TOP-3)', label: '2-O‘RIN · KUMUSH YUTUQLI KARTA', quote: 'Kuchli natija va yuksak intilish! Keyingi marra albatta 1-o‘rin!' },
  3: { amount: 75000, tier: '3-o‘rin (Parallel TOP-3)', label: '3-O‘RIN · BRONZA YUTUQLI KARTA', quote: 'Ajoyib yutuq! Har bir mehnat kelajakdagi katta g‘alabaga yo‘l ochadi!' }
};

const THEMES: Record<number, { g: [string, string, string]; border: string; accent: string; sub: string; circle: [number, number] }> = {
  1: { g: ['#1f1002', '#78350f', '#d97706'], border: 'rgba(253,224,71,0.85)', accent: '#fde047', sub: '#fef08a', circle: [960, 210] },
  2: { g: ['#090d16', '#1e293b', '#64748b'], border: 'rgba(226,232,240,0.85)', accent: '#f1f5f9', sub: '#cbd5e1', circle: [920, 175] },
  3: { g: ['#230b04', '#7c2d12', '#c2410c'], border: 'rgba(253,186,116,0.85)', accent: '#fdba74', sub: '#ffedd5', circle: [980, 175] }
};

export const promoCode = (id: number) => 'RGN12-' + String(id).padStart(4, '0');
export const money = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';

const x = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function fit(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function cardSvg(c: CardInfo) {
  const p = PRIZES[c.rank];
  const t = THEMES[c.rank];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="640" viewBox="0 0 1120 640">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${t.g[0]}"/><stop offset="0.5" stop-color="${t.g[1]}"/><stop offset="1" stop-color="${t.g[2]}"/>
  </linearGradient></defs>
  <rect width="1120" height="640" fill="url(#g)"/>
  <circle cx="${t.circle[0]}" cy="140" r="${t.circle[1]}" fill="rgba(255,255,255,0.06)"/>
  <rect x="26" y="26" width="1068" height="588" fill="none" stroke="${t.border}" stroke-width="${c.rank === 1 ? 6 : 4}"/>
  <g font-family="Inter">
    <text x="64" y="92" font-size="24" font-weight="900" fill="${t.accent}">${x(fit(`REGISTAN LC · ${p.label} (${c.gradeKey})`, 70))}</text>
    <text x="64" y="132" font-size="22" font-weight="700" fill="${t.sub}" opacity="0.85">${x(fit(c.schoolName, 60))}</text>
    <text x="64" y="215" font-size="54" font-weight="900" fill="#ffffff">${x(fit(c.fullName, 30))}</text>
    <text x="64" y="278" font-size="32" font-weight="800" fill="${t.sub}">${x(`${p.tier} · ${c.className} sinfi`)}</text>
    <text x="64" y="358" font-size="46" font-weight="900" fill="#ffffff">${x(`Chegirma: ${money(p.amount)}`)}</text>
    <text x="64" y="436" font-size="23" font-weight="600" fill="#e2e8f0">${x(fit(p.quote, 85))}</text>
    <text x="64" y="545" font-size="24" font-weight="800" fill="${t.accent}">${x(`Promo-kod: ${promoCode(c.id)} · 2 oy davomida amal qiladi`)}</text>
  </g>
</svg>`;
}

let ready: Promise<void> | null = null;
let fonts: Uint8Array[] = [];

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const FONT_URLS = [
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_600SemiBold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_800ExtraBold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_900Black.ttf'
];

/** Lokal test uchun: wasm va shriftlarni tashqaridan berish */
export function setAssets(wasm: Uint8Array, fontFiles: Uint8Array[]) {
  ready = initWasm(wasm);
  fonts = fontFiles;
}

async function ensureReady() {
  if (!ready) {
    ready = (async () => {
      const [wasm, ...fs] = await Promise.all([WASM_URL, ...FONT_URLS].map(u => fetch(u).then(r => {
        if (!r.ok) throw new Error('asset ' + r.status + ' ' + u);
        return r.arrayBuffer();
      })));
      await initWasm(wasm);
      fonts = fs.map(b => new Uint8Array(b));
    })();
  }
  await ready;
}

export async function cardPng(c: CardInfo): Promise<Uint8Array> {
  await ensureReady();
  const r = new Resvg(cardSvg(c), {
    font: { fontBuffers: fonts, defaultFontFamily: 'Inter', loadSystemFonts: false },
    fitTo: { mode: 'original' }
  });
  return r.render().asPng();
}
