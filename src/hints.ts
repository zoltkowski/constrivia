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
    circle3: 'Wskaż trzy punkty na obwodzie albo cały trójkąt, aby narysować okrąg opisany.',
    circle: 'Wskaż środek i punkt na obwodzie albo cały trójkąt, aby narysować okrąg opisany.',
    compass: 'Wskaż odcinek lub dwa punkty, aby przenieść ich długość, a następnie wybierz lub utwórz środek okręgu.',
    triangle: 'Klikając w dwa punkty narysuj podstawę - powstanie trójkąt równoboczny, który możesz deformować ciągnąc za wierzchołki.',
    square: 'Klikając w dwa punkty narysuj podstawę - powstanie kwadrat, który możesz deformować ciągnąc za boki lub wierzchołki.',
    prism: 'Wybierz wielokąt podstawy lub liczbę boków. Cztery boki tworzą sześcian. Kolorowe ikony płaszczyzn przy ścianach pozwalają obracać bryłę, pomarańczowy obraca swobodnie, a zielona strzałka skaluje. Po zaznaczeniu górnej podstawy strzałki przy bokach służą do pochylania, a pionowa strzałka zmienia wysokość. Dwuklik żółtego uchwytu przywraca widok przestrzenny. Obrót zachowuje zaznaczenie. Trzy kłódki niezależnie blokują kształt podstawy, pochylenie i wysokość podczas edycji.',
    pyramid: 'Wybierz wielokąt podstawy lub liczbę boków. Kliknij płótno, aby dodać ostrosłup. Po zaznaczeniu wierzchołka pionowa strzałka zmienia wysokość. Dwuklik żółtego uchwytu przywraca widok przestrzenny. Obrót zachowuje zaznaczenie. Trzy kłódki niezależnie blokują kształt podstawy, pochylenie i wysokość podczas edycji.',
    section: 'Wskaż trzy różne, niewspółliniowe punkty jednej bryły lub powiązanej grupy 3D. Możesz też klikać krawędzie, aby utworzyć na nich punkty. Powstanie wielokąt przekroju płaszczyzną przez te punkty.',
    polygon: 'Klikaj kolejne wierzchołki; zakończ kliknięciem pierwszego punktu.',
    angle: 'Kliknij dwa ramiona (segmenty o wspólnym punkcie), lub kliknij trzy punkty — zostanie utworzony kąt.',
    bisector: 'Wskaż trzy punkty (drugi jest wierzchołkiem), dwa ramiona lub istniejący kąt — powstanie dwusieczna.',
    midpoint: 'Wskaż dwa końce odcinka lub kliknij odcinek, aby dodać punkt środkowy.',
    symmetric: 'Kliknij punkt, a następnie oś symetrii (punkt, odcinek lub prostą).',
    tangent: 'Kliknij punkt i okrąg — narzędzie utworzy styczną w tym punkcie (lub dwie styczne, jeżeli wskazany punkt leży poza okręgiem).',
    perpBisector: 'Wskaż dwa punkty lub odcinek — powstanie symetralna.',
    ngon: 'Klikając w dwa punkty narysuj bok, następnie wybierz liczbę boków, aby umieścić wielokąt foremny.',
    handwriting: 'Narzędzie pisma odręcznego.'
    ,
    intersection: 'Wskaż dwie proste lub okręgi, wielokąt i prostą albo dwa wielokąty — powstaną wszystkie przecięcia. Dwie płaszczyzny bryły wyznaczą odcinek. Całą figurę wskazujesz kliknięciem w jej wnętrze.'
  },
  menu: {
    showGrid: 'Pokaż lub ukryj kratkę i przyciąganie punktów. Rozmiar pól zmienisz przybliżając lub oddalając płótno. Wygląd kratki ustawisz w Konfiguracja → Wygląd.',
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
    eraser: 'Włącz gumkę i przeciągaj po piśmie ręcznym, aby je usuwać. Pozostaje włączona do ponownego kliknięcia.',
    hideSelected: 'Ukrywa lub pokazuje aktualnie zaznaczone obiekty.',
    copyStyle: 'Kopiuje styl zaznaczonego elementu, kliknij inny element tego samego typu aby wklej.',

    multiMove: 'Przesuwa wszystkie zaznaczone obiekty jednoczesnie.',

    multiHide: 'Ukrywa wszystkie zaznaczone obiekty.',
    multiClone: 'Kopiuje zaznaczenie z własnymi zależnościami. Bryły powiązane w jednej grupie 3D kopiują się razem. Kliknij ponownie, aby wkleić.',
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
