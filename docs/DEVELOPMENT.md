# Working on Constrivia

The main project directory is the canonical checkout. Its `main` branch and GitHub's `main` must contain the same latest application after publication.

Work in the main checkout by default. A temporary worktree is only for a short-lived experiment or integration: bring completed changes back into the main checkout before publishing and remove the temporary checkout afterward. Do not keep publishing from a separate worktree while the main directory stays behind.

Before publishing, incorporate all completed local changes, run the appropriate regressions, and check the staged changes. Publish from the main checkout with a normal fast-forward push; never overwrite remote history. Afterward, compare `git rev-parse HEAD` with `git rev-parse origin/main` and confirm that `git status --short` is clean.

Source, public examples, reusable construction materials, tests, and maintained documentation belong in Git. Generated files under `output/`, dated audit reports, local status reports, dependency/build directories, logs, and duplicate ZIP archives are ignored. Ignored files remain available locally.

The older pre-consolidation local state is retained in Git history through the safety branch `codex/backup-local-20261016-grid`; it is a recovery snapshot, not a development checkout.

See [TESTING.md](TESTING.md) for construction regression checks.

Multipage CTR files contain one JSON document with ordered `pages` and a zero-based `activePage`. Every page is a normal construction document; the active page is also present at the top level for single-page reader compatibility. A single-page export omits both fields. Legacy CTR archives containing multiple JSON files remain supported and open as editable pages. Page edits and their independent Undo/Redo histories are retained while browsing in the current session; saved files contain page content, not edit history. Turning off the multipage toggle requires confirmation and discards all pages and their history.

Points constrained to a finite segment or circle can be assigned a nonnegative speed in drawing units per second and a direction in the point style menu. The animation toolbar always contains Open, Save, one Play/Pause/Stop control, Step and Loop, even with a point selected. The main control shows Pause while playing, Play while paused and Stop after reaching an endpoint; Stop restores the starting pose. Step pauses playback and advances one second using 60 substeps, retaining smooth traces. Reaching an endpoint by playback or Step changes the main control to Stop; Loop instead reverses all directions at that instant. Motion inputs are evaluated before dependent moving paths, and a segment's positive endpoint order stays fixed during the run. Cyclic motion dependencies cannot be played; conflicting endpoint directions or an excessive number of reversals end the preview instead of spinning or silently dropping time.

Stop restores the geometry from the start of the run and clears all point traces. Canvas interaction pauses playback; a construction edit then commits the visible pose as a normal history entry and ends the preview. Editing speed or direction in a paused preview also commits that pose as the new starting point. Undo/Redo first ends the preview, and navigating to another page restores the starting pose before saving that page's session. History jumps break trace paths instead of drawing a spurious connecting line.

CTR files retain motion speeds, directions, loop and enabled state in optional per-page `animation` metadata. Older metadata without `enabled` defaults to enabled. Loading enables the controls unless the page was explicitly saved with animation off; playback never starts automatically. A multipage file may mix plain and animated pages; the player and toggle always follow the current page. The top-level animation metadata only mirrors the active page for compatibility. Trace settings and samples, the playback clock and the Stop snapshot are session-only.

Local and cloud file lists remember separate name/date sort preferences. Date order uses local `File.lastModified` or the cloud key's `metadata.modifiedAt` (milliseconds since epoch), newest first; missing dates sort last, with name as the tie break. Cloud writes store the timestamp and binary file value together in one KV multipart PUT. Existing cloud files acquire a date on their next save; expiration is never treated as a modification time. The library always sorts by name.
