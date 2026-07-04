# cursor-migrate

Move a project folder without losing Cursor agent chat history.

`cursor-migrate` relocates your repository **and** remaps the Cursor metadata that actually powers the Agents sidebar:

- `~/.cursor/projects/<encoded-path>/agent-transcripts`
- `~/Library/Application Support/Cursor/User/workspaceStorage/<workspace-id>/` (macOS; see [Platform paths](#platform-paths))
- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (`composer.composerHeaders`)

## Requirements

- macOS or Linux (primary); Windows support is best-effort
- [Node.js](https://nodejs.org/) **22.5+** (uses the built-in `node:sqlite` module)
- Cursor IDE

## Install / run

Local development:

```bash
npm link
cursor-migrate --from ~/old/project --to ~/new/project --quit-cursor
```

Once published:

```bash
npx cursor-migrate --from ~/Project/side-hustles/tiny-blog --to ~/Project/tiny-blog/tiny-blog-core --quit-cursor
```

Positional args also work:

```bash
npx cursor-migrate ~/Project/experiments/weather-dash ~/Project/weather-dash/weather-dash-app
```

**Important:** `--to` must be the **full destination path including the project folder name**, not just the parent directory. For example, use `~/Project/Sidequests/nomade-rico`, not `~/Project/Sidequests`. You may pre-create an **empty** folder at `--to`; the tool will move the project into it.

## Options

| Flag             | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| `--from`, `-f`   | Origin project directory                                        |
| `--to`, `-t`     | Destination project directory (full path including folder name) |
| `--dry-run`      | Preview actions without writing                                 |
| `--no-move-repo` | Only migrate Cursor metadata (if you already moved the folder)  |
| `--repair`       | Fix chat history after a move (use with `--no-move-repo`)       |
| `--skip-backup`  | Skip Desktop backup                                             |
| `--quit-cursor`  | Attempt to quit Cursor before migrating                         |
| `--force`        | Continue even if Cursor appears to be running                   |

## What it does

1. Creates a backup on your Desktop (unless `--skip-backup`)
2. Moves the project folder with `rename` on the same volume (preserves git + birthtime), or copies across volumes
3. Renames the matching folder under `~/.cursor/projects/`
4. Copies workspace storage to the workspace id Cursor uses at the new path (mirrored to nearby hash candidates)
5. Rewrites the global composer index so existing conversations appear under the new workspace id

## Workflows

**Standard migration** (repo not moved yet):

```bash
npx cursor-migrate --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app --quit-cursor
```

**Metadata only** (repo already moved manually):

```bash
npx cursor-migrate --no-move-repo --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app --quit-cursor
```

**Repair** (repo moved but chats missing from the sidebar):

```bash
npx cursor-migrate --repair --no-move-repo --from ~/Project/Personal/my-app --to ~/Project/Sidequests/my-app --quit-cursor
```

For repair, `--from` is still the **old path string** used for database matching — the origin directory does not need to exist.

## Tips

- **Quit Cursor first** — migration while Cursor is open can undo composer index changes. Use `--quit-cursor` on macOS, Linux, and Windows.
- **Zero agent-transcript files does not mean no chat history.** Most conversations live in the global composer index and workspace `state.vscdb`, not in `agent-transcripts/*.jsonl`.
- If conversations still do not appear after migration, open the project once at the new path, quit Cursor, and rerun with `--repair --no-move-repo`.
- Workspace ids include folder birthtime; the tool mirrors data to nearby hash candidates and prefers an existing Cursor workspace folder when present.
- **Cross-volume moves** (e.g. to an external drive) copy the folder instead of renaming. Folder birthtime may change — use `--repair` if chats are missing.

## Troubleshooting

| Symptom                           | What to try                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Chats missing after migrate       | Quit Cursor completely (`osascript -e 'application "Cursor" is running'` → `false`), then run `--repair --no-move-repo` |
| "Destination already exists and is not empty" | Remove files from `--to`, pick a new path, or pre-create an empty folder to receive the project |
| Log says mapped but sidebar empty | Cursor may have been running during migrate, or multiple workspace folders exist — run `--repair`    |
| Cross-volume move                 | Rerun with `--repair --no-move-repo` after opening the project once at the new path                  |

## Platform paths

| Platform | Cursor user data                             |
| -------- | -------------------------------------------- |
| macOS    | `~/Library/Application Support/Cursor/User/` |
| Linux    | `~/.config/Cursor/User/`                     |
| Windows  | `%APPDATA%/Cursor/User/`                     |

## Development

```bash
npm test
node bin/cursor-migrate.js --help
```

## License

MIT
