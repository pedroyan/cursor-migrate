# cursor-migrate

Move a project folder without losing Cursor agent chat history.

`cursor-migrate` relocates your repository **and** remaps the Cursor metadata that actually powers the Agents sidebar:

- `~/.cursor/projects/<encoded-path>/agent-transcripts`
- `~/Library/Application Support/Cursor/User/workspaceStorage/<workspace-id>/`
- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (`composer.composerHeaders`)

## Requirements

- macOS, Linux, or Windows
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
npx cursor-migrate --from ~/Project/Fintropya/MarkBlog --to ~/Project/MarkBlog/MarkBlog --quit-cursor
```

Positional args also work:

```bash
npx cursor-migrate ~/Project/Fintropya/MarkBlog ~/Project/MarkBlog/MarkBlog
```

## Options

| Flag | Description |
|------|-------------|
| `--from`, `-f` | Origin project directory |
| `--to`, `-t` | Destination project directory |
| `--dry-run` | Preview actions without writing |
| `--no-move-repo` | Only migrate Cursor metadata (if you already moved the folder) |
| `--skip-backup` | Skip Desktop backup |
| `--quit-cursor` | Attempt to quit Cursor before migrating |
| `--force` | Continue even if Cursor appears to be running |

## What it does

1. Creates a backup on your Desktop (unless `--skip-backup`)
2. Moves the project folder with `rename` (same filesystem, preserves git + birthtime)
3. Renames the matching folder under `~/.cursor/projects/`
4. Copies workspace storage to the workspace id Cursor uses at the new path
5. Rewrites the global composer index so existing conversations appear under the new workspace id

## Tips

- **Quit Cursor first** for the cleanest migration.
- If conversations still do not appear, open the project once at the new path, quit Cursor, and rerun with `--no-move-repo`.
- Workspace ids include folder birthtime; the tool tries several nearby values and prefers an existing Cursor workspace folder when present.

## Development

```bash
npm test
node bin/cursor-migrate.js --help
```

## License

MIT
