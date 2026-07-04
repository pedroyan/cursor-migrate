import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function createBackupDir(label = "cursor-migrate-backup") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(os.homedir(), "Desktop", `${label}-${stamp}`);
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
