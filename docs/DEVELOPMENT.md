# Working on Constrivia

The main project directory is the canonical checkout. Its `main` branch and GitHub's `main` must contain the same latest application after publication.

Work in the main checkout by default. A temporary worktree is only for a short-lived experiment or integration: bring completed changes back into the main checkout before publishing and remove the temporary checkout afterward. Do not keep publishing from a separate worktree while the main directory stays behind.

Before publishing, incorporate all completed local changes, run the appropriate regressions, and check the staged changes. Publish from the main checkout with a normal fast-forward push; never overwrite remote history. Afterward, compare `git rev-parse HEAD` with `git rev-parse origin/main` and confirm that `git status --short` is clean.

Source, public examples, reusable construction materials, tests, and maintained documentation belong in Git. Generated files under `output/`, dated audit reports, local status reports, dependency/build directories, logs, and duplicate ZIP archives are ignored. Ignored files remain available locally.

The older pre-consolidation local state is retained in Git history through the safety branch `codex/backup-local-20261016-grid`; it is a recovery snapshot, not a development checkout.

See [TESTING.md](TESTING.md) for construction regression checks.
