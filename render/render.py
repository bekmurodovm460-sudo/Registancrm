#!/usr/bin/env python3
"""AI montaj renderer (GitHub Actions'da ishlaydi).

Navbatdagi loyihani Supabase edu-app'dan oladi (GitHub OIDC tokeni bilan — maxfiy kalit
kerak emas), media fayllarni yuklab, ffmpeg bilan MP4 yasaydi, yopiq bucket'ga yuklaydi
va edu-app'ga xabar beradi — bot tayyor videoni foydalanuvchi chatiga yuboradi.

Lokal sinov:  python3 render.py --local plan.json out.mp4 media0 media1 ...
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import time
import urllib.request
import uuid

API = os.environ.get('RENDER_API', 'https://bbnakgvgoydahagiwltn.supabase.co/functions/v1/edu-app')
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, '..', 'brand', 'edu-bot-avatar.png')
FONT_B = next((p for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', os.path.join(HERE, '..', 'brand', 'fonts', 'DejaVuSansCondensed-Bold.ttf')] if os.path.exists(p)), None)
FONT_R = next((p for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', os.path.join(HERE, '..', 'brand', 'fonts', 'DejaVuSansCondensed.ttf')] if os.path.exists(p)), FONT_B)
SIZES = {'916': (720, 1280), '11': (720, 720), '169': (1280, 720)}
XFADE = {'fade': 'fade', 'slide': 'slideleft', 'zoom': 'zoomin'}
FPS, T = 30, 0.5
NAVY, ORANGE = '0x0F1F45', '0xF2642A'


def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        raise RuntimeError('ffmpeg: ' + r.stderr[-800:])
    return r.stdout


def has_audio(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path], stdout=subprocess.PIPE, text=True).stdout
    return bool(out.strip())


def probe_duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], stdout=subprocess.PIPE, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def esc_path(p):
    return p.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")


def text_file(tmp, text, width_chars):
    """drawtext uchun matnni faylga yozadi (qochirish muammosisiz), qatorlarga bo'ladi."""
    lines = textwrap.wrap(str(text).strip(), width=max(8, width_chars))[:3]
    path = os.path.join(tmp, f'txt_{uuid.uuid4().hex}.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    return path, len(lines)


def caption_filter(tmp, text, pos, W, H):
    if not text:
        return ''
    fs = int(min(W, H) * 0.058)
    path, n = text_file(tmp, text, int(W * 0.8 / (fs * 0.58)))
    y = {'top': f'{int(H * 0.09)}', 'mid': f'(h-text_h)/2'}.get(pos, f'{int(H * 0.80)}-text_h/2')
    return (f",drawtext=fontfile='{esc_path(FONT_B)}':textfile='{esc_path(path)}':fontsize={fs}:fontcolor=white:line_spacing={int(fs * 0.25)}"
            f":box=1:boxcolor={NAVY}@0.78:boxborderw={int(fs * 0.55)}:x=(w-text_w)/2:y={y}:alpha='min(1,t/0.45)'")


def enc_args(out):
    return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', str(FPS),
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-shortest', '-y', out]


def seg_card(tmp, out, W, H, d, lines, logo=False):
    """Intro/outro: brend fon, logotip (ixtiyoriy) va matn qatorlari."""
    s = min(W, H)
    vf = [f'color=c={NAVY}:s={W}x{H}:d={d}:r={FPS}[bg]']
    cur = 'bg'
    inputs = ['-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=stereo']
    if logo and os.path.exists(LOGO):
        L = int(s * 0.3)
        inputs += ['-loop', '1', '-t', str(d), '-i', LOGO]
        vf.append(f"[1:v]scale={L}:{L},format=rgba,geq=lum='p(X,Y)':a='if(lte(hypot(X-{L}/2,Y-{L}/2),{L}/2),255,0)'[lg]")
        vf.append(f"[{cur}][lg]overlay=(W-w)/2:(H-h)/2-{int(s * 0.14)}:enable='gte(t,0)'[v0]")
        cur = 'v0'
    chain = f'[{cur}]drawbox=x=(iw-{int(s * 0.36)})/2:y=ih/2+{int(s * 0.008 if not logo else s * 0.13)}:w={int(s * 0.36)}:h={max(4, int(s * 0.012))}:color={ORANGE}:t=fill'
    y0 = H / 2 - s * 0.05 if not logo else H / 2 + s * 0.06
    for i, (txt, size, bold, color) in enumerate(lines):
        if not txt:
            continue
        p, _ = text_file(tmp, txt, 28)
        fy = int(y0 + (0 if i == 0 else s * (0.11 + 0.07 * (i - 1)) + (s * 0.03 if logo else 0)))
        chain += (f",drawtext=fontfile='{esc_path(FONT_B if bold else FONT_R)}':textfile='{esc_path(p)}':fontsize={int(s * size)}:fontcolor={color}"
                  f":x=(w-text_w)/2:y={fy}-text_h/2:alpha='min(1,max(0,(t-{0.15 * i})/0.6))'")
    vf.append(chain + '[v]')
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(vf), '-map', '[v]', '-map', '0:a', '-t', str(d), *enc_args(out)])


def seg_photo(tmp, src, out, W, H, d, zoom, text, pos):
    frames = int(d * FPS)
    z = f"zoompan=z='min(1+0.12*on/{frames},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}" if zoom else f'fps={FPS}'
    vf = f'scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},{z},scale={W}:{H},setsar=1' + caption_filter(tmp, text, pos, W, H)
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-t', str(d), '-i', src, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
         '-vf', vf, '-map', '0:v', '-map', '1:a', '-t', str(d), *enc_args(out)])


def seg_video(tmp, src, out, W, H, start, d, text, pos):
    vf = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1' + caption_filter(tmp, text, pos, W, H)
    audio = has_audio(src)
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', f'{start:.2f}', '-t', f'{d:.2f}', '-i', src]
    if not audio:
        cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']
    cmd += ['-vf', vf, '-map', '0:v', '-map', '0:a' if audio else '1:a', '-t', f'{d:.2f}', *enc_args(out)]
    run(cmd)


def render(plan, media, out):
    """plan — AI tuzgan reja; media — yuklangan fayllar ro'yxati (indeks bo'yicha)."""
    W, H = SIZES.get(str(plan.get('format')), SIZES['916'])
    tmp = tempfile.mkdtemp(prefix='render_')
    try:
        segs = []
        if plan.get('intro_title'):
            p = os.path.join(tmp, 'intro.mp4')
            seg_card(tmp, p, W, H, 2.5, [(plan['intro_title'], 0.095, True, 'white'), (plan.get('intro_subtitle', ''), 0.048, False, '0xC7D2FE')])
            segs.append((p, 2.5))
        for i, c in enumerate(plan.get('clips') or []):
            m = media[int(c['media'])]
            p = os.path.join(tmp, f'c{i}.mp4')
            if m['kind'] == 'video':
                length = probe_duration(m['path']) or float(m.get('duration') or 5)
                start = max(0.0, min(length - 0.5, float(c.get('trim_start') or 0)))
                d = max(0.8, min(length - start, float(c.get('seconds') or min(6.0, length))))
                seg_video(tmp, m['path'], p, W, H, start, d, c.get('text'), c.get('text_position'))
            else:
                d = max(1.0, min(10.0, float(c.get('seconds') or 3)))
                seg_photo(tmp, m['path'], p, W, H, d, c.get('zoom', True) is not False, c.get('text'), c.get('text_position'))
            segs.append((p, d))
        if plan.get('outro', True) is not False:
            p = os.path.join(tmp, 'outro.mp4')
            seg_card(tmp, p, W, H, 3.0, [('Registan LC', 0.085, True, 'white'), ('you belong here!', 0.045, True, ORANGE), (plan.get('outro_text', ''), 0.04, False, '0xC7D2FE')], logo=True)
            segs.append((p, 3.0))
        if not segs:
            raise RuntimeError('Klip yo‘q')
        tr = XFADE.get(plan.get('transition'), None) if len(segs) > 1 else None
        inputs, fc = [], []
        for p, _ in segs:
            inputs += ['-i', p]
        n = len(segs)
        for k in range(n):
            fc.append(f'[{k}:v]settb=AVTB,fps={FPS},format=yuv420p[v{k}];[{k}:a]aresample=44100,asetpts=PTS-STARTPTS[a{k}]')
        if tr:
            off, vprev, aprev = 0.0, 'v0', 'a0'
            for k in range(1, n):
                off += segs[k - 1][1] - T
                fc.append(f'[{vprev}][v{k}]xfade=transition={tr}:duration={T}:offset={off:.3f}[vx{k}]')
                fc.append(f'[{aprev}][a{k}]acrossfade=d={T}[ax{k}]')
                vprev, aprev = f'vx{k}', f'ax{k}'
            vout, aout = vprev, aprev
        else:
            fc.append(''.join(f'[v{k}][a{k}]' for k in range(n)) + f'concat=n={n}:v=1:a=1[vc][ac]')
            vout, aout = 'vc', 'ac'
        # Logotip — burchakda (yumaloq)
        if os.path.exists(LOGO):
            s = int(min(W, H) * 0.11)
            inputs += ['-i', LOGO]
            fc.append(f"[{n}:v]scale={s}:{s},format=rgba,geq=lum='p(X,Y)':a='if(lte(hypot(X-{s}/2,Y-{s}/2),{s}/2),230,0)'[wm]")
            fc.append(f'[{vout}][wm]overlay=W-w-{int(s * 0.3)}:{int(s * 0.3)}[vf]')
            vout = 'vf'
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(fc), '-map', f'[{vout}]', '-map', f'[{aout}]',
             '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '128k',
             '-movflags', '+faststart', '-y', out])
        return {'width': W, 'height': H, 'duration': round(probe_duration(out), 2)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------- GitHub Actions: navbat bilan ishlash ----------------
def oidc_token():
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=registan-render'
    req = urllib.request.Request(url, headers={'Authorization': 'bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)['value']


def api(action, body=None, raw=False):
    data = json.dumps({'action': action, **(body or {})}).encode()
    req = urllib.request.Request(API, data=data, headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + oidc_token()})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read() if raw else json.load(r)


def upload(url, path):
    boundary = uuid.uuid4().hex
    with open(path, 'rb') as f:
        blob = f.read()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="cacheControl"\r\n\r\n3600\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name=""; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n').encode() + blob + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(url, data=body, method='PUT', headers={'Content-Type': f'multipart/form-data; boundary={boundary}', 'x-upsert': 'true'})
    with urllib.request.urlopen(req, timeout=300) as r:
        r.read()


def work_once():
    job = api('renderNext').get('job')
    if not job:
        return False
    pid = job['id']
    print(f'▶ loyiha {pid}: {len(job["plan"].get("clips") or [])} klip', flush=True)
    tmp = tempfile.mkdtemp(prefix='job_')
    try:
        media = []
        for i, f in enumerate(job['files']):
            ext = '.mp4' if f['kind'] == 'video' else '.jpg'
            p = os.path.join(tmp, f'm{i}{ext}')
            with open(p, 'wb') as fh:
                fh.write(api('renderFile', {'id': pid, 'i': i}, raw=True))
            media.append({**f, 'path': p})
        out = os.path.join(tmp, 'out.mp4')
        t0 = time.time()
        meta = render(job['plan'], media, out)
        size = os.path.getsize(out)
        print(f'  ✓ {meta} · {size / 1048576:.1f} MB · {time.time() - t0:.1f}s', flush=True)
        if size > 49 * 1024 * 1024:
            raise RuntimeError('Video 50 MB dan katta')
        upload(job['upload']['url'], out)
        print('  ✓', api('renderDone', {'id': pid, 'ok': True, 'path': job['upload']['path'], **meta}), flush=True)
    except Exception as e:  # noqa: BLE001 — xatoni foydalanuvchiga yetkazish uchun
        print('  ✗', e, flush=True)
        try:
            api('renderDone', {'id': pid, 'ok': False, 'error': str(e)[:500]})
        except Exception as e2:  # noqa: BLE001
            print('  ✗ renderDone:', e2, flush=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return True


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--local':
        plan = json.load(open(sys.argv[2], encoding='utf-8'))
        media = [{'kind': 'video' if p.endswith(('.mp4', '.mov', '.webm')) else 'photo', 'path': p} for p in sys.argv[4:]]
        print(render(plan, media, sys.argv[3]))
        return
    for _ in range(6):  # bitta ishga tushishda 6 tagacha loyiha
        if not work_once():
            break


if __name__ == '__main__':
    main()
