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

The multipage suite (`npm run test:ui:multipage`, port 5253) enables the document toggle, clones and edits pages, preserves per-page Undo/Redo and viewport, deletes pages, and checks both outcomes of the disable warning. It saves actual CTR bytes through the local file controls and a stubbed cloud endpoint, opens those files through the file panel, exports a single page, and loads a legacy multi-JSON archive. It checks navigation and the save scope at 390px. Evidence is saved under `output/playwright/multipage/`; `multipageDocument.test.ts` checks the native envelope, ordering, independent data and validation.

The same suite saves and reopens a three-page CTR with a plain page and two pages with different animation settings for the same point ID. It checks page-local edits, player visibility, ready playback, current-page exports, and whole-document saves with either a plain or animated active page.

`node scripts/regression/verify-file-sorting.cjs` checks the single local Name/Time toggle, newest-first local ordering, retained selection and preferences, folder changes, alphabetical cloud/library lists without sort controls, ignored legacy cloud preferences, desktop/mobile placement, dragging the file panel and toggling sorting by touch. It saves and reopens a CTR using the timestamp-only default filename with a space, checks that resaving retains the name, and verifies the cloud save request and archive entry. Cloud requests and local directory handles are simulated. Screenshots are stored under `output/playwright/file-sorting/`. `fileSorting.test.ts` covers comparison rules; `cloudFileMetadata.test.ts` verifies that modification metadata is saved with unmodified CTR bytes in one cloud write.

`node scripts/regression/verify-animation.cjs` checks point selection, per-point speed values when selection changes while the input remains focused, direction arrow, player controls, endpoint handling, synchronized loop reversal, traces and rolling/nested moving circles. It saves actual CTR bytes and reloads the animation metadata, checking ready controls, an explicitly disabled mode, and the exclusion of traces and playback state. It also exercises real dragging during a preview, Undo and page navigation. `animationSettings.test.ts` covers validation and per-page metadata; `pointAnimation.test.ts` protects path eligibility, initial orientation and dependency order. `node scripts/regression/verify-point-trace.cjs` checks recording, clearing and disabling a dependent point's trace through the actual style menu. Screenshots are written under `output/playwright/animation/`.

`node scripts/regression/verify-circle-attachment.cjs` builds a compass circle and adds a constrained point with the actual tools, then checks center/perimeter dragging and Undo/Redo with mouse and touch. It also animates the center and radius point of a second circle at equal speed, checking the passive point's relative offset and trace, Stop and save/reload. Screenshots are under `output/playwright/circle-attachment/`. `circleAttachment.test.ts` covers both driver orders, computed centers, three-point circles, radius changes and independent intersection constraints.

`node scripts/regression/verify-animation-player.cjs` exercises the desktop and 390px touch UI: switching between two points with independent speeds in the actual point style menu, Open/Save hidden during selection and restored after deselection, the separate Play/Pause and Stop buttons, Stop before motion and after Step, during playback and at the endpoint, clearing all traces and restoring the baseline, 0.1-second Step with smooth traces, endpoint reset and Loop. Screenshots are stored under `output/playwright/animation-player/`.

`node scripts/regression/verify-animation-toolbar.cjs` calibrates a segment as length 10 through the actual measurement input and checks a full traversal at speed 5 in two simulated seconds and approximately two seconds of playback, including a delayed clock callback. Without calibration, it checks a three-second screen traversal at speed 1 at multiple zoom levels on desktop and mobile, with stable speed through zoom changes and resizing during a run. It covers calibrated circular motion and mouse/touch dragging, position persistence, keyboard movement, viewport clamping and responsive Loop visibility. Screenshots are stored under `output/playwright/animation-toolbar/`; `animationToolbar.test.ts` checks placement bounds.

`node scripts/regression/verify-animation-responsive.cjs` verifies docking versus floating across widths 220–1440 px, with mouse and touch, selected points and multipage documents. It compares the exact bounds and DOM parents of Open/Save before and after repeated animation toggles and deselection, checks that selection hides both actions while real tool-button clicks keep them visible in both modes, and checks all visible main actions and every player button for visible bounds and hit targets. It checks the order of contextual actions, page navigation and the docked player, the exact one-pixel layout transition and resize during playback. Screenshots for wide and narrow layouts are stored under `output/playwright/animation-responsive/`. The toolbar regression also verifies that a saved dragged position does not prevent docking and is restored when space becomes narrow again.

The common tangent suite (`npm run test:ui:common-tangents`, port 5219) creates two external common tangents from circle clicks or preselection. It checks equal/unequal radii, center/radius movement, native serialization, dependency-complete independent copies, source deletion, Undo/Redo, rejected contained circles and mouse/touch input. Evidence is saved under `output/playwright/common-tangents/`. The companion `commonTangents.test.ts` verifies tangency during repeated deformations, branch loss/recovery and the single internally tangent case.

The inline label suite (`npm run test:ui:labels`, port 5217) checks bold, italic, color and font size on selected text in point, line, angle and free labels. It verifies math source preservation, styled bounds and hit testing, Undo/Redo, typing, clearing part of a style range, native serialization, independent copies, shortcuts and touch controls at 390px. It also checks subscript/superscript palette buttons: template insertion, caret placement inside braces, selected text replacement and inherited formatting with mouse and touch. Evidence is saved under `output/playwright/label-styles/`.

The movement lock suite (`npm run test:ui:movement-lock`, port 5249) verifies that the hamburger toggle starts disabled and prevents dragging 2D/3D objects while retaining selection, construction tools and handwriting. It checks wheel and pinch zoom, allowed touch navigation, continued panning after lifting one finger, mobile menu placement, pen touch restrictions, restored movement after unlocking, and the default state after reload. Evidence is saved under `output/playwright/movement-lock/`.

The groups suite (`npm run test:ui:groups`, port 5248) checks grouping, selection of all members, shared styles, rigid movement and rotation, optional scale locking, native save/load, independent copies, ungrouping and Undo/Redo. It also checks group controls and touch dragging at 390×844. Evidence is saved under `output/playwright/object-groups/`.

The handwriting suite (`npm run test:ui:handwriting`, port 5267) checks automatic grouping through actual mouse and touch strokes, separated words and tightly spaced writing lines, native save/load, whole-group selection, ungrouping and Undo/Redo. `handwritingGrouping.test.ts` also covers screen-sized gaps, dots, equals signs, writing pauses, long strokes and explicit group changes.

The measurements suite (`npm run test:ui:measurements`, port 5220) checks pinning length and angle annotations, live values and positions, fixed calibration, Undo/Redo, manual placement, native reload, independent copies, duplicate prevention and touch. Unit tests also cover source invalidity/recovery and deletion. Evidence is saved under `output/playwright/bound-measurements/`.

The polygon translation suite (`npm run test:ui:polygon-move`, port 5221) drags the four-arrow handle for a whole polygon and an individual side with mouse and touch. It checks rigid translation, stationary unselected vertices, preserved selection, Undo/Redo, movement locking, zoom-independent spacing and attached measurement labels. Evidence is saved under `output/playwright/polygon-move-handles/`.

The solid side suite (`npm run test:ui:solid-face-move`, port 5222) checks the directional move handle on editable prism, pyramid and converted cuboid side faces. It verifies normal-only movement, stationary opposite vertices, preserved height/tilt/anchor, shape locking, selection, Undo/Redo, native reload, mouse/touch input and canceled touch gestures. The companion `spatialFaceMoveHandle.test.ts` covers eligibility, direction and constraints. Evidence is saved under `output/playwright/solid-face-move/`.

The spatial rotation suite (`npm run test:ui:spatial-rotation`, port 5209) also checks the small move handle beside the rotation panel. Mouse and touch drags move the panel without changing geometry or component selection. Checks cover Undo/Redo, canceled touch movement, native reload and using the relocated rotation controls. Evidence is saved under `output/playwright/spatial-rotation/`.

The object symmetry suite (`npm run test:ui:symmetry`, port 5251) reflects points, segments, circles, polygons and mixed groups, including text and handwriting. It checks source and mirror movement, read-only images, Undo/Redo, native reload, independent copies, mirror deletion and touch input. The companion `objectSymmetry.test.ts` also covers construction input closure, independent line directions, transferred radii, arc styles, validity recovery and projected solid geometry. Evidence is saved under `output/playwright/object-symmetry/`.

The inversion suite (`npm run test:ui:inversion`, port 5252) selects a circle as the second Symmetry input. It checks exact segment arcs, hidden complements, two rays across the pole, circle/line transitions, half-plane fills, mixed groups, source/radius movement, read-only images, Undo/Redo, native reload, independent copies, pole recovery, deletion and touch. The companion `inversion.test.ts` verifies reciprocal distances, curved polygon regions, tangent angles and compositions of inversions/reflections. Evidence is saved under `output/playwright/inversion/`.

The tool extensions suite (`npm run test:ui:tool-extensions`, port 5205) distinguishes whole-triangle shortcuts: Circle creates the incircle, while Three-point Circle creates the circumcircle. It checks body clicks and preselection, vertex movement, the fixed computed incenter, native reload, Undo/Redo and a 390px viewport. The companion `triangleIncircle.test.ts` checks tangency, degeneracy and recovery, contact intersections, independent copying and symmetry.

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
