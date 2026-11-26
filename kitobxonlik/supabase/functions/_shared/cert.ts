// Sertifikat rasmi: SVG → PNG (resvg-wasm). Kitob yakunlanganda va tanlov natijasida bot yuboradi.
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';

export type CertInfo = {
  kind: 'book' | 'contest';
  fullName: string;
  title: string;        // kitob yoki tanlov nomi
  author?: string;
  certNo: string;
  date: string;         // 26.11.2026
  testPct?: number;
  reviewScore?: number;
  rank?: number;        // tanlovdagi o'rin
  participants?: number;
};

const x = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fit = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

// Tanlov o'rni bo'yicha medal rangi
const MEDAL: Record<number, [string, string]> = { 1: ['#f5c542', '#a8780f'], 2: ['#d9dde3', '#8a929c'], 3: ['#e3a26b', '#9a5a26'] };

export function certSvg(c: CertInfo) {
  const W = 1600, H = 1130;
  const gold = '#b8892d', ink = '#1f2a37', soft = '#5b6573';
  const winner = c.kind === 'contest' && c.rank && c.rank <= 3;
  const heading = c.kind === 'book' ? 'KITOBXONLIK SERTIFIKATI' : winner ? `${c.rank}-O‘RIN · G‘OLIB DIPLOMI` : 'ISHTIROKCHI SERTIFIKATI';
  const lead = c.kind === 'book'
    ? 'quyidagi asarni to‘liq o‘qib, bilim testidan muvaffaqiyatli o‘tgani va audio taqriz topshirgani uchun taqdirlanadi'
    : winner ? 'kitobxonlik tanlovida yuqori natija ko‘rsatgani uchun taqdirlanadi' : 'kitobxonlik tanlovida faol ishtirok etgani uchun taqdirlanadi';
  const stats = c.kind === 'book'
    ? [`Test natijasi: ${c.testPct ?? 0}%`, `Audio taqriz: ${c.reviewScore ?? 0} / 10`]
    : [`Natija: ${c.testPct ?? 0}%`, c.rank ? `O‘rin: ${c.rank}${c.participants ? ` / ${c.participants}` : ''}` : ''];
  const medal = winner ? MEDAL[c.rank!] : null;
  // Lead matnini 2 qatorga bo'lish
  const words = lead.split(' ');
  const lines: string[] = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > 70) lines.push(w);
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  const nameSize = c.fullName.length > 26 ? 70 : 88;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#f6efe0"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6f1e"/><stop offset="0.5" stop-color="#e2bf6a"/><stop offset="1" stop-color="#9c6f1e"/></linearGradient>
    ${medal ? `<radialGradient id="medal"><stop offset="0" stop-color="${medal[0]}"/><stop offset="1" stop-color="${medal[1]}"/></radialGradient>` : ''}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="url(#gold)" stroke-width="10"/>
  <rect x="62" y="62" width="${W - 124}" height="${H - 124}" fill="none" stroke="${gold}" stroke-width="2"/>
  ${[[62, 62], [W - 62, 62], [62, H - 62], [W - 62, H - 62]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="16" fill="${gold}"/>`).join('')}
  <g transform="translate(${W / 2} 170)">
    <path d="M-62 -34 Q-31 -50 0 -34 Q31 -50 62 -34 L62 30 Q31 14 0 30 Q-31 14 -62 30 Z" fill="none" stroke="${gold}" stroke-width="5" stroke-linejoin="round"/>
    <line x1="0" y1="-34" x2="0" y2="30" stroke="${gold}" stroke-width="4"/>
  </g>
  <text x="${W / 2}" y="262" text-anchor="middle" font-family="Inter" font-weight="800" font-size="26" letter-spacing="6" fill="${gold}">LAYLO PARDAYEVA KITOBXONLIK AKADEMIYASI</text>
  <text x="${W / 2}" y="368" text-anchor="middle" font-family="Playfair Display" font-weight="900" font-size="76" fill="${ink}">${x(heading)}</text>
  <line x1="${W / 2 - 220}" y1="404" x2="${W / 2 + 220}" y2="404" stroke="url(#gold)" stroke-width="4"/>
  <text x="${W / 2}" y="470" text-anchor="middle" font-family="Inter" font-weight="600" font-size="28" fill="${soft}">Ushbu sertifikat</text>
  <text x="${W / 2}" y="${560 + (nameSize - 88) / 3}" text-anchor="middle" font-family="Playfair Display" font-weight="700" font-size="${nameSize}" fill="${ink}">${x(fit(c.fullName, 34))}</text>
  ${lines.map((l, i) => `<text x="${W / 2}" y="${630 + i * 40}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="28" fill="${soft}">${x(l)}</text>`).join('')}
  <text x="${W / 2}" y="${630 + (lines.length - 1) * 40 + 92}" text-anchor="middle" font-family="Playfair Display" font-style="italic" font-weight="400" font-size="50" fill="${ink}">«${x(fit(c.title, 44))}»</text>
  ${c.author ? `<text x="${W / 2}" y="${630 + (lines.length - 1) * 40 + 146}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="28" fill="${gold}">${x(fit(c.author, 50))}</text>` : ''}
  <text x="${W / 2}" y="868" text-anchor="middle" font-family="Inter" font-weight="800" font-size="28" fill="${ink}">${x(stats.filter(Boolean).join('   ·   '))}</text>
  <g font-family="Inter">
    <line x1="170" y1="960" x2="520" y2="960" stroke="${soft}" stroke-width="2"/>
    <text x="345" y="1000" text-anchor="middle" font-weight="700" font-size="24" fill="${ink}">Laylo Pardayeva</text>
    <text x="345" y="1032" text-anchor="middle" font-weight="600" font-size="20" fill="${soft}">Akademiya asoschisi</text>
    <line x1="${W - 520}" y1="960" x2="${W - 170}" y2="960" stroke="${soft}" stroke-width="2"/>
    <text x="${W - 345}" y="1000" text-anchor="middle" font-weight="700" font-size="24" fill="${ink}">${x(c.date)}</text>
    <text x="${W - 345}" y="1032" text-anchor="middle" font-weight="600" font-size="20" fill="${soft}">№ ${x(c.certNo)}</text>
  </g>
  ${medal ? `<g transform="translate(${W / 2} 985)">
    <circle r="72" fill="url(#medal)" stroke="#fff" stroke-width="6"/>
    <circle r="56" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>
    <text y="26" text-anchor="middle" font-family="Playfair Display" font-weight="900" font-size="74" fill="#ffffff">${c.rank}</text>
  </g>` : `<g transform="translate(${W / 2} 985)">
    <circle r="64" fill="none" stroke="${gold}" stroke-width="4"/>
    <circle r="52" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="4 6"/>
    <text y="-6" text-anchor="middle" font-family="Inter" font-weight="800" font-size="18" letter-spacing="3" fill="${gold}">LPKA</text>
    <text y="22" text-anchor="middle" font-family="Inter" font-weight="700" font-size="15" fill="${gold}">${x(c.date.slice(-4))}</text>
  </g>`}
</svg>`;
}

let ready: Promise<void> | null = null;
let fonts: Uint8Array[] = [];

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const FONT_URLS = [
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_600SemiBold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_800ExtraBold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/playfair-display@0.2.3/PlayfairDisplay_700Bold.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/playfair-display@0.2.3/PlayfairDisplay_900Black.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/playfair-display@0.2.3/PlayfairDisplay_400Regular_Italic.ttf'
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
    })().catch(e => { ready = null; throw e; });
  }
  await ready;
}

export async function certPng(c: CertInfo): Promise<Uint8Array> {
  await ensureReady();
  const r = new Resvg(certSvg(c), {
    font: { fontBuffers: fonts, defaultFontFamily: 'Inter', loadSystemFonts: false },
    fitTo: { mode: 'width', value: 1600 }
  });
  return r.render().asPng();
}
