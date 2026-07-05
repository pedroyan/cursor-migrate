import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findWorkspaceStorageIdsForFolder } from "../lib/discover.js";
import { buildBackupManifestMeta, readBackupManifest, writeBackupManifest } from "../lib/backup-manifest.js";
import { applyRevert } from "../lib/revert.js";
import { migrateProject } from "../lib/migrate.js";
import { resetCursorUserDataDir, toFileUri } from "../lib/paths.js";

function createWorkspaceEntry(root, id, folderPath, { dbSize = 1024 } = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), `${JSON.stringify({ folder: toFileUri(folderPath) })}\n`);
  fs.writeFileSync(path.join(dir, "state.vscdb"), "x".repeat(dbSize));
}

function createUserDataDir(root) {
  const userDataDir = path.join(root, "custom-cursor");
  fs.mkdirSync(path.join(userDataDir, "User", "workspaceStorage"), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, "User", "globalStorage"), { recursive: true });
  return userDataDir;
}

test("findWorkspaceStorageIdsForFolder discovers workspaces in a custom user data dir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-udd-"));
  const userDataDir = createUserDataDir(root);
  const wsRoot = path.join(userDataDir, "User", "workspaceStorage");
  const projectPath = path.join(root, "project");

  createWorkspaceEntry(wsRoot, "ws-custom", projectPath);

  const matches = findWorkspaceStorageIdsForFolder(projectPath, toFileUri(projectPath), {
    workspaceRoot: wsRoot,
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "ws-custom");
});

test("buildBackupManifestMeta records userDataDir when provided", () => {
  const meta = buildBackupManifestMeta({
    fromPath: "/old",
    toPath: "/new",
    mode: "migrate",
    moveRepo: true,
    oldWorkspaceId: "abc",
    artifacts: [],
    userDataDir: "/Users/me/Documents/cursor-workspace/incention",
  });

  assert.equal(meta.userDataDir, "/Users/me/Documents/cursor-workspace/incention");
});

test("applyRevert restores global storage to custom user data dir from manifest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-udd-revert-"));
  const userDataDir = createUserDataDir(root);
  const backupDir = path.join(root, "backup");
  const liveGlobal = path.join(userDataDir, "User", "globalStorage", "state.vscdb");

  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(path.join(backupDir, "globalStorage-state.vscdb"), { recursive: true });
  fs.writeFileSync(path.join(backupDir, "globalStorage-state.vscdb", "db"), "backup-global");
  fs.mkdirSync(liveGlobal, { recursive: true });
  fs.writeFileSync(path.join(liveGlobal, "db"), "live-global");

  const result = applyRevert({
    backupDir,
    manifest: {
      artifacts: ["globalStorage-state.vscdb"],
      userDataDir,
    },
    paths: {
      globalStorageDbPath: () => liveGlobal,
      workspaceStorageRoot: () => path.join(userDataDir, "User", "workspaceStorage"),
      cursorProjectsRoot: () => path.join(root, "unused-projects"),
    },
  });

  assert.ok(result.actions.some((action) => action.includes(liveGlobal)));
  assert.equal(fs.readFileSync(path.join(liveGlobal, "db"), "utf8"), "backup-global");
});

test("migrateProject accepts userDataDir and discovers workspace storage there", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-udd-migrate-"));
  const userDataDir = createUserDataDir(root);
  const wsRoot = path.join(userDataDir, "User", "workspaceStorage");
  const fromPath = path.join(root, "origin");
  const toPath = path.join(root, "destination");

  fs.mkdirSync(fromPath);
  fs.mkdirSync(toPath);
  createWorkspaceEntry(wsRoot, "ws-origin", fromPath, { dbSize: 5000 });
  createWorkspaceEntry(wsRoot, "ws-dest", toPath, { dbSize: 4096 });

  resetCursorUserDataDir();
  try {
    await migrateProject({
      from: fromPath,
      to: toPath,
      dryRun: true,
      moveRepo: false,
      skipBackup: true,
      userDataDir,
      repair: true,
      force: true,
    });
  } finally {
    resetCursorUserDataDir();
  }
});
