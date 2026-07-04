#!/usr/bin/env node

import { parseArgs } from "node:util";
import { migrateProject } from "../lib/migrate.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string", short: "f" },
    to: { type: "string", short: "t" },
    "dry-run": { type: "boolean", default: false },
    "no-move-repo": { type: "boolean", default: false },
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
  -t, --to <path>         New project folder
      --dry-run           Show what would happen without writing changes
      --no-move-repo      Only migrate Cursor metadata (repo already moved)
      --skip-backup       Do not create a Desktop backup first
      --quit-cursor       Attempt to quit Cursor before migrating
      --force             Continue even if Cursor appears to be running
  -h, --help              Show this help

Examples:
  npx cursor-migrate --from ~/Project/Fintropya/MarkBlog --to ~/Project/MarkBlog/MarkBlog
  cursor-migrate ./old/path ./new/path --quit-cursor

Notes:
  - Close Cursor before migrating for best results.
  - Backups are written to ~/Desktop/cursor-migrate-backup-<timestamp> by default.
  - Requires Node.js 22.5+ (built-in sqlite support).
`);
}
