export const UI_PL: Record<string, { text?: string; title?: string; placeholder?: string; aria?: string }> = {
  multipageDocumentBtn: {title:'Dokument wielostronicowy',aria:'Dokument wielostronicowy'},
  cloudPageScopeLabel: {text:'Zapisz'},
  cloudPageScope: {aria:'Zakres zapisu'},
  cloudPageScopeAll: {text:'Wszystkie strony'},
  cloudPageScopeCurrent: {text:'Aktualna strona'},
  labelSubscriptBtn: { title: 'Indeks dolny', aria: 'Indeks dolny' },
  labelSuperscriptBtn: { title: 'Indeks górny', aria: 'Indeks górny' },
  solidShadowLabel: { text: 'Intensywność cienia' },
  customColorIntensityLabel: { text: 'Intensywność' },
  settingsTitle: { text: 'Konfiguracja' },
  tabBtnGeneral: { text: 'Ogólne' },
  tabBtnButtons: { text: 'Przyciski' },
  tabBtnAppearance: { text: 'Wygląd' },
  showHintsLabel: { text: 'Pokaż podpowiedzi' },
  autoStyleMenuLabel: { text: 'Automatycznie otwieraj styl' },
  pointBasedConstructionModeLabel: { text: 'Tryb konstrukcyjny' },
  pointBasedConstructionModeDescription: { text: 'Punkty swobodne stawiaj narzędziem Punkt. Narzędzia geometryczne wymagają wskazania istniejących punktów lub obiektów; graniastosłupy i ostrosłupy możesz tworzyć kliknięciem w płótno.' },
  objectMovementLockBtn: { title: 'Blokada przesuwania obiektów', aria: 'Blokada przesuwania obiektów' },
  penTouchModeLabel: { text: 'Tryb pióra: ogranicz dotyk' },
  penTouchAllowZoomLabel: { text: 'Gesty zoom' },
  penTouchAllowPanLabel: { text: 'Gesty przesuwania' },
  penTouchOnlyInPenModeLabel: { text: 'Tylko w trybie pióra' },
  languageLabel: { text: 'Język' },
  exportConfigText: { text: 'Eksportuj konfigurację' },
  importConfigText: { text: 'Importuj konfigurację' },
  settingsCloseBtn: { title: 'Zamknij', aria: 'Zamknij' },
  settingsBtn: { title: 'Konfiguracja', aria: 'Konfiguracja' },
  helpBtn: { title: 'Pomoc', aria: 'Pomoc' },
  modeMove: { title: 'Zaznacz', aria: 'Zaznacz' },
  modeCompass: { title: 'Cyrkiel', aria: 'Cyrkiel' },
  modeMultiselect: { title: 'Zaznacz wiele', aria: 'Zaznacz wiele' },
  modeLabel: { title: 'Etykieta', aria: 'Etykieta' }
};

// Additional settings translations
Object.assign(UI_PL, {
  precisionTitle: { text: 'Precyzja wymiarów' },
  precisionLengthLabel: { text: 'Długości:' },
  precisionAngleLabel: { text: 'Kątów:' },
  exportImportTitle: { text: 'Eksport i Import' },
  exportImportDesc: { text: 'Zapisz lub wczytaj pełną konfigurację aplikacji.' },
  themeDarkText: { text: 'Ciemny' },
  themeLightText: { text: 'Jasny' },
  defaultColorsTitle: { text: 'Domyślne kolory' },
  themeBgLabel: { text: 'Kolor tła:' },
  showGridBtn: { title: 'Pokaż/ukryj kratkę', aria: 'Pokaż/ukryj kratkę' },
  gridTitle: { text: 'Tło w kratkę' },
  gridColorLabel: { text: 'Kolor kratek:' },
  gridOpacityLabel: { text: 'Intensywność:' },
  gridWidthLabel: { text: 'Grubość:' },
  gridDotsLabel: { text: 'Tylko punkty przecięcia:' },
  gridHelp: { text: 'Rozmiar kratek zmienisz przybliżając lub oddalając płótno. Widoczna kratka przyciąga punkty; ukryta wyłącza przyciąganie.' },
  gridVisibleLabel: { text: 'Tło' },
  themePanelLabel: { text: 'Kolor okna:' },
  themeStrokeLabel: { text: 'Kolor linii:' },
  themeHighlightLabel: { text: 'Kolor zaznaczenia:' },
  themeSelectionLineStyleLabel: { text: 'Styl linii zaznaczenia:' },
  themeSelectionEffectLabel: { text: 'Efekt zaznaczenia:' },
  themeHighlightWidthLabel: { text: 'Szerokość zaznaczenia:' },
  themeSelectionPointStyleSameAsLine: { text: 'Styl punktu jak linii:' },
  themeSelectionPointRadiusLabel: { text: 'Promień zaznaczenia punktu:' }
});

Object.assign(UI_PL, {
  previewTitle: { text: 'Podgląd' },
  defaultSizesTitle: { text: 'Domyślne rozmiary' },
  themeLineWidthLabel: { text: 'Grubość linii:' },
  themePointSizeLabel: { text: 'Rozmiar punktu:' },
  themeArcRadiusLabel: { text: 'Promień łuku kąta:' },
  themeLabelFontSize: { text: 'Rozmiar czcionki etykiet:' }
});

Object.assign(UI_PL, {
  styleMenu: { title: 'Styl zaznaczenia', aria: 'Styl zaznaczenia' },
  viewVerticesOption: { title: 'Wierzchołki', aria: 'Wierzchołki' },
  viewEdgesOption: { title: 'Krawędzie', aria: 'Krawędzie' },
  styleTickToggle: { title: 'Znacznik zgodności', aria: 'Znacznik zgodności' },
  rayLeftOption: { title: 'Lewa półprosta', aria: 'Lewa półprosta' },
  rayRightOption: { title: 'Prawa półprosta', aria: 'Prawa półprosta' },
  raySegmentOption: { title: 'Odcinek', aria: 'Odcinek' },
  viewCirclePointsOption: { title: 'Punkty', aria: 'Punkty' },
  viewCircleLineOption: { title: 'Okrąg', aria: 'Okrąg' },
    customColorBtn: { title: 'Inny kolor', aria: 'Inny kolor' },
    pointHollowToggleBtn: { title: 'Pusty punkt', aria: 'Pusty punkt' },
    exteriorAngleBtn: { title: 'Kąt wklęsły', aria: 'Kąt wklęsły' },
    fillToggleBtn: { title: 'Wypełnienie', aria: 'Wypełnienie' },
    polygonLockToggleBtn: { title: 'Blokada kształtu', aria: 'Blokada kształtu' },
    solidHeightLockBtn: { title: 'Zablokuj wysokość', aria: 'Zablokuj wysokość' },
    labelGreekToggle: { title: 'Klawiatura symboli', aria: 'Klawiatura symboli' },
  labelFontDecrease: { title: 'Zmniejsz rozmiar tekstu', aria: 'Zmniejsz rozmiar tekstu' },
  labelFontIncrease: { title: 'Zwiększ rozmiar tekstu', aria: 'Zwiększ rozmiar tekstu' },
  labelAlignToggle: { title: 'Wyrównanie etykiety (lewo / środek)', aria: 'Wyrównanie etykiety' },
  labelGreekShift: { title: 'Wielkie litery', aria: 'Wielkie litery' },
  labelScriptToggle: { title: 'Latin script', aria: 'Latin script' },
  lineWidthDecrease: { title: 'Zmniejsz grubość', aria: 'Zmniejsz grubość' },
  lineWidthIncrease: { title: 'Zwiększ grubość', aria: 'Zwiększ grubość' },
  angleRadiusDecreaseBtn: { title: 'Zmniejsz promień łuku', aria: 'Zmniejsz promień łuku' },
  angleRadiusIncreaseBtn: { title: 'Zwiększ promień łuku', aria: 'Zwiększ promień łuku' },
  rightAngleBtn: { title: 'Kąt prosty', aria: 'Kąt prosty' },
  pointLabelsAutoBtn: { title: 'Wyrównaj etykiety', aria: 'Wyrównaj etykiety' },
  pointLabelsAwayBtn: { title: 'Odsuń etykiety', aria: 'Odsuń etykiety' },
  pointLabelsCloserBtn: { title: 'Przysuń etykiety', aria: 'Przysuń etykiety' },
  labelToolsOverflowBtn: { title: 'Więcej', aria: 'Więcej' },
  eraserBtn: { title: 'Gumka', aria: 'Gumka' },
  hideButton: { title: 'Ukryj/Pokaż zaznaczone', aria: 'Ukryj/Pokaż zaznaczone' },
  copyStyleBtn: { title: 'Kopiuj/Wklej styl', aria: 'Kopiuj/Wklej styl' },
  multiMoveBtn: { title: 'Przesuń zaznaczone', aria: 'Przesuń zaznaczone' },
  multiHideBtn: { title: 'Ukryj zaznaczone', aria: 'Ukryj zaznaczone' },

  multiCloneBtn: { title: 'Klonuj zaznaczone', aria: 'Klonuj zaznaczone' },
  cloudFilesBtn: { title: 'Pliki w chmurze', aria: 'Pliki w chmurze' },
  exportJsonBtn: { title: 'Zapisz (CTR)', aria: 'Zapisz (CTR)' },
  bundlePrevBtn: { title: 'Poprzedni plik', aria: 'Poprzedni plik' },
  bundleNextBtn: { title: 'Następny plik', aria: 'Następny plik' },
  deletePoint: { title: 'Usuń zaznaczone', aria: 'Usuń zaznaczone' },
  undo: { title: 'Cofnij', aria: 'Cofnij' },
  redo: { title: 'Ponów', aria: 'Ponów' },
  zoomMenu: { title: 'Opcje', aria: 'Opcje' },
  clearAll: { title: 'Wyczyść wszystko', aria: 'Wyczyść wszystko' },
  showHiddenBtn: { title: 'Pokaż ukryte', aria: 'Pokaż ukryte' },
  showMeasurementsBtn: { title: 'Pokaż wymiary', aria: 'Pokaż wymiary' },
  copyImageBtn: { title: 'Kopiuj obraz (PNG)', aria: 'Kopiuj obraz' },
  saveImageBtn: { title: 'Zapisz PNG', aria: 'Zapisz PNG' },
  invertColorsBtn: { title: 'Odwróć kolory', aria: 'Odwróć kolory' },
  settingsBtn: { title: 'Konfiguracja', aria: 'Konfiguracja' },
  helpBtn: { title: 'Pomoc', aria: 'Pomoc' },
  themeDark: { title: 'Tryb ciemny', aria: 'Tryb ciemny' },
  cloudCloseBtn: { title: 'Zamknij panel plików', aria: 'Zamknij panel plików' },
  settingsCloseBtn: { title: 'Zamknij', aria: 'Zamknij' },
  exportConfigBtn: { title: 'Eksportuj konfigurację', aria: 'Eksportuj konfigurację' },
  importConfigBtn: { title: 'Importuj konfigurację', aria: 'Importuj konfigurację' },
  pointStyleToggleBtn: { title: 'Styl punktów', aria: 'Styl punktów' },

  // mode buttons
  modeMove: { title: 'Zaznacz', aria: 'Zaznacz' },
  modeMultiselect: { title: 'Zaznacz wiele', aria: 'Zaznacz wiele' },
  modeLabel: { title: 'Etykieta', aria: 'Etykieta' },
  modeAdd: { title: 'Dodaj punkt', aria: 'Punkt' },
  modeSegment: { title: 'Odcinek', aria: 'Odcinek' },
  modeParallel: { title: 'Równoległa', aria: 'Równoległa' },
  modePerpendicular: { title: 'Prostopadła', aria: 'Prostopadła' },
  modeCircle: { title: 'Okrąg', aria: 'Okrąg' },
  modeCircleThree: { title: 'Okrąg przez 3 punkty', aria: 'Okrąg przez 3 punkty' },
  modeTriangleUp: { title: 'Trójkąt foremny', aria: 'Trójkąt foremny' },
  modeSquare: { title: 'Kwadrat', aria: 'Kwadrat' },
  modePolygon: { title: 'Wielokąt', aria: 'Wielokąt' },
  modeNgon: { title: 'n-gon', aria: 'n-gon' },
  modeAngle: { title: 'Kąt', aria: 'Kąt' },
  modeBisector: { title: 'Dwusieczna', aria: 'Dwusieczna' },
  modeMidpoint: { title: 'Punkt środkowy', aria: 'Punkt środkowy' },
  modeSymmetric: { title: 'Symetria', aria: 'Symetria' },
  modeTangent: { title: 'Styczna', aria: 'Styczna' },
  modePerpBisector: { title: 'Symetralna', aria: 'Symetralna' },
  modeHandwriting: { title: 'Pismo odręczne', aria: 'Pismo odręczne' }
});

export default UI_PL;

Object.assign(UI_PL, {
  spatialAppearanceTitle: { text: "Bryły — niewidoczne fragmenty" },
  spatialBackHiddenLabel: { text: "Całkowicie ukryj" },
  spatialBackIntensityLabel: { text: "Intensywność" },
  spatialBackEdgeStyleLabel: { text: "Styl krawędzi" },
  spatialBackDashed: { text: "Przerywane" },
  spatialBackDotted: { text: "Kropkowane" },
  spatialBackSolid: { text: "Ciągłe" }
});

Object.assign(UI_PL, {
  "labelInlineBold": {
    "title": "Pogrubienie fragmentu (Ctrl+B)",
    "aria": "Pogrubienie fragmentu"
  },
  "labelInlineItalic": {
    "title": "Kursywa fragmentu (Ctrl+I)",
    "aria": "Kursywa fragmentu"
  },
  "labelInlineColor": {
    "title": "Kolor fragmentu",
    "aria": "Kolor fragmentu"
  },
  "labelInlineSize": {
    "title": "Rozmiar czcionki fragmentu (px)",
    "aria": "Rozmiar czcionki fragmentu (px)"
  },
  "labelInlineClear": {
    "title": "Wyczyść formatowanie fragmentu",
    "aria": "Wyczyść formatowanie fragmentu"
  },
  "labelInlineHint": {
    "text": "Zaznacz fragment tekstu, aby zmienić jego styl."
  }
});
