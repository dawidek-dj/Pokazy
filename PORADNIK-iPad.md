# Pokazy na iPadzie

Ten sam program co na laptopie: te same projekty, ustawienia, pilot w telefonie, kod QR dla gości, życzenia i album.
Telewizor podłączasz kablem HDMI (przejściówka **USB-C → HDMI**, w starszych iPadach **Lightning → HDMI**).

**Na czym działa:** iPad z iPadOS 16 lub nowszym (np. iPad Air 4, 5 i M2/M3).
**Czego nie ma na iPadzie:**
- zapisu pokazu jako filmu MP4,
- albumu do wysłania,
- mozaiki,
- importu z karty SD,
- wyboru głośnika — dźwięk idzie sam do telewizora, AirPlay albo Bluetooth (zmienisz to w Centrum sterowania iPada).

Te rzeczy przygotujesz na laptopie.

---

## 1. Zbuduj aplikację (raz na każdą wersję)

1. Wgraj pliki do repozytorium jak zwykle (razem z folderami `ios` i `.github`) → **Commit** → **Push**.
2. Na GitHubie: **Actions → „Zbuduj Pokazy na iPada” → Run workflow** → wpisz numer wersji.
   Najwygodniej ten sam numer co w wersji na Windows, po jej zbudowaniu.
3. Po ok. 10 minutach plik **Pokazy-iPad-X.Y.Z.ipa** jest:
   - w wydaniu **vX.Y.Z** (Releases), jeśli wersja na Windows o tym numerze już istnieje,
   - albo w podsumowaniu przebiegu, w sekcji **Artifacts** — pobierasz ZIP, a w nim jest plik `.ipa`.

---

## 2. Wgraj aplikację na iPada

Na iPadzie: **Ustawienia → Prywatność i ochrona → Tryb dewelopera → włącz** (iPad uruchomi się ponownie).

### Sposób A — SideStore (polecany: odświeżanie z samego iPada, bez komputera)

1. Na komputerze z Windows zainstaluj **iTunes ze strony Apple** (nie ze Sklepu Microsoft) — to sterowniki do iPada.
2. Zainstaluj **iLoader**. Podłącz iPada kablem, zaloguj się swoim Apple ID i wybierz instalację **SideStore**.
   iLoader zapisze też na iPadzie „plik parowania” (`ALTPairingFile.mobiledevicepairing`). Pierwsze uruchomienie SideStore poprosi o niego — wskaż go w „Plikach”.
3. Na iPadzie, z App Store, zainstaluj **LocalDevVPN** i włącz go (to lokalny „VPN” na iPadzie, nic nie wysyła do internetu).
4. Na iPadzie: **Ustawienia → Ogólne → VPN i zarządzanie urządzeniem** → zaufaj swojemu Apple ID.
5. Skopiuj plik `Pokazy-iPad-X.Y.Z.ipa` na iPada, np. do „Plików” przez AirDrop, iCloud Drive albo pendrive.
6. W SideStore: **My Apps → „+”** → wybierz plik `.ipa`. Pokazy pojawią się na ekranie głównym.

**Odświeżanie:**
- Z darmowym Apple ID aplikacja działa **7 dni**. Raz w tygodniu włącz LocalDevVPN i w SideStore stuknij **Refresh All** (albo licznik „7 DAYS”).
- Możesz ustawić w aplikacji Skróty automatyzację „co tydzień otwórz SideStore”, która będzie Ci przypominać.
- Dane programu, projekty i ustawienia zostają po odświeżeniu.

### Sposób B — Sideloadly (z komputera, kablem)

1. Zainstaluj **iTunes i iCloud ze strony Apple** (nie ze Sklepu Microsoft) oraz **Sideloadly**.
2. Podłącz iPada kablem, przeciągnij plik `.ipa` do Sideloadly, wpisz Apple ID i kliknij **Start**.
3. Na iPadzie: **Ustawienia → Ogólne → VPN i zarządzanie urządzeniem** → zaufaj.
4. Co 7 dni powtórz kroki 2–3. W Sideloadly możesz też włączyć automatyczne odświeżanie przez Wi-Fi, gdy komputer jest włączony.

**Darmowe Apple ID:** najwyżej 3 takie aplikacje naraz (SideStore liczy się jako jedna).
**Płatne konto dewelopera Apple (99 USD/rok):** aplikacja działa rok bez odświeżania.

> Nie instaluj Pokazów wewnątrz LiveContainer — tylko normalnie przez SideStore („My Apps”). Telewizor i serwer pilota potrzebują pełnej aplikacji.

**Ważne przed weselem:** odśwież aplikację dzień–dwa wcześniej. Jeśli podpis wygaśnie w trakcie imprezy, aplikacja się nie uruchomi.

---

## 3. Przenieś pokaz przygotowany na laptopie

Wszystko, co ustawiłeś na laptopie, jedzie razem z projektem:
- zdjęcia, filmy i muzyka z folderu,
- kolejność, poprawki godzin, obroty, kadrowanie, ukryte i ulubione,
- części, plansze, podpisy, motyw, kolaż powitalny, niespodzianki, napisy końcowe,
- notatki i komentarze głosowe,
- nazwy obiektów (sala, kościół).

Nie trzeba niczego kopiować ręcznie, a ciasteczka nie są potrzebne.

**Na laptopie:**
1. **Program → „💾 Zabierz projekt na pendrive / dysk”** → wybierz miejsce, np. pendrive albo Pulpit.
2. Powstanie folder **„Nazwa projektu — Pokazy”**. W środku są pliki, gotowe miniatury i plik `projekt.json`.

**Folder na iPada — jeden ze sposobów:**
- **Kablem z Windows:** aplikacja **„Urządzenia Apple”** (Sklep Microsoft) albo iTunes → Twój iPad → **Pliki → Pokazy** → przeciągnij folder.
- **Pendrive / dysk USB-C podłączony do iPada:** w aplikacji „Pliki” skopiuj folder do **Na moim iPadzie → Pokazy**.
- **AirDrop z Maca** albo **iCloud Drive** — też do **Na moim iPadzie → Pokazy**.

**Na iPadzie, w Pokazach:** okno startowe → **„📂 Otwórz projekt z laptopa”** → wybierz projekt → **Otwórz projekt**.
Miniatury są gotowe od razu — iPad nic nie przelicza.

Projekt można też otworzyć prosto z pendrive'a („Wybierz z Plików”). Na wesele lepiej jednak mieć wszystko skopiowane na iPada.

**Nie przechodzi z laptopa (ustawiasz na iPadzie):**
- przyciski pilota Bluetooth — naucz je raz na iPadzie,
- połączenie z telefonem-pilotem — zeskanuj nowy kod QR,
- logowanie do YouTube.

---

## 4. Zwykłe zdjęcia bez laptopa

Wrzuć folder ze zdjęciami do **Pliki → Na moim iPadzie → Pokazy**, a w programie: **Dodaj folder** → folder z listy.
Można też wybrać folder z innego miejsca: **„Wybierz z Plików”** (pendrive, iCloud Drive — pliki z iCloud muszą być pobrane na iPada).

iPad sam zrobi miniatury: ok. 1–2 minuty na 1000 zdjęć. Robi to tylko raz.

---

## 5. Pokaz z telewizorem

Podłącz telewizor przejściówką HDMI, potem **Rozpocznij pokaz**:
- **„Na telewizorze, sterowanie na iPadzie”** — telewizor pokazuje tylko zdjęcia i filmy. Na iPadzie masz panel jak na laptopie: podgląd, kolejne zdjęcia, muzykę, ogłoszenia i gości.
- **„Na tym ekranie”** — pokaz na całym ekranie iPada, a telewizor pokazuje to samo (odbicie).

Dźwięk idzie automatycznie do telewizora przez HDMI. Jeśli wolisz głośnik Bluetooth albo AirPlay — wybierz go w Centrum sterowania iPada.

W trakcie pokazu ekran iPada nie gaśnie. Ładuj iPada — przejściówki USB-C z dodatkowym gniazdem zasilania pozwalają ładować w czasie pokazu.

---

## 6. Sterowanie

- **Na iPadzie:** palcem w lewo/prawo — następne/poprzednie; palcem w górę — pasek z przyciskami. Klawiatura Bluetooth — te same skróty co na laptopie.
- **Telefon jako pilot:** jak na laptopie (Ustawienia → Pilot w telefonie → kod QR). iPad i telefon muszą być w tej samej sieci Wi-Fi.
  Przy pierwszym uruchomieniu zezwól Pokazom na **„sieć lokalną”**. Jeśli przez pomyłkę odmówisz, włączysz to w Ustawienia → Pokazy → Sieć lokalna.
- **Pilot Bluetooth** (np. Nokia, Thomson): sparuj go w Ustawieniach iPada → Bluetooth, potem w programie **Pilot Bluetooth → naucz przyciski**. Przyciski ⏯ ⏭ ⏮ zwykle działają od razu.
- **Pilot od telewizora (podczerwień) nie steruje iPadem** — iPad nie odbiera sygnałów z telewizora (HDMI-CEC). Użyj telefonu albo pilota Bluetooth.
- Telefon i pilot Bluetooth mogą działać jednocześnie.

---

## 7. Muzyka

- **Z folderu:** muzyka przychodzi razem z projektem z laptopa (Pliki/Muzyka). Możesz też wskazać inny folder z muzyką na iPadzie.
- **YouTube:** działa, ale na iPadzie mogą pojawiać się reklamy, bo logowanie do YouTube Premium wewnątrz aplikacji nie zawsze jest respektowane. Na ważną imprezę pewniejsza jest muzyka z plików.

---

## Gdy coś nie działa

- **Aplikacja się nie otwiera / od razu zamyka:** minęło 7 dni — odśwież ją w SideStore albo Sideloadly.
- **„Serwer programu nie wystartował”:** zamknij Pokazy (przesuń w górę w przełączniku aplikacji) i otwórz ponownie. Na ekranie widać ostatnie linie dziennika — wyślij ich zdjęcie.
- **Telefon nie łączy się jako pilot:** ta sama sieć Wi-Fi? Zezwolenie na „sieć lokalną” (Ustawienia → Pokazy)? Hotspot z telefonu też działa: iPad podłączony do hotspotu telefonu.
- **Brak obrazu na telewizorze:** wyjmij i włóż przejściówkę, sprawdź źródło HDMI w telewizorze. Opcja „Na telewizorze” odblokowuje się po podłączeniu.
