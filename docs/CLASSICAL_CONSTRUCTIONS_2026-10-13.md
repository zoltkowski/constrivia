# Próby klasycznych konstrukcji — 13 października 2026

## Wynik

Wykonano pięć konstrukcji za pomocą narzędzi interfejsu, korzystając z dostępnych skrótów. Wszystkie były poprawne początkowo. Środkowe, wysokości i okrąg opisany zachowały sprawdzane własności podczas deformowania i przekształcania. Okrąg wpisany ujawnił dwa problemy obliczeń. Styczne ujawniły poważny błąd zapisu/odczytu okręgów i brak poprawnej obsługi konstrukcji nieistniejącej.

Nie zmieniono kodu aplikacji. Dodano materiały, instrukcje i narzędzia diagnostyczne. Istniejące zmiany użytkownika w źródłach pozostawiono nietknięte.

| Konstrukcja | Zmiana kształtu / punktu wejściowego | Przesunięcie, skala i obrót trójkąta | Przesunięcie i skala całej konstrukcji |
| --- | --- | --- | --- |
| Środkowe / G | Poprawnie w sprawdzonych położeniach | Poprawnie | Poprawnie |
| Wysokości / H | Poprawnie w sprawdzonych położeniach | Poprawnie | Poprawnie |
| Okrąg opisany / O | Poprawnie w sprawdzonych położeniach | Poprawnie | Poprawnie |
| Okrąg wpisany / I | Błędnie po dodaniu punktu styczności | Błędnie | Poprawnie w sprawdzonych próbach |
| Styczne z P | Poprawnie na zewnątrz; błędne proste wewnątrz | Nie dotyczy | Poprawnie przy zachowaniu właściwego rodzaju okręgów |

Zoom, pan i mobilny pinch nie zmieniły współrzędnych ani liczby punktów w żadnym z pięciu przykładów. Cofnięcie/ponowienie skalowania trójkąta przywracało dokładnie zarejestrowane współrzędne; nie oznacza to poprawności samej błędnej konstrukcji wpisanej.

## Metoda i dowody

Skrypt: `output/playwright/classical-constructions.cjs`. Uruchomienie: `node output/playwright/classical-constructions.cjs all`. Wymaga lokalnych zależności projektu, Edge i runtime Playwright wskazanego w skrypcie. Uruchamia i zamyka własny serwer Vite na 127.0.0.1:5175. Ponowne uruchomienie regeneruje materiały i wyniki.

Geometrię tworzono przez rzeczywiste kliknięcia narzędzi i canvasu, a ruch przez zdarzenia myszy/dotyku. Dostęp diagnostyczny wstrzyknięto do odpowiedzi serwera bez edycji źródeł: odczyt modelu, serializacja/import, współrzędne uchwytów i obsługa edytora podpisu. Dodatkowe wywołania przeliczenia służą wyłącznie porównaniom diagnostycznym i są osobno oznaczone w wynikach. Import stosowano również do przywracania punktu wyjścia między próbami.

`output/playwright/classical/results.json` zawiera 91 zapisów prób, kontroli i wczytań etapów; to nie jest liczba 91 niezależnych scenariuszy. Nie zarejestrowano wyjątków JavaScript strony. Skrypt jest raportem diagnostycznym: samo zakończenie kodem 0 nie oznacza braku znalezionych błędów.

Sprawdzano odległość G od średniej współrzędnych ABC i poprawność środków boków; prostopadłość AH/BH/CH do odpowiednich boków; równość promieni OA/OB/OC i przynależność O do symetralnych; równość odległości I od boków z promieniem; przynależność punktów styczności do okręgu, przechodzenie stycznych przez P i ich prostopadłość do promieni. Reszty odległości i znormalizowane iloczyny skalarne są w jednostkach modelu. Próg zapisu dowodu wynosił 0,05; wyniki poprawnych prób były rzędu 10⁻¹¹ lub mniejsze. Nie oceniano istnienia stycznych na podstawie reszt liczbowych, gdy P był wewnątrz okręgu.

Początkowo A=(300,520), B=(700,520), C=(430,260). C przesuwano kolejno do (350,340), (180,450), (430,570), (430,260): zmiana kształtu, trójkąt rozwartokątny i zmiana orientacji. Nie przechodzono przez dokładną współliniowość. W przykładzie stycznych O=(330,350), promień 120, P=(650,350); kolejne położenia P: (740,300), (500,350), (410,350), (740,450).

Pozostałe próby: przesunięcie trójkąta za bok; skala ×1,2; rzeczywisty obrót uchwytem o 20° (zarejestrowano start obracania i końcowy kąt); cofnięcie/ponowienie skali; zaznaczenie całej konstrukcji prostokątem, przesunięcie i skala ×1,15; zoom kółkiem; pan; ponowne wczytanie przy 390×844 i pinch dwoma punktami dotyku. Wszystkie etapy archiwów `.ctr` zaimportowano ponownie. Nie testowano fizycznego telefonu, rysika, systemowego okna zapisu ani obrotu całej grupy.

## K1 · P1 — zapis i odczyt zmienia rodzaj okręgu, następnie konstrukcja się rozpada

**Odtworzenie:** utwórz okrąg O przez punkt promienia, dodaj zewnętrzny P, użyj Styczna dla P i okręgu. Zserializuj dokument i wczytaj go bez modyfikowania danych. Przesuń wyłącznie P do (740,300).

**Wynik:** okrąg główny i pomocniczy zmieniają rodzaj z `center-radius` na `three-point`. Po ruchu P środek O przesuwa się o około **8439,92 jednostki**, choć nie był przeciągany. Jedna z rzekomych stycznych mija P o około **8780,11 jednostki**. Powtórzenie z jawnie zachowanym rodzajem okręgów nie powoduje tego rozpadu.

**Przyczyna potwierdzona w danych i kodzie:** adapter przekazuje trzy `defining_points`, również dla okręgu środek/promień (`src/core/engineAdapter.ts:45`, `189`). Eksport zachowuje tę tablicę (`src/main.ts:13518`), lecz pomija domyślny `circle_kind` (`13527`). Import uznaje brak rodzaju i trzy punkty za okrąg przez trzy punkty (`13853`). Punkt będący wcześniej środkiem może w ten sposób wejść do własnej definicji okręgu, tworząc niepoprawną zależność.

**Dowody:** `output/playwright/classical/tangents-raw-export.json`, `tangents-raw-reload-drag.json`, `tangents-raw-reload-drag.png`, wpis `raw-app-export-reload-and-drag` w wynikach.

**Znaczenie:** zwykłe zapisanie i ponowne otwarcie może zmienić sens istniejącej konstrukcji. To priorytet przed rozbudową biblioteki materiałów zawierających takie okręgi. Test korzysta bezpośrednio z funkcji serializatora/importera aplikacji; nie obejmuje systemowego okna zapisu.

## K2 · P1 — dodanie spodka prostopadłej na boku unieruchamia dwusieczne

**Odtworzenie:** w trójkącie ABC utwórz dwusieczne przy A i B przez wskazanie par boków. Przetnij je w I. Utwórz prostopadłą I→AB ze spodkiem T, następnie okrąg I–T. Przesuń C do (350,340).

**Wynik:** okrąg przestaje być wpisany. Różnica między promieniem a odległością I od BC to **73,69 jednostki**. Dodatkowe przeliczenie nie poprawia wyniku. Powrót do początkowego C przywraca pozornie poprawny rysunek.

**Porównanie kontrolne:** ten sam ruch C przed dodaniem T daje błąd kąta obu dwusiecznych 0°. Po dodaniu T błędy wynoszą **5,52° i 8,35°**. W pierwszym wariancie końce referencji do boków są sąsiednie, w drugim nie.

**Przyczyna:** referencja dwusiecznej zachowuje A,B. Wstawienie T zmienia kolejność punktów prostej na A,T,B. `resolveBisectSegment` wymaga sąsiedztwa A,B (`src/core/engineCompute.ts:183`–`195`), więc odrzuca nadal sensowną geometrycznie referencję. `recomputeBisectPoint` kończy pracę bez aktualizacji (`226`–`228`). Identyczne wymaganie występuje również w pomocniczej logice `src/main.ts:13067`.

**Dowody:** `incircle-drag-0.json/png` i następne w katalogu wyników, wpis `bisector-split-side-comparison`. Etap `dwusieczne` w `incircle-kroki.ctr` pozwala porównać zachowanie przed dodaniem T.

**Znaczenie:** zwyczajna kontynuacja klasycznej konstrukcji psuje już utworzone zależności. Nie jest to kwestia nieustalonego stylowania fragmentów przy mijaniu się punktów. Dwusieczna ma jednoznaczny sens mimo podzielenia boku dodatkowym punktem.

## K3 · P1 — przekształcenie trójkąta pozostawia niedoprzeliczony okrąg wpisany

**Odtworzenie:** przywróć początkową kompletną konstrukcję okręgu wpisanego. Przesuń sam trójkąt, chwytając jego bok; osobno odtwórz stan i przeskaluj trójkąt ×1,2 albo obróć o 20°.

**Wynik:** maksymalne różnice odległości od boków i promienia wynoszą odpowiednio **85,41**, **3,75** i **318,45 jednostki**. Zaznaczenie całej konstrukcji i przekształcenie całej grupy zachowuje poprawne zależności w sprawdzonych próbach.

**Kontrola:** jedno dodatkowe wywołanie `recomputeAllConstraints()` po przesunięciu samego trójkąta zmniejsza błąd do około 1,7·10⁻¹². To inny objaw niż K2, którego dodatkowe przeliczenie nie naprawia. Nie sprawdzano analogicznej kontroli po skali i obrocie.

**Trop w kodzie, wymagający dalszego rozdzielenia przy naprawie:** `recomputeAll` domyślnie wykonuje najwyżej trzy przebiegi, w kolejności prostopadłe/równoległe → okręgi → wielokąty → przecięcia → punkty pochodne → punkty na obiektach (`src/core/engineCompute.ts:733`–`743`). Kontrola dowodzi pozostawienia nieustalonego wyniku po operacji; nie dowodzi jeszcze, że samo zwiększenie liczby przebiegów jest właściwą naprawą. Nie należy w ten sposób maskować problemów referencji i ewentualnych cykli.

**Dowody:** `incircle-polygon-drag.json/png`, `incircle-polygon-scale.json/png`, `incircle-polygon-rotation.json/png`, wpis `diagnostic-extra-recompute-after-drag`.

## K4 · P2 — po wejściu P do okręgu pozostają widoczne nieistniejące styczne

**Odtworzenie:** w przykładzie stycznych przesuń P do (410,350), wewnątrz okręgu O=(330,350), r=120.

**Wynik:** punkty styczności zostają oznaczone jako ukryte, ale ich zależne proste nadal są rysowane. Nie przechodzą przez P i sugerują istnienie stycznych, których geometrycznie nie ma. Powrót P do sprawdzonego położenia zewnętrznego przywraca poprawny wynik.

**Interpretacja:** potrzebny jest osobny stan „konstrukcja chwilowo nie istnieje”, propagowany do zależnych obiektów. Ukrycie punktu jako elementu prezentacji nie powinno automatycznie ukrywać wszystkich prostych przez ten punkt — użytkownik może przecież celowo ukrywać punkty pomocnicze. Obecne flagi widoczności nie rozróżniają tych sytuacji wystarczająco.

**Dowód:** `tangents-drag-2.json/png`.

## K5 · P2 — dopasowanie rysunku umieszcza uchwyty pod paskami narzędzi

Po wczytaniu przykładów środkowych, wysokości i okręgu wpisanego w oknie 1100×800 uchwyt skali ma położenie (1045;750,625), pod dolnym paskiem. Uchwyt obrotu (550;41,125) leży pod górnym paskiem. Również w przykładzie okręgu opisanego uchwyt obrotu jest przykryty paskiem. Potwierdzono element przechwytujący kliknięcie przez `elementFromPoint`, nie tylko ocenę obrazu.

Przed właściwymi próbami transformacji trzeba było oddalić widok. Dopiero po odsłonięciu uchwytów wykonano rzeczywiste skalowanie i obrót, potwierdzone współrzędnymi. Wyniki nie obejmują pustych prób kliknięcia w zasłonięty uchwyt.

**Znaczenie dla wygody:** dopasowanie powinno uwzględniać dostępny obszar pracy i zapas na uchwyty. Problem występuje już na większym ekranie; na małym ekranie potrzeba takiego marginesu jest jeszcze większa. To uzupełnia wcześniejsze uwagi o dopasowaniu widoku.

## Materiały i konsekwencje dla podziału kodu

`materials/klasyczne-konstrukcje/README.md` opisuje konstrukcje, zadania do obserwacji i ograniczenia. Każdy przykład ma wersję końcową, archiwum etapów, JSON i PNG. Do `public/content/` dołączono trzy sprawdzone przykłady z etapami. Okrąg wpisany i styczne pozostają materiałami roboczymi z opisanymi problemami.

W materiałach jawnie zachowano rodzaj okręgów zgodny z modelem podczas tworzenia. Surowe wyniki aplikacji pozostają w dowodach, więc obejście przygotowania materiałów nie ukrywa K1. Zwykły ponowny zapis w aplikacji może ponownie pominąć rodzaj.

Walidacja końcowa: rozpakowano i sprawdzono 23 dokumenty (samodzielne JSON-y oraz dokumenty we wszystkich archiwach), skończone współrzędne, referencje punktów i jawne rodzaje okręgów. Pakiet ZIP zawiera 21 plików. `npm run build` zakończył się powodzeniem; manifest biblioteki zawiera demo i trzy nowe materiały. Dodatkowy test `output/playwright/verify-classical-library.cjs` otworzył wszystkie trzy nowe pliki przez rzeczywisty panel Biblioteka i przeszedł wszystkie etapy przyciskami Następny/Poprzedni. Wyniki: `output/playwright/classical/library-results.json`, bez wyjątków i alertów błędów.

Te próby wzmacniają wcześniejszy wniosek o stopniowym wydzieleniu modułów: definicja geometryczna musi przetrwać podział boku i zapis dokumentu; obliczenia powinny zwracać ustalony wynik oraz stan istnienia; warstwa prezentacji musi niezależnie obsługiwać świadome ukrycie. Samo przeniesienie funkcji do nowych plików nie zapewni tych reguł. Warto zacząć od odtwarzalnych kontraktów dla K1–K3, a następnie wydzielać granice silnika i formatu dokumentu. Szersza analiza jest w `REVIEW_2026-10-13.md` i `UI_MODEL_REVIEW_2026-10-13.md`.
