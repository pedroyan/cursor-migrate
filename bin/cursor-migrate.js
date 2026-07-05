#!/usr/bin/env node

import { parseArgs } from "node:util";
import { assertNodeVersion } from "../lib/node-version.js";
import { assertPlatformSupported } from "../lib/platform-support.js";
import { migrateProject } from "../lib/migrate.js";

assertNodeVersion();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string", short: "f" },
    to: { type: "string", short: "t" },
    "dry-run": { type: "boolean", default: false },
    "no-move-repo": { type: "boolean", default: false },
    repair: { type: "boolean", default: false },
    "skip-backup": { type: "boolean", default: false },
    "quit-cursor": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  printHelp();
  process.exit(0);
}

assertPlatformSupported();

const from = values.from ?? positionals[0];
const to = values.to ?? positionals[1];

if (!from || !to) {
  console.error("Error: origin and destination paths are required.\n");
  printHelp();
  process.exit(1);
}

try {
  await migrateProject({
    from,
    to,
    dryRun: values["dry-run"],
    moveRepo: !values["no-move-repo"],
    skipBackup: values["skip-backup"],
    quitCursor: values["quit-cursor"],
    force: values.force,
    repair: values.repair,
  });
  console.log("\nDone. Reopen the project in Cursor from its new path.");
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`cursor-migrate — move a project folder and keep Cursor agent chat history

Usage:
  cursor-migrate --from <origin> --to <destination>
  cursor-migrate <origin> <destination>

Options:
  -f, --from <path>       Current project folder
  -t, --to <path>         New project folder (full path including folder name)
      --dry-run           Show what would happen without writing changes
      --no-move-repo      Only migrate Cursor metadata (repo already moved)
      --repair            Fix chat history after a move (use with --no-move-repo)
      --skip-backup       Do not create a backup first
      --quit-cursor       Quit Cursor immediately without prompting
      --force             Continue even if Cursor appears to be running
  -h, --help              Show this help

Examples:
  npx cursor-migrate --from ~/Project/Personal/ledger-app --to ~/Project/Sidequests/ledger-app --quit-cursor
  cursor-migrate --repair --no-move-repo --from ~/old/path --to ~/new/path --quit-cursor

Notes:
  - Supported platforms: macOS and Linux. Windows is not currently supported (see GitHub for contribution info).
  - Cursor must be quit before migrating. You will be prompted to quit if it is running; use --quit-cursor to skip the prompt.
  - --to must be the full destination path, not just the parent directory. An empty pre-created folder is allowed.
  - Cross-volume moves copy the folder; use --repair if chats are missing afterward.
  - Backups are written to the cursor-migrate application folder (see log output for the full path).
  - Requires Node.js 22.5+ (built-in sqlite support).
`);
}
