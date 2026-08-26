# Changelog

## 0.2.1 — 2026-08-26

Works with the **new Agents Window** in current Cursor.

Cursor moved the conversation index out of the old `composer.composerHeaders` JSON blob and into a dedicated `composerHeaders` SQLite table. `0.2.0` still patched only the blob, so migrate/repair could report success while the Agents Window and history clock stayed empty (open tabs could still appear from copied workspace UI state).

**Fixed**

- Remap `composerHeaders.workspaceId` and the JSON header (`workspaceIdentifier`, folder paths, `trackedGitRepos`) so chats follow the new project path in the Agents Window, history clock, and Agents sidebar.
- Count and verify conversations from that table when it exists; keep the old blob path for older Cursor builds.
- Fail repair/migrate if the origin had conversations and none landed on the destination, instead of printing `0 conversations` and `Done`.

**Not changed**

- GitHub remote names (`github.com/org/old-folder`) are not rewritten. If the Agents Window still groups by the old repo name after a successful remap, that is the git remote, not the folder.

If you already migrated with `0.2.0` and the history clock is empty, quit Cursor and rerun:

```bash
npx cursor-migrate --repair --no-move-repo --from <old-path> --to <new-path>
```

Add `--user-data-dir` if the project lives in a custom Cursor profile.

## 0.2.0 — 2026-07-05

- `--user-data-dir` for custom Cursor profiles (`cursor --user-data-dir=...`).
