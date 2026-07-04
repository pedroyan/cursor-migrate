import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBackupDir } from "../lib/backup.js";
import { cursorMigrateBackupRoot, cursorMigrateDataRoot } from "../lib/paths.js";

test("cursorMigrateDataRoot lives under the user home directory", () => {
  const root = cursorMigrateDataRoot();
  assert.ok(root.startsWith(os.homedir()));
  assert.ok(!root.includes(`${path.sep}Desktop${path.sep}`));
});

test("createBackupDir places backups under cursor-migrate application data", () => {
  const dir = createBackupDir("test-backup");
  try {
    assert.equal(path.dirname(dir), cursorMigrateBackupRoot());
    assert.ok(fs.existsSync(dir));
    assert.match(path.basename(dir), /^test-backup-\d{8}-\d{6}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
