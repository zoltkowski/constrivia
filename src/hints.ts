export type HintsMap = {
  tools: Record<string, string>;
  menu: Record<string, string>;
  style: Record<string, string>;
  config: Record<string, string>;
};

export const HINTS: HintsMap = {
  tools: {
    select: 'Kliknij obiekt, aby go zaznaczyć; kliknięcie w pusty obszar odznacza.',
    multiselect: 'Przeciągnij, aby zaznaczyć wiele obiektów lub klikaj po kolei (kliknięcie zaznaczonego odznacza).',
    label: 'Kliknij obiekt aby dodać jego etykietę. Jeżeli punkt/odcinek/kąt/wielokąt jest zaznaczony, jest etykietowany automatycznie. Kliknięcie w pusty obszar dodaje wolną etykietę.' ,
    point: 'Kliknij dowolne miejsce na płótnie, aby dodać punkt.',
    segment: 'Kliknij pierwszy punkt, a następnie drugi — utworzy się odcinek. Można tworzyć odcinki poziome, pionowe i pod kątem 45 stopni. Potem można przeciągać punkty dowolnie.',
    parallel: 'Wybierz punkt i kliknij linię odniesienia (w dowolnej kolejności) — powstanie prosta równoległa.',
    perpendicular: 'Wybierz punkt i kliknij linię odniesienia (w dowolnej kolejności) — powstanie prosta prostopadła.',
    circle3: 'Wybierz trzy różne punkty na obwodzie, aby narysować okrąg.',
    circle: 'Wybierz punkt środka, a następnie drugi punkt określający promień, aby narysować okrąg.',
    triangle: 'Klikając w dwa punkty narysuj podstawę - powstanie trójkąt równoboczny, który możesz deformować ciągnąc za wierzchołki.',
    square: 'Klikając w dwa punkty narysuj podstawę - powstanie kwadrat, który możesz deformować ciągnąc za boki lub wierzchołki.',
    polygon: 'Klikaj kolejne wierzchołki; zakończ kliknięciem pierwszego punktu.',
    angle: 'Kliknij dwa ramiona (segmenty o wspólnym punkcie), lub kliknij trzy punkty — zostanie utworzony kąt.',
    bisector: 'Kliknij dwa ramiona (segmenty o wspólnym punkcie) lub istniejący kąt — zostanie utworzona dwusieczna.',
    midpoint: 'Wskaż dwa końce odcinka lub kliknij odcinek, aby dodać punkt środkowy.',
    symmetric: 'Kliknij punkt, a następnie oś symetrii (punkt, odcinek lub prostą).',
    tangent: 'Kliknij punkt i okrąg — narzędzie utworzy styczną w tym punkcie (lub dwie styczne, jeżeli wskazany punkt leży poza okręgiem).',
    perpBisector: 'Wskaż dwa punkty lub odcinek — powstanie symetralna.',
    ngon: 'Klikając w dwa punkty narysuj bok, następnie wybierz liczbę boków, aby umieścić wielokąt foremny.',
    handwriting: 'Narzędzie pisma odręcznego.'
  },
  menu: {
    clearAll: 'Usuwa wszystkie obiekty z aktualnego dokumentu. W razie czego przycisk COFNIJ przywróci.',
    showHidden: 'Przełącza widoczność obiektów oznaczonych jako ukryte (punkty pomocnicze, pomocnicze linie).',
    showMeasurements: 'Pokazuje/ukrywa etykiety pomiarów (długości i kąty). Pierwsze kliknięcie w pustą etykietę i nadanie długości pozwala ustalić skalę. Pozostałe długości przeliczą się odpowiednio.',
    copyImage: 'Kopiuje konstrukcję do schowka jako PNG.',
    saveImage: 'Zapisuje konstrukcję jako plik PNG.',
    invertColors: 'Dostosowuje kolory konstrukcji, przydatne przy wczytywaniu plików utworzonych w innej kolorystyce.',
    debug: 'Otwiera panel z listą wszystkich obiektów (przydatne do diagnostyki).',
    settings: 'Otwiera panel konfiguracji — tutaj można dostosować interfejs do swoich potrzeb.',
    help: 'Otwiera stronę pomocy z instrukcjami i opisami narzędzi.',
    style: 'Otwiera menu stylu — wybierz kolor, grubość i typ linii oraz sposób wyświetlania punktów.'
    ,
    themeToggle: 'Przełącza jasny/ciemny tryb interfejsu.',
    eraser: 'Włącz narzędzie gumki — kliknij pismo ręczne, aby je usunąć.',
    hideSelected: 'Ukrywa lub pokazuje aktualnie zaznaczone obiekty.',
    copyStyle: 'Kopiuje styl zaznaczonego elementu, kliknij inny element tego samego typu aby wkleić.',
    multiMove: 'Przesuwa wszystkie zaznaczone obiekty jednocześnie.',
    multiClone: 'Klonuje zaznaczone obiekty i pozwala je przesuwać.',
    cloudFiles: 'Otwórz panel z plikami w chmurze.',
    exportJson: 'Zapisuje konstrukcję.',
    bundlePrev: 'Wczytuje poprzednią stronę wielostronicowego pliku.',
    bundleNext: 'Wczytuje następną stronę wielostronicowego pliku.'
    ,
    pointLabelsAuto: 'Automatycznie wyrównuje etykiety punktów względem ich punktów.',
    pointLabelsAway: 'Odsuwa etykiety punktów na zewnątrz, zwiększając odstęp od punktów.',
    pointLabelsCloser: 'Przybliża etykiety do odpowiednich punktów.'
  },
  
  style: {
    pointColor: 'Ustaw kolor zaznaczonego punktu.',
    pointSize: 'Reguluje rozmiar punktu.',
    lineColor: 'Ustaw kolor zaznaczonej linii lub odcinka.',
    lineWidth: 'Reguluje grubość linii/odcinka.',
    lineStyle: 'Wybierz styl kreski: ciągła, przerywana lub kropkowana.',
    angleRadius: 'Zmienia promień oznaczenia kąta.',
    fill: 'Jeśli obiekt obsługuje wypełnienie, wybierz jego kolor i stopień wypełnienia.'
  },
  config: {
    generalHints: 'Pokaż podpowiedzi — gdy włączone, aplikacja wyświetla krótkie wskazówki kontekstowe.',
    buttons: 'Konfigurator przycisków pozwala zmieniać ich kolejność oraz grupować je w multiprzyciski lub przyciski dwurzędowe.',
    appearance: 'Tutaj zmieniasz motyw, kolory, rozmiary i ustawienia wyglądu.',
    precision: 'Ustaw precyzję wyświetlania długości i kątów (liczba miejsc po przecinku).',
    importExport: 'Eksportuj lub wczytaj konfigurację w celu migracji ustawień między instalacjami.'
  }
};

export default HINTS;
