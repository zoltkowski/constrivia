# Spójność interfejsu i model obiektów — 13 października 2026

## Wniosek

Warto rozbudować model **znaczeń i operacji**, zachowując małą liczbę narzędzi. Obecne pięć podstawowych rodzajów geometrii samo w sobie nie jest problemem. Problemem jest to, że „prosta”, „jej część”, „bok wielokąta”, „zakres stylowania” i „cel usuwania” nie mają równie jednoznacznej reprezentacji. UI odgaduje intencję z kombinacji zaznaczeń, flag i pozycji w tablicach.

Rozdzielenie plików bez ustalenia tych reguł przeniesie niejasności do nowych modułów. Proponuję najpierw spisać kontrakt zachowania najczęstszych operacji i oprzeć na nim małe etapy refaktoru.

To przegląd i propozycje do dyskusji. **Nie zmieniłem kodu aplikacji.** Zachowuję wcześniejsze uzgodnienie: stylowanie po mijaniu się punktów nie ma obecnie jednej obowiązującej poprawnej semantyki. Swobodna deformacja figury utworzonej narzędziem Kwadrat/Trójkąt jest zamierzona i opisana w pomocy.

## Odtworzenia w aplikacji

Próby wykonano lokalnie w Edge/Playwright, 390×844. Większość działań to rzeczywiste kliknięcia i przeciągnięcia przycisków/canvasu. Minimalne modele ładowano istniejącą funkcją importu. Wartości kąta i wynik wyszukiwania punktu odczytano przez istniejące funkcje aplikacji. Dostęp diagnostyczny dodaje skrypt do odpowiedzi serwera, bez edycji źródeł aplikacji.

Polecenie: `node output/playwright/review-ui.cjs --logic`. Dane: `output/playwright/logic-review-results.json`. Zrzut: `output/playwright/concave-polygon.png`. Skrypt korzysta z lokalnego runtime Playwright i Edge, jak we wcześniejszym przeglądzie. Nie badano fizycznego telefonu ani rysika.

### U1 · Zaznaczenie części nie określa spójnie zakresu operacji

**Odtworzone:** prosta ma A, B, C. Pierwsze kliknięcie odcinka A–B zaznacza całą prostą, drugie jedną część (`ln1:s:0`). Naciśnięcie Usuń usuwa cały obiekt prostej, także B–C; punkty pozostają.

Stylowanie i ukrywanie uwzględniają `selectedSegments`, ale usuwanie prostej w `src/main.ts:9396`–`9422` operuje na `selectedLineId` i nie rozpatruje zakresu części. Przy zaznaczonym boku wielokąta wcześniej wybierana jest gałąź `selectedPolygonId` (`9388`). To ostatnie wynika z kodu; osobna próba usuwania boku wielokąta nie była wykonywana.

**Ocena:** potwierdzona niespójność zakresu zaznaczenia i operacji. Nie przesądzam, że usuwanie fragmentu ma otwierać wielokąt lub fizycznie rozcinać prostą. Tę regułę trzeba dopiero ustalić. Użytkownik powinien jednak widzieć, że operacja dotknie całego obiektu, jeśli właśnie taki będzie skutek.

**Propozycja:** jawny cel operacji: cała figura / część / punkt / adnotacja. Do czasu określenia semantyki „usuń część”, części mogą mieć Ukryj, a usuwanie całego obiektu powinno wymagać zaznaczenia całego obiektu lub jawnie opisanej akcji. To nie musi oznaczać dodatkowego narzędzia na głównym pasku.

### U2 · Ten sam punkt na prostej ma inne zależności zależnie od narzędzia

**Odtworzone:** kliknięcie (160,300) na istniejącej prostej narzędziem Punkt tworzy `on_object` z rodzicem `ln1`. Rozpoczęcie w tym samym miejscu narzędziem Odcinek tworzy `free`, bez rodzica i bez dołączenia do podziału istniejącej prostej.

Źródło: obsługa Punktu (`src/main.ts:3054` i dalsze), a dla Odcinka `3254`–`3259` sprawdzane są tylko istniejące punkty. Analogiczne tworzenie punktów jest powielane w innych narzędziach.

**Ocena:** decyzja projektowa wymagająca spójnej reguły. Obie możliwości mogą być potrzebne: punkt związany z prostą i swobodny punkt leżący na niej tylko wizualnie. Obecnie rozróżnienie zależy od historii kliknięć, bez jednoznacznego sygnału dla użytkownika.

**Propozycja:** wspólne rozstrzyganie wskazania punktu dla wszystkich narzędzi: istniejący punkt / punkt na obiekcie / przecięcie / punkt swobodny. Podświetlenie kandydata powinno pokazywać związek przed zatwierdzeniem. Wariant swobodny powinien być dostępny celowo, bez wymagania pamiętania, które narzędzie akurat tworzy zależność.

### U3 · Niedokończona konstrukcja nie jest osobnym stanem dokumentu

**Odtworzone:** wybór Odcinka, pierwszy klik w pustym miejscu, przejście do Zaznacz. Punkt startowy zostaje w dokumencie. Historia nadal ma jedną pozycję i indeks 0, więc nie ma osobnego Cofnij dla pozostawionego punktu.

Pierwszy punkt jest od razu dodawany do runtime (`src/main.ts:3259`), historia dopiero po ukończeniu odcinka (`3294`), a zmiana trybu zeruje identyfikatory początku bez zakończenia takiej operacji (`2226`–`2233`). Wielokąt również tworzy punkty i odcinki podczas kolejnych kroków, przed końcowym zapisem historii.

**Ocena:** pozostawienie punktu lub otwartego łańcucha może być przydatne w szkicowniku. Samo pozostawienie nie jest automatycznie błędem. Brakuje jednak konsekwentnej granicy działania, obsługi anulowania i historii.

**Propozycja:** jawny stan roboczy konstrukcji z krokami i jedną transakcją. Zmiana narzędzia ma zawsze ustalony skutek: anuluje szkic roboczy albo zatwierdza go w konkretnej postaci. Cofnij podczas tworzenia cofa krok; po ukończeniu cofa całą konstrukcję. Jeżeli otwarte łańcuchy mają być zachowywane, warto modelować je jako polilinię/łańcuch, a nie przypadkową kolekcję nieukończonych elementów.

### U4 · Walidacja kolejnych wskazań różni się między podobnymi narzędziami

**Odtworzone:** dwa kliknięcia tego samego punktu narzędziem Kwadrat tworzą wielokąt z powtórzonym wierzchołkiem i zerowymi bokami. W przykładzie powstały trzy punkty o tych samych współrzędnych i m.in. prosta `points: [pt1,pt1]`. Przy Okręgu powtórzenie środka odrzuca promień, ale zostawia drugi punkt w tym samym miejscu, bez osobnego zapisu historii.

Odcinek ma kontrolę identycznych końców (`src/main.ts:3271`), Kwadrat jej nie ma (`3697`–`3717`). Okrąg tworzy nowy punkt dla ponownego trafienia w środek (`3572`–`3579`), po czym warunek sprzątania przy zerowym promieniu nie obejmuje tego przypadku (`3585`–`3594`).

**Ocena:** błędy implementacyjne, szczególnie odczuwalne przy przypadkowym podwójnym dotknięciu lub małej odległości między punktami.

**Propozycja:** wspólne warunki wejściowe dla kroków narzędzi: różne punkty, niezerowa podstawa, dopuszczalna konstrukcja. Błędne wskazanie nie powinno tworzyć osieroconych obiektów; narzędzie pozostaje w zrozumiałym kroku i daje krótką informację, czego oczekuje.

### U5 · Trafienie dokładnie w punkt może wybrać sąsiada

**Odtworzone:** starszy punkt (100,300), nowszy (112,300), wskazanie dokładnie (100,300). `findPoint` zwraca nowszy punkt oddalony o 12 px. Tolerancja wynosi 16 px przy zoomie 1.

`src/canvas/hitTesting.ts:16`–`25` bierze ostatnio dodany punkt mieszczący się w tolerancji, a nie najbliższy. Podobnie pierwsza pasująca prosta jest wybierana według kolejności obiektów. To nie musi być ta, w którą użytkownik celował.

**Ocena:** potwierdzony mechanizm utrudniający wskazywanie w gęstych konstrukcjach. Nie ustalam jednej uniwersalnej kolejności wszystkich typów, ale dokładne trafienie i kontekst narzędzia powinny mieć znaczenie.

**Propozycja:** wspólny resolver kandydatów z odległością, rodzajem celu i kontekstem narzędzia. Dla niejednoznacznych trafień możliwość jawnego wyboru kandydata. Gest trzeba dobrać z uwzględnieniem tego, że ponowne kliknięcie już służy wybieraniu części obiektu — nie dokładać do niego niezależnego, kolidującego cyklu.

### U6 · Zmiana jednego atrybutu stylu zmienia też pozostałe

**Odtworzone:** dwie części prostej mają grubości 2 i 8, pierwsza jest przerywana, druga ciągła. Zaznaczenie całej prostej i kliknięcie wyłącznie koloru zmienia obie części na grubość 2 i kreskę przerywaną.

`applyStyleFromInputs` czyta kolor, grubość i rodzaj kreski razem (`src/main.ts:12747`–`12754`), po czym razem zapisuje je w każdej wybranej części (`12847`–`12849`). Formularz pokazuje wartość reprezentatywnej części, zamiast wyraźnego stanu mieszanego.

**Ocena:** potwierdzony skutek uboczny pojedynczej edycji. Ujednolicenie całego stylu jest sensowną operacją, ale kliknięcie koloru nie komunikuje ujednolicenia grubości i rodzaju kreski.

**Propozycja:** edycja przekazuje tylko zmieniony atrybut. Zaznaczenie o różnych wartościach pokazuje stan „różne”; jawna operacja kopiowania stylu może nadal przenosić wiele atrybutów.

### U7 · Obrys wielokąta nie jest używany konsekwentnie

**Odtworzone przez narzędzie Wielokąt:** wierzchołki (60,260), (300,260), (120,320), (300,460), (60,460), zamknięcie. Boki powstają w tej kolejności, ale wypełnienie używa kolejności identyfikatorów `[5,4,2,1,3]`. To nie jest tylko odwrócenie lub zmiana początku tego samego obrysu. Wypełnienie trafia na inną stronę wklęsłego wcięcia niż boki.

`src/core/polygonTools.ts:127`–`137` sortuje wierzchołki wokół średniej współrzędnych, choć w modelu jest już kolejność wyklikana przez użytkownika. Z tego helpera korzysta również wykrywanie wnętrza i inne operacje. `createPolygon` przyjmuje listę linii boków, lecz jej nie zapisuje (`src/main.ts:15212`–`15224`); boki są potem wyszukiwane na podstawie punktów.

**Ocena:** potwierdzony błąd topologii wielokąta, nie kwestia stylu. Wklęsłe wielokąty nie wymagają osobnego przycisku ani koniecznie osobnego rodzaju figury; wymagają zachowania znaczenia uporządkowanego obrysu.

**Propozycja:** jeden uporządkowany obrys używany do wypełnienia, wskazywania wnętrza, boków i zmian topologii. Związek boku z konkretną częścią prostej powinien być jednoznaczny także wtedy, gdy istnieją nakładające się odcinki lub wspólne boki kilku figur.

### U8 · Wybrany sektor kąta i jego pomiar nie mają wspólnej interpretacji

**Odtworzone:** kąt 90°, po ustawieniu `style.exterior=true` geometria znacznika przełącza się na sektor wklęsły, ale funkcja pomiaru nadal zwraca 90°, zamiast 270°.

`angleGeometry` zmienia kierunek dla sektora wklęsłego (`src/core/angleTools.ts:125`–`135`), a `getAngleValue` po uwzględnieniu tego kierunku jeszcze raz odejmuje wynik od pełnego obrotu (`src/main.ts:1704`–`1711`).

**Ocena:** błąd obliczania prezentowanej wartości. Jednocześnie wskazuje na mieszanie definicji kąta z jego dekoracją: wybrany sektor jest zapisany jako styl, mimo że zmienia to, jaki kąt mierzymy.

**Propozycja:** definicja kąta określa wierzchołek, skierowane ramiona i sektor; wygląd znacznika określa kolor, promień, liczbę łuków i sposób oznaczenia. Rysowanie i pomiar korzystają z tej samej interpretacji sektora. Symbol kąta prostego może być adnotacją w szkicowniku; nie należy automatycznie utożsamiać go z więzem wymuszającym 90°.

### U9 · Wklej pokazuje dostępną akcję, która nie działa w tym stanie

**Odtworzone:** skopiuj punkt, odznacz wszystko i wróć do Zaznacz. Przycisk Wklej jest widoczny; kliknięcie nie zmienia dokumentu. Liczba punktów przed i po wynosi 1.

`updateSelectionButtons` pokazuje przycisk przy zawartości schowka i braku zaznaczenia (`src/main.ts:11058`–`11061`), ale handler zaczyna od `if (!hasMultiSelection()) return` (`9203`–`9204`).

**Ocena:** błąd zgodności dostępności akcji i jej wykonania.

**Propozycja:** dostępność przycisku i wykonanie polecenia korzystają z tego samego warunku. Wewnętrznie Kopiuj, Wklej i Klonuj powinny być różnymi poleceniami, nawet jeśli UI oszczędza miejsce i pokazuje je w jednym miejscu.

### U10 · Zaznaczanie prostokątem ma różne kryteria dla różnych obiektów

**Odtworzone:** prostokąt (80,280)–(120,320) obejmuje środek okręgu o promieniu 80, lecz większość obwodu leży poza nim. Mimo to zaznacza cały okrąg. Zaznacza też ukryty punkt (110,310), choć użytkownik nie włączył pokazywania ukrytych.

`src/main.ts:1383`–`1427`: prosta wymaga wszystkich punktów w prostokącie, okrąg tylko środka, kąt tylko wierzchołka, wielokąt wszystkich wierzchołków. Większość kolekcji nie filtruje ukrycia; swobodne etykiety mają osobny filtr.

**Ocena:** dobór kryterium obejmowania jest decyzją projektową. Wybieranie niewidocznych elementów bez jawnego trybu jest osobnym problemem przewidywalności, zwłaszcza przy późniejszym grupowym usuwaniu/przesuwaniu.

**Propozycja:** ustalić jedną regułę zaznaczania obszarem: obejmowanie albo przecięcie widocznego obiektu, z celowymi i komunikowanymi wyjątkami. Ukryte elementy domyślnie poza zasięgiem wyboru; jawne grupy mogą mieć osobne zasady obejmowania ich składników.

## Co warto rozróżniać w modelu

| Pojęcie | Obecny problem | Korzyść z jawnego modelowania |
| --- | --- | --- |
| Prosta geometryczna i jej zakresy | Ukrycie promienia, części i całego obiektu ma różne reprezentacje; granica promienia przesuwa się wraz z listą punktów | Wyraźny zakres odcinka/półprostej/prostej oraz przenoszenie widoczności przy zmianie podziału |
| Część prostej/okręgu | Indeksy części zależą od aktualnego podziału; etykiety i pomiary nie wszędzie mają równie precyzyjny cel | Stabilne odniesienia do części, ich końców, kierunku i obiektu bazowego |
| Obrys wielokąta i bok | Kilka funkcji odtwarza znaczenie z listy punktów; lista boków przekazana przy tworzeniu nie zostaje w modelu | Jedna topologia wspólna dla rysowania, wskazywania, stylowania i usuwania |
| Definicja konstrukcji | Luźne `construction_kind: string` i opcjonalne metadane dopuszczają sprzeczne lub niepełne zestawy pól | Rozłączne warianty: swobodny, na obiekcie, środek, przecięcie, symetria itd.; dane obowiązkowe dla danego wariantu |
| Poprawność, ręczne ukrycie i rola pomocnicza | Geometria i prezentacja współdzielą stan ukrycia; pomocniczość bywa zakodowana samym stylem | Nieważny wynik nie nadpisuje decyzji użytkownika; pomocnicze elementy mają jasne zasady wyboru i edycji |
| Kąt geometryczny i oznaczenie kąta | Sektor jest stylem, ale zmienia znaczenie pomiaru | Zgodność wartości i rysunku; odróżnienie adnotacji od więzu geometrycznego |
| Cel zaznaczenia i zakres operacji | Kilka równoległych id, zbiorów i flag daje inne interpretacje w różnych handlerach | Jeden jawny cel: obiekt/część/punkt/etykieta/grupa; polecenia deklarują, na czym działają |
| Stan roboczy narzędzia | Wiele niezależnych zmiennych początku, pierwszego ramienia, promienia itd. | Jawne etapy, walidacja, anulowanie i jedna granica historii |
| Pomiar i kalibracja | Wpisanie długości ustala wspólną skalę, a nie więz długości odcinka (`main.ts:1512`) | UI może jednoznacznie nazwać „ustal skalę”, „pokaż pomiar” i ewentualne przyszłe „wymuś długość” |

Te pojęcia nie muszą być osobnymi klasami, kolekcjami ani przyciskami. Część wystarczy reprezentować rozłącznymi wariantami danych lub stabilnymi referencjami. **Proponuję bogatszy model wewnętrzny przy prostym interfejsie.**

Nie rekomenduję obecnie mnożenia osobnych typów Kwadrat/Prostokąt/Romb/Trapez wyłącznie dla nazw kształtów. Pomoc celowo pozwala przekształcać jeden w drugi. Jeśli w przyszłości potrzebne będzie zachowanie foremności lub prostopadłości, powinno wynikać z jawnych więzów, odrębnych od szablonu początkowego i od blokady całego kształtu.

## Proponowany kontrakt interfejsu

To propozycje do uzgodnienia, nie wdrożone reguły:

1. **Zaznaczenie pokazuje rzeczywisty zakres działania.** Kolor, ukrycie, etykieta, kopiowanie i usunięcie nie odgadują go niezależnie. Szerszy skutek, np. zmiana całej figury, jest widoczny przed wykonaniem.
2. **Jedno wskazanie punktu ma wspólne reguły.** Narzędzie może filtrować dopuszczalne cele, ale nie tworzy po cichu innego rodzaju zależności dla tego samego trafienia.
3. **Każde narzędzie ma jawne kroki i zakończenie.** Użytkownik widzi, co już wybrał i co ma wskazać dalej. Powtórne wskazanie/zmiana narzędzia/Cofnij mają ustalone znaczenie. Pismo ręczne i gumka mogą być trwałymi trybami, ale nie powinno to wynikać z przypadkowych wyjątków.
4. **Zmiana koloru zmienia kolor.** Ujednolicenie pozostałych atrybutów jest osobną intencją. Wartości mieszane w zaznaczeniu nie są przedstawiane jako jednolite.
5. **Gesty nawigacji zachowują dokument.** Dotyczy również momentu rozpoczęcia gestu, nie tylko stanu po wykryciu dwóch palców.
6. **Swoboda i zależność są rozpoznawalne.** Swobodny szkic, punkt związany z obiektem, zablokowany kształt i obiekt obliczony nie muszą mieć tego samego zachowania przeciągania, ale użytkownik musi móc odróżnić ich role.
7. **Domyślna konfiguracja jest punktem odniesienia.** Personalizacja może skracać pracę; nie powinna być potrzebna do uzyskania przewidywalnych podstawowych operacji. Na małym ekranie istotny jest realny obszar roboczy, a nie sam rozmiar canvasu.

## Kolejność dalszej pracy

Najpierw trzy decyzje: zakres zaznaczenia części i usuwania, zasady tworzenia zależnych punktów w każdym narzędziu, zakończenie/anulowanie konstrukcji wieloetapowej. Wcześniejsze pytanie o style mijających się punktów zostaje otwarte; przypadek półprosta → odcinek powinien być rozpatrywany osobno.

Następnie małe etapy: wspólny cel zaznaczenia i warunki dostępności poleceń; wspólne rozstrzyganie punktów i walidacja kroków; jawny stan roboczy z historią; stabilne części i obrysy; przenoszenie odpowiedzialności do modułów silnika/stylów/UI.

Błędy takie jak podwójne odwrócenie sektora kąta lub sortowanie obrysu nie wymagają oczekiwania na wielki nowy model. Przed naprawą wystarczy uzgodnić zachowanie, zachować odtworzenie i sprawdzić zależne ścieżki. Nie proponuję jednoczesnej wymiany całej architektury ani dokładania ogólnego solvera więzów bez konkretnych potrzeb.
