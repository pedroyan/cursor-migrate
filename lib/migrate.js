import fs from "node:fs";
import path from "node:path";
import { createBackupDir, backupIfExists } from "./backup.js";
import { isCursorRunning, quitCursor } from "./cursor-process.js";
import {
  migrateCursorProjectDir,
  countAgentTranscripts,
} from "./cursor-projects.js";
import {
  findWorkspaceStorageIdsForFolder,
  findWorkspaceStorageIdsForOrigin,
  findActiveWorkspaceStorageId,
} from "./discover.js";
import { buildMigration, patchGlobalStorage } from "./global-storage.js";
import {
  resolvePath,
  toFileUri,
  cursorProjectsRoot,
  encodeCursorProjectDir,
  globalStorageDbPath,
  workspaceStorageRoot,
} from "./paths.js";
import { validateDestinationForMove } from "./dir-utils.js";
import { migrateWorkspaceStorage } from "./workspace-storage.js";

function log(step, message) {
  console.log(`[cursor-migrate] ${step}: ${message}`);
}

function ensureParentDir(absPath) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
}

function warnMultipleWorkspaceFolders(count) {
  if (count > 1) {
    log(
      "discover",
      `Found ${count} workspace folders for this path — if chats do not appear, run with --repair --no-move-repo`,
    );
  }
}

function moveProjectDirectory(fromPath, toPath, { intoExistingEmpty = false } = {}) {
  if (intoExistingEmpty) {
    return moveIntoExistingDirectory(fromPath, toPath);
  }

  try {
    fs.renameSync(fromPath, toPath);
    return false;
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    log(
      "repo",
      "Cross-volume move — copying instead of rename (folder birthtime may change; use --repair if chats are missing)",
    );
    fs.cpSync(fromPath, toPath, { recursive: true, force: true, preserveTimestamps: true });
    fs.rmSync(fromPath, { recursive: true, force: true });
    return true;
  }
}

function moveIntoExistingDirectory(fromPath, toPath) {
  try {
    for (const entry of fs.readdirSync(fromPath)) {
      fs.renameSync(path.join(fromPath, entry), path.join(toPath, entry));
    }
    fs.rmdirSync(fromPath);
    return false;
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    log(
      "repo",
      "Cross-volume move — copying into existing empty folder (birthtime of destination folder is preserved; use --repair if chats are missing)",
    );
    fs.cpSync(fromPath, toPath, { recursive: true, force: true, preserveTimestamps: true });
    fs.rmSync(fromPath, { recursive: true, force: true });
    return true;
  }
}

async function ensureCursorClosed(options) {
  if (!isCursorRunning()) {
    return;
  }
  if (options.quitCursor) {
    log("cursor", "Quitting Cursor...");
    quitCursor();
    await sleep(2000);
    if (isCursorRunning()) {
      throw new Error("Cursor is still running. Close it manually and retry.");
    }
    return;
  }
  if (!options.force) {
    throw new Error(
      "Cursor is running — quit it completely before migrating (use --quit-cursor to attempt auto-quit). " +
        "Migration while Cursor is open can undo composer index changes.",
    );
  }
  log("cursor", "Warning: Cursor is running — migration may be reverted on next launch");
}

export async function migrateProject(options) {
  if (options.repair) {
    return repairProject(options);
  }

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
  const destState = moveRepo ? validateDestinationForMove(toPath) : null;
  const intoExistingEmpty = Boolean(destState?.exists && destState?.empty);

  if (!moveRepo && !fs.existsSync(toPath)) {
    throw new Error(`Destination does not exist and --no-move-repo was set: ${toPath}`);
  }
  if (!fs.statSync(fromPath).isDirectory()) {
    throw new Error(`Origin must be a directory: ${fromPath}`);
  }

  await ensureCursorClosed(options);

  const oldWorkspaceMatches = findWorkspaceStorageIdsForOrigin(fromPath, fromUri);
  const oldWorkspaceId = oldWorkspaceMatches[0]?.id ?? null;

  log("plan", `${fromPath} -> ${toPath}`);
  if (oldWorkspaceId) {
    log("discover", `Found workspace storage ${oldWorkspaceId}`);
  } else {
    log("discover", "No workspace storage found for origin");
  }

  let backupDir = null;
  if (!skipBackup && !dryRun) {
    backupDir = createBackupDir();
    log("backup", backupDir);
    backupIfExists(globalStorageDbPath(), backupDir, "globalStorage-state.vscdb");
    if (oldWorkspaceId) {
      backupIfExists(
        path.join(workspaceStorageRoot(), oldWorkspaceId),
        backupDir,
        `workspaceStorage-${oldWorkspaceId}`,
      );
    }
    const oldProjectDir = path.join(cursorProjectsRoot(), encodeCursorProjectDir(fromPath));
    backupIfExists(oldProjectDir, backupDir, encodeCursorProjectDir(fromPath));
  }

  let crossVolumeMove = false;
  if (moveRepo) {
    if (!intoExistingEmpty) {
      ensureParentDir(toPath);
    }
    const moveLabel = intoExistingEmpty
      ? `${fromPath} -> ${toPath} (into existing empty folder)`
      : `${fromPath} -> ${toPath}`;
    log("repo", dryRun ? `Would move ${moveLabel}` : `Moving ${moveLabel}`);
    if (!dryRun) {
      crossVolumeMove = moveProjectDirectory(fromPath, toPath, { intoExistingEmpty });
    }
  }

  const projectMeta = migrateCursorProjectDir(fromPath, toPath, { dryRun });
  if (projectMeta.moved) {
    const transcripts = dryRun ? "?" : countAgentTranscripts(projectMeta.newDir);
    log(
      "cursor-projects",
      `Renamed ${path.basename(projectMeta.oldDir)} -> ${path.basename(projectMeta.newDir)} (${transcripts} agent-transcript file(s); composer index handled separately)`,
    );
  } else {
    log("cursor-projects", `Skipped (${projectMeta.reason})`);
  }

  const wsResult = migrateWorkspaceStorage({
    fromPath,
    toPath,
    toUri,
    oldWorkspaceId,
    dryRun,
    preferActive: false,
  });

  if (wsResult.copied) {
    const mirrors = wsResult.mirrorIds?.length ? ` (mirrored to ${wsResult.mirrorIds.length} ids)` : "";
    log("workspace-storage", `${wsResult.sourceId} -> ${wsResult.newWorkspaceId}${mirrors}`);
  } else {
    log("workspace-storage", `Skipped (${wsResult.reason})`);
  }

  if (!dryRun) {
    const destMatches = findWorkspaceStorageIdsForFolder(toPath, toUri);
    warnMultipleWorkspaceFolders(destMatches.length);
    if (crossVolumeMove) {
      log(
        "repo",
        "Cross-volume move completed — if chats are missing after reopening Cursor, run with --repair --no-move-repo",
      );
    }
  }

  return finishGlobalPatch({
    fromPath,
    toPath,
    backupDir,
    dryRun,
    projectMeta,
    wsResult,
    oldWorkspaceId,
  });
}

async function repairProject(options) {
  const fromPath = resolvePath(options.from);
  const toPath = resolvePath(options.to);
  const fromUri = toFileUri(fromPath);
  const toUri = toFileUri(toPath);
  const dryRun = Boolean(options.dryRun);
  const skipBackup = Boolean(options.skipBackup);

  if (!fs.existsSync(toPath)) {
    throw new Error(`Destination does not exist: ${toPath}`);
  }

  await ensureCursorClosed(options);

  const originMatches = findWorkspaceStorageIdsForOrigin(fromPath, fromUri);
  const destinationMatches = findWorkspaceStorageIdsForFolder(toPath, toUri);
  const oldWorkspaceId = originMatches[0]?.id ?? null;
  const activeWorkspaceId = findActiveWorkspaceStorageId(toPath, toUri) ?? destinationMatches[0]?.id;

  if (!activeWorkspaceId) {
    throw new Error(`No workspace storage found for destination: ${toPath}`);
  }

  log("repair", `${fromPath} -> ${toPath}`);
  log("repair", `Active workspace id: ${activeWorkspaceId}`);
  if (oldWorkspaceId) {
    log("repair", `Origin workspace id: ${oldWorkspaceId}`);
  }
  warnMultipleWorkspaceFolders(destinationMatches.length);

  let backupDir = null;
  if (!skipBackup && !dryRun) {
    backupDir = createBackupDir();
    log("backup", backupDir);
    backupIfExists(globalStorageDbPath(), backupDir, "globalStorage-state.vscdb");
  }

  const sourceId =
    destinationMatches.find((m) => m.size > 100_000)?.id ??
    oldWorkspaceId ??
    destinationMatches[0]?.id;

  const wsResult = migrateWorkspaceStorage({
    fromPath,
    toPath,
    toUri,
    oldWorkspaceId: sourceId,
    dryRun,
    preferActive: true,
  });

  if (wsResult.copied) {
    log("workspace-storage", `Repair copy ${wsResult.sourceId} -> ${wsResult.newWorkspaceId}`);
  } else {
    log("workspace-storage", `Skipped (${wsResult.reason})`);
  }

  const staleIds = [
    ...new Set([oldWorkspaceId, ...destinationMatches.map((m) => m.id)].filter(Boolean)),
  ].filter((id) => id !== wsResult.newWorkspaceId);

  let globalResult = null;
  if (!dryRun) {
    for (const staleId of staleIds) {
      const migration = buildMigration(fromPath, toPath, staleId, wsResult.newWorkspaceId);
      globalResult = patchGlobalStorage(migration, { verify: false });
    }
    if (globalResult) {
      log(
        "global-storage",
        `Updated ${globalResult.updatedRows} rows; ${globalResult.composerCounts.forWorkspace} conversations on ${wsResult.newWorkspaceId}`,
      );
    }
  } else {
    log("global-storage", `Would remap composer entries from ${staleIds.join(", ")}`);
  }

  return {
    fromPath,
    toPath,
    backupDir,
    dryRun,
    projectMeta: { moved: false, reason: "repair" },
    wsResult,
    globalResult,
    done: true,
    repair: true,
  };
}

function finishGlobalPatch(ctx) {
  const { fromPath, toPath, backupDir, dryRun, projectMeta, wsResult, oldWorkspaceId, repair = false } = ctx;

  if (!oldWorkspaceId || !wsResult.newWorkspaceId) {
    log("global-storage", "Skipped composer remap (missing workspace ids)");
    return { fromPath, toPath, backupDir, dryRun, projectMeta, wsResult, done: true, repair };
  }

  const migration = buildMigration(fromPath, toPath, oldWorkspaceId, wsResult.newWorkspaceId);
  if (dryRun) {
    log("global-storage", "Would patch composer.composerHeaders and related keys");
    return { fromPath, toPath, backupDir, dryRun, projectMeta, wsResult, done: true, repair };
  }

  const globalResult = patchGlobalStorage(migration, { dryRun: false });
  log(
    "global-storage",
    `Updated ${globalResult.updatedRows} rows; ${globalResult.composerCounts.forWorkspace} conversations mapped to ${wsResult.newWorkspaceId}`,
  );

  return { fromPath, toPath, backupDir, dryRun, projectMeta, wsResult, globalResult, done: true, repair };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
