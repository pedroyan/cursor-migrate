import fs from "node:fs";
import path from "node:path";
import { cursorMigrateBackupRoot } from "./paths.js";

export function createBackupDir(label = "cursor-migrate-backup") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(cursorMigrateBackupRoot(), `${label}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function copyTree(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

export function backupIfExists(src, backupRoot, name) {
  if (!fs.existsSync(src)) {
    return false;
  }
  const dest = path.join(backupRoot, name);
  copyTree(src, dest);
  return true;
}
