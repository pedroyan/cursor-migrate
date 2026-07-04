import fs from "node:fs";
import path from "node:path";
import { workspaceStorageRoot } from "./paths.js";
import {
  pickWorkspaceId,
  pickWorkspaceIdMirrorTargets,
} from "./workspace-id.js";
import { findActiveWorkspaceStorageId } from "./discover.js";
import { patchWorkspaceDbPaths } from "./sqlite-helpers.js";

function writeWorkspaceJson(destDir, toUri) {
  fs.writeFileSync(path.join(destDir, "workspace.json"), `${JSON.stringify({ folder: toUri })}\n`);
}

function copyWorkspaceTree(sourceDir, destDir, fromPath, toPath, toUri) {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.cpSync(sourceDir, destDir, { recursive: true });
  writeWorkspaceJson(destDir, toUri);
  patchWorkspaceDbPaths(destDir, fromPath, toPath);
}

export function migrateWorkspaceStorage({
  fromPath,
  toPath,
  toUri,
  oldWorkspaceId,
  dryRun = false,
  preferActive = false,
}) {
  const root = workspaceStorageRoot();
  const sourceId = oldWorkspaceId;
  const sourceDir = sourceId ? path.join(root, sourceId) : null;

  const activeId = preferActive ? findActiveWorkspaceStorageId(toPath, toUri) : null;
  const primaryId = activeId ?? pickWorkspaceId(toPath);
  const mirrorIds = pickWorkspaceIdMirrorTargets(toPath);

  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return {
      copied: false,
      reason: "missing-source",
      sourceId,
      newWorkspaceId: primaryId,
      destDir: path.join(root, primaryId),
    };
  }

  const targetIds = [...new Set([primaryId, ...mirrorIds])];

  if (!dryRun) {
    for (const id of targetIds) {
      const destDir = path.join(root, id);
      if (id === sourceId) {
        writeWorkspaceJson(destDir, toUri);
        patchWorkspaceDbPaths(destDir, fromPath, toPath);
        continue;
      }
      copyWorkspaceTree(sourceDir, destDir, fromPath, toPath, toUri);
    }
  }

  return {
    copied: true,
    sourceId,
    newWorkspaceId: primaryId,
    destDir: path.join(root, primaryId),
    mirrorIds: targetIds,
    discovered: Boolean(activeId),
  };
}
