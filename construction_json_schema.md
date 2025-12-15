# Schemat pliku konstrukcji (PersistedDocument)

Plik JSON, który aplikacja potrafi wczytać/zapisać, ma korzeń typu `PersistedDocument`.

```jsonc
{
  "model": { /* PersistedModel */ },
  "measurementReferenceSegment"?: { "lineIdx": 0, "segIdx": 0 },
  "measurementReferenceValue"?: 42.0

  // Legacy (stare pliki mogą zawierać te pola, ale nie są już zapisywane):
  // "version": 1|2|3,
  // "panOffset": { "x": 0, "y": 0 },
  // "zoom": 1,
  // "labelState": { /* PersistedLabelState */ },
  // "recentColors": ["#15a3ff", "..."],
  // "showHidden": false
}
```

## PersistedModel
```jsonc
{
  "points"?: [ /* PersistedPoint */ ],
  "lines"?:  [ /* PersistedLine */ ],
  "circles"?:[ /* PersistedCircle */ ],
  "angles"?: [ /* PersistedAngle */ ],
  "polygons"?:[ /* PersistedPolygon */ ],
  "inkStrokes"?: [ /* InkStroke */ ],
  "labels"?: [ /* FreeLabel */ ]

  // Legacy (nie jest już zapisywane):
  // "idCounters"?: { "point": 0, "line": 0, "circle": 0, "angle": 0, "polygon": 0 }
}
```

Uwagi:
- Puste tablice (`[]`) mogą być pomijane: brakujący klucz jest traktowany jak pusta tablica.
- `panOffset`, `zoom`, `labelState`, `recentColors`, `showHidden`, `idCounters` są odtwarzane po wczytaniu i nie są już zapisywane.
- `measurementReferenceSegment` i `measurementReferenceValue` są zapisywane tylko, gdy oba istnieją (nie `null`).

### PersistedPoint
```jsonc
{
  "id": "p1",
  "object_type": "point",
  "x": 0, "y": 0,
  "style": PointStyle,
  "label": Label?,
  "construction_kind": string,             // np. "free", "midpoint", itp.
  "defining_parents": [string],
  "parent_refs": ConstructionParent[],
  "midpoint": MidpointMeta?,
  "symmetric": SymmetricMeta?,
  "parallel_helper_for": string?,
  "perpendicular_helper_for": string?
}
```

### PersistedLine
```jsonc
{
  "id": "l1",
  "object_type": "line",
  "points": [pointIndex, ...],              // indeksy punktów w tablicy points
  "defining_points": [pointIndexA, pointIndexB],
  "segmentStyles": [StrokeStyle]?,          // dla wielosegmentowych linii
  "segmentKeys": [string]?,
  "leftRay": StrokeStyle?,                  // styl promienia lewego
  "rightRay": StrokeStyle?,                 // styl promienia prawego
  "style": StrokeStyle,
  "label": Label?,
  "hidden": false,
  "construction_kind": "free" | "parallel" | "perpendicular" | ...,
  "defining_parents": [string],
  "parallel": ParallelLineMeta?,
  "perpendicular": PerpendicularLineMeta?
}
```

### PersistedCircle
Bazowy kształt (`PersistedCircleBase`) + wariant:
```jsonc
{
  "id": "c1",
  "object_type": "circle",
  "center": pointIndex,
  "radius_point": pointIndex,
  "points": [pointIndex, ...],              // punkty leżące na okręgu
  "style": StrokeStyle,
  "fill": "#rrggbb" | null,
  "fillOpacity": 0.5,
  "arcStyles": [StrokeStyle]?,
  "label": Label?,
  "hidden": false,
  "construction_kind": string,
  "defining_parents": [string],
  "circle_kind": "center-radius"            // wariant 1
}
```
lub
```jsonc
{
  ...circleBase,
  "circle_kind": "three-point",
  "defining_points": [pointIndexA, pointIndexB, pointIndexC]
}
```

### PersistedAngle
```jsonc
{
  "id": "a1",
  "object_type": "angle",
  "leg1": { "line": lineIndex, "seg": segmentIndex },
  "leg2": { "line": lineIndex, "seg": segmentIndex },
  "vertex": pointIndex,
  "style": AngleStyle,
  "label": Label?,
  "hidden": false,
  "construction_kind": string,
  "defining_parents": [string],
}
```

### PersistedPolygon
```jsonc
{
  "id": "poly1",
  "object_type": "polygon",
  "lines": [lineIndex, ...],                // krawędzie w tablicy lines
  "fill": "#rrggbb" | null,
  "fillOpacity": 0.5,
  "construction_kind": string,
  "defining_parents": [string],
}
```

### InkStroke
```jsonc
{
  "points": [ { "x": 0, "y": 0, "pressure": 0.5, "time": 0 }, ... ],
  "color": "#rrggbb",
  "baseWidth": number
}
```

### FreeLabel
Etykiety niezależne od obiektów geometrycznych.
```jsonc
{
  "pos": { "x": 0, "y": 0 },
  "text": "A",
  "color": "#rrggbb",
  "fontSize": 0,          // delta od domyślnej wielkości czcionki etykiet
  "hidden": false,
  "textAlign": "center"
}
```

## Style i meta-typy
- `PointStyle`: `{ "color": "#rrggbb", "size": number, "hidden"?: bool, "hollow"?: bool }`
- `StrokeStyle`: `{ "color": "#rrggbb", "width": number, "type": "solid"|"dashed"|"dotted", "hidden"?: bool, "tick"?: 0|1|2|3 }`
- `AngleStyle`: StrokeStyle + `{ "fill"?: "#rrggbb", "arcCount"?: 1|2|3|4, "right"?: bool, "exterior"?: bool, "arcRadiusOffset"?: number }`
- `Label`: `{ "text": string, "offset"?: {x,y}, "color"?: "#rrggbb", "hidden"?: bool, "fontSize"?: number, "seq"?: { "kind": "upper"|"lower"|"greek", "idx": number }, "textAlign"?: "left"|"center" }`
- `ConstructionParent`: `{ "id": string, "type": "point"|"line"|"circle"|"angle"|"polygon" }`
- `MidpointMeta`: `{ "parents": [idA,idB], "parentLineId"?: string|null }`
- `SymmetricMeta`: `{ "source": string, "mirror": { "kind": "point", "id": string } | { "kind": "line", "id": string } }`
- `ParallelLineMeta`: `{ "throughPoint": string, "referenceLine": string, "helperPoint": string }`
- `PerpendicularLineMeta`: `{ "throughPoint": string, "referenceLine": string, "helperPoint": string, "helperDistance"?: number, "helperOrientation"?: 1|-1, "helperMode"?: "projection"|"normal" }`

## Uwagi
- Indeksy (`pointIndex`, `lineIndex`, …) odnoszą się do pozycji elementu w odpowiedniej tablicy w `model`.
- Identyfikatory (`id`) są ciągami w stylu `p1`, `l2`, `c3` itd. i są używane w polach relacyjnych (`defining_parents`, `parent_refs`).
- Aplikacja wczytuje również stare pliki z polem `version: 1/2/3` (oraz innymi polami legacy), ale zapisuje nowy format bez `version`.
