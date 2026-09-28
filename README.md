# Pokazy

Program na Windows do pokazów zdjęć i filmów z wydarzeń i wyjazdów: telewizor przez HDMI,
pilot w telefonie, muzyka z YouTube lub z plików, ogłoszenia, prośby gości o piosenki,
napisy końcowe. Każde wydarzenie to osobny **projekt**.

Dla wyjazdów: nazwy miejsc z GPS telefonu (lokalna baza, bez internetu), nazwy dni typu „Dzień 3 — Rzym”,
mapa z trasą na planszy dnia. Motywy plansz (złoty, morski, kolorowy, natura, klasyczny).
Goście przez jeden kod QR: prośby o piosenki, wysyłanie zdjęć i filmów prosto do pokazu, galeria do pobrania —
wszystko w sieci Wi-Fi, bez wysyłania czegokolwiek do internetu.

- **Instalator:** `Pokazy-Setup-X.Y.Z.exe` — aktualizuje się sam.
- **Wersja przenośna:** `Pokazy-Portable-X.Y.Z.zip` — rozpakuj gdziekolwiek (także na pendrive),
  uruchom `Pokazy.exe`. Ustawienia i projekty są w folderze `dane` obok programu. Też aktualizuje się sama.

Pliki do pobrania: zakładka **Releases** w tym repozytorium.
Jak zbudować nową wersję: zobacz **PORADNIK.md**.

## Budowa projektu
- `src/` — aplikacja (okna, serwer, obróbka zdjęć i filmów, aktualizacje)
- `zrodla/` — strona pokazu (źródła); `python zrodla/build.py web --app` składa ją do folderu `web/`
- `.github/workflows/build.yml` — automatyczna budowa instalatora i wersji przenośnej
