# Pokazy

Program na Windows do pokazów zdjęć i filmów z wydarzeń i wyjazdów: telewizor przez HDMI,
pilot w telefonie, muzyka z YouTube lub z plików, ogłoszenia, prośby gości o piosenki,
napisy końcowe. Każde wydarzenie to osobny **projekt**.

Dla wyjazdów: nazwy miejsc z GPS telefonu (lokalna baza, bez internetu), nazwy dni typu „Dzień 3 — Rzym”,
mapa z trasą na planszy dnia. Motywy plansz (złoty, morski, kolorowy, natura, klasyczny).
Goście przez jeden kod QR: prośby o piosenki, wysyłanie zdjęć i filmów prosto do pokazu, galeria do pobrania —
wszystko w sieci Wi-Fi, bez wysyłania czegokolwiek do internetu.

Także: notatki prezentera i komentarze głosowe do zdjęć, pogoda i statystyki wyjazdu, przerzedzanie serii,
Live Photos w ruchu, eksport pokazu do filmu MP4, import z karty SD / pendrive'a / telefonu (Wi-Fi),
automatyczna kopia ustawień, skróty do projektów, kanał testowy aktualizacji.

Wygląd i płynność: przejścia do wyboru (także osobno dla części), styl kinowy, animowane plansze,
rozdzielczość dopasowana do telewizora, profil wydajności komputera, przygotowanie w kolejności pokazu,
szybki start dużych projektów, licznik płynności filmów, strażnik okna pokazu, próba generalna,
projekt na pendrive razem z przygotowanymi plikami.

- **Instalator:** `Pokazy-Setup-X.Y.Z.exe` — aktualizuje się sam.
- **Wersja przenośna:** `Pokazy-Portable-X.Y.Z.zip` — rozpakuj gdziekolwiek (także na pendrive),
  uruchom `Pokazy.exe`. Ustawienia i projekty są w folderze `dane` obok programu. Też aktualizuje się sama.

Pliki do pobrania: zakładka **Releases** w tym repozytorium.
Jak zbudować nową wersję: zobacz **PORADNIK.md**.

## Budowa projektu
- `src/` — aplikacja (okna, serwer, obróbka zdjęć i filmów, aktualizacje)
- `zrodla/` — strona pokazu (źródła); `python zrodla/build.py web --app` składa ją do folderu `web/`
- `.github/workflows/build.yml` — automatyczna budowa instalatora i wersji przenośnej

Niespodzianki o wyznaczonej godzinie (albo z pilota), album-książka z przewracanymi stronami, wybór źródła dźwięku w pokazie bez kabla.
Pokaz bez kabla: muzyka przesyłana z laptopa do urządzenia przez Wi-Fi (WebRTC) — grają wszystkie utwory, także te, których YouTube nie pozwala odtwarzać na telefonach.
Wybór głośnika dla pokazu z laptopa (telewizor przez HDMI, głośniki laptopa, Bluetooth, USB): filmy i teledyski grają prosto na wybrany głośnik bez opóźnienia, muzyka w tle przez przechwycenie dźwięku okna; gdy głośnik się rozłączy — wraca na domyślne urządzenie i sam przełącza się z powrotem.
Pilot Bluetooth (prezenter, pilot multimedialny, pilot do zdjęć): ⏭ ⏮ ⏯ działają od razu, każdy przycisk można „nauczyć” dowolnego działania z legendy (QR, muzyka, przewijanie, przyspieszanie filmu ×1,5 / ×2 — klawisz S…); działa też w trybie bezpiecznym i gdy program jest w tle. Serie: można schować całą serię (bez zostawiania żadnego ujęcia).
Pilot w telefonie: miniatury wszystkich slajdów tworzy aplikacja (szybko, także w trakcie filmu), a bieżący film widać na telefonie na żywo (bez dźwięku, przycisk „🎬 podgląd”).
Sygnał na telefon (wibracja + komunikat z odliczaniem) przed końcem filmu, teledysku i przed niespodzianką. Szybka próba pokazu z listą problemów (pliki, które się nie otwierają, filmy bez dźwięku, ciemne i nieostre zdjęcia). Części i plansze: można usunąć wszystkie albo wyłączyć plansze części / dni.
Życzenia od gości przez kod QR do 1000 znaków (plansza, pasek albo przesuwający się pasek jak w TV, rozdział w albumie-książce), moderacja: blokada telefonu i zmiana kodu QR; w pilocie okienko „Goście coś przysłali” z przeglądem i zaznaczaniem.
