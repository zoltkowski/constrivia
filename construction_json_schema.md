# Schemat pliku konstrukcji (PersistedDocument)

Plik JSON, który aplikacja potrafi wczytać/zapisać, ma korzeń typu `PersistedDocument`.


## PersistedModel
```jsonc
{
  "points"?: [ /* PersistedPoint */ ],
  "lines"?:  [ /* PersistedLine */ ],
  "circles"?:[ /* PersistedCircle */ ],
  "angles"?: [ /* PersistedAngle */ ],
  "polygons"?:[ /* PersistedPolygon */ ],
  "inkStrokes"?: [ /* InkStroke */ ],
  "labels"?: [ /* FreeLabel */ ],
  "idCounters"?: { /* Partial<Record<GeometryKind,number>> */ }
}
```

### PersistedPoint
```jsonc
{
  "id": "p1",
  "object_type": "point",
  "x": 0,
  "y": 0,
  "style": PointStyle,
  "label"?: Label,
  "construction_kind": string,             // np. "free", "midpoint", itp.
  "defining_parents": [string],
  "parent_refs": ConstructionParent[],
  "midpoint"?: MidpointMeta,
  "bisect"?: BisectMeta,
  "symmetric"?: SymmetricMeta,
  "parallel_helper_for"?: string,
  "perpendicular_helper_for"?: string
}
```

### PersistedLine
```jsonc
{
  "id": "l1",
  "object_type": "line",
  "points": [pointIndex, ...],              // indeksy punktów w tablicy points
  "defining_points": [pointIndexA, pointIndexB],
  "segmentStyles"?: [StrokeStyle],          // dla wielosegmentowych linii
  "segmentKeys"?: [string],
  "leftRay"?: StrokeStyle,                  // styl promienia lewego
  "rightRay"?: StrokeStyle,                 // styl promienia prawego
  "style": StrokeStyle,
  "label"?: Label,
  "hidden"?: boolean,
  "construction_kind": string,
  "defining_parents": [string],
  "parallel"?: ParallelLineMeta,
  "perpendicular"?: PerpendicularLineMeta
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
  "fill"?: "#rrggbb",
  "fillOpacity"?: number,
  "arcStyles"?: [StrokeStyle],
  "label"?: Label,
  "hidden"?: boolean,
  "construction_kind": string,
  "defining_parents": [string]
}
```
lub
```jsonc
{
  ...PersistedCircleBase,
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
  "label"?: Label,
  "hidden"?: boolean,
  "construction_kind": string,
  "defining_parents": [string]
}
```

### PersistedPolygon
```jsonc
{
  "id": "poly1",
  "object_type": "polygon",
  "lines": [lineIndex, ...],                // krawędzie w tablicy lines
  "fill"?: "#rrggbb",
  "fillOpacity"?: number,
  "construction_kind": string,
  "defining_parents": [string]
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
  "color"?: "#rrggbb",
  "fontSize"?: number,          // delta od domyślnej wielkości czcionki etykiet
  "hidden"?: boolean,
  "textAlign"?: "left"|"center"|"right"
}
```

## Style i meta-typy
- `PointStyle`: `{ "color": "#rrggbb", "size": number, "hidden"?: boolean, "hollow"?: boolean }`
- `StrokeStyle`: `{ "color": "#rrggbb", "width": number, "type": "solid"|"dashed"|"dotted", "hidden"?: boolean, "tick"?: 0|1|2|3 }`
- `AngleStyle`: StrokeStyle + `{ "fill"?: "#rrggbb", "arcCount"?: 1|2|3|4, "right"?: boolean, "exterior"?: boolean, "arcRadiusOffset"?: number }`
- `Label`: `{ "text": string, "offset"?: {x:number,y:number}, "color"?: "#rrggbb", "hidden"?: boolean, "fontSize"?: number, "seq"?: { "kind": "upper"|"lower"|"greek", "idx": number }, "textAlign"?: "left"|"center"|"right" }`
- `ConstructionParent`: `{ "id": string, "type": "point"|"line"|"circle"|"angle"|"polygon" }`
- `MidpointMeta`: `{ "parents": [idA,idB], "parentLineId"?: string|null }`
- `BisectMeta`: `{ "parents": [idA,idB], "parentLineId"?: string|null }`
- `SymmetricMeta`: `{ "source": string, "mirror": { "kind": "point", "id": string } | { "kind": "line", "id": string } }`
- `ParallelLineMeta`: `{ "throughPoint": string, "referenceLine": string, "helperPoint": string }`
- `PerpendicularLineMeta`: `{ "throughPoint": string, "referenceLine": string, "helperPoint": string, "helperDistance"?: number, "helperOrientation"?: 1|-1, "helperMode"?: "projection"|"normal" }`

## Uwagi
- Indeksy (`pointIndex`, `lineIndex`, …) odnoszą się do pozycji elementu w odpowiedniej tablicy w `model`.
- Identyfikatory (`id`) są ciągami w stylu `p1`, `l2`, `c3` itd. i są używane w polach relacyjnych (`defining_parents`, `parent_refs`).
- Aplikacja wczytuje również stare pliki zawierające pole `version` (1/2/3) i inne pola legacy, ale zapisuje nowy format bez pola `panOffset`/`zoom`/`labelState` itp.
