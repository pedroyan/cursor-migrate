import fs from "node:fs";
import path from "node:path";
import { createBackupDir, backupIfExists } from "./backup.js";
import { isCursorRunning, quitCursor } from "./cursor-process.js";
import {
  migrateCursorProjectDir,
  countAgentTranscripts,
} from "./cursor-projects.js";
import { findWorkspaceStorageIdsForFolder } from "./discover.js";
import { buildMigration, patchGlobalStorage } from "./global-storage.js";
import {
  resolvePath,
  toFileUri,
  cursorProjectsRoot,
  encodeCursorProjectDir,
  globalStorageDbPath,
  workspaceStorageRoot,
} from "./paths.js";
import { migrateWorkspaceStorage } from "./workspace-storage.js";

function log(step, message) {
  console.log(`[cursor-migrate] ${step}: ${message}`);
}

function ensureParentDir(absPath) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
}

export async function migrateProject(options) {
  const fromPath = resolvePath(options.from);
  const toPath = resolvePath(options.to);
  const fromUri = toFileUri(fromPath);
  const toUri = toFileUri(toPath);
  const dryRun = Boolean(options.dryRun);
  const moveRepo = options.moveRepo !== false;
  const skipBackup = Boolean(options.skipBackup);

  if (!fs.existsSync(fromPath)) {
    throw new Error(`Origin path does not exist: ${fromPath}`);
  }
  if (fromPath === toPath) {
    throw new Error("Origin and destination must be different paths");
  }
  if (fs.existsSync(toPath)) {
    throw new Error(`Destination already exists: ${toPath}`);
  }
  if (!fs.statSync(fromPath).isDirectory()) {
    throw new Error(`Origin must be a directory: ${fromPath}`);
  }

  if (isCursorRunning()) {
    if (options.quitCursor) {
      log("cursor", "Quitting Cursor...");
      quitCursor();
      await sleep(1500);
      if (isCursorRunning()) {
        throw new Error("Cursor is still running. Close it manually and retry.");
      }
    } else if (!options.force) {
      throw new Error(
        "Cursor is running. Close it first, or pass --quit-cursor / --force.",
      );
    }
  }

  const oldWorkspaceMatches = findWorkspaceStorageIdsForFolder(fromPath, fromUri);
  const oldWorkspaceId = oldWorkspaceMatches[0]?.id ?? null;

  log("plan", `${fromPath} -> ${toPath}`);
  if (oldWorkspaceId) {
    log("discover", `Found workspace storage ${oldWorkspaceId}`);
  } else {
    log("discover", "No existing workspace storage found for origin (metadata migration only)");
  }

  let backupDir = null;
  if (!skipBackup && !dryRun) {
    backupDir = createBackupDir();
    log("backup", backupDir);
    backupIfExists(globalStorageDbPath(), backupDir, "globalStorage-state.vscdb");
    if (oldWorkspaceId) {
      backupIfExists(path.join(workspaceStorageRoot(), oldWorkspaceId), backupDir, `workspaceStorage-${oldWorkspaceId}`);
    }
    const oldProjectDir = path.join(cursorProjectsRoot(), encodeCursorProjectDir(fromPath));
    backupIfExists(oldProjectDir, backupDir, encodeCursorProjectDir(fromPath));
  }

  if (moveRepo) {
    ensureParentDir(toPath);
    log("repo", dryRun ? `Would move ${fromPath} -> ${toPath}` : `Moving ${fromPath} -> ${toPath}`);
    if (!dryRun) {
      fs.renameSync(fromPath, toPath);
    }
  } else if (!fs.existsSync(toPath)) {
    throw new Error(`Destination does not exist and --no-move-repo was set: ${toPath}`);
  }

  const projectMeta = migrateCursorProjectDir(fromPath, toPath, { dryRun });
  if (projectMeta.moved) {
    const transcripts = dryRun ? "?" : countAgentTranscripts(projectMeta.newDir);
    log("cursor-projects", `Renamed ${path.basename(projectMeta.oldDir)} -> ${path.basename(projectMeta.newDir)} (${transcripts} transcript files)`);
  } else {
    log("cursor-projects", `Skipped (${projectMeta.reason})`);
  }

  const wsResult = migrateWorkspaceStorage({
    fromPath,
    toPath,
    toUri,
    oldWorkspaceId,
    dryRun,
  });

  if (wsResult.copied) {
    log(
      "workspace-storage",
      `${wsResult.sourceId} -> ${wsResult.newWorkspaceId}${wsResult.discovered ? " (detected existing folder)" : ""}`,
    );
  } else {
    log("workspace-storage", `Skipped (${wsResult.reason})`);
  }

  if (!oldWorkspaceId || !wsResult.newWorkspaceId) {
    log("global-storage", "Skipped composer remap (missing workspace ids)");
    return summarize({ fromPath, toPath, backupDir, dryRun, projectMeta, wsResult });
  }

  const migration = buildMigration(fromPath, toPath, oldWorkspaceId, wsResult.newWorkspaceId);
  const globalResult = patchGlobalStorage(migration, { dryRun });
  if (globalResult.reason === "missing-db") {
    log("global-storage", "Skipped (global storage database not found)");
  } else if (dryRun) {
    log("global-storage", "Would patch composer.composerHeaders and related keys");
  } else {
    log(
      "global-storage",
      `Updated ${globalResult.updatedRows} rows; ${globalResult.composerCounts.forWorkspace} conversations mapped to ${wsResult.newWorkspaceId}`,
    );
  }

  return summarize({ fromPath, toPath, backupDir, dryRun, projectMeta, wsResult, globalResult });
}

function summarize(result) {
  return {
    ...result,
    done: true,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
