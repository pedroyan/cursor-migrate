import path from "node:path";
import os from "node:os";

export function resolvePath(input) {
  return path.resolve(input.replace(/^~(?=\/|$)/, os.homedir()));
}

export function encodeCursorProjectDir(absPath) {
  return absPath.replace(/^\//, "").replace(/\//g, "-");
}

export function toFileUri(absPath) {
  return `file://${absPath}`;
}

export function cursorProjectsRoot() {
  return path.join(os.homedir(), ".cursor", "projects");
}

export function cursorUserDataRoot() {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "Cursor");
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Cursor");
    default:
      return path.join(os.homedir(), ".config", "Cursor");
  }
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
