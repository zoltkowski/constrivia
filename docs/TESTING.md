# Testing construction changes

Run the focused regression suite before and after changes that affect geometry, persistence, or UI and styling behavior used by constructions:

```sh
npm run test:regression
```

This runs every Vitest suite in `test/` with one worker. The permanent classical construction tests load the five reviewed JSON fixtures from `test/fixtures/classical/` and check geometric properties for the centroid, orthocenter, circumcircle, incircle, and tangent constructions as input points move and the construction is transformed. They also check the runtime/engine adapter roundtrip.

After changing the geometry engine or a construction UI path, run the browser construction suite as well:

```sh
npm run test:ui:constructions
```

The browser suite exercises the five constructions through the app UI and writes its verification output under `output/playwright/classical-after-fixes/`. It needs the project's local dependencies, Edge, and the project's Playwright dependency.

The verification mode fails with a nonzero exit code on incorrect geometric invariants, missing transforms, view gestures changing geometry, or invalid tangents remaining available. A diagnostic report alone does not constitute a pass.

Additional browser regressions for related changes:

The common tangent suite (`npm run test:ui:common-tangents`, port 5219) creates two external common tangents from circle clicks or preselection. It checks equal/unequal radii, center/radius movement, native serialization, dependency-complete independent copies, source deletion, Undo/Redo, rejected contained circles and mouse/touch input. Evidence is saved under `output/playwright/common-tangents/`. The companion `commonTangents.test.ts` verifies tangency during repeated deformations, branch loss/recovery and the single internally tangent case.

The inline label suite (`npm run test:ui:labels`, port 5217) checks bold, italic, color and font size on selected text in point, line, angle and free labels. It verifies math source preservation, styled bounds and hit testing, Undo/Redo, typing, clearing part of a style range, native serialization, independent copies, shortcuts and touch controls at 390px. It also checks subscript/superscript palette buttons: template insertion, caret placement inside braces, selected text replacement and inherited formatting with mouse and touch. Evidence is saved under `output/playwright/label-styles/`.

The movement lock suite (`npm run test:ui:movement-lock`, port 5249) verifies that the hamburger toggle starts disabled and prevents dragging 2D/3D objects while retaining selection, construction tools and handwriting. It checks wheel and pinch zoom, allowed touch navigation, continued panning after lifting one finger, mobile menu placement, pen touch restrictions, restored movement after unlocking, and the default state after reload. Evidence is saved under `output/playwright/movement-lock/`.

The groups suite (`npm run test:ui:groups`, port 5248) checks grouping, selection of all members, shared styles, rigid movement and rotation, optional scale locking, native save/load, independent copies, ungrouping and Undo/Redo. It also checks group controls and touch dragging at 390×844. Evidence is saved under `output/playwright/object-groups/`.

The measurements suite (`npm run test:ui:measurements`, port 5220) checks pinning length and angle annotations, live values and positions, fixed calibration, Undo/Redo, manual placement, native reload, independent copies, duplicate prevention and touch. Unit tests also cover source invalidity/recovery and deletion. Evidence is saved under `output/playwright/bound-measurements/`.

The polygon translation suite (`npm run test:ui:polygon-move`, port 5221) drags the four-arrow handle for a whole polygon and an individual side with mouse and touch. It checks rigid translation, stationary unselected vertices, preserved selection, Undo/Redo, movement locking, zoom-independent spacing and attached measurement labels. Evidence is saved under `output/playwright/polygon-move-handles/`.

The solid side suite (`npm run test:ui:solid-face-move`, port 5222) checks the directional move handle on editable prism, pyramid and converted cuboid side faces. It verifies normal-only movement, stationary opposite vertices, preserved height/tilt/anchor, shape locking, selection, Undo/Redo, native reload, mouse/touch input and canceled touch gestures. The companion `spatialFaceMoveHandle.test.ts` covers eligibility, direction and constraints. Evidence is saved under `output/playwright/solid-face-move/`.

```sh
npm run test:ui:theme
npm run test:ui:visibility
npm run test:ui:rays
npm run test:ui:eraser
npm run test:ui:logic
npm run test:ui:groups
npm run test:ui:movement-lock
npm run test:ui:advanced
npm run test:ui:definitions
npm run test:ui:reported
npm run test:ui:compass
npm run typecheck
```

The theme suite (port 5230) verifies light/dark selection, saved preferences, reloads, full browser restarts with an isolated persistent profile, invalid saved values and the theme button state. Evidence is written under `output/playwright/theme-persistence/`.

Visibility tests inspect canvas pixels and hit testing with Show hidden both off and on, and verify save/load recovery without overwriting manual visibility. Ray tests drag a dependent projection across an endpoint and check its hidden interval after reload. Eraser tests use the UI to erase, undo, redo, and make an empty gesture. They check that the eraser stays enabled across mouse and touch gestures, removes all crossed strokes in one history step, and restores writing when toggled off. Evidence is written under `output/playwright/geometry-visibility/`.

The logic suite checks concave polygons, angle measurements, rejected construction input and continuation, unfinished construction history, individual style edits, paste, nearest point selection, hidden selection, intersection target choice, touch gestures and sticky tools. Width-button checks cover mouse and touch holds accelerating from 0.1 to 0.5, stopping on release, resetting on the next press, min/max limits and precise keyboard clicks. Sticky Point tests place three consecutive points using mouse and touch after enabling the lock, both on startup and after rebuilding its button. They also create consecutive points on a line/circle and check Undo/Redo. It checks fit in portrait and landscape, including actual canvas hit targets for scale/rotation handles. Reports are in `output/playwright/logic-review-results.json`.

The advanced suite creates the Euler/nine-point circle, Simson line and secant-power constructions through the UI. It checks input movement, transformations, gestures, saved stages, and geometry availability. Simson dependencies must disappear when their source secant misses the circle and recover when it intersects again. Verification writes generated fixture copies under `output/playwright/advanced-constructions/materials`, preserving canonical educational materials. The companion `advancedConstructions.test.ts` also checks their mathematical properties directly through the engine and adapter.

`npm run typecheck` checks the source TypeScript independently of Vite's build. Browser suites use separate local ports, except `test:ui:logic` and `test:ui:rays`, which both use 5174 and must run sequentially.

The compass suite (port 5189) protects transferred lengths from selected subdivided segments or point pairs, real and new centers, dependency-preserving copies, deletion, Undo/Redo, native reload, styles, annotations, wheel zoom and touch/pinch on a 390×844 viewport. Distance-source checks cover point–line and parallel-line/side inputs, preselection, absence of helper geometry, source movement, loss/recovery of parallelism, native reload and independent copies. It constructs an equilateral triangle through two compass circles and saves a labelled, styled native file. Evidence is written to `output/playwright/compass/`. The companion `compassGeometry.test.ts` and `compassDistances.test.ts` check geometry loss/recovery, dependent perimeter points, complete copy inputs and equilateral geometry as the base moves.

The definitions suite (port 5186) creates angles on subdivided sides and directed rays, a bisector of a point-only angle, a perpendicular bisector without a hidden support line, and fresh tangents without radius line objects. It verifies actual input movement, geometry, Undo/Redo and native file reload. The reported-issues suite (port 5187) creates incircle contacts with the Intersection tool and drags a triangle 25 times, then checks native reload, explicit perpendicular/parallel construction inputs and explicit reflection source selection. Selecting a point and then a side before activating Perpendicular or Parallel must not create a construction; both tools wait for fresh input and support Undo/Redo. Both suites fail on unmet assertions or browser exceptions. The companion `tangentContactStability.test.ts` exercises all three incircle contacts across 80 deformations at three scales.

The grid suite (`npm run test:ui:grid`, port 5193) checks the visible paper, snapping, zoom/pan alignment, preferences, geometry priority and touch. Legacy exact-coordinate fixtures explicitly hide the optional grid.
