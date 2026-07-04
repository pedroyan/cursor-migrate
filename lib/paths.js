import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

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
