"""Składa stronę pokazu z plików źródłowych.
   python zrodla/build.py web --app   → strona dla aplikacji (folder web)
   python zrodla/build.py pokaz-www    → wersja przeglądarkowa (z serwerem PowerShell / Python)"""
import os, shutil, sys, glob, re
src = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(src, '..', 'web')
app_mode = '--app' in sys.argv
os.makedirs(out, exist_ok=True)
parts = sorted(glob.glob(os.path.join(src, 'app*.js')), key=lambda p: int(re.search(r'app(\d+)\.js$', p).group(1)))
app = ''.join(open(p, encoding='utf-8').read() for p in parts)
h = open(os.path.join(src, 'index.html'), encoding='utf-8').read()
qr = open(os.path.join(src, 'qr.min.js'), encoding='utf-8').read()
assert h.count('/*__SCRIPT__*/') == 1 and h.count('/*__QR__*/') == 1, 'brak znaczników w index.html'
assert '</script' not in app and '</script' not in qr, 'kod zawiera </script>'
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(h.replace('/*__QR__*/', qr).replace('/*__SCRIPT__*/', app))
for f in ('pilot.html', 'prosba.html', 'mv.html'):
    shutil.copy(os.path.join(src, f), out)
shutil.copytree(os.path.join(src, 'lib'), os.path.join(out, 'lib'), dirs_exist_ok=True)
if not app_mode:
    open(os.path.join(out, 'serwer.ps1'), 'w', newline='\r\n').write(open(os.path.join(src, 'serwer.ps1')).read())
    shutil.copy(os.path.join(src, 'serwer.py'), out)
    open(os.path.join(out, 'uruchom.bat'), 'w', newline='\r\n').write('@echo off\ntitle Pokazy\ncd /d "%~dp0"\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serwer.ps1"\n')
    open(os.path.join(out, 'uruchom.command'), 'w', newline='\n').write('#!/bin/bash\ncd "$(dirname "$0")"\npython3 serwer.py\n')
print('zbudowano:', out, '(aplikacja)' if app_mode else '(przeglądarka)')
