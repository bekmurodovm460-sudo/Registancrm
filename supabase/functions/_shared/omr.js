// =========================================================
// REGISTAN OMR — javoblar varaqasini o'qish (klassik, bepul)
// Brauzerda ham, Deno (Supabase edge function) da ham ishlaydi.
// Varaq A4 (210 x 297 mm). Barcha koordinatalar mm da.
// =========================================================

export const SHEET = { w: 210, h: 297 };
export const MARKER = { size: 9 };
// Burchak markerlari markazlari: TL, TR, BR, BL
export const MARKERS = [
  { x: 14, y: 14 },
  { x: 196, y: 14 },
  { x: 196, y: 283 },
  { x: 14, y: 283 }
];
// Yo'nalish belgisi (faqat yuqori-chap marker yonida)
export const ORIENT_MARK = { x: 27, y: 14, size: 5 };
export const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function getLayout(numQuestions, numOptions = 4) {
  const cols = numQuestions <= 20 ? 1 : numQuestions <= 40 ? 2 : 3;
  const rows = Math.ceil(numQuestions / cols);
  const colWidth = 62;
  const totalWidth = cols * colWidth;
  const x0 = (SHEET.w - totalWidth) / 2 + 4;
  const y0 = 82;
  const step = Math.min(10, (268 - y0) / Math.max(rows, 1));
  const r = Math.min(2.9, step * 0.3);
  const bubbles = [];
  for (let q = 0; q < numQuestions; q++) {
    const c = Math.floor(q / rows);
    const row = q % rows;
    const cx = x0 + c * colWidth;
    const cy = y0 + row * step;
    const opts = [];
    for (let j = 0; j < numOptions; j++) opts.push({ x: cx + 14 + j * 8.5, y: cy });
    bubbles.push({ q: q + 1, labelX: cx + 2, y: cy, opts });
  }
  return { cols, rows, step, r, bubbles };
}

// ---------------------------------------------------------
// Varaq chizish (brauzer canvas) — chop etish uchun
// ---------------------------------------------------------
export function drawSheet(ctx, pxWidth, test) {
  const k = pxWidth / SHEET.w;
  const W = pxWidth, H = Math.round(SHEET.h * k);
  const n = Number(test.num_questions) || 30;
  const no = Number(test.num_options) || 4;
  const L = getLayout(n, no);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  MARKERS.forEach(m => ctx.fillRect((m.x - MARKER.size / 2) * k, (m.y - MARKER.size / 2) * k, MARKER.size * k, MARKER.size * k));
  ctx.fillRect((ORIENT_MARK.x - ORIENT_MARK.size / 2) * k, (ORIENT_MARK.y - ORIENT_MARK.size / 2) * k, ORIENT_MARK.size * k, ORIENT_MARK.size * k);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111827';
  ctx.font = `900 ${6 * k}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('REGISTAN LC · JAVOBLAR VARAQASI', W / 2, 30 * k);
  ctx.font = `700 ${4 * k}px Inter, Arial, sans-serif`;
  ctx.fillText(`${test.title || ''}`, W / 2, 38 * k);
  ctx.textAlign = 'left';
  ctx.font = `700 ${4 * k}px Inter, Arial, sans-serif`;
  ctx.fillText(`Test kodi: ${test.code || ''}`, 22 * k, 50 * k);
  ctx.fillText(`Savollar: ${n}`, 140 * k, 50 * k);
  ctx.fillText('F.I.Sh.: ______________________________________________', 22 * k, 60 * k);
  ctx.font = `500 ${3 * k}px Inter, Arial, sans-serif`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Doirachani qora/ko‘k ruchka bilan TO‘LIQ bo‘yang. Varaqni bukmang. Rasmga 4 ta qora burchak to‘liq tushsin.', 22 * k, 69 * k);

  const r = L.r;
  L.bubbles.forEach(b => {
    ctx.fillStyle = '#111827';
    ctx.font = `800 ${3.6 * k}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(String(b.q).padStart(2, ' ') + '.', b.labelX * k, b.y * k);
    b.opts.forEach((o, j) => {
      ctx.beginPath();
      ctx.arc(o.x * k, o.y * k, r * k, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, 0.35 * k);
      ctx.strokeStyle = '#4b5563';
      ctx.stroke();
      ctx.fillStyle = '#9ca3af';
      ctx.font = `700 ${2.6 * k}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(LETTERS[j], o.x * k, o.y * k + 0.15 * k);
    });
  });
  ctx.textAlign = 'left';
  return { width: W, height: H };
}

// ---------------------------------------------------------
// Rasm -> kulrang
// ---------------------------------------------------------
export function rgbaToGray(rgba, width, height) {
  const g = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return g;
}

function downscale(gray, w, h, maxSide) {
  const s = Math.max(w, h) / maxSide;
  if (s <= 1) return { gray, w, h, scale: 1 };
  const f = Math.ceil(s);
  const nw = Math.floor(w / f), nh = Math.floor(h / f);
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let sum = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * w + x * f;
        for (let dx = 0; dx < f; dx++) sum += gray[row + dx];
      }
      out[y * nw + x] = sum / (f * f);
    }
  }
  return { gray: out, w: nw, h: nh, scale: f };
}

function otsu(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

// Lokal (adaptiv) qorayish: integral rasm bo'yicha atrofdagi o'rtachadan sezilarli qora
function adaptiveDark(gray, w, h, win, offset) {
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const dark = new Uint8Array(w * h);
  const r = win >> 1;
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - r), y2 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - r), x2 = Math.min(w, x + r + 1);
      const area = (x2 - x1) * (y2 - y1);
      const s = integ[y2 * (w + 1) + x2] - integ[y1 * (w + 1) + x2] - integ[y2 * (w + 1) + x1] + integ[y1 * (w + 1) + x1];
      dark[y * w + x] = gray[y * w + x] < (s / area) - offset ? 1 : 0;
    }
  }
  return dark;
}

function components(bin, w, h) {
  const labels = new Int32Array(w * h);
  const comps = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || labels[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = next;
    let area = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && bin[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack[sp++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack[sp++] = p + 1; }
      if (y > 0 && bin[p - w] && !labels[p - w]) { labels[p - w] = next; stack[sp++] = p - w; }
      if (y < h - 1 && bin[p + w] && !labels[p + w]) { labels[p + w] = next; stack[sp++] = p + w; }
    }
    comps.push({ id: next, area, cx: sx / area, cy: sy / area, minX, maxX, minY, maxY });
    next++;
  }
  return comps;
}

// 4 nuqtali gomografiya: src (mm) -> dst (px)
function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gauss
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-12) return null;
    for (let k = c; k < 9; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (!f) continue;
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const hm = A.map(r => r[8]);
  hm.push(1);
  return (x, y) => {
    const z = hm[6] * x + hm[7] * y + 1;
    return { x: (hm[0] * x + hm[1] * y + hm[2]) / z, y: (hm[3] * x + hm[4] * y + hm[5]) / z };
  };
}

function diskFill(dark, w, h, cx, cy, r) {
  let n = 0, d = 0;
  const r2 = r * r;
  const x1 = Math.max(0, Math.floor(cx - r)), x2 = Math.min(w - 1, Math.ceil(cx + r));
  const y1 = Math.max(0, Math.floor(cy - r)), y2 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      n++;
      d += dark[y * w + x];
    }
  }
  return n ? d / n : 0;
}

function quadArea(p) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a += p[i].x * p[j].y - p[j].x * p[i].y; }
  return a / 2;
}

/**
 * Varaqni o'qish.
 * @param {{gray:Uint8Array,width:number,height:number}} img
 * @param {{numQuestions:number,numOptions?:number}} opts
 * @returns {{ok:boolean,error?:string,answers?:string,fills?:number[][],rotation?:number,threshold?:number}}
 */
export function readSheet(img, opts) {
  const numQuestions = Number(opts.numQuestions);
  const numOptions = Number(opts.numOptions) || 4;
  const ds = downscale(img.gray, img.width, img.height, 1400);
  const { gray, w, h } = ds;
  const maxDim = Math.max(w, h);

  // Markerlarni topish: global Otsu bilan qora dog'lar
  const thr = otsu(gray);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < thr ? 1 : 0;
  const comps = components(bin, w, h);
  const minA = Math.pow(maxDim * 0.012, 2), maxA = Math.pow(maxDim * 0.09, 2);
  const cands = comps.filter(c => {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    const fill = c.area / (bw * bh);
    const asp = bw / bh;
    const touches = c.minX <= 1 || c.minY <= 1 || c.maxX >= w - 2 || c.maxY >= h - 2;
    return !touches && c.area >= minA && c.area <= maxA && fill >= 0.8 && asp > 0.55 && asp < 1.8;
  });
  if (cands.length < 4) return { ok: false, error: 'Burchakdagi 4 ta qora belgi topilmadi. Varaqni to‘liq, yorug‘ joyda suratga oling.' };

  const pick = f => cands.reduce((b, c) => (f(c) < f(b) ? c : b));
  const tl = pick(c => c.cx + c.cy);
  const tr = pick(c => (w - c.cx) + c.cy);
  const br = pick(c => (w - c.cx) + (h - c.cy));
  const bl = pick(c => c.cx + (h - c.cy));
  const corners = [tl, tr, br, bl];
  if (new Set(corners.map(c => c.id)).size < 4) return { ok: false, error: 'Burchak belgilarini ajratib bo‘lmadi. Varaqni to‘g‘riroq suratga oling.' };
  const areas = corners.map(c => c.area);
  if (Math.max(...areas) / Math.min(...areas) > 4) return { ok: false, error: 'Burchak belgilari noto‘g‘ri aniqlandi (soya yoki ortiqcha narsa bor).' };
  const pts = corners.map(c => ({ x: c.cx, y: c.cy }));
  if (Math.abs(quadArea(pts)) < w * h * 0.12) return { ok: false, error: 'Varaq rasmda juda kichik. Yaqinroqdan suratga oling.' };

  // Bubble o'lchash uchun adaptiv binarizatsiya (soya va notekis yorug'likka chidamli)
  const win = Math.max(15, Math.round(maxDim / 25) | 1);
  const dark = adaptiveDark(gray, w, h, win, 18);

  // Yo'nalish: 4 ta aylantirishdan qaysi birida yo'nalish belgisi qora
  let best = null;
  for (let rot = 0; rot < 4; rot++) {
    const dst = [0, 1, 2, 3].map(i => pts[(i + rot) % 4]);
    const H = homography(MARKERS, dst);
    if (!H) continue;
    const o = H(ORIENT_MARK.x, ORIENT_MARK.y);
    const e1 = H(ORIENT_MARK.x + ORIENT_MARK.size / 2, ORIENT_MARK.y);
    const rpx = Math.hypot(e1.x - o.x, e1.y - o.y) * 0.6;
    // binar (Otsu) bo'yicha to'ldirilganlik
    const f = diskFill(bin, w, h, o.x, o.y, rpx);
    if (!best || f > best.f) best = { rot, H, f };
  }
  if (!best || best.f < 0.5) return { ok: false, error: 'Varaq yo‘nalishi aniqlanmadi (yuqori-chap burchakdagi kichik belgi ko‘rinmayapti).' };
  const H = best.H;

  const L = getLayout(numQuestions, numOptions);
  const fills = [];
  let answers = '';
  const MARK = 0.42;
  L.bubbles.forEach(b => {
    const row = b.opts.map(o => {
      const c = H(o.x, o.y);
      const e = H(o.x + L.r, o.y);
      const rpx = Math.hypot(e.x - c.x, e.y - c.y) * 0.62;
      return diskFill(dark, w, h, c.x, c.y, rpx);
    });
    fills.push(row.map(v => Math.round(v * 100) / 100));
    const sorted = row.map((v, i) => [v, i]).sort((a, b2) => b2[0] - a[0]);
    const [top, second] = sorted;
    if (top[0] < MARK) answers += '-';
    else if (second && second[0] >= MARK && second[0] > top[0] * 0.75) answers += '*';
    else answers += LETTERS[top[1]];
  });
  return { ok: true, answers, fills, rotation: best.rot, threshold: thr };
}

/** Kalit bilan solishtirish */
export function gradeAnswers(answers, test) {
  const key = String(test.answer_key || '').toUpperCase().replace(/[^A-E]/g, '');
  const n = Math.min(key.length, Number(test.num_questions) || key.length);
  const q1Count = Math.min(Number(test.q1_count) || 0, n);
  let correct = 0, q1 = 0, q2 = 0;
  const wrong = [];
  for (let i = 0; i < n; i++) {
    const a = answers[i] || '-';
    if (a === key[i]) {
      correct++;
      if (i < q1Count) q1++; else q2++;
    } else {
      wrong.push({ q: i + 1, given: a, right: key[i] });
    }
  }
  const w1 = Number(test.w1) || 1, w2 = Number(test.w2) || 1;
  const score = q1Count ? Math.round((q1 * w1 + q2 * w2) * 10) / 10 : Math.round(correct * w1 * 10) / 10;
  return { total: n, correct, q1, q2, score, wrong };
}
