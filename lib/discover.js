import fs from "node:fs";
import path from "node:path";
import { normalizePathForMatch, workspaceStorageRoot } from "./paths.js";

function readWorkspaceJson(dir) {
  const file = path.join(dir, "workspace.json");
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function folderMatches(ws, absPath, fileUri) {
  if (!ws?.folder) {
    return false;
  }
  if (ws.folder === fileUri) {
    return true;
  }
  const normalizedTarget = normalizePathForMatch(absPath);
  const normalizedFolder = normalizePathForMatch(ws.folder);
  return normalizedFolder === normalizedTarget;
}

export function findWorkspaceStorageIdsForFolder(absPath, fileUri, { workspaceRoot = workspaceStorageRoot() } = {}) {
  if (!fs.existsSync(workspaceRoot)) {
    return [];
  }

  const matches = [];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = path.join(workspaceRoot, entry.name);
    const ws = readWorkspaceJson(dir);
    if (!folderMatches(ws, absPath, fileUri)) {
      continue;
    }
    const db = path.join(dir, "state.vscdb");
    const size = fs.existsSync(db) ? fs.statSync(db).size : 0;
    const mtime = fs.existsSync(db) ? fs.statSync(db).mtimeMs : 0;
    matches.push({ id: entry.name, size, mtime, folder: ws.folder });
  }

  return matches.sort((a, b) => b.size - a.size);
}

/** Best source folder when copying history (largest db). */
export function findBestWorkspaceStorageId(absPath, fileUri) {
  const matches = findWorkspaceStorageIdsForFolder(absPath, fileUri);
  return matches[0]?.id ?? null;
}

/**
 * Workspace id Cursor is actively using at `toPath`.
 * Prefer the most recently modified db (Cursor wrote on open), then largest.
 */
export function findActiveWorkspaceStorageId(absPath, fileUri, options) {
  const matches = findWorkspaceStorageIdsForFolder(absPath, fileUri, options);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0].id;
  }

  const byRecency = [...matches].sort((a, b) => b.mtime - a.mtime);
  const recentSmall = byRecency.find((m) => m.size < 512_000);
  if (recentSmall && byRecency[0]?.mtime - recentSmall.mtime < 60_000) {
    return recentSmall.id;
  }

  return byRecency[0]?.id ?? matches[0].id;
}

/** Find workspace ids still pointing at the old origin path. */
export function findWorkspaceStorageIdsForOrigin(fromPath, fromUri, options) {
  return findWorkspaceStorageIdsForFolder(fromPath, fromUri, options);
}
