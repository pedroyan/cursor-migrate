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

function patchJsonValue(value, m) {
  try {
    const data = JSON.parse(value);
    if (patchWorkspaceObject(data, m)) {
      return JSON.stringify(data);
    }
  } catch {
    // fall through to string replace
  }
  return value
    .split(m.fromPath).join(m.toPath)
    .split(m.fromUri).join(m.toUri)
    .split(m.oldWs).join(m.newWs);
}

function replaceKey(key, m) {
  return key
    .split(m.fromPath).join(m.toPath)
    .split(m.fromUri).join(m.toUri)
    .split(m.oldWs).join(m.newWs);
}

export function patchGlobalStorage(migration, { dryRun = false } = {}) {
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

  db.close();

  const composerCounts = readComposerCounts(migration.newWs);
  patchStorageJson(migration);

  return { updatedRows, composerCounts };
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
