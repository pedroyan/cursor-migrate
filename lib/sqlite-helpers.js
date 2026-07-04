import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { workspaceStorageRoot } from "./paths.js";

export function countComposerHeadersForWorkspace(workspaceId) {
  const dbPath = path.join(
    path.dirname(workspaceStorageRoot()),
    "globalStorage",
    "state.vscdb",
  );
  if (!fs.existsSync(dbPath)) {
    return 0;
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
  db.close();
  if (!row?.value) {
    return 0;
  }
  const data = JSON.parse(row.value);
  return (data.allComposers ?? []).filter((c) => c.workspaceIdentifier?.id === workspaceId).length;
}

export function patchWorkspaceDbPaths(workspaceDir, fromPath, toPath) {
  const dbPath = path.join(workspaceDir, "state.vscdb");
  if (!fs.existsSync(dbPath)) {
    return 0;
  }

  const db = new DatabaseSync(dbPath);
  const rows = db.prepare("SELECT key, value FROM ItemTable").all();
  const update = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
  let changed = 0;
  const fromUri = `file://${fromPath}`;
  const toUri = `file://${toPath}`;

  for (const row of rows) {
    if (typeof row.value !== "string") {
      continue;
    }
    let next = row.value;
    if (next.includes(fromPath)) {
      next = next.split(fromPath).join(toPath);
    }
    if (next.includes(fromUri)) {
      next = next.split(fromUri).join(toUri);
    }
    if (next !== row.value) {
      update.run(next, row.key);
      changed += 1;
    }
  }

  db.close();
  return changed;
}
