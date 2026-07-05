import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatBackupLabel,
  inferLegacyBackupMeta,
  listBackups,
  readBackupManifest,
  writeBackupManifest,
} from "../lib/backup-manifest.js";
import { applyRevert } from "../lib/revert.js";
import { cursorMigrateBackupRoot } from "../lib/paths.js";

function tempBackupRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-revert-"));
  const backups = path.join(root, "backups");
  fs.mkdirSync(backups, { recursive: true });
  return { root, backups };
}

test("writeBackupManifest and readBackupManifest round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-manifest-"));
  const meta = {
    from: "/Users/alice/old-app",
    to: "/Users/alice/new-app",
    mode: "migrate",
    moveRepo: true,
    oldWorkspaceId: "abc123",
    encodedFromProjectDir: "Users-alice-old-app",
    artifacts: ["globalStorage-state.vscdb"],
  };

  writeBackupManifest(dir, meta);
  assert.deepEqual(readBackupManifest(dir), {
    version: 1,
    ...meta,
    createdAt: readBackupManifest(dir).createdAt,
  });
  assert.match(readBackupManifest(dir).createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("formatBackupLabel uses from and to paths", () => {
  assert.equal(
    formatBackupLabel({ from: "/a/old", to: "/b/new" }),
    "/a/old --> /b/new",
  );
});

test("listBackups returns newest first with labels", () => {
  const { backups } = tempBackupRoot();
  const older = path.join(backups, "cursor-migrate-backup-20260101-120000");
  const newer = path.join(backups, "cursor-migrate-backup-20260201-120000");
  fs.mkdirSync(older);
  fs.mkdirSync(newer);

  writeBackupManifest(older, {
    from: "/old/a",
    to: "/new/a",
    mode: "migrate",
    moveRepo: true,
    artifacts: [],
  });
  writeBackupManifest(newer, {
    from: "/old/b",
    to: "/new/b",
    mode: "repair",
    moveRepo: false,
    artifacts: [],
  });

  const entries = listBackups(backups);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].dir, newer);
  assert.equal(entries[0].label, "/old/b --> /new/b");
  assert.equal(entries[1].label, "/old/a --> /new/a");
});

test("inferLegacyBackupMeta derives paths from encoded project dir folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-legacy-"));
  fs.mkdirSync(path.join(dir, "globalStorage-state.vscdb"));
  fs.mkdirSync(path.join(dir, "Users-alice-Projects-demo"));

  const meta = inferLegacyBackupMeta(dir);
  assert.equal(meta.from, "/Users/alice/Projects/demo");
  assert.equal(meta.to, null);
  assert.deepEqual(meta.artifacts.sort(), [
    "Users-alice-Projects-demo",
    "globalStorage-state.vscdb",
  ].sort());
});

test("applyRevert restores backed-up Cursor artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-apply-"));
  const backupDir = path.join(root, "backup");
  const liveGlobal = path.join(root, "live", "globalStorage", "state.vscdb");
  const liveWorkspace = path.join(root, "live", "workspaceStorage", "ws-old");
  const liveProject = path.join(root, "live", "projects", "Users-me-app");

  fs.mkdirSync(path.join(backupDir, "globalStorage-state.vscdb"), { recursive: true });
  fs.writeFileSync(path.join(backupDir, "globalStorage-state.vscdb", "db"), "backup-global");
  fs.mkdirSync(path.join(backupDir, "workspaceStorage-ws-old"), { recursive: true });
  fs.writeFileSync(path.join(backupDir, "workspaceStorage-ws-old", "db"), "backup-ws");
  fs.mkdirSync(path.join(backupDir, "Users-me-app"), { recursive: true });
  fs.writeFileSync(path.join(backupDir, "Users-me-app", "note.txt"), "backup-project");

  fs.mkdirSync(liveGlobal, { recursive: true });
  fs.writeFileSync(path.join(liveGlobal, "db"), "live-global");
  fs.mkdirSync(liveWorkspace, { recursive: true });
  fs.writeFileSync(path.join(liveWorkspace, "db"), "live-ws");
  fs.mkdirSync(liveProject, { recursive: true });
  fs.writeFileSync(path.join(liveProject, "note.txt"), "live-project");

  const manifest = {
    version: 1,
    from: path.join(root, "from-app"),
    to: path.join(root, "to-app"),
    mode: "migrate",
    moveRepo: false,
    oldWorkspaceId: "ws-old",
    encodedFromProjectDir: "Users-me-app",
    artifacts: [
      "globalStorage-state.vscdb",
      "workspaceStorage-ws-old",
      "Users-me-app",
    ],
  };
  writeBackupManifest(backupDir, manifest);

  const result = applyRevert({
    backupDir,
    manifest,
    paths: {
      globalStorageDbPath: () => liveGlobal,
      workspaceStorageRoot: () => path.join(root, "live", "workspaceStorage"),
      cursorProjectsRoot: () => path.join(root, "live", "projects"),
    },
  });

  assert.equal(fs.readFileSync(path.join(liveGlobal, "db"), "utf8"), "backup-global");
  assert.equal(fs.readFileSync(path.join(liveWorkspace, "db"), "utf8"), "backup-ws");
  assert.equal(fs.readFileSync(path.join(liveProject, "note.txt"), "utf8"), "backup-project");
  assert.deepEqual(result.restored.sort(), manifest.artifacts.sort());
});

test("applyRevert moves repo back when destination exists and origin is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-repo-"));
  const backupDir = path.join(root, "backup");
  const fromPath = path.join(root, "from-app");
  const toPath = path.join(root, "to-app");

  fs.mkdirSync(backupDir);
  fs.mkdirSync(toPath);
  fs.writeFileSync(path.join(toPath, "README.md"), "project");

  writeBackupManifest(backupDir, {
    from: fromPath,
    to: toPath,
    mode: "migrate",
    moveRepo: true,
    artifacts: [],
  });

  applyRevert({
    backupDir,
    manifest: readBackupManifest(backupDir),
    paths: {
      globalStorageDbPath: () => path.join(root, "unused-global"),
      workspaceStorageRoot: () => path.join(root, "unused-ws"),
      cursorProjectsRoot: () => path.join(root, "unused-projects"),
    },
  });

  assert.equal(fs.existsSync(fromPath), true);
  assert.equal(fs.existsSync(toPath), false);
  assert.equal(fs.readFileSync(path.join(fromPath, "README.md"), "utf8"), "project");
});

test("cursorMigrateBackupRoot is under application data not Desktop", () => {
  const root = cursorMigrateBackupRoot();
  assert.ok(root.includes(`${path.sep}cursor-migrate${path.sep}backups`));
  assert.ok(!root.includes(`${path.sep}Desktop${path.sep}`));
});
