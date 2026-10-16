# Klasyczne konstrukcje — materiały robocze

Pięć przykładów wykonanych narzędziami Constrivii podczas przeglądu 13 października 2026. Każdy początkowy rysunek jest poprawny matematycznie. Po poprawkach ponowiono próby ruchu: wszystkie pięć konstrukcji przeszło opisane sprawdzenia. Styczne znikają przy wejściu P do wnętrza okręgu i wracają po wyjściu. Historia napraw znajduje się w `docs/CONSTRUCTION_FIXES_2026-10-13.md`.

## Pliki i status

| Przykład | Gotowy rysunek | Kolejne etapy | Status |
| --- | --- | --- | --- |
| Środek ciężkości | `centroid.ctr` | `centroid-kroki.ctr` | Przeszedł opisane próby ruchu i przekształceń |
| Ortocentrum | `orthocenter.ctr` | `orthocenter-kroki.ctr` | Przeszedł opisane próby ruchu i przekształceń |
| Okrąg opisany | `circumcircle.ctr` | `circumcircle-kroki.ctr` | Przeszedł opisane próby ruchu i przekształceń |
| Okrąg wpisany | `incircle.ctr` | `incircle-kroki.ctr` | Po poprawkach przeszedł opisane próby ruchu i przekształceń |
| Styczne z punktu | `tangents.ctr` | `tangents-kroki.ctr` | Poprawne dla sprawdzonych położeń zewnętrznych; zanikają wewnątrz i odzyskują istnienie na zewnątrz |

Otwórz plik `.ctr` w Constrivii. Wersja `-kroki` zawiera osobne rysunki kolejnych etapów, a wersja bez tego dopisku tylko gotową konstrukcję. Przechodź między etapami strzałkami Poprzedni/Następny plik; pojawiają się w trybie Przesuwanie, gdy nic nie jest zaznaczone. Obok są czytelne pliki `.json` oraz podglądy `.png`.

Pierwsze trzy przykłady, w wersjach z etapami, dodano też do `public/content/`: `srodek-ciezkosci-trojkata.ctr`, `ortocentrum-trojkata.ctr`, `okrag-opisany-na-trojkacie.ctr`.

**Zapis okręgów:** w przygotowanych plikach jawnie zapisano rodzaj każdego okręgu (`circle_kind`). Początkowo było to obejście błędu eksportu/importu. Po poprawce aplikacja sama zachowuje tę informację i rozpoznaje stare błędne eksporty zawierające środek we własnej definicji. Ponowne wczytanie i przeciągnięcie konstrukcji ze stycznymi sprawdzono bez obejścia. Surowe eksporty sprzed naprawy pozostają w dowodach diagnostycznych.

## 1. Środek ciężkości trójkąta

**Cel:** zbadaj przecięcie środkowych i podział każdej z nich w stosunku 2:1.

1. Narzędziem Wielokąt utwórz trójkąt ABC i zamknij go kliknięciem A.
2. Wybierz Środek odcinka. Kliknij kolejno boki BC, CA, AB, otrzymując D, E, F. Wystarczy wskazać bok; nie trzeba za każdym razem wybierać obu końców.
3. Narzędziem Odcinek połącz C z F oraz A z D.
4. Narzędziem Przecięcie wskaż te dwie środkowe. Powstaje G.
5. Dorysuj BE, aby sprawdzić współpękowość trzech środkowych.

**Spróbuj:** przeciągnij C, zrób trójkąt rozwartokątny, przenieś C na drugą stronę AB. Czy G pozostaje wewnątrz trójkąta? Dlaczego AG = 2·GD? Czy przesunięcie, obrót lub powiększenie figury zmienia ten stosunek?

Etapy: trójkąt → środki boków → gotowa konstrukcja. Środkowe narysowano jako odcinki, bez zbędnych przedłużeń.

## 2. Ortocentrum trójkąta

**Cel:** zbadaj położenie punktu przecięcia wysokości.

1. Utwórz trójkąt ABC.
2. Wybierz Prostopadła: wskaż C, następnie bok AB.
3. Powtórz dla A i BC.
4. Narzędziem Przecięcie wskaż obie wysokości; oznacz punkt H.
5. Utwórz trzecią prostopadłą z B do CA.

**Spróbuj:** przejdź od trójkąta ostrokątnego do rozwartokątnego. Gdzie znajduje się H? Co dzieje się przy kącie prostym? Pozostaw przedłużenia wysokości widoczne — są potrzebne do obserwacji H poza trójkątem.

Etapy: trójkąt → gotowa konstrukcja. Testy obejmowały położenia ostro- i rozwartokątne oraz zmianę orientacji, bez przechodzenia przez dokładną współliniowość trzech wierzchołków.

## 3. Okrąg opisany na trójkącie

**Cel:** połącz szybkie utworzenie okręgu z uzasadnieniem jego środka.

1. Utwórz trójkąt ABC.
2. Wybierz Okrąg przez trzy punkty, wskaż A, B, C. To najszybsza dostępna droga do samego okręgu.
3. Aby pokazać konstrukcję środka, wybierz Symetralna i kliknij bok AB, a następnie BC.
4. Oznacz środek istniejącego okręgu literą O; leży na obu symetralnych.

**Spróbuj:** przesuń C tak, aby trójkąt stał się rozwartokątny. Porównaj położenie O i H z poprzedniego przykładu. Dlaczego OA = OB = OC? Gdzie jest O w trójkącie prostokątnym?

Etapy: trójkąt → okrąg przez trzy punkty → okrąg i symetralne. Symetralne służą wyjaśnieniu; nie są potrzebne do działania skrótu Okrąg przez trzy punkty.

## 4. Okrąg wpisany w trójkąt

**Cel:** zbuduj okrąg o środku równo odległym od trzech boków.

1. Utwórz trójkąt ABC.
2. Narzędziem Dwusieczna wskaż boki AB i CA, a następnie AB i BC.
3. Utwórz przecięcie dwusiecznych I.
4. Poprowadź prostopadłą z I do AB. Jej spodek oznacz T.
5. Narzędziem Okrąg wskaż I jako środek i T jako punkt wyznaczający promień.

**Spróbuj:** przeciągnij C i obserwuj, czy okrąg nadal dotyka każdego boku. Dlaczego przecięcie dwóch dwusiecznych wystarcza do wyznaczenia środka? Porównaj odległości I od trzech boków. Po poprawkach dodanie T na AB zachowuje zależności dwusiecznych; sprawdzone przesuwanie, skalowanie i obracanie trójkąta też zachowało styczność.

Etapy: trójkąt → dwusieczne → gotowa konstrukcja. Ten przykład pozostaje również testem regresji dawnego błędu dzielenia boku dodatkowym punktem.

## 5. Dwie styczne z punktu do okręgu

**Cel:** skonstruuj styczne i uzasadnij prostopadłość promienia do stycznej.

1. Narzędziem Okrąg utwórz okrąg o środku O i wybranym promieniu.
2. Dodaj punkt P na zewnątrz okręgu.
3. Wybierz Styczna, wskaż P, potem okrąg. Program tworzy obie styczne wraz z potrzebnymi zależnościami pomocniczymi.
4. Punkty styczności oznacz T₁ i T₂.

**Spróbuj:** przesuwaj P, pozostając na zewnątrz. Dlaczego OT₁ ⟂ PT₁ i OT₂ ⟂ PT₂? Wyjaśnij równość PT₁ = PT₂, korzystając z przystawania trójkątów prostokątnych. Klasyczne uzasadnienie konstrukcji wykorzystuje okrąg o średnicy OP.

**Spróbuj również:** przesuń P do wnętrza okręgu. Styczne przestają istnieć i znikają, natomiast sam okrąg pozostaje widoczny. Po powrocie do sprawdzonego położenia zewnętrznego styczne znów są poprawne. Dlaczego z punktu wewnętrznego nie można poprowadzić rzeczywistej stycznej?

Etapy: okrąg i punkt → gotowa konstrukcja.

## Zakres sprawdzenia

Sprawdzono przeciąganie wierzchołków/punktu P, przesunięcie trójkąta, skalowanie trójkąta ×1,2, obrót o 20°, przesuwanie i skalowanie całej zaznaczonej konstrukcji ×1,15, cofnięcie i ponowienie skalowania, zoom kółkiem, przesuwanie widoku i dotykowy pinch przy rozmiarze 390×844. Każdy etap plików ponownie wczytano do aplikacji. Pełne wyniki i ograniczenia są w `docs/CLASSICAL_CONSTRUCTIONS_2026-10-13.md`.

Próby wykonano w Edge z automatyzacją prawdziwych zdarzeń interfejsu. Nie zastępuje to testu wygody na fizycznym telefonie lub z rysikiem. Nie badano wszystkich konfiguracji osobliwych, np. dokładnie współliniowego trójkąta.
