#!/usr/bin/env python3
"""從 assets/icon.svg 生成 app/Contents/Resources/AppIcon.icns(16~1024 全尺寸)。

依賴:Pillow、numpy、Playwright(用 Chromium 把 SVG 渲染成 1024×1024 PNG)。
    pip install pillow numpy playwright && python -m playwright install chromium
用法:python3 assets/make_icon.py
"""
import io, pathlib, struct
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

R = pathlib.Path(__file__).resolve().parent.parent
SVG = R / 'assets/icon.svg'
OUT = R / 'app/Contents/Resources/AppIcon.icns'

def render_master():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1024, 'height': 1024})
        pg.set_content('<html><body style="margin:0;background:transparent">' + SVG.read_text(encoding='utf-8') + '</body></html>')
        png = pg.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': 1024, 'height': 1024})
        b.close()
    return Image.open(io.BytesIO(png)).convert('RGBA')

def scaled(im, s):
    """預乘 alpha 後再縮放,避免透明邊緣發黑。"""
    if s == im.width:
        return im
    a = np.asarray(im).astype('float32'); al = a[..., 3:4] / 255.0
    a[..., :3] *= al
    small = np.asarray(Image.fromarray(a.clip(0, 255).astype('uint8'), 'RGBA').resize((s, s), Image.LANCZOS)).astype('float32')
    al2 = small[..., 3:4] / 255.0
    small[..., :3] = np.where(al2 > 0, small[..., :3] / np.maximum(al2, 1e-6), 0)
    return Image.fromarray(small.clip(0, 255).astype('uint8'), 'RGBA')

TYPES = [('icp4', 16), ('icp5', 32), ('icp6', 64), ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024),
         ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512)]

def main():
    im = render_master()
    cache, chunks = {}, []
    for t, s in TYPES:
        if s not in cache:
            b = io.BytesIO(); scaled(im, s).save(b, 'PNG', optimize=True); cache[s] = b.getvalue()
        chunks.append((t.encode(), cache[s]))
    toc = b''.join(t + struct.pack('>I', 8 + len(d)) for t, d in chunks)
    body = b'TOC ' + struct.pack('>I', 8 + len(toc)) + toc + b''.join(t + struct.pack('>I', 8 + len(d)) + d for t, d in chunks)
    OUT.write_bytes(b'icns' + struct.pack('>I', 8 + len(body)) + body)
    print('wrote', OUT.relative_to(R), OUT.stat().st_size, 'bytes')

if __name__ == '__main__':
    main()
