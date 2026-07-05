import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

let cursorUserDataDirOverride = null;

export function setCursorUserDataDir(input) {
  cursorUserDataDirOverride = input ? resolvePath(input) : null;
}

export function resetCursorUserDataDir() {
  cursorUserDataDirOverride = null;
}

export function getConfiguredCursorUserDataDir() {
  return cursorUserDataDirOverride;
}

export function validateUserDataDir(input) {
  const root = resolvePath(input);
  if (!fs.existsSync(root)) {
    throw new Error(`Cursor user data directory does not exist: ${root}`);
  }
  const userDir = path.join(root, "User");
  if (!fs.existsSync(userDir)) {
    throw new Error(`Cursor user data directory is missing User/: ${root}`);
  }
  return root;
}

export function createCursorPathOverrides(userDataDir) {
  if (!userDataDir) {
    return {};
  }
  const root = resolvePath(userDataDir);
  return {
    cursorUserDataRoot: () => root,
    workspaceStorageRoot: () => path.join(root, "User", "workspaceStorage"),
    globalStorageDbPath: () => path.join(root, "User", "globalStorage", "state.vscdb"),
    storageJsonPath: () => path.join(root, "User", "globalStorage", "storage.json"),
  };
}

export function resolvePath(input) {
  return path.resolve(input.replace(/^~(?=\/|$)/, os.homedir()));
}

export function encodeCursorProjectDir(absPath) {
  const resolved = path.resolve(absPath);
  if (process.platform === "win32") {
    return resolved
      .replace(/\\/g, "-")
      .replace(/^([A-Za-z]):-?/, (_, drive) => `${drive.toLowerCase()}-`);
  }
  return resolved.replace(/^\//, "").replace(/\//g, "-");
}

export function toFileUri(absPath) {
  const resolved = path.resolve(absPath);
  if (process.platform === "win32") {
    return `file:///${resolved.replace(/\\/g, "/")}`;
  }
  return `file://${resolved}`;
}

/** Normalize a filesystem path or file URI for exact comparison. */
export function normalizePathForMatch(input) {
  if (!input) {
    return null;
  }
  if (input.startsWith("file://")) {
    try {
      return path.resolve(fileURLToPath(input));
    } catch {
      return path.resolve(input.replace(/^file:\/\//, ""));
    }
  }
  return path.resolve(input);
}

export function cursorProjectsRoot() {
  return path.join(os.homedir(), ".cursor", "projects");
}

export function cursorUserDataRoot() {
  if (cursorUserDataDirOverride) {
    return cursorUserDataDirOverride;
  }
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "Cursor");
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Cursor");
    default:
      return path.join(os.homedir(), ".config", "Cursor");
  }
}

export function cursorMigrateDataRoot() {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "cursor-migrate");
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "cursor-migrate",
      );
    default:
      return path.join(os.homedir(), ".local", "share", "cursor-migrate");
  }
}

export function cursorMigrateBackupRoot() {
  return path.join(cursorMigrateDataRoot(), "backups");
}

export function workspaceStorageRoot() {
  return path.join(cursorUserDataRoot(), "User", "workspaceStorage");
}

export function globalStorageDbPath() {
  return path.join(cursorUserDataRoot(), "User", "globalStorage", "state.vscdb");
}

export function storageJsonPath() {
  return path.join(cursorUserDataRoot(), "User", "globalStorage", "storage.json");
}
