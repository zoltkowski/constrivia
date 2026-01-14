# Architecture

This project is split into four layers: UI orchestration, event handling, rendering, and the computational engine. `main.ts` wires them together, while the engine and runtime types define the canonical geometry model and computation rules.

## Layers
- UI: DOM wiring, menus, tool state, and orchestration (`src/main.ts`, `src/ui/*`, `src/configPane.ts`, `src/debugPanel.ts`).
- Events: canvas pointer/mouse/touch handling and drag interactions (`src/canvas/events.ts`, `src/canvas/handlers.ts`, `src/canvas/selection.ts`, `src/canvas/hitTesting.ts`, `src/canvas/handles.ts`).
- Rendering: canvas drawing and style resolution (`src/canvas/renderer.ts`, `src/canvas/sceneRenderer.ts`, `src/styleMapper.ts`).
- Engine: geometry computations and action-based mutations (`src/core/engine.ts`, `src/core/engineActions.ts`, `src/core/runtimeTypes.ts`, `src/core/lineProjection.ts`, `src/core/modelToRuntime.ts`).

## File responsibilities
- `src/main.ts`: UI entry point; manages tool state, selection, and delegates to renderer, handlers, and engine helpers.
- `src/core/runtimeTypes.ts`: Canonical runtime object shapes (points/lines/circles/polygons/angles) and shared metadata.
- `src/core/engine.ts`: Geometry computations, construction rules, and runtime helpers used by UI and renderer.
- `src/core/engineActions.ts`: Action-based engine mutations (add/update/delete) and model/index helpers.
- `src/core/angleTools.ts`: Angle geometry utilities and leg resolution helpers shared by renderer/tools.
- `src/core/lineConstraints.ts`: Line constraint helpers for keeping on-line points aligned during drags.
- `src/core/lineProjection.ts`: Line projection logic for recomputing points that reference a line.
- `src/core/lineTools.ts`: Line utilities used by tools (hit testing, length, and type guards).
- `src/core/polygonTools.ts`: Polygon helpers for vertex ordering, edges, and hit selection.
- `src/core/modelToRuntime.ts`: Adapter from the editable model to `ConstructionRuntime`.
- `src/core/hitTypes.ts`: Shared hit-test types for selection and tool routing.
- `src/core/refactorHelpers.ts`: Compatibility helpers for resolving ids/indices during refactor.
- `src/core/segmentKeys.ts`: Segment/ray selection key helpers.
- `src/canvas/renderer.ts`: Low-level canvas drawing for objects, labels, and selection handles.
- `src/canvas/sceneRenderer.ts`: Scene-level orchestration of renderer passes and draw order.
- `src/canvas/axisSnaps.ts`: Axis-snap computations for rotation/drag hints.
- `src/canvas/lineExtent.ts`: Line extent helper for UI handle placement and snapping.
- `src/canvas/handlers.ts`: Pointer-move drag/transform logic shared by UI modes.
- `src/canvas/hitTesting.ts`: Point/line hit testing utilities for tool interactions.
- `src/canvas/handles.ts`: Scale/rotate handle placement helpers.
- `src/canvas/selection.ts`: Polygon hit-testing helpers for selection.
- `src/canvas/events.ts`: Event registration and pointer routing for the canvas element.
- `src/styleMapper.ts`: Resolves runtime styles into concrete render styles with defaults.
- `src/files.ts`: Import/export and file persistence helpers.
- `src/state/interactionState.ts`: Captures transient interaction state for tools and gestures.
- `src/state/selectionState.ts`: Selection snapshot data for undo/redo and UI sync.
- `src/state/viewState.ts`: Camera/viewport state (zoom, pan, etc).
- `src/configPane.ts`: Configuration UI for tool settings and options.
- `src/debugPanel.ts`: Debug overlay panel and formatting for model/runtime inspection.
- `src/ui/initUi.ts`: UI initialization for toolbars and buttons.
- `src/ui/uiRefs.ts`: Centralized DOM references for UI controls.
- `src/hints.ts` / `src/hints.en.ts`: User hint strings and tutorial prompts.
- `src/i18n/index.ts`: Language bindings and localized string lookup.
- `src/ui.pl.ts` / `src/ui.en.ts`: Localized UI labels.
