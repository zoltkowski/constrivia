# Klasyczne konstrukcje — materiały robocze

Pięć przykładów wykonanych narzędziami Constrivii podczas przeglądu 13 października 2026. Każdy początkowy rysunek jest poprawny matematycznie. Próby ruchu ujawniły błędy w dwóch przykładach; ich ograniczenia opisano poniżej. Kod aplikacji nie został zmieniony.

## Pliki i status

| Przykład | Gotowy rysunek | Kolejne etapy | Status |
| --- | --- | --- | --- |
| Środek ciężkości | `centroid.ctr` | `centroid-kroki.ctr` | Przeszedł opisane próby ruchu i przekształceń |
| Ortocentrum | `orthocenter.ctr` | `orthocenter-kroki.ctr` | Przeszedł opisane próby ruchu i przekształceń |
| Okrąg opisany | `circumcircle.ctr` | `circumcircle-kroki.ctr` | Przeszedł opisane próby ruchu i przekształceń |
| Okrąg wpisany | `incircle.ctr` | `incircle-kroki.ctr` | Poprawny początkowo; deformowanie i przekształcanie trójkąta ujawnia błędy |
| Styczne z punktu | `tangents.ctr` | `tangents-kroki.ctr` | Działa dla sprawdzonych położeń zewnętrznych; błędy wewnątrz okręgu i przy zapisie aplikacji |

Otwórz plik `.ctr` w Constrivii. Wersja `-kroki` zawiera osobne rysunki kolejnych etapów, a wersja bez tego dopisku tylko gotową konstrukcję. Przechodź między etapami strzałkami Poprzedni/Następny plik; pojawiają się w trybie Przesuwanie, gdy nic nie jest zaznaczone. Obok są czytelne pliki `.json` oraz podglądy `.png`.

Pierwsze trzy przykłady, w wersjach z etapami, dodano też do `public/content/`: `srodek-ciezkosci-trojkata.ctr`, `ortocentrum-trojkata.ctr`, `okrag-opisany-na-trojkacie.ctr`.

**Uwaga o zapisie okręgów:** w przygotowanych plikach jawnie zapisano istniejący rodzaj każdego okręgu (`circle_kind`). To obejście błędu zgodności eksportu i importu, bez zmiany geometrii. Obecny zapis aplikacji pomija rodzaj „środek i promień”, a importer może wtedy odczytać taki okrąg jako „przez trzy punkty”. Ponowne zapisanie materiału w aplikacji może przywrócić ten problem. Okrąg opisany, rzeczywiście zdefiniowany trzema punktami, nie wymaga tej korekty. Surowe eksporty zachowano osobno w dowodach diagnostycznych.

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

## 4. Okrąg wpisany w trójkąt — przykład do poprawy

**Cel:** zbuduj okrąg o środku równo odległym od trzech boków.

1. Utwórz trójkąt ABC.
2. Narzędziem Dwusieczna wskaż boki AB i CA, a następnie AB i BC.
3. Utwórz przecięcie dwusiecznych I.
4. Poprowadź prostopadłą z I do AB. Jej spodek oznacz T.
5. Narzędziem Okrąg wskaż I jako środek i T jako punkt wyznaczający promień.

**Ograniczenie aplikacji:** po dodaniu T na AB dwusieczne przestają prawidłowo reagować na zmianę kształtu trójkąta. Początkowy okrąg jest wpisany, lecz po przeciągnięciu C może wyjść poza trójkąt. Samo przesuwanie, skalowanie i obracanie trójkąta też może pozostawić niepoprawnie przeliczony okrąg. Nie używaj gotowego przykładu do wyciągania wniosków z deformacji figury, dopóki te błędy nie zostaną naprawione.

Etapy: trójkąt → dwusieczne → gotowa konstrukcja. W środkowym etapie, przed dodaniem T, dwusieczne poprawnie reagowały na sprawdzone przesunięcie C. To przydatny przykład diagnostyczny.

## 5. Dwie styczne z punktu do okręgu — z ograniczeniami

**Cel:** skonstruuj styczne i uzasadnij prostopadłość promienia do stycznej.

1. Narzędziem Okrąg utwórz okrąg o środku O i wybranym promieniu.
2. Dodaj punkt P na zewnątrz okręgu.
3. Wybierz Styczna, wskaż P, potem okrąg. Program tworzy obie styczne wraz z potrzebnymi zależnościami pomocniczymi.
4. Punkty styczności oznacz T₁ i T₂.

**Spróbuj:** przesuwaj P, pozostając na zewnątrz. Dlaczego OT₁ ⟂ PT₁ i OT₂ ⟂ PT₂? Wyjaśnij równość PT₁ = PT₂, korzystając z przystawania trójkątów prostokątnych. Klasyczne uzasadnienie konstrukcji wykorzystuje okrąg o średnicy OP.

**Ograniczenia aplikacji:** po wejściu P do wnętrza okręgu styczne nie istnieją, ale aplikacja pozostawia widoczne błędne proste. Powrót do sprawdzonego położenia zewnętrznego przywraca poprawną geometrię. Zachowaj też uwagę o ponownym zapisie okręgów na początku dokumentu.

Etapy: okrąg i punkt → gotowa konstrukcja.

## Zakres sprawdzenia

Sprawdzono przeciąganie wierzchołków/punktu P, przesunięcie trójkąta, skalowanie trójkąta ×1,2, obrót o 20°, przesuwanie i skalowanie całej zaznaczonej konstrukcji ×1,15, cofnięcie i ponowienie skalowania, zoom kółkiem, przesuwanie widoku i dotykowy pinch przy rozmiarze 390×844. Każdy etap plików ponownie wczytano do aplikacji. Pełne wyniki i ograniczenia są w `docs/CLASSICAL_CONSTRUCTIONS_2026-10-13.md`.

Próby wykonano w Edge z automatyzacją prawdziwych zdarzeń interfejsu. Nie zastępuje to testu wygody na fizycznym telefonie lub z rysikiem. Nie badano wszystkich konfiguracji osobliwych, np. dokładnie współliniowego trójkąta.
