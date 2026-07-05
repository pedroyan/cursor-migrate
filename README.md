# cursor-migrate

Move a project folder without losing Cursor agent chat history.

`cursor-migrate` relocates your repository **and** remaps the Cursor metadata that actually powers the Agents sidebar. This means that after you move your project to a new folder using `cursor-migrate`:

✅ The chat history continues to work.

✅ References to the project (like in the "Open Recent" menu or the main Cursor window) are updated to the new place.

✅ Usually avoids a full codebase re-index (embedding pointers are copied with workspace storage).

✅ You won't have to worry about a supply chain attack since this package has zero dependencies.

## Quick start

**Migrate** — move the repo and remap Cursor metadata in one step:

```bash
npx cursor-migrate <source> <destination>
npx cursor-migrate ~/Project/Personal/my-app ~/Project/Sidequests/my-app
npx cursor-migrate --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app
```

**Repair** — you already moved the folder yourself and chats are missing from the sidebar:

```bash
npx cursor-migrate --repair --no-move-repo --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app
```

If you use a custom Cursor profile (`cursor --user-data-dir=...`), pass the same directory:

```bash
npx cursor-migrate --user-data-dir ~/Documents/cursor-workspace/incention \
  --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app
```

For repair, `--from` is the **old path string** (the folder does not need to exist). `--to` must be the **full destination path including the project folder name**.

**Revert** — undo a migration using a saved backup:

```bash
npx cursor-migrate --revert
```

Quit Cursor before running any command. If it is still open, the CLI prompts you — append `--quit-cursor` to any command above to quit immediately without the prompt.

## Requirements

- macOS or Linux (validated on macOS; Linux untested in production)
- Windows is **not supported** at the CLI entry point (code paths exist but are untested; see GitHub to contribute)
- [Node.js](https://nodejs.org/) **22.5+** (uses the built-in `node:sqlite` module)
- Cursor IDE

## Install / run

Local development:

```bash
npm link
cursor-migrate --from ~/old/project --to ~/new/project
```

Once published:

```bash
npx cursor-migrate --from ~/Project/side-hustles/tiny-blog --to ~/Project/tiny-blog/tiny-blog-core
```

Positional args also work:

```bash
npx cursor-migrate ~/Project/experiments/weather-dash ~/Project/weather-dash/weather-dash-app
```

**Important:** `--to` must be the **full destination path including the project folder name**, not just the parent directory. For example, use `~/Project/Sidequests/nomade-rico`, not `~/Project/Sidequests`. You may pre-create an **empty** folder at `--to`; the tool will move the project into it.

## Options

| Flag             | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `--from`, `-f`   | Origin project directory                                           |
| `--to`, `-t`     | Destination project directory (full path including folder name)    |
| `--dry-run`      | Preview actions without writing                                    |
| `--no-move-repo` | Only migrate Cursor metadata (if you already moved the folder)     |
| `--repair`       | Fix chat history after a move (use with `--no-move-repo`)          |
| `--revert`       | Interactively restore a previous backup                            |
| `--skip-backup`  | Skip backup before migrating                                       |
| `--quit-cursor`  | Append to any command to quit Cursor immediately without prompting |
| `--user-data-dir <path>` | Cursor profile directory (same value as `cursor --user-data-dir`) |
| `--force`        | Continue even if Cursor appears to be running                      |

## What it does

1. Creates a backup under the cursor-migrate application data folder (unless `--skip-backup`); the full path is printed in the log
2. Moves the project folder with `rename` on the same volume (preserves git + birthtime), or copies across volumes
3. Renames the Cursor project folder and remaps agent transcripts
4. Copies workspace storage to the workspace id Cursor uses at the new path (mirrored to nearby hash candidates)
5. Rewrites the global composer index and path references in Cursor's storage so conversations and "Open Recent" follow the new location

## Cursor data locations

These are the main on-disk locations the tool reads and rewrites (macOS paths shown; see [Platform paths](#platform-paths) for Linux and Windows):

- `~/.cursor/projects/<encoded-path>/agent-transcripts`
- `~/Library/Application Support/Cursor/User/workspaceStorage/<workspace-id>/`
- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (`composer.composerHeaders`)

## Backups

Unless you pass `--skip-backup`, each run copies affected Cursor data into a timestamped folder. The CLI prints the full path:

```
[cursor-migrate] backup: Created backup at /Users/you/Library/Application Support/cursor-migrate/backups/cursor-migrate-backup-20260704-220100
```

Default backup root by platform:

| Platform | Location                                                |
| -------- | ------------------------------------------------------- |
| macOS    | `~/Library/Application Support/cursor-migrate/backups/` |
| Linux    | `~/.local/share/cursor-migrate/backups/`                |
| Windows  | `%APPDATA%\cursor-migrate\backups\`                     |

Each backup includes a `manifest.json` with the origin path, destination path, and list of copied artifacts.

## Revert a bad migration

If a migration went wrong, use `--revert` to pick a backup and roll back Cursor metadata (and the repo move, when applicable):

```bash
npx cursor-migrate --revert
```

The CLI lists backups labeled as `<origin> --> <destination>`. Use ↑/↓ to select, Enter to confirm. Add `--dry-run` to preview without writing.

Revert restores:

- Global composer index (`state.vscdb`)
- Origin workspace storage (when present in the backup)
- `~/.cursor/projects/<encoded-origin-path>/`
- The project folder itself, when the original migrate run moved the repo

Legacy backups without `manifest.json` are listed from folder contents when possible.

## Workflows

**Standard migration** (repo not moved yet):

```bash
npx cursor-migrate --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app
```

**Metadata only** (repo already moved manually):

```bash
npx cursor-migrate --no-move-repo --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app
```

**Repair** (repo moved but chats missing from the sidebar):

```bash
npx cursor-migrate --repair --no-move-repo --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app
```

**Revert** (undo a migration using a saved backup):

```bash
npx cursor-migrate --revert
```

For repair, `--from` is still the **old path string** used for database matching — the origin directory does not need to exist.

## Tips

- **Quit Cursor first** — migration while Cursor is open can undo composer index changes.
- **Zero agent-transcript files does not mean no chat history.** Most conversations live in the global composer index and workspace `state.vscdb`, not in `agent-transcripts/*.jsonl`.
- If conversations still do not appear after migration, open the project once at the new path, quit Cursor, and rerun with `--repair --no-move-repo`.
- Workspace ids include folder birthtime; the tool mirrors data to nearby hash candidates and prefers an existing Cursor workspace folder when present.
- **Cross-volume moves** (e.g. to an external drive) copy the folder instead of renaming. Folder birthtime may change — use `--repair` if chats are missing.

## Troubleshooting

| Symptom                                       | What to try                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Chats missing after migrate                   | Quit Cursor completely (`osascript -e 'application "Cursor" is running'` → `false`), then run `--repair --no-move-repo` |
| "Destination already exists and is not empty" | Remove files from `--to`, pick a new path, or pre-create an empty folder to receive the project                         |
| Log says mapped but sidebar empty             | Cursor may have been running during migrate, or multiple workspace folders exist — run `--repair`                       |
| Cross-volume move                             | Rerun with `--repair --no-move-repo` after opening the project once at the new path                                     |

## Platform paths

| Platform | Cursor user data                             |
| -------- | -------------------------------------------- |
| macOS    | `~/Library/Application Support/Cursor/User/` |
| Linux    | `~/.config/Cursor/User/`                     |
| Windows  | `%APPDATA%/Cursor/User/`                     |

Custom profiles use `--user-data-dir` on both Cursor and `cursor-migrate`. Agent transcripts still live under `~/.cursor/projects/` (shared across profiles).

## Development

```bash
npm test
node bin/cursor-migrate.js --help
```

## License

MIT
