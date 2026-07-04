import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildMigration, patchGlobalStorage } from "../lib/global-storage.js";
import { toFileUri } from "../lib/paths.js";

function createComposerEntry(workspaceId, fsPath) {
  return {
    composerId: "test-composer-1",
    workspaceIdentifier: {
      id: workspaceId,
      uri: {
        fsPath,
        external: toFileUri(fsPath),
        path: fsPath,
        scheme: "file",
      },
    },
  };
}

function createTestGlobalDb(dbPath, composers) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "composer.composerHeaders",
    JSON.stringify({ allComposers: composers }),
  );
  db.close();
}

test("patchGlobalStorage remaps composer workspace ids", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-global-"));
  const dbPath = path.join(tmp, "state.vscdb");
  const fromPath = path.join(tmp, "old", "project");
  const toPath = path.join(tmp, "new", "project");
  const oldWs = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const newWs = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  createTestGlobalDb(dbPath, [createComposerEntry(oldWs, fromPath)]);

  const migration = buildMigration(fromPath, toPath, oldWs, newWs);
  const result = patchGlobalStorage(migration, { dbPath, verify: true });

  assert.equal(result.composerCounts.forWorkspace, 1);
  assert.equal(result.composerPatch.mapped, 1);
  assert.ok(fs.existsSync(`${dbPath}.cursor-migrate.bak`));

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
  db.close();
  const data = JSON.parse(row.value);
  assert.equal(data.allComposers[0].workspaceIdentifier.id, newWs);
  assert.equal(data.allComposers[0].workspaceIdentifier.uri.fsPath, toPath);
});

test("patchGlobalStorage skips verification when verify is false", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-global-"));
  const dbPath = path.join(tmp, "state.vscdb");
  const fromPath = path.join(tmp, "old");
  const toPath = path.join(tmp, "new");
  const oldWs = "cccccccccccccccccccccccccccccccc";
  const newWs = "dddddddddddddddddddddddddddddddd";

  createTestGlobalDb(dbPath, [
    {
      composerId: "unrelated",
      workspaceIdentifier: { id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
    },
  ]);

  const migration = buildMigration(fromPath, toPath, oldWs, newWs);
  assert.doesNotThrow(() => patchGlobalStorage(migration, { dbPath, verify: false }));
});

test("patchGlobalStorage replaces path strings in other keys", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-global-"));
  const dbPath = path.join(tmp, "state.vscdb");
  const fromPath = path.join(tmp, "old", "project");
  const toPath = path.join(tmp, "new", "project");
  const oldWs = "ffffffffffffffffffffffffffffffff";
  const newWs = "11111111111111111111111111111111";

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "composer.composerHeaders",
    JSON.stringify({ allComposers: [] }),
  );
  db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "some.other.key",
    JSON.stringify({ gitRoot: fromPath }),
  );
  db.close();

  patchGlobalStorage(buildMigration(fromPath, toPath, oldWs, newWs), { dbPath, verify: false });

  const readDb = new DatabaseSync(dbPath, { readOnly: true });
  const row = readDb.prepare("SELECT value FROM ItemTable WHERE key = 'some.other.key'").get();
  readDb.close();
  assert.equal(JSON.parse(row.value).gitRoot, toPath);
});

test("patchGlobalStorage remaps stale workspace id when paths already point to destination", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-global-"));
  const dbPath = path.join(tmp, "state.vscdb");
  const fromPath = "/Users/pedroyan/Project/Sidequests/nomade-rico";
  const toPath = "/Users/pedroyan/Project/SQ2/nomade-rico";
  const staleWs = "73c0274fa665774d735c138a7eeef70c";
  const activeWs = "e0824df04e5a16206becf1a2327bb409";

  const composers = ["a", "b", "c"].map((id) => ({
    composerId: id,
    workspaceIdentifier: {
      id: staleWs,
      uri: {
        fsPath: toPath,
        external: toFileUri(toPath),
        path: toPath,
        scheme: "file",
      },
    },
  }));

  createTestGlobalDb(dbPath, composers);

  const migration = buildMigration(fromPath, toPath, staleWs, activeWs);
  const result = patchGlobalStorage(migration, { dbPath, verify: true });

  assert.equal(result.composerCounts.forWorkspace, 3);

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
  db.close();
  const data = JSON.parse(row.value);
  const onActive = data.allComposers.filter((c) => c.workspaceIdentifier?.id === activeWs);
  const onStale = data.allComposers.filter((c) => c.workspaceIdentifier?.id === staleWs);
  assert.equal(onActive.length, 3);
  assert.equal(onStale.length, 0);
  assert.ok(onActive.every((c) => c.workspaceIdentifier.uri.fsPath === toPath));
});

test("patchGlobalStorage repair loop remaps composers from multiple stale ids to active id", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-global-"));
  const dbPath = path.join(tmp, "state.vscdb");
  const fromPath = "/Users/pedroyan/Project/Sidequests/nomade-rico";
  const toPath = "/Users/pedroyan/Project/SQ2/nomade-rico";
  const staleA = "73c0274fa665774d735c138a7eeef70c";
  const staleB = "9b312f8538309b7c701dbddf59bb42f0";
  const activeWs = "e0824df04e5a16206becf1a2327bb409";

  createTestGlobalDb(dbPath, [
    ...["x", "y"].map((id) => ({
      composerId: id,
      workspaceIdentifier: { id: staleA, uri: { fsPath: toPath } },
    })),
    {
      composerId: "z",
      workspaceIdentifier: { id: staleB, uri: { fsPath: toPath } },
    },
  ]);

  patchGlobalStorage(buildMigration(fromPath, toPath, staleA, activeWs), { dbPath, verify: false });
  const result = patchGlobalStorage(buildMigration(fromPath, toPath, staleB, activeWs), {
    dbPath,
    verify: true,
  });

  assert.equal(result.composerCounts.forWorkspace, 3);

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
  db.close();
  const data = JSON.parse(row.value);
  assert.equal(
    data.allComposers.filter((c) => c.workspaceIdentifier?.id === activeWs).length,
    3,
  );
  assert.equal(
    data.allComposers.filter((c) => c.workspaceIdentifier?.id === staleA).length,
    0,
  );
  assert.equal(
    data.allComposers.filter((c) => c.workspaceIdentifier?.id === staleB).length,
    0,
  );
});
