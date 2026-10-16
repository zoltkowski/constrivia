# Zaawansowane konstrukcje

Trzy rysunki zbudowane w Constrivii narzędziami interfejsu 13 października 2026. Pliki zawierają gotowe konstrukcje, archiwa z kolejnymi etapami, podglądy PNG i wersje JSON.

| Konstrukcja | Gotowy rysunek | Etapy | Sprawdzana własność |
| --- | --- | --- | --- |
| Prosta Eulera i okrąg dziewięciu punktów | `euler-ninepoint.ctr` | `euler-ninepoint-kroki.ctr` | H, G i O są współliniowe; okrąg przechodzi przez trzy środki boków i trzy spodki wysokości |
| Prosta Simsona | `simson.ctr` | `simson-kroki.ctr` | Rzuty punktu P z okręgu opisanego na boki trójkąta leżą na jednej prostej |
| Twierdzenie o siecznych | `power-secants.ctr` | `power-secants-kroki.ctr` | Dla dwóch siecznych z P iloczyny długości odcinków są równe |

Otwórz plik `.ctr` w aplikacji. Archiwum `-kroki.ctr` zawiera osobne rysunki kolejnych etapów; można przechodzić między nimi przyciskami Poprzedni/Następny plik. Obok znajdują się czytelne pliki `.json` i podglądy `.png`.

## Prosta Eulera i okrąg dziewięciu punktów

1. Utwórz trójkąt ABC narzędziem Wielokąt.
2. Wskaż boki AB, BC i CA narzędziem Punkt środkowy. Otrzymasz D, E i F.
3. Poprowadź środkowe z A i B do przeciwległych środków boków. Ich przecięcie to G.
4. Wybierz Symetralna i wskaż kolejno końce A, B, a potem B, C. Przecięcie symetralnych to O.
5. Poprowadź wysokości z A i B na przeciwległe boki; ich przecięcie to H. Utwórz trzecią wysokość, aby zobaczyć wszystkie spodki.
6. Narzędziem Okrąg przez 3 punkty wskaż D, E i F. Okrąg przechodzi też przez trzy spodki wysokości. Połącz O z G.

Użycie końców boku w kroku 4 jest celowe: jeśli bok ma już dodatkowy punkt, kliknięcie jego widocznego fragmentu wyznacza symetralną tego fragmentu. Wybór końców jednoznacznie wskazuje cały bok.

## Prosta Simsona

1. Utwórz trójkąt ABC i okrąg opisany narzędziem Okrąg przez 3 punkty.
2. Dodaj dwa punkty po przeciwnych stronach okręgu i połącz je sieczną.
3. Wybierz Przecięcie, wskaż sieczną, a następnie okrąg w miejscu z dala od siecznej. Program utworzy oba przecięcia; jedno z nich jest P.
4. Zbuduj prostopadłe z P do boków AB, BC i CA. Przecięcia z bokami to X, Y i Z.
5. Połącz X z Y i sprawdź, że Z leży na tej samej prostej.

Po przesunięciu C sieczna wybrana na etapie 2 może przestać przecinać okrąg. Wtedy punkt P oraz zależne rzuty i prosta Simsona znikają; po powrocie przecięcia konstrukcja odtwarza się. W pliku gotowym sieczna przecina okrąg.

## Potęga punktu i dwie sieczne

1. Utwórz okrąg i zewnętrzny punkt P.
2. Zbuduj dwie sieczne przechodzące przez P.
3. Dla każdej siecznej użyj Przecięcie: najpierw wskaż sieczną, potem okrąg w miejscu z dala od obu siecznych.
4. Oznacz przecięcia pierwszej siecznej A, B, drugiej C, D. Sprawdź równość PA · PB = PC · PD.

## Sprawdzenie

Automatyzacja tworzyła rysunki prawdziwymi kliknięciami i przeciągnięciami w Edge. Przeciągnęła wierzchołek lub punkt P w cztery położenia, przesunęła i przeskalowała całą konstrukcję, a dla trójkątów również przesunęła, przeskalowała i obróciła wielokąt. W dwóch położeniach C dla Simsona sieczna nie przecina okręgu, więc P i jego obiekty zależne prawidłowo stają się niedostępne; w czwartym położeniu przecięcie wraca. Sprawdzono też zoom, przesunięcie widoku, dotykowy pinch przy rozmiarze 390×844 oraz ponowne wczytanie gotowego pliku i każdego etapu. Maksymalny błąd własności w poprawnych konfiguracjach był mniejszy niż 2×10⁻¹¹ jednostki dla Eulera, 1.1×10⁻¹² dla Simsona i 2.2×10⁻¹⁵ błędu względnego dla potęgi punktu.

Szczegóły prób, liczbę kliknięć, ograniczenia i pomysły na usprawnienia opisano w `docs/ADVANCED_CONSTRUCTIONS_2026-10-13.md`.
