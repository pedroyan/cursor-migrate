import fs from "node:fs";
import path from "node:path";
import { workspaceStorageRoot } from "./paths.js";
import { pickWorkspaceId } from "./workspace-id.js";
import { findBestWorkspaceStorageId } from "./discover.js";
import { patchWorkspaceDbPaths } from "./sqlite-helpers.js";

export function migrateWorkspaceStorage({
  fromPath,
  toPath,
  toUri,
  oldWorkspaceId,
  dryRun = false,
}) {
  const root = workspaceStorageRoot();
  const discovered = findBestWorkspaceStorageId(toPath, toUri);
  const newWorkspaceId = discovered ?? pickWorkspaceId(toPath);

  const sourceId = oldWorkspaceId;
  const sourceDir = sourceId ? path.join(root, sourceId) : null;
  const destDir = path.join(root, newWorkspaceId);

  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return {
      copied: false,
      reason: "missing-source",
      sourceId,
      newWorkspaceId,
      destDir,
    };
  }

  if (!dryRun) {
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.cpSync(sourceDir, destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, "workspace.json"), `${JSON.stringify({ folder: toUri })}\n`);
    patchWorkspaceDbPaths(destDir, fromPath, toPath);
  }

  return {
    copied: true,
    sourceId,
    newWorkspaceId,
    destDir,
    discovered: Boolean(discovered),
  };
}
