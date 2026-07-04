import fs from "node:fs";
import path from "node:path";
import { workspaceStorageRoot } from "./paths.js";

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

export function findWorkspaceStorageIdsForFolder(absPath, fileUri) {
  const root = workspaceStorageRoot();
  if (!fs.existsSync(root)) {
    return [];
  }

  const matches = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const ws = readWorkspaceJson(path.join(root, entry.name));
    if (!ws?.folder) {
      continue;
    }
    if (ws.folder === fileUri || ws.folder.endsWith(absPath)) {
      const db = path.join(root, entry.name, "state.vscdb");
      const size = fs.existsSync(db) ? fs.statSync(db).size : 0;
      matches.push({ id: entry.name, size, folder: ws.folder });
    }
  }

  return matches.sort((a, b) => b.size - a.size);
}

export function findBestWorkspaceStorageId(absPath, fileUri) {
  const matches = findWorkspaceStorageIdsForFolder(absPath, fileUri);
  return matches[0]?.id ?? null;
}
