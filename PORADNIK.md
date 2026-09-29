# Poradnik: jak zbudować i aktualizować program Pokazy

Wszystko robisz w przeglądarce, bez instalowania narzędzi programistycznych.
GitHub sam zbuduje instalator i wersję przenośną na swoim komputerze z Windows (za darmo).

---

## Część 1 — jednorazowe przygotowanie (ok. 15 minut)

### Krok 1. Załóż konto na GitHubie
1. Wejdź na **https://github.com/signup**.
2. Podaj e-mail, hasło i nazwę użytkownika (np. `jan-kowalski`).
3. Potwierdź adres e-mail kodem, który przyjdzie na skrzynkę.

### Krok 2. Utwórz repozytorium (miejsce na pliki programu)
1. Kliknij **+** w prawym górnym rogu → **New repository**.
2. **Repository name:** `pokazy`
3. Zaznacz **Public** (publiczne).
   *Dlaczego publiczne:* dzięki temu program może sam pobierać aktualizacje bez haseł.
   W repozytorium jest tylko kod programu — **żadnych Twoich zdjęć, filmów ani ustawień**.
4. Nie zaznaczaj niczego więcej. Kliknij **Create repository**.

### Krok 3. Wgraj pliki programu
1. Rozpakuj paczkę `pokazy-aplikacja-zrodla.zip` na komputerze.
2. Na stronie nowego repozytorium kliknij link **uploading an existing file**
   (albo **Add file → Upload files**).
3. Otwórz rozpakowany folder `pokazy-aplikacja` w Eksploratorze Windows,
   zaznacz **całą jego zawartość** (Ctrl+A — razem z folderem `.github`!) i przeciągnij na stronę GitHuba.
4. Poczekaj, aż wszystkie pliki się wczytają, na dole kliknij zielony **Commit changes**.
5. Sprawdź, czy na liście plików repozytorium widać folder **.github** — bez niego budowanie nie ruszy.
   Jeśli go brakuje: **Add file → Upload files** i przeciągnij sam folder `.github`.

### Krok 4. Pozwól automatowi publikować wersje
1. W repozytorium: **Settings** (zębatka u góry) → po lewej **Actions** → **General**.
2. Na dole, w sekcji **Workflow permissions**, zaznacz **Read and write permissions**.
3. Kliknij **Save**.

---

## Część 2 — zbudowanie wersji (za każdym razem ok. 10–15 minut, dzieje się samo)

1. W repozytorium kliknij zakładkę **Actions**.
   Przy pierwszym wejściu może pojawić się przycisk *I understand my workflows, go ahead and enable them* — kliknij go.
2. Po lewej wybierz **Zbuduj i wydaj Pokazy**.
3. Po prawej kliknij **Run workflow**, wpisz numer wersji — za pierwszym razem **1.0.0** — i kliknij zielony **Run workflow**.
4. Pojawi się zadanie z żółtą kropką (trwa). Gdy kropka zmieni się na **zielony znaczek ✓**, wersja jest gotowa.
   Czerwony krzyżyk = błąd — kliknij w zadanie, skopiuj ostatnie linijki i wyślij mi.
5. Na stronie głównej repozytorium, po prawej, kliknij **Releases** → najnowsza wersja. Znajdziesz tam:
   - **Pokazy-Setup-1.0.0.exe** — instalator,
   - **Pokazy-Portable-1.0.0.zip** — wersja przenośna.

**Numery wersji:** każda kolejna musi być wyższa: 1.0.0 → 1.0.1 → 1.0.2 … (albo 1.1.0 przy większych zmianach).

---

## Część 3 — instalacja i pierwsze uruchomienie

### Wersja zainstalowana (na Twoim laptopie)
1. Pobierz **Pokazy-Setup-…exe** i uruchom.
2. Windows może pokazać niebieskie okno **„System Windows ochronił ten komputer”** —
   to normalne dla programów bez płatnego certyfikatu. Kliknij **Więcej informacji → Uruchom mimo to**.
3. Przejdź przez instalator. Na pulpicie pojawi się skrót **Pokazy**.

### Wersja przenośna (np. na pendrive, na cudzy laptop)
1. Pobierz **Pokazy-Portable-…zip**, kliknij prawym → **Wyodrębnij wszystkie** do wybranego folderu (albo na pendrive).
2. Uruchom **Pokazy.exe** z tego folderu (też może pojawić się okno SmartScreen — jak wyżej).
3. Projekty i ustawienia zapisują się w folderze **dane** obok programu — zabierasz je razem z programem.

### Zapora sieciowa
Przy pierwszym uruchomieniu Windows zapyta, czy zezwolić programowi **Pokazy** na dostęp do sieci.
Kliknij **Zezwalaj** (sieci prywatne) — to potrzebne dla pilota w telefonie i próśb gości.

---

## Część 4 — aktualizacje

### Gdy przyślę Ci poprawki
1. Rozpakuj paczkę z poprawkami.
2. W repozytorium: **Add file → Upload files** → przeciągnij zmienione pliki/foldery (zastąpią stare) → **Commit changes**.
3. **Actions → Zbuduj i wydaj Pokazy → Run workflow** → wpisz wyższy numer wersji.

### U Ciebie na komputerze — samo
- **Wersja zainstalowana** sama pobiera nową wersję w tle. U góry pojawi się pasek
  „Dostępna nowa wersja” → kliknij **Zaktualizuj i uruchom ponownie**.
- **Wersja przenośna** co kilka godzin sprawdza, czy jest nowa wersja. Po kliknięciu
  **Zaktualizuj i uruchom ponownie** pobiera ją, podmienia pliki obok siebie i uruchamia się ponownie.
  Folder **dane** (projekty, ustawienia) zostaje nietknięty.
- W trakcie pokazu nic nie aktualizuje się bez Twojego potwierdzenia.

---

## Część 5 — wersje testowe (bezpiecznie przed ważnym wydarzeniem)

1. W programie: **Program → Aktualizacje → także testowe** — tylko na komputerze, na którym chcesz sprawdzać nowości.
2. Na GitHubie przy **Run workflow** wybierz **Kanał: testowa**. Taka wersja trafi wyłącznie do programów z włączonymi aktualizacjami testowymi.
3. Gdy wszystko działa, zrób ją stabilną: **Releases** → przy tej wersji ✎ (**Edit**) → odznacz **Set as a pre-release**, zaznacz **Set as the latest release** → **Update release**.
   Od tej chwili dostaną ją wszystkie programy (także przenośne).

## Część 6 — gdy coś źle się skopiowało

Najprostszy sposób, żeby repozytorium było dokładnie takie jak w paczce:
1. W GitHub Desktop: **Repository → Show in Explorer**.
2. Usuń w tym folderze **wszystko oprócz ukrytego folderu `.git`** (tego nie ruszaj — Widok → Pokaż → Ukryte elementy, żeby go widzieć).
3. Otwórz paczkę, wejdź **do środka** folderu `pokazy-aplikacja`, zaznacz wszystko (Ctrl+A, razem z `.github`) i skopiuj do folderu repozytorium.
4. W GitHub Desktop: **Commit to main** → **Push origin**.
Budowanie na GitHubie samo sprawdza układ plików i przy błędzie wyświetla po polsku, czego brakuje.

## Przydatne informacje

- **Gdzie są dane?** Wersja zainstalowana: `%APPDATA%\Pokazy`. Wersja przenośna: folder `dane` obok programu.
  W środku jest też folder `cache` (przygotowane zdjęcia 4K i filmy) — można go usunąć, odtworzy się sam.
- **Przeniesienie ustawień z wersji w przeglądarce:** w starej wersji panel **Kopia ustawień → Zapisz kopię**,
  w programie Pokazy **Kopia ustawień → Wczytaj kopię**. Poprawki godzin, obroty i ulubione przejdą na te same pliki.
- **Diagnostyka:** `Ctrl+Shift+I` otwiera narzędzia (przydatne, gdy poproszę o zrzut błędów).
  Dziennik programu: plik `pokazy.log` w folderze danych.
