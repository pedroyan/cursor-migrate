# Agent instructions — `cursor-migrate`

This repo moves project folders while preserving Cursor agent chat history. Most failures are subtle (SQLite, workspace hashes, composer index). **Do not rely on training data alone** — read the private notes first.

## Before you change anything

1. **Read `priv-notes/README.md`** — index, triage checklist, critical lessons.
2. **Skim the latest session log:** `priv-notes/08-session-log.md`.
3. **If the user reports missing chats**, read the relevant incident postmortem:
   - `priv-notes/07-nomade-rico-incident.md` — first migrate / hash delta
   - `priv-notes/09-nomade-rico-second-migration.md` — chained migrate / multiple origin ids
4. **For algorithm or module questions**, use `priv-notes/03-migration-algorithm.md` and `priv-notes/04-codebase-map.md`.

## Bug fixes: use TDD

Every bug fix must follow **test-driven development**. Do not patch first and add tests later.

1. **Red** — Write a test in `test/` that fails for the **exact** bug (minimal reproduction: wrong return value, missing remap, guard not firing, etc.). Run `npm test` and confirm the new test fails for the right reason.
2. **Green** — Implement the smallest fix that makes that test pass. Re-run `npm test` and confirm **all** tests pass.
3. **Refactor** (optional) — Clean up only if needed; keep tests green.

Prefer **unit tests** with temp dirs / mocked inputs over live Cursor state when possible. Use integration-style tests (e.g. `{ skip: process.platform !== "darwin" }`) only when the bug is platform- or environment-specific.

Recent example: `test/cursor-process.test.js` — `parseCursorRunningResult` + darwin check that `isCursorRunning()` matches `osascript` (session 3, broken `pgrep -x Cursor` guard).

## After you change something

Update `priv-notes/` so the next agent inherits your context. This is required, not optional.

| What you did | Where to document |
|--------------|-------------------|
| Fixed a user-reported failure | New or updated incident doc (e.g. `09-...md`) + entry in `08-session-log.md` + **failing test first, then fix** |
| New pitfall or edge case | `05-gotchas-and-failures.md` |
| Changed CLI steps or flags | `03-migration-algorithm.md` |
| New/changed module | `04-codebase-map.md` |
| New backup paths, workspace ids, counts | Relevant incident doc + `05-gotchas` reference table |
| Shift in project status | `priv-notes/README.md` “Current status” |

Write for a **future agent with no chat history**: what broke, how you verified in the DB, what code changed, and the exact repair command if applicable.

## Non-negotiable rules

1. **Cursor must be quit** before migrate/repair. Use `--quit-cursor` to skip the prompt and quit immediately; open Cursor reverts the composer index.
2. **Verify in the database**, not log lines — count `composer.composerHeaders` entries per workspace id (see `priv-notes/06-dev-and-testing.md`).
3. **Multiple workspace hash folders** per path are normal. Composers may be on a different id than the largest `state.vscdb`.
4. **`0 transcript files` ≠ no history** — check global composer index.
5. **`--to` is the full destination path** including the project folder name.
6. **Chained migrations** (project moved twice): remap composers from **all** origin workspace ids, not just the first discover match.
7. **Do not commit** unless the user asks. **`priv-notes/` is not published to npm** — safe for internal forensics.

## Quick triage: “chats missing after migrate”

```bash
# 1. Quit Cursor (Cmd+Q). While open, migrate will prompt to quit (or use --quit-cursor to skip the prompt).
osascript -e 'application "Cursor" is running'  # expect false before migrate

# 2. Repair (from = old path string, to = current folder)
npx . --repair --no-move-repo --from <old-path> --to <new-path> --quit-cursor

# 3. Verify composer count on active workspace id (doc 06)
```

## Key files

| Path | Role |
|------|------|
| `lib/migrate.js` | Orchestrator: migrate + repair |
| `lib/global-storage.js` | Composer index + global SQLite patch |
| `lib/workspace-storage.js` | Workspace folder copy + mirror |
| `lib/discover.js` | Find all / active workspace ids |
| `test/*.test.js` | Node native test runner — **add a failing test before every bug fix** |
| `priv-notes/` | Agent knowledge base (read and update) |
| `README.md` | User-facing docs (published to npm) |
