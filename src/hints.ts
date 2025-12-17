export type HintsMap = {
  tools: Record<string, string>;
  menu: Record<string, string>;
  style: Record<string, string>;
  config: Record<string, string>;
};

export const HINTS: HintsMap = {
  tools: {
    select: 'Kliknij obiekt, aby go zaznaczyć; ponowne kliknięcie odznacza.',
    multiselect: 'Przeciągnij, aby zaznaczyć wiele obiektów lub klikaj po kolei.',
    label: 'Kliknij obiekt aby dodać lub edytować jego etykietę.' ,
    point: 'Kliknij w dowolne miejsce na płótnie, aby dodać punkt.',
    segment: 'Kliknij pierwszy punkt, a następnie drugi — utworzy się odcinek.',
    parallel: 'Wybierz punkt, potem kliknij linię odniesienia — powstanie prosta równoległa.',
    perpendicular: 'Wybierz punkt, potem kliknij linię odniesienia — powstanie prosta prostopadła.',
    circle3: 'Kliknij trzy różne punkty na obwodzie, aby narysować okrąg.',
    circle: 'Kliknij punkt środka, a następnie drugi punkt określający promień, aby narysować okrąg.',
    triangle: 'Kliknij punkt startowy i przesuń kursor, aby określić rozmiar trójkąta.',
    square: 'Kliknij punkt startowy i drugi punkt definiujący kierunek i długość boku.',
    polygon: 'Klikaj kolejne wierzchołki; zakończ dwuklikiem lub kliknięciem pierwszego punktu.',
    angle: 'Kliknij punkt na pierwszym ramieniu, potem wierzchołek, potem punkt na drugim ramieniu.',
    bisector: 'Kliknij dwa ramiona (segmenty) lub istniejący kąt — zostanie utworzona dwusieczna.',
    midpoint: 'Wskaż dwa końce odcinka lub kliknij odcinek, aby dodać punkt środkowy.',
    symmetric: 'Kliknij punkt źródłowy, a następnie oś symetrii (punkt, odcinek lub prostą).',
    tangent: 'Kliknij punkt i okrąg — narzędzie utworzy styczną w tym punkcie.',
    perpBisector: 'Wskaż dwa punkty — powstanie symetralna odcinka.',
    ngon: 'Wybierz liczbę boków (n) i kliknij, aby umieścić n-gon.',
    handwriting: 'Rysuj pismo odręczne, narzędzie zamieni szkic w obiekty geometryczne.'
  },
  menu: {
    clearAll: 'Usuwa wszystkie obiekty z aktualnego dokumentu. Uwaga: operacja jest nieodwracalna.',
    showHidden: 'Przełącza widoczność obiektów oznaczonych jako ukryte (punkty pomocnicze, pomocnicze linie).',
    showMeasurements: 'Pokazuje/ukrywa etykiety pomiarów (długości i kąty).',
    copyImage: 'Kopiuje obraz canvas do schowka jako PNG (jeśli przeglądarka to wspiera).',
    saveImage: 'Zapisz bieżący widok jako plik PNG.',
    invertColors: 'Tymczasowo odwraca kolory interfejsu i rysunku, przydatne do eksportu.',
    debug: 'Otwiera panel z listą wszystkich obiektów i ich właściwościami (przydatne do diagnostyki).',
    settings: 'Otwiera panel konfiguracji — tutaj zmieniasz układ, wygląd i precyzję pomiarów.',
    help: 'Otwiera stronę pomocy z instrukcjami i opisami narzędzi.',
    style: 'Otwiera menu stylu — wybierz kolor, grubość i typ linii oraz sposób wyświetlania punktów.'
    ,
    themeToggle: 'Przełącza tryb jasny/ciemny interfejsu.',
    eraser: 'Włącz narzędzie gumki — kliknij obiekty, aby je usunąć.',
    hideSelected: 'Ukrywa lub pokazuje aktualnie zaznaczone obiekty.',
    copyStyle: 'Kopiuje styl zaznaczonego elementu, kliknij inny element aby wkleić.',
    multiMove: 'Przesuwa wszystkie zaznaczone obiekty jednocześnie.',
    multiClone: 'Klonuje zaznaczone obiekty.',
    cloudFiles: 'Otwórz panel z plikami w chmurze.',
    exportJson: 'Eksportuje dokument do formatu JSON.',
    bundlePrev: 'Przełącza na poprzedni plik w aktualnym bundle.',
    bundleNext: 'Przełącza na następny plik w aktualnym bundle.'
    ,
    pointLabelsAuto: 'Automatycznie wyrównuje etykiety punktów względem ich pozycji.',
    pointLabelsAway: 'Odsuwa etykiety punktów na zewnątrz, zwiększając odstęp od punktu.',
    pointLabelsCloser: 'Przybliża etykiety punktów do odpowiednich punktów.'
  },
  
  style: {
    pointColor: 'Ustaw kolor punktów dla zaznaczonego elementu.',
    pointSize: 'Reguluje rozmiar renderowanego punktu.',
    lineColor: 'Ustaw kolor dla linii lub odcinka.',
    lineWidth: 'Reguluje grubość linii/odcinka.',
    lineStyle: 'Wybierz styl kreski: ciągła, przerywana lub kropkowana.',
    angleRadius: 'Zmienia promień oznaczenia kąta (wpływa na widoczność łuku).',
    fill: 'Jeśli obiekt obsługuje wypełnienie, wybierz jego kolor i stopień wypełnienia.'
  },
  config: {
    generalHints: 'Pokaż podpowiedzi — gdy włączone, aplikacja wyświetla krótkie wskazówki kontekstowe.',
    buttons: 'Konfigurator przycisków pozwala zmieniać kolejność i grupy narzędzi na pasku.',
    appearance: 'Tutaj zmieniasz motyw, kolory, rozmiary i ustawienia podglądu wyglądu.',
    precision: 'Ustaw precyzję wyświetlania długości i kątów (liczba miejsc po przecinku).',
    importExport: 'Eksportuj lub wczytaj konfigurację w celu migracji ustawień między instalacjami.'
  }
};

export default HINTS;
