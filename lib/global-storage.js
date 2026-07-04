import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { globalStorageDbPath, storageJsonPath } from "./paths.js";

function makeMigration(fromPath, toPath) {
  const fromUri = `file://${fromPath}`;
  const toUri = `file://${toPath}`;
  return {
    fromPath,
    toPath,
    fromUri,
    toUri,
    oldWs: null,
    newWs: null,
  };
}

function makeWorkspaceIdentifier(m) {
  return {
    id: m.newWs,
    uri: {
      $mid: 1,
      fsPath: m.toPath,
      external: m.toUri,
      path: m.toPath,
      scheme: "file",
    },
  };
}

function patchWorkspaceObject(obj, m) {
  let changed = false;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (patchWorkspaceObject(item, m)) {
        changed = true;
      }
    }
    return changed;
  }
  if (!obj || typeof obj !== "object") {
    return false;
  }

  for (const field of ["workspaceIdentifier", "workspace"]) {
    const ws = obj[field];
    if (ws && typeof ws === "object" && ws.id === m.oldWs) {
      obj[field] = makeWorkspaceIdentifier(m);
      changed = true;
    }
  }

  const root = obj.rootUri;
  if (root && typeof root === "object" && root.fsPath === m.fromPath) {
    obj.rootUri = makeWorkspaceIdentifier(m).uri;
    changed = true;
  }

  if (obj.gitRoot === m.fromPath) {
    obj.gitRoot = m.toPath;
    changed = true;
  }

  for (const value of Object.values(obj)) {
    if (patchWorkspaceObject(value, m)) {
      changed = true;
    }
  }
  return changed;
}

function replaceStrings(value, m) {
  return value
    .split(m.fromPath).join(m.toPath)
    .split(m.fromUri).join(m.toUri)
    .split(m.oldWs).join(m.newWs);
}

function patchJsonValue(value, m) {
  let next = replaceStrings(value, m);
  try {
    const data = JSON.parse(value);
    if (patchWorkspaceObject(data, m)) {
      next = JSON.stringify(data);
    }
  } catch {
    // keep string-replaced version
  }
  return next;
}

function patchComposerHeaders(db, migration) {
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
  if (!row?.value) {
    return { patched: false, mapped: 0 };
  }

  let next = row.value;
  try {
    const data = JSON.parse(row.value);
    patchWorkspaceObject(data, migration);
    next = JSON.stringify(data);
  } catch {
    next = replaceStrings(row.value, migration);
  }

  next = replaceStrings(next, migration);

  if (next === row.value) {
    return { patched: false, mapped: readComposerCount(next, migration.newWs) };
  }

  db.prepare("UPDATE ItemTable SET value = ? WHERE key = 'composer.composerHeaders'").run(next);
  return { patched: true, mapped: readComposerCount(next, migration.newWs) };
}

function readComposerCount(rawJson, workspaceId) {
  try {
    const data = JSON.parse(rawJson);
    return (data.allComposers ?? []).filter((c) => c.workspaceIdentifier?.id === workspaceId).length;
  } catch {
    return 0;
  }
}

function replaceKey(key, m) {
  return replaceStrings(key, m);
}

export function patchGlobalStorage(migration, { dryRun = false, verify = true } = {}) {
  const dbPath = globalStorageDbPath();
  if (!fs.existsSync(dbPath)) {
    return { updatedRows: 0, composerCounts: null, reason: "missing-db" };
  }

  if (dryRun) {
    return { updatedRows: 0, composerCounts: null, dryRun: true };
  }

  fs.copyFileSync(dbPath, `${dbPath}.cursor-migrate.bak`);

  const db = new DatabaseSync(dbPath);
  const rows = db.prepare("SELECT key, value FROM ItemTable").all();
  const del = db.prepare("DELETE FROM ItemTable WHERE key = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)");
  let updatedRows = 0;

  for (const row of rows) {
    let key = row.key;
    let value = row.value;
    for (const pass of [migration]) {
      const nextKey = replaceKey(key, pass);
      const nextValue = patchJsonValue(value, pass);
      key = nextKey;
      value = nextValue;
    }

    if (key !== row.key) {
      del.run(row.key);
      upsert.run(key, value);
      updatedRows += 1;
    } else if (value !== row.value) {
      upsert.run(key, value);
      updatedRows += 1;
    }
  }

  const beforeCount = readComposerCounts(migration.oldWs).forWorkspace;
  const composerPatch = patchComposerHeaders(db, migration);
  db.close();

  const composerCounts = readComposerCounts(migration.newWs);
  patchStorageJson(migration);

  if (verify && beforeCount > 0 && composerPatch.mapped === 0) {
    throw new Error(
      `composer.composerHeaders was not remapped (0 conversations on ${migration.newWs}, ${beforeCount} still on ${migration.oldWs}). ` +
        "Close Cursor completely and rerun with --repair --no-move-repo.",
    );
  }

  return { updatedRows, composerCounts, composerPatch, beforeCount };
}

function readComposerCounts(workspaceId) {
  const dbPath = globalStorageDbPath();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
  db.close();
  if (!row?.value) {
    return { total: 0, forWorkspace: 0 };
  }
  const data = JSON.parse(row.value);
  const composers = data.allComposers ?? [];
  const forWorkspace = composers.filter((c) => c.workspaceIdentifier?.id === workspaceId).length;
  return { total: composers.length, forWorkspace };
}

function patchStorageJson(migration) {
  const file = storageJsonPath();
  if (!fs.existsSync(file)) {
    return;
  }
  const text = fs.readFileSync(file, "utf8");
  const next = text
    .split(migration.fromPath).join(migration.toPath)
    .split(migration.fromUri).join(migration.toUri);
  if (next !== text) {
    fs.writeFileSync(file, next);
  }
}

export function buildMigration(fromPath, toPath, oldWorkspaceId, newWorkspaceId) {
  const migration = makeMigration(fromPath, toPath);
  migration.oldWs = oldWorkspaceId;
  migration.newWs = newWorkspaceId;
  return migration;
}
