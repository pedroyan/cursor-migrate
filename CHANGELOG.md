# Changelog

## 0.2.2 — 2026-08-26

`0.2.1` remapped the `composerHeaders` table, but the Agents Window could still point at the old folder (`name` / `~/displayPath`), a sibling path that shared a prefix (`everest` vs `everest-dashboard`) could be rewritten, and repair could attach chats to a birthtime **+1** mirror that Cursor never opens.

**Fixed**

- Replace folder paths only at a path-segment boundary so migrating `…/everest` does not rewrite `…/everest-dashboard`.
- Remap Agents Window / glass `name` and `~/displayPath` (not only `composerHeaders`), so the project list does not keep pointing at the old folder.
- Repair no longer remaps chats to the last-written birthtime mirror (+1) when Cursor will open delta 0. Prefer the predicted id unless one dest folder was clearly written later (real open).

**Not changed**

- GitHub remotes are still not rewritten. The Agents Window Repositories list may keep the old repo name (`everest`) after the folder is `quickscope-notes`.

If you already migrated with `0.2.1` and the Agents Window or history clock is empty, quit Cursor and rerun:

```bash
npx cursor-migrate --repair --no-move-repo --from <old-path> --to <new-path>
```

Add `--user-data-dir` if the project lives in a custom Cursor profile.

## 0.2.1 — 2026-08-26

Requires **[Node.js](https://nodejs.org/) 24.13.0 or later** — the version this tool is tested on. Older runtimes (including Node 22) exit with an error. `npx` does not install Node for you; upgrade Node first if the CLI refuses to start.

Works with the **new Agents Window** in current Cursor.

Cursor moved the conversation index out of the old `composer.composerHeaders` JSON blob and into a dedicated `composerHeaders` SQLite table. `0.2.0` still patched only the blob, so migrate/repair could report success while the Agents Window and history clock stayed empty (open tabs could still appear from copied workspace UI state).

**Changed**

- Require **Node.js 24.13.0+** (the version this tool is tested on). Older runtimes, including Node 22, exit with a clear error.

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
