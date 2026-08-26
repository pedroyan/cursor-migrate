import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { globalStorageDbPath, storageJsonPath, toFileUri } from "./paths.js";

function makeMigration(fromPath, toPath) {
  return {
    fromPath,
    toPath,
    fromUri: toFileUri(fromPath),
    toUri: toFileUri(toPath),
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

function asText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return value;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return String(value);
}

function patchJsonValue(value, m) {
  const text = asText(value);
  if (typeof text !== "string") {
    return value;
  }

  let next = replaceStrings(text, m);
  try {
    const data = JSON.parse(next);
    if (patchWorkspaceObject(data, m)) {
      next = replaceStrings(JSON.stringify(data), m);
    }
  } catch {
    // keep string-replaced version
  }
  return next;
}

function tableExists(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row);
}

function composerHeadersTableRowCount(db) {
  if (!tableExists(db, "composerHeaders")) {
    return 0;
  }
  return db.prepare("SELECT COUNT(*) AS n FROM composerHeaders").get()?.n ?? 0;
}

function countComposerHeadersTableForWorkspace(db, workspaceId) {
  if (!tableExists(db, "composerHeaders")) {
    return 0;
  }
  return (
    db.prepare("SELECT COUNT(*) AS n FROM composerHeaders WHERE workspaceId = ?").get(workspaceId)?.n ?? 0
  );
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

function patchComposerHeadersTable(db, migration) {
  if (!tableExists(db, "composerHeaders")) {
    return { patched: false, mapped: 0, updated: 0 };
  }

  const rows = db
    .prepare(
      `SELECT composerId, workspaceId, value FROM composerHeaders
       WHERE workspaceId = ? OR instr(COALESCE(value, ''), ?) > 0 OR instr(COALESCE(value, ''), ?) > 0`,
    )
    .all(migration.oldWs, migration.fromPath, migration.oldWs);

  const update = db.prepare("UPDATE composerHeaders SET workspaceId = ?, value = ? WHERE composerId = ?");
  let updated = 0;
  for (const row of rows) {
    const nextWs = row.workspaceId === migration.oldWs ? migration.newWs : replaceStrings(row.workspaceId ?? "", migration);
    const nextValue = typeof asText(row.value) === "string" ? patchJsonValue(row.value, migration) : row.value;
    if (nextWs !== row.workspaceId || nextValue !== row.value) {
      update.run(nextWs, nextValue, row.composerId);
      updated += 1;
    }
  }

  return {
    patched: updated > 0,
    mapped: countComposerHeadersTableForWorkspace(db, migration.newWs),
    updated,
  };
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

export function patchGlobalStorage(
  migration,
  {
    dryRun = false,
    verify = true,
    dbPath = globalStorageDbPath(),
    storageJson = storageJsonPath(),
    skipComposerHeadersTable = false,
  } = {},
) {
  if (!fs.existsSync(dbPath)) {
    return { updatedRows: 0, composerCounts: null, reason: "missing-db" };
  }

  if (dryRun) {
    return { updatedRows: 0, composerCounts: null, dryRun: true };
  }

  const beforeCount = readComposerCounts(migration.oldWs, dbPath).forWorkspace;

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

  const itemTablePatch = patchComposerHeaders(db, migration);
  const tablePatch = skipComposerHeadersTable
    ? { patched: false, mapped: 0, updated: 0, skipped: true }
    : patchComposerHeadersTable(db, migration);
  db.close();

  const composerCounts = readComposerCounts(migration.newWs, dbPath);
  patchStorageJson(migration, storageJson);

  const composerPatch = {
    ...itemTablePatch,
    table: tablePatch,
    mapped: composerCounts.forWorkspace,
  };

  if (verify && beforeCount > 0 && composerCounts.forWorkspace === 0) {
    throw new Error(
      `composerHeaders was not remapped (0 conversations on ${migration.newWs}, ${beforeCount} still on ${migration.oldWs}). ` +
        "Close Cursor completely and rerun with --repair --no-move-repo.",
    );
  }

  return { updatedRows, composerCounts, composerPatch, beforeCount };
}

function readComposerCounts(workspaceId, dbPath = globalStorageDbPath()) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tableTotal = composerHeadersTableRowCount(db);
    if (tableTotal > 0) {
      return {
        total: tableTotal,
        forWorkspace: countComposerHeadersTableForWorkspace(db, workspaceId),
        source: "table",
      };
    }

    const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
    if (!row?.value) {
      return { total: 0, forWorkspace: 0, source: "itemTable" };
    }
    const data = JSON.parse(row.value);
    const composers = data.allComposers ?? [];
    const forWorkspace = composers.filter((c) => c.workspaceIdentifier?.id === workspaceId).length;
    return { total: composers.length, forWorkspace, source: "itemTable" };
  } finally {
    db.close();
  }
}

export function countComposersOnWorkspaceIds(workspaceIds, dbPath = globalStorageDbPath()) {
  let total = 0;
  for (const id of workspaceIds) {
    total += readComposerCounts(id, dbPath).forWorkspace;
  }
  return total;
}

function patchStorageJson(migration, file = storageJsonPath()) {
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
