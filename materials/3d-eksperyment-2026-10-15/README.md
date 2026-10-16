# Przykłady eksperymentu 3D

Materiały do lokalnego testowania brancha `codex/cube-3d-experiment` z 15 października 2026. Otwieraj pliki `.ctr` w aplikacji przez panel plików. To przykłady działania narzędzi i ich zależności, jeszcze nie gotowe lekcje.

- `graniastoslupy-i-przekroje.ctr`: zestaw graniastosłupów i ostrosłupów, przekrój równoległy, przekrój przez trzy punkty, wysokość i ostrosłup ścięty.
- `deformacja-i-ostroslup-sciety.ctr`: zmiana kształtu podstawy graniastosłupa oraz ostrosłup z przekrojem przez punkt środkowy krawędzi bocznej i ukrytym wierzchołkiem.

Próbuj obracać i przesuwać bryły, zmieniać wysokość, przesuwać swobodne punkty na krawędziach, cofać i ponawiać zmiany oraz zapisywać i ponownie otwierać pliki. Punkty środkowe zachowują parametr 1/2. Podstawy współdzielone z inną konstrukcją zachowują jej zależności.

Obliczenia, style, etykiety i wczytywanie tych scenariuszy chronią testy `test:ui:spatial`, `test:ui:polyhedra` oraz `test:ui:solid-editing`. Pełny raport: `docs/experiments/3d-audit-2026-10-15.md`.

Materiały pozostają lokalne i nie są częścią publikacji aplikacji.
