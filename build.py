#!/usr/bin/env python3
"""構建 Rime 外觀設計器。

1. 把 src/ 下的 CSS、JS 和 vendor/ 裏的 js-yaml 內聯進單個 dist/index.html(app 不依賴任何外部資源);
2. 用 app/ 裏的骨架(Info.plist、啟動器、圖標)加上 index.html、server.pl、window.m、window.js,
   組裝出 dist/Rime外觀設計器.app。

用法: python3 build.py            # 構建 dist/index.html 和 dist/Rime外觀設計器.app
      python3 build.py --html-only # 只構建 dist/index.html
"""
import os, shutil, sys, pathlib
R = pathlib.Path(__file__).resolve().parent
S = R / 'src'
DIST = R / 'dist'
APP_NAME = 'Rime外觀設計器.app'


def build_html(dest):
    tpl = (S / 'index.tpl.html').read_text(encoding='utf-8')
    css = (S / 'style.css').read_text(encoding='utf-8')
    parts = [
        (R / 'vendor/js-yaml/js-yaml.min.js').read_text(encoding='utf-8'),
        (S / 'core.js').read_text(encoding='utf-8'),
        # themes.js 裏的 const 要掛到 window 上供 app.js 使用
        (S / 'themes.js').read_text(encoding='utf-8') +
        "\nwindow.THEMES=THEMES;window.LABEL_PRESETS=LABEL_PRESETS;window.FORMAT_PRESETS=FORMAT_PRESETS;window.FONT_LIST=FONT_LIST;window.FONT_PAIRS=FONT_PAIRS;window.SAMPLES=SAMPLES;\n",
        (S / 'preview.js').read_text(encoding='utf-8'),
        (S / 'app.js').read_text(encoding='utf-8'),
    ]
    js = '\n;\n'.join(parts)
    assert '</script' not in js.lower(), '內聯腳本裏含有 </script,會截斷頁面'
    assert tpl.count('/*__CSS__*/') == 1 and tpl.count('/*__JS__*/') == 1
    # 注意:server.pl 會把全文所有 __TOKEN__ 替換成令牌,所以腳本裏只能出現一次(模板裏那處)
    out = tpl.replace('/*__CSS__*/', css, 1).replace('/*__JS__*/', js, 1)
    assert out.count('__TOKEN__') == 1, '__TOKEN__ 出現次數異常:%d' % out.count('__TOKEN__')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding='utf-8')
    print('built', dest.relative_to(R), len(out) // 1024, 'KB')


def build_app(html):
    app = DIST / APP_NAME
    if app.exists():
        shutil.rmtree(app)
    shutil.copytree(R / 'app', app)
    res = app / 'Contents/Resources'
    res.mkdir(parents=True, exist_ok=True)
    shutil.copy2(html, res / 'index.html')
    for f in ('server.pl', 'window.m', 'window.js'):
        shutil.copy2(R / f, res / f)
    os.chmod(app / 'Contents/MacOS/RimeAppearanceDesigner', 0o755)
    print('built', app.relative_to(R))


if __name__ == '__main__':
    html = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--out' else DIST / 'index.html'
    build_html(html)
    if '--html-only' not in sys.argv and '--out' not in sys.argv:
        build_app(html)
